import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { getCampaignDashboard, type CampaignFormField, type CampaignConfig } from '../actions'
import { QuestoesList, type QuestaoItem } from './questoes-list'
import { EmbedFormSection } from './embed-form-section'
import { ConfigSection } from './config-section'

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
  iso
    ? new Date(iso).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      })
    : '—'

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
      'id, name, status, access_mode, window_start, window_end, pause_allowed, duration_minutes, releases, live_at, live_url, simulado_id, campaign_form(embed_id, allowed_domains, fields, require_email_verification, ask_segment)'
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
    comentarios_release_at?: string | null
    comentarios_release_until?: string | null
    revisao?: boolean
    dashboard?: boolean
  }

  const config: CampaignConfig = {
    name: c.name ?? '',
    durationMinutes: c.duration_minutes ?? 60,
    accessMode: (c.access_mode ?? 'imediato') as CampaignConfig['accessMode'],
    windowStart: c.window_start ?? null,
    windowEnd: c.window_end ?? null,
    pauseAllowed: !!c.pause_allowed,
    liveAt: c.live_at ?? null,
    liveUrl: c.live_url ?? null,
    releases: {
      nota_gabarito: !!releases.nota_gabarito,
      comentarios_mode: (releases.comentarios_mode ??
        'oculto') as CampaignConfig['releases']['comentarios_mode'],
      comentarios_release_at: releases.comentarios_release_at ?? null,
      comentarios_release_until: releases.comentarios_release_until ?? null,
      revisao: !!releases.revisao,
      dashboard: !!releases.dashboard,
    },
  }

  // campaign_form tem PK = campaign_id (1-para-1): o PostgREST devolve OBJETO,
  // não array — tratar os dois formatos, senão o embed existente "some" da UI
  // e o staff acaba gerando um segundo formulário duplicado.
  type FormRow = {
    embed_id: string
    allowed_domains: string[]
    fields: CampaignFormField[] | null
    require_email_verification: boolean
    ask_segment: boolean
  }
  const formRel = c.campaign_form as unknown as FormRow | FormRow[] | null
  const form = Array.isArray(formRel) ? formRel[0] : (formRel ?? undefined)
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
          <Metric
            label="Iniciaram"
            value={String(dash.iniciaram)}
            hint={dash.cadastros > 0 ? `${dash.conversaoPct}% dos cadastros` : undefined}
          />
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

        {dash.ranking.length > 0 && (
          <div className="rounded-xl border border-border">
            <p className="border-b border-border px-4 py-2 text-xs font-semibold text-muted-foreground">
              Ranking ({dash.ranking.length} participante{dash.ranking.length > 1 ? 's' : ''}) —
              nota, depois menor tempo, depois entrega mais cedo
            </p>
            <div className="max-h-96 overflow-auto">
              <div className="min-w-[480px]">
                <div className="grid grid-cols-[2.5rem_2fr_1fr_1fr_1.5fr] gap-2 border-b border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground">
                  <span>#</span>
                  <span>Participante</span>
                  <span>Nota</span>
                  <span>Tempo</span>
                  <span>Finalizou em</span>
                </div>
                {dash.ranking.map((f, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[2.5rem_2fr_1fr_1fr_1.5fr] gap-2 border-b border-border/50 px-4 py-2 text-sm last:border-0"
                  >
                    <span className={i < 3 ? 'font-bold text-primary' : 'text-muted-foreground'}>
                      {i + 1}º
                    </span>
                    <span className="truncate text-foreground">{f.nome}</span>
                    <span className="text-foreground">{f.scorePct}%</span>
                    <span className="text-muted-foreground">{fmtDur(f.tempoSeg)}</span>
                    <span className="text-muted-foreground">{fmt(f.finishedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {dash.questoesStats.some((q) => q.respostas > 0) && (
          <div className="rounded-xl border border-border">
            <p className="border-b border-border px-4 py-2 text-xs font-semibold text-muted-foreground">
              Erro por questão (entre quem finalizou) — priorize as mais erradas na live
            </p>
            <div className="max-h-[32rem] overflow-auto">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-[3rem_3fr_1fr_1fr_1fr_1fr] gap-2 border-b border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground">
                  <span>Nº</span>
                  <span>Questão</span>
                  <span>% erro</span>
                  <span>Respostas</span>
                  <span>Em branco</span>
                  <span>Dúvidas</span>
                </div>
                {[...dash.questoesStats]
                  .sort((a, b) => (b.erroPct ?? -1) - (a.erroPct ?? -1))
                  .map((q) => (
                    <div
                      key={q.questionId}
                      className="grid grid-cols-[3rem_3fr_1fr_1fr_1fr_1fr] items-center gap-2 border-b border-border/50 px-4 py-2 text-sm last:border-0"
                    >
                      <span className="text-muted-foreground">{q.position}</span>
                      <span className="truncate text-foreground" title={q.stem}>
                        {q.stem || '—'}
                      </span>
                      <span
                        className={`font-semibold ${
                          (q.erroPct ?? 0) >= 60
                            ? 'text-[#D3402A]'
                            : (q.erroPct ?? 0) >= 30
                              ? 'text-[#9E6606]'
                              : 'text-foreground'
                        }`}
                      >
                        {q.erroPct == null ? '—' : `${q.erroPct}%`}
                      </span>
                      <span className="text-muted-foreground">{q.respostas}</span>
                      <span className="text-muted-foreground">{q.emBranco}</span>
                      <span className={q.duvidas > 0 ? 'font-medium text-primary' : 'text-muted-foreground'}>
                        {q.duvidas}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <ConfigSection campaignId={c.id} status={c.status} initial={config} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Link do aluno</h2>
        <p className="text-xs text-muted-foreground">
          Endereço direto do simulado (após o aluno se cadastrar/logar).
        </p>
        <pre className="overflow-auto rounded-lg bg-background p-3 text-xs text-foreground">
          {studentLink}
        </pre>
      </section>

      <EmbedFormSection
        campaignId={c.id}
        embedId={embedId}
        fields={form?.fields ?? []}
        allowedDomains={form?.allowed_domains ?? []}
        requireEmailVerification={form?.require_email_verification ?? false}
        askSegment={form?.ask_segment ?? true}
        appUrl={appUrl}
      />

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
