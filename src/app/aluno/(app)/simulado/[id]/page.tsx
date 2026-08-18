import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { getAlunoAcesso } from '@/lib/aluno/acesso'
import { getErrorCardImages } from '@/lib/aluno/estudo'
import { startOrResumeAttempt } from './actions'
import { ProvaRuntime } from './prova-runtime'

export const metadata = { title: 'Simulado — MedMaestro' }

type QuestionRow = {
  position: number
  questions: {
    id: string
    question_number: number | null
    stem: string | null
    alternatives: Record<string, string> | null
    exams: { year: number | null } | null
  } | null
}

function Aviso({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-border bg-card p-8 text-center">
      <h1 className="text-lg font-bold text-foreground">{title}</h1>
      <div className="mt-2 text-sm text-muted-foreground">{children}</div>
    </div>
  )
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo', // o servidor roda em UTC — sem isso o horário mostrado mente
  })

export default async function SimuladoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: campaignId } = await params
  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('name, simulado_id, pause_allowed, status, access_mode, window_start, window_end')
    .eq('id', campaignId)
    .single()

  // Tentativa existente decide se a prova pode continuar mesmo com a campanha
  // despublicada ou a janela fechada no meio da aplicação.
  const supabaseSessao = await createClient()
  const {
    data: { user },
  } = await supabaseSessao.auth.getUser()
  const { data: myAttempt } = user
    ? await service
        .from('simulado_attempts')
        .select('status')
        .eq('user_id', user.id)
        .eq('campaign_id', campaignId)
        .maybeSingle()
    : { data: null }
  const emAndamento = myAttempt?.status === 'em_andamento'

  if (!campaign || (campaign.status !== 'publicada' && !emAndamento)) {
    return <Aviso title="Simulado indisponível">Esta prova não está disponível no momento.</Aviso>
  }

  // Conta de lead só acessa as campanhas de onde veio (URL direta não vale).
  const acesso = await getAlunoAcesso(supabaseSessao)
  if (acesso.kind === 'lead' && !acesso.campaignIds.includes(campaignId)) {
    return <Aviso title="Simulado indisponível">Esta prova não está disponível para o seu acesso.</Aviso>
  }

  const now = Date.now()

  // T027 — Página de espera / janela encerrada (não vale para prova em andamento).
  if (campaign.access_mode !== 'imediato' && !emAndamento) {
    if (campaign.window_start && now < new Date(campaign.window_start).getTime()) {
      return (
        <Aviso title="Quase lá!">
          <p>A prova abre em <strong>{fmt(campaign.window_start)}</strong>.</p>
          <p className="mt-2">Volte nesse horário para começar. Você terá um tempo cronometrado para concluir.</p>
        </Aviso>
      )
    }
    if (campaign.window_end && now > new Date(campaign.window_end).getTime()) {
      return (
        <Aviso title="Janela encerrada">
          <p>O período para realizar esta prova terminou em <strong>{fmt(campaign.window_end)}</strong>.</p>
          {myAttempt && (
            <p className="mt-3">
              <Link href={`/aluno/simulado/${campaignId}/resultado`} className="font-medium text-primary underline">
                Ver meu resultado
              </Link>
            </p>
          )}
        </Aviso>
      )
    }
  }

  // Janela aberta (ou acesso imediato): inicia/retoma.
  const started = await startOrResumeAttempt(campaignId)
  if (!started.ok) {
    return <Aviso title="Simulado">{started.error}</Aviso>
  }

  const { attemptId, remaining } = started.data

  const { data: rows } = await service
    .from('simulado_questions')
    .select(
      'position, questions(id, question_number, stem, alternatives, exams(year))'
    )
    .eq('simulado_id', campaign.simulado_id)
    .order('position', { ascending: true })

  const qrows = ((rows ?? []) as unknown as QuestionRow[]).filter((r) => r.questions)

  // Figuras das questões (ECG, radiografia etc.) — a prova fica irrespondível sem elas.
  const imagesByQ = await getErrorCardImages(
    service,
    qrows.map((r) => r.questions!.id)
  )

  const questions = qrows.map((r) => {
    const q = r.questions!
    const alt = (q.alternatives ?? {}) as Record<string, string>
    return {
      id: q.id,
      number: q.question_number ?? r.position,
      origem: q.exams?.year ? `Ano ${q.exams.year}` : null,
      stem: q.stem ?? '',
      alternatives: {
        A: alt.A ?? '',
        B: alt.B ?? '',
        C: alt.C ?? '',
        D: alt.D ?? '',
        E: alt.E ?? '',
      } as Record<string, string>,
      images: imagesByQ.get(q.id) ?? [],
    }
  })

  const { data: saved } = await service
    .from('question_attempts')
    .select('question_id, selected_alt, is_saved')
    .eq('attempt_id', attemptId)

  const savedMap: Record<string, { alt: string | null; locked: boolean }> = {}
  for (const s of saved ?? []) savedMap[s.question_id] = { alt: s.selected_alt, locked: !!s.is_saved }

  return (
    <ProvaRuntime
      campaignId={campaignId}
      campaignName={campaign.name ?? 'Simulado'}
      attemptId={attemptId}
      initialRemaining={remaining}
      pauseAllowed={!!campaign.pause_allowed}
      questions={questions}
      saved={savedMap}
    />
  )
}
