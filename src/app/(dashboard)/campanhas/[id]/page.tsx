import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'

export const metadata = { title: 'Campanha — MedMaestro' }

type QRow = {
  position: number
  questions: {
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
    .select('position, questions(question_number, stem, exams(year, specialties(name)))')
    .eq('simulado_id', c.simulado_id)
    .order('position', { ascending: true })

  const questions = ((rows ?? []) as unknown as QRow[]).filter((r) => r.questions)

  const releases = (c.releases ?? {}) as {
    nota_gabarito?: boolean
    comentarios_mode?: string
    revisao?: boolean
    dashboard?: boolean
  }

  const form = (c.campaign_form as unknown as { embed_id: string; allowed_domains: string[] }[] | null)?.[0]
  const embedId = form?.embed_id ?? null

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
                ? 'bg-green-500/15 text-green-500'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {c.status}
          </span>
        </div>
      </div>

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
          Questões do simulado ({questions.length})
        </h2>
        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma questão vinculada.</p>
        ) : (
          <ol className="space-y-1 rounded-lg border border-border p-2 text-sm">
            {questions.map((r) => {
              const q = r.questions!
              const exam = q.exams
              return (
                <li key={r.position} className="flex gap-2 rounded-md p-2 hover:bg-card">
                  <span className="shrink-0 text-muted-foreground">{r.position}.</span>
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">
                      {q.question_number ? `Q${q.question_number} · ` : ''}
                      {(q.stem ?? '').slice(0, 120) || '(sem enunciado)'}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {exam?.specialties?.name ?? 'Prova'}
                      {exam?.year ? ` ${exam.year}` : ''}
                    </span>
                  </span>
                </li>
              )
            })}
          </ol>
        )}
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
