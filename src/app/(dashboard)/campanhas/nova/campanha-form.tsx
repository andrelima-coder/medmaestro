'use client'

import { useActionState, useState } from 'react'
import { createCampaignAction, type CampaignState } from '../actions'

type SimuladoOption = { id: string; title: string }

function buildEmbedSnippet(embedId: string, appUrl: string): string {
  const endpoint = `${appUrl || ''}/api/public/leads`
  return `<form id="mm-lead-form">
  <input name="name" placeholder="Nome" required />
  <input name="email" type="email" placeholder="E-mail" required />
  <input name="whatsapp" placeholder="WhatsApp" required />
  <label><input type="checkbox" name="consent" required /> Aceito os termos (LGPD)</label>
  <input type="text" name="hp" style="display:none" tabindex="-1" autocomplete="off" />
  <button type="submit">Quero fazer o simulado</button>
</form>
<script>
(function(){
  var f=document.getElementById('mm-lead-form');
  f.addEventListener('submit',function(e){
    e.preventDefault();
    var d=new FormData(f);
    fetch('${endpoint}',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        embed_id:'${embedId}',
        name:d.get('name'), email:d.get('email'), whatsapp:d.get('whatsapp'),
        consent:d.get('consent')==='on', consent_version:'v1', hp:d.get('hp')
      })
    }).then(function(r){return r.json()}).then(function(j){
      if(j.lead_id){ window.location.href='${appUrl || ''}/aluno/login'; }
      else { alert('Não foi possível enviar. Verifique os campos.'); }
    });
  });
})();
</script>`
}

export function CampanhaForm({
  simulados,
  appUrl,
}: {
  simulados: SimuladoOption[]
  appUrl: string
}) {
  const [state, formAction, isPending] = useActionState<CampaignState, FormData>(
    createCampaignAction,
    null
  )
  const [accessMode, setAccessMode] = useState('imediato')

  if (state?.ok && state.embedId) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-bold text-foreground">Campanha criada ✅</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cole este código na landing page externa para captar leads desta campanha.
        </p>
        <pre className="mt-4 max-h-80 overflow-auto rounded-lg bg-background p-4 text-xs text-foreground">
          {buildEmbedSnippet(state.embedId, appUrl)}
        </pre>
        <p className="mt-2 text-xs text-muted-foreground">
          embed_id: <code>{state.embedId}</code>
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      <Section title="Campanha">
        <Text label="Nome da campanha" name="name" required />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Simulado (molde)</span>
          <select
            name="simulado_id"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Selecione…</option>
            {simulados.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <Text label="Duração (minutos)" name="duration_minutes" type="number" required />
      </Section>

      <Section title="Acesso">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Modo de acesso</span>
          <select
            name="access_mode"
            value={accessMode}
            onChange={(e) => setAccessMode(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="imediato">Imediato</option>
            <option value="data_unica">Data única</option>
            <option value="janela">Janela (faixa de dias)</option>
          </select>
        </label>
        {accessMode !== 'imediato' && (
          <div className="grid grid-cols-2 gap-3">
            <Text label="Início" name="window_start" type="datetime-local" />
            {accessMode === 'janela' && (
              <Text label="Fim" name="window_end" type="datetime-local" />
            )}
          </div>
        )}
        <Check label="Permitir pausar e retomar" name="pause_allowed" defaultChecked />
      </Section>

      <Section title="Liberações pós-prova">
        <Check label="Liberar nota e gabarito" name="rel_nota" />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Comentários</span>
          <select
            name="rel_coment_mode"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="oculto">Oculto (gancho da live)</option>
            <option value="imediato">Imediato</option>
            <option value="data">Liberar em data</option>
          </select>
        </label>
        <Text label="Data de liberação dos comentários (se aplicável)" name="rel_coment_at" type="datetime-local" />
        <Check label="Permitir revisão das questões/alternativas" name="rel_revisao" />
        <Check label="Liberar dashboard de desempenho (Fase 2)" name="rel_dashboard" />
      </Section>

      <Section title="Live">
        <Text label="Data da live" name="live_at" type="datetime-local" />
        <Text label="Link da live (YouTube)" name="live_url" />
      </Section>

      <Section title="Formulário de captação (embed)">
        <Text label="Domínios autorizados (separados por vírgula)" name="allowed_domains" />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">
            Campos extras (um por linha)
          </span>
          <textarea
            name="extra_fields"
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder={'Cidade\nAno de conclusão da residência'}
          />
        </label>
        <Check label="Exigir verificação de e-mail" name="require_email_verification" />
      </Section>

      <Section title="Rastreamento / Pixel (por campanha)">
        <Text label="Meta Pixel ID" name="meta_pixel_id" />
        <Text label="Meta Access Token (Conversions API)" name="meta_access_token" />
        <Text label="Google Measurement ID (GA4)" name="ga_measurement_id" />
        <Text label="Google API Secret (GA4)" name="ga_api_secret" />
      </Section>

      <Check label="Publicar imediatamente" name="publish" />

      {state?.error && (
        <p role="alert" className="text-sm text-red-500">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {isPending ? 'Criando…' : 'Criar campanha'}
      </button>
    </form>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-border p-4">
      <legend className="px-1 text-sm font-semibold text-foreground">{title}</legend>
      {children}
    </fieldset>
  )
}

function Text({
  label,
  name,
  type = 'text',
  required,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
      />
    </label>
  )
}

function Check({
  label,
  name,
  defaultChecked,
}: {
  label: string
  name: string
  defaultChecked?: boolean
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4" />
      {label}
    </label>
  )
}
