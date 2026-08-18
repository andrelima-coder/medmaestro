import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Formulário de captação hospedado, consumido via <iframe> nas landing pages
// (snippet gerado em lib/marketing/embed-snippet.ts). Renderiza os campos de
// campaign_form.fields, aplica máscara de WhatsApp e conduz o fluxo completo:
// cadastro → verificação de e-mail (código 6 dígitos) → CTA para o simulado.
// Anônimo (liberado no proxy); anti-embed fora dos allowed_domains via CSP
// frame-ancestors. O POST continua em /api/public/leads.

type FormField = { key?: string; label?: string; type?: string; required?: boolean }

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function htmlResponse(html: string, status: number, csp?: string): NextResponse {
  const headers: Record<string, string> = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    // /f/* fica fora dos security headers globais (next.config) para o iframe
    // funcionar — repõe aqui o mínimo que não conflita com embed.
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }
  if (csp) headers['Content-Security-Policy'] = csp
  return new NextResponse(html, { status, headers })
}

const BASE_KEYS = new Set(['name', 'email', 'whatsapp'])

function fieldInput(f: FormField): string {
  const key = (f.key ?? '').replace(/[^a-z0-9_]/gi, '')
  if (!key) return ''
  const label = esc(f.label ?? key)
  const type = f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'
  const required = f.required ? ' required' : ''
  const extra =
    key === 'whatsapp'
      ? ' inputmode="numeric" autocomplete="tel" data-mm-whatsapp="1" placeholder="(11) 91234-5678"'
      : key === 'email'
        ? ' autocomplete="email"'
        : key === 'name'
          ? ' autocomplete="name"'
          : ''
  return `<label class="mm-field"><span>${label}${f.required ? '' : ' <em>(opcional)</em>'}</span><input name="${key}" type="${type}"${required}${extra} /></label>`
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ embedId: string }> }
) {
  const { embedId } = await params
  const service = createServiceClient()

  const { data: form } = await service
    .from('campaign_form')
    .select('campaign_id, fields, allowed_domains, require_email_verification, campaigns(name)')
    .eq('embed_id', embedId)
    .single()

  if (!form) {
    return htmlResponse(
      '<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif;color:#3F5A75">Formulário não encontrado.</p>',
      404
    )
  }

  const campaignRel = form.campaigns as unknown as { name: string | null } | { name: string | null }[] | null
  const campaignName =
    (Array.isArray(campaignRel) ? campaignRel[0]?.name : campaignRel?.name) ?? 'Simulado'

  const allowed: string[] = (form.allowed_domains as string[] | null) ?? []
  const csp =
    allowed.length > 0
      ? `frame-ancestors 'self' ${allowed.join(' ')}`
      : "frame-ancestors *"

  const rawFields = (form.fields as FormField[] | null) ?? []
  const baseDefaults: FormField[] = [
    { key: 'name', label: 'Nome completo', type: 'text', required: true },
    { key: 'email', label: 'E-mail', type: 'email', required: true },
    { key: 'whatsapp', label: 'WhatsApp', type: 'tel', required: true },
  ]
  // Base sempre presente (o endpoint exige name/email/whatsapp); extras vêm do admin.
  const fields = [
    ...baseDefaults.map((b) => rawFields.find((f) => f.key === b.key) ?? b),
    ...rawFields.filter((f) => f.key && !BASE_KEYS.has(f.key)),
  ]
  const extraKeys = fields
    .map((f) => (f.key ?? '').replace(/[^a-z0-9_]/gi, ''))
    .filter((k) => k && !BASE_KEYS.has(k))

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  const alunoUrl = (process.env.NEXT_PUBLIC_ALUNO_URL ?? '').replace(/\/$/, '')
  const cadastroUrl = alunoUrl ? `${alunoUrl}/cadastro` : `${appUrl}/aluno/cadastro`

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${esc(campaignName)} — cadastro</title>
<style>
  *{box-sizing:border-box}
  /* Fonte de sistema: o CSP (style-src 'self') bloqueia o Google Fonts, então
     qualquer webfont externa cairia no fallback com erro de console. */
  body{margin:0;background:transparent;font-family:'Afya Sans',-apple-system,'Segoe UI','Helvetica Neue',Arial,sans-serif}
  .mm-card{max-width:440px;background:#FFFFFF;border:1px solid #E8E8E8;border-radius:18px;padding:24px;
    box-shadow:0 10px 34px rgba(14,40,65,.10)}
  .mm-title{margin:0 0 4px;font-size:17px;font-weight:800;color:#0E2841}
  .mm-sub{margin:0 0 16px;font-size:13px;line-height:1.45;color:#3F5A75}
  .mm-field{display:block;margin:0 0 10px}
  .mm-field span{display:block;margin:0 0 4px;font-size:13px;font-weight:600;color:#0E2841}
  .mm-field em{font-style:normal;font-weight:400;color:#A4A3A4}
  .mm-field input{width:100%;padding:12px 14px;border:1px solid #E8E8E8;border-radius:10px;font-size:15px;
    color:#0E2841;background:#FFFFFF;font-family:inherit}
  .mm-field input::placeholder{color:#A4A3A4}
  .mm-field input:focus{outline:2px solid #D40754;outline-offset:0;border-color:#D40754}
  .mm-consent{display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.45;color:#3F5A75;margin:6px 0 16px}
  .mm-consent input{accent-color:#D40754;margin-top:2px}
  .mm-btn{display:block;width:100%;border:0;border-radius:10px;padding:14px 20px;background:#D40754;color:#FFFFFF;
    font-size:15px;font-weight:800;font-family:inherit;cursor:pointer;text-align:center;text-decoration:none;
    transition:background .15s}
  .mm-btn:hover{background:#B6014F}
  .mm-btn[disabled]{opacity:.6;cursor:default}
  .mm-link{background:none;border:0;padding:0;margin-top:12px;font-size:13px;color:#D40754;font-family:inherit;
    cursor:pointer;text-decoration:underline;display:inline-block}
  .mm-error{margin:10px 0 0;font-size:13px;color:#D3402A;min-height:1em}
  .mm-code{letter-spacing:8px;text-align:center;font-size:22px;font-weight:800}
  .mm-hide{display:none}
  .mm-ok{margin:0 0 16px;font-size:14px;line-height:1.5;color:#006048}
</style>
</head>
<body>
<div class="mm-card">
  <div id="mm-step-form">
    <h1 class="mm-title">${esc(campaignName)}</h1>
    <p class="mm-sub">Preencha seus dados para fazer o simulado gratuito.</p>
    <form id="mm-form">
      ${fields.map(fieldInput).join('\n      ')}
      <label class="mm-consent"><input type="checkbox" name="consent" required />
        <span>Autorizo o contato e o tratamento dos meus dados conforme a LGPD.</span></label>
      <input type="text" name="hp" style="display:none" tabindex="-1" autocomplete="off" />
      <button type="submit" class="mm-btn" id="mm-submit">Quero fazer o simulado</button>
      <p class="mm-error" id="mm-form-error"></p>
    </form>
  </div>

  <div id="mm-step-verify" class="mm-hide">
    <h1 class="mm-title">Confirme seu e-mail</h1>
    <p class="mm-sub">Enviamos um código de 6 dígitos para <strong id="mm-verify-email"></strong>. Digite-o abaixo.</p>
    <form id="mm-verify-form">
      <label class="mm-field"><span>Código</span>
        <input name="code" class="mm-code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required placeholder="••••••" /></label>
      <button type="submit" class="mm-btn" id="mm-verify-submit">Confirmar</button>
      <p class="mm-error" id="mm-verify-error"></p>
    </form>
    <button type="button" class="mm-link" id="mm-resend">Reenviar código</button>
  </div>

  <div id="mm-step-done" class="mm-hide">
    <h1 class="mm-title">Cadastro confirmado ✅</h1>
    <p class="mm-ok">Tudo certo! Agora crie sua conta de acesso para fazer o simulado.</p>
    <a class="mm-btn" id="mm-cta" href="${esc(cadastroUrl)}" target="_top">Fazer o simulado</a>
  </div>

  <div id="mm-step-espera" class="mm-hide">
    <h1 class="mm-title">Cadastro confirmado ✅</h1>
    <p class="mm-sub">O simulado ainda não está aberto. Você receberá um e-mail quando a janela de realização começar.</p>
  </div>
</div>
<script>
(function(){
  var EMBED_ID=${JSON.stringify(embedId)};
  var EXTRA_KEYS=${JSON.stringify(extraKeys)};
  var CADASTRO_URL=${JSON.stringify(cadastroUrl)};
  var leadId=null;

  function el(id){return document.getElementById(id)}
  function postHeight(){
    try{parent.postMessage({mmEmbedId:EMBED_ID,mmEmbedHeight:document.documentElement.scrollHeight+8},'*')}catch(e){}
  }
  function show(step){
    ['form','verify','done','espera'].forEach(function(s){
      el('mm-step-'+s).className = s===step ? '' : 'mm-hide';
    });
    postHeight();
  }
  if(window.ResizeObserver){new ResizeObserver(postHeight).observe(document.body)}
  window.addEventListener('load',postHeight);

  // Máscara de WhatsApp: (DD) 9XXXX-XXXX
  var wa=document.querySelector('[data-mm-whatsapp]');
  if(wa){wa.addEventListener('input',function(){
    var d=wa.value.replace(/\\D/g,'').slice(0,11);
    var out=d;
    if(d.length>2){out='('+d.slice(0,2)+') '+d.slice(2)}
    if(d.length>7){out='('+d.slice(0,2)+') '+d.slice(2,7)+'-'+d.slice(7)}
    wa.value=out;
  })}

  function finish(next){
    if(next==='espera'){show('espera')}else{show('done')}
  }

  el('mm-form').addEventListener('submit',function(e){
    e.preventDefault();
    var btn=el('mm-submit');btn.disabled=true;
    el('mm-form-error').textContent='';
    var d=new FormData(el('mm-form'));
    var extras={};
    EXTRA_KEYS.forEach(function(k){var v=d.get(k);if(v)extras[k]=v});
    fetch('/api/public/leads',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        embed_id:EMBED_ID,
        name:d.get('name'),email:d.get('email'),whatsapp:d.get('whatsapp'),
        fields:extras,consent:d.get('consent')==='on',consent_version:'v1',hp:d.get('hp')
      })
    }).then(function(r){return r.json()}).then(function(j){
      btn.disabled=false;
      if(j.error){el('mm-form-error').textContent=j.error;postHeight();return}
      if(!j.lead_id){el('mm-form-error').textContent='Não foi possível enviar. Tente novamente.';postHeight();return}
      leadId=j.lead_id;
      if(j.cta){el('mm-cta').href=j.cta}
      if(j.next==='verificar'){
        el('mm-verify-email').textContent=String(d.get('email')||'');
        show('verify');
      }else{finish(j.next)}
    }).catch(function(){
      btn.disabled=false;
      el('mm-form-error').textContent='Falha de conexão. Tente novamente.';postHeight();
    });
  });

  el('mm-verify-form').addEventListener('submit',function(e){
    e.preventDefault();
    var btn=el('mm-verify-submit');btn.disabled=true;
    el('mm-verify-error').textContent='';
    var code=new FormData(el('mm-verify-form')).get('code');
    fetch('/api/public/leads/verify',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({lead_id:leadId,code:code})
    }).then(function(r){return r.json()}).then(function(j){
      btn.disabled=false;
      if(!j.ok){el('mm-verify-error').textContent=j.error||'Código incorreto.';postHeight();return}
      if(j.cta){el('mm-cta').href=j.cta}
      finish(j.next);
    }).catch(function(){
      btn.disabled=false;
      el('mm-verify-error').textContent='Falha de conexão. Tente novamente.';postHeight();
    });
  });

  el('mm-resend').addEventListener('click',function(){
    el('mm-verify-error').textContent='';
    fetch('/api/public/leads/verify',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({lead_id:leadId,resend:true})
    }).then(function(r){return r.json()}).then(function(j){
      el('mm-verify-error').textContent=j.ok?'Novo código enviado.':(j.error||'Não foi possível reenviar.');
      postHeight();
    });
  });
})();
</script>
</body>
</html>`

  return htmlResponse(html, 200, csp)
}
