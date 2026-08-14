import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { getCampaignDashboard } from '../actions'
import { QuestoesList, type QuestaoItem } from './questoes-list'

function fmtDur(sec: number | null): string {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

export const metadata = { title: 'Campanha — MedMaestro' }

type QRow = {
  position: number
  questions: {
    id: string
    question_number: number | null
    stem: string | null
    exams: { year: number | null; specialties: { name: string } | null } | null
  } | null
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

function buildEmbedSnippet(embedId: string, endpointBase: string, alunoBase: string): string {
  const endpoint = `${endpointBase || ''}/api/public/leads`
  const destino = `${alunoBase || endpointBase || ''}/login`
  return `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;800&display=swap" />
<style>
  #mm-lead-form{font-family:'Afya Sans','Figtree','Helvetica Neue',Arial,sans-serif;max-width:420px;background:#FFFFFF;
    border:1px solid #E8E8E8;border-radius:18px;padding:24px;box-shadow:0 10px 34px rgba(14,40,65,.10);box-sizing:border-box}
  #mm-lead-form input[type=text],#mm-lead-form input[type=email]{width:100%;box-sizing:border-box;margin:0 0 10px;
    padding:12px 14px;border:1px solid #E8E8E8;border-radius:10px;font-size:15px;color:#0E2841;background:#FFFFFF;font-family:inherit}
  #mm-lead-form input::placeholder{color:#A4A3A4}
  #mm-lead-form input[type=text]:focus,#mm-lead-form input[type=email]:focus{outline:2px solid #D40754;outline-offset:0;border-color:#D40754}
  #mm-lead-form label{display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.45;color:#3F5A75;margin:6px 0 16px}
  #mm-lead-form label input{accent-color:#D40754;margin-top:2px}
  #mm-lead-form button{width:100%;border:0;border-radius:10px;padding:14px 20px;background:#D40754;color:#FFFFFF;
    font-size:15px;font-weight:800;font-family:inherit;cursor:pointer;transition:background .15s}
  #mm-lead-form button:hover{background:#B6014F}
</style>
<form id="mm-lead-form">
  <input name="name" placeholder="Nome" required />
  <input name="email" type="email" placeholder="E-mail" required />
  <input name="whatsapp" placeholder="WhatsApp" required />
  <label><input type="checkbox" name="consent" required /> <span>Autorizo o contato e o tratamento dos meus dados conforme a LGPD.</span></label>
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
      if(j.lead_id){ window.location.href='${destino}'; }
      else { alert('Não foi possível enviar. Verifique os campos.'); }
    });
  });
})();
</script>`
}

export default async function CampanhaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const service = createServiceClient()

  const { data: c } = await service
    .from('campaigns')
    .select(
      'id, name, status, access_mode, window_start, window_end, pause_allowed, duration_minutes, releases, live_at, live_url, simulado_id, campaign_form(embed_id, allowed_domains)'
    )
    .eq('id', id)
    .single()

  if (!c) notFound()

  const { data: rows } = await service
    .from('simulado_questions')
    .select('position, questions(id, question_number, stem, exams(year, specialties(name)))')
    .eq('simulado_id', c.simulado_id)
    .order('position', { ascending: true })

  const questions = ((rows ?? []) as unknown as QRow[]).filter((r) => r.questions)
  const questoesItems: QuestaoItem[] = questions.map((r) => {
    const q = r.questions!
    return {
      id: q.id,
      position: r.position,
      number: q.question_number ?? null,
      stem: (q.stem ?? '').slice(0, 120),
      examLabel: `${q.exams?.specialties?.name ?? 'Prova'}${q.exams?.year ? ' ' + q.exams.year : ''}`,
    }
  })

  const releases = (c.releases ?? {}) as {
    nota_gabarito?: boolean
    comentarios_mode?: string
    revisao?: boolean
    dashboard?: boolean
  }

  const form = (c.campaign_form as unknown as { embed_id: string; allowed_domains: string[] }[] | null)?.[0]
  const embedId = form?.embed_id ?? null

  const dash = await getCampaignDashboard(c.id)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const alunoUrl = process.env.NEXT_PUBLIC_ALUNO_URL ?? ''
  const studentLink = `${alunoUrl || appUrl}/simulado/${c.id}`

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/campanhas" className="text-sm text-muted-foreground hover:text-foreground">
          ← Campanhas
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{c.name}</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              c.status === 'publicada'
                ? 'bg-[rgba(0,96,72,0.15)] text-[#006048]'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {c.status}
          </span>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Acompanhamento</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Metric label="Cadastros" value={String(dash.cadastros)} />
          <Metric label="Iniciaram" value={String(dash.iniciaram)} hint={`${dash.conversaoPct}% dos cadastros`} />
          <Metric label="Finalizaram" value={String(dash.finalizaram)} />
          <Metric label="Em andamento" value={String(dash.emAndamento)} />
          <Metric
            label="Taxa de abandono"
            value={`${dash.abandonoPct}%`}
            hint="iniciaram e não terminaram"
            danger={dash.abandonoPct >= 50}
          />
          <Metric
            label="Média dos alunos"
            value={dash.mediaPct == null ? '—' : `${dash.mediaPct}%`}
          />
          <Metric label="Tempo médio" value={fmtDur(dash.tempoMedioSeg)} />
        </div>

        {dash.finalizaram > 0 && (
          <div className="rounded-xl border border-border p-4">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              Distribuição das notas ({dash.finalizaram} finalizada{dash.finalizaram > 1 ? 's' : ''})
            </p>
            <div className="space-y-1">
              {dash.distribuicao.map((d) => {
                const pct =
                  dash.finalizaram > 0 ? Math.round((d.n / dash.finalizaram) * 100) : 0
                return (
                  <div key={d.faixa} className="flex items-center gap-2 text-xs">
                    <span className="w-14 shrink-0 text-muted-foreground">{d.faixa}</span>
                    <span className="h-3 flex-1 overflow-hidden rounded bg-background">
                      <span
                        className="block h-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="w-8 shrink-0 text-right text-foreground">{d.n}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {dash.finalizacoes.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-[2fr_1fr_1fr_1.5fr] gap-2 border-b border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>Aluno</span>
              <span>Nota</span>
              <span>Tempo</span>
              <span>Finalizou em</span>
            </div>
            {dash.finalizacoes.map((f, i) => (
              <div
                key={i}
                className="grid grid-cols-[2fr_1fr_1fr_1.5fr] gap-2 border-b border-border/50 px-4 py-2 text-sm last:border-0"
              >
                <span className="truncate text-foreground">{f.nome}</span>
                <span className="text-foreground">{f.scorePct}%</span>
                <span className="text-muted-foreground">{fmtDur(f.tempoSeg)}</span>
                <span className="text-muted-foreground">{fmt(f.finishedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 rounded-xl border border-border p-4 text-sm md:grid-cols-3">
        <Info label="Acesso" value={c.access_mode} />
        <Info label="Duração" value={`${c.duration_minutes} min`} />
        <Info label="Pausar/retomar" value={c.pause_allowed ? 'Sim' : 'Não'} />
        <Info label="Início" value={fmt(c.window_start)} />
        <Info label="Fim" value={fmt(c.window_end)} />
        <Info label="Questões" value={String(questions.length)} />
        <Info label="Nota/gabarito" value={releases.nota_gabarito ? 'Liberado' : 'Retido'} />
        <Info label="Comentários" value={releases.comentarios_mode ?? 'oculto'} />
        <Info label="Revisão" value={releases.revisao ? 'Liberada' : 'Retida'} />
        <Info label="Live" value={fmt(c.live_at)} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Link do aluno</h2>
        <p className="text-xs text-muted-foreground">
          Endereço direto do simulado (após o aluno se cadastrar/logar).
        </p>
        <pre className="overflow-auto rounded-lg bg-background p-3 text-xs text-foreground">
          {studentLink}
        </pre>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Formulário de captação (embed)</h2>
        {embedId ? (
          <>
            <p className="text-xs text-muted-foreground">
              embed_id: <code>{embedId}</code>
              {form?.allowed_domains?.length
                ? ` · domínios: ${form.allowed_domains.join(', ')}`
                : ''}
            </p>
            <pre className="max-h-72 overflow-auto rounded-lg bg-background p-3 text-xs text-foreground">
              {buildEmbedSnippet(embedId, appUrl, alunoUrl)}
            </pre>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Esta campanha não tem formulário embedável (foi criada sem o gerador de formulário).
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          Questões do simulado ({questoesItems.length})
        </h2>
        <p className="text-xs text-muted-foreground">
          Clique em “Ver” para conferir enunciado, alternativas (com gabarito) e comentários.
        </p>
        <QuestoesList questoes={questoesItems} />
      </section>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium text-foreground">{value}</div>
    </div>
  )
}

function Metric({
  label,
  value,
  hint,
  danger,
}: {
  label: string
  value: string
  hint?: string
  danger?: boolean
}) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${danger ? 'text-[#D3402A]' : 'text-foreground'}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  )
}
