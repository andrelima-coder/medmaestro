import { createServiceClient } from '@/lib/supabase/service'
import { RecalcButton } from './recalc-button'
import { FlagsList, type FlagItem } from './flags-list'

export const metadata = { title: 'Calibração — MedMaestro' }

type StatRow = {
  question_id: string
  empirical_difficulty: number | null
  response_count: number
  is_reliable: boolean
  questions: { question_no: number | null; stem: string | null } | null
}

type FlagRow = {
  id: string
  reason: string
  questions: { question_no: number | null } | null
}

function faixa(p: number | null): string {
  if (p == null) return '—'
  if (p >= 0.7) return 'Fácil'
  if (p >= 0.4) return 'Média'
  return 'Difícil'
}

export default async function CalibracaoPage() {
  const service = createServiceClient()

  const { data: stats } = await service
    .from('question_stats')
    .select('question_id, empirical_difficulty, response_count, is_reliable, questions(question_no, stem)')
    .order('response_count', { ascending: false })
    .limit(100)

  const { data: flagsRaw } = await service
    .from('gabarito_flags')
    .select('id, reason, questions(question_no)')
    .eq('status', 'aberto')
    .limit(100)

  const rows = (stats ?? []) as unknown as StatRow[]
  const flags: FlagItem[] = ((flagsRaw ?? []) as unknown as FlagRow[]).map((f) => ({
    id: f.id,
    reason: f.reason,
    questionNo: f.questions?.question_no ?? null,
  }))

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Calibração de dificuldade</h1>
          <p className="text-sm text-muted-foreground">
            Dificuldade empírica (desempenho real) — separada da dificuldade editorial.
          </p>
        </div>
        <RecalcButton />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Candidatos a erro de gabarito</h2>
        <FlagsList flags={flags} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Dificuldade empírica por questão</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ainda não há respostas suficientes. Rode "Recalcular agora" após as campanhas receberem respostas.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2">Questão</th>
                <th className="py-2">Respostas</th>
                <th className="py-2">Acerto (p)</th>
                <th className="py-2">Faixa empírica</th>
                <th className="py-2">Confiável</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.question_id} className="border-b border-border/50">
                  <td className="py-2 text-foreground">
                    Nº {r.questions?.question_no ?? '—'}
                  </td>
                  <td className="py-2">{r.response_count}</td>
                  <td className="py-2">
                    {r.empirical_difficulty != null
                      ? `${Math.round(r.empirical_difficulty * 100)}%`
                      : '—'}
                  </td>
                  <td className="py-2">{faixa(r.empirical_difficulty)}</td>
                  <td className="py-2">{r.is_reliable ? 'Sim' : 'Amostra baixa'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
