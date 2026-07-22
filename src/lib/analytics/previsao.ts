import { createServiceClient } from '@/lib/supabase/service'

/**
 * Motor de PREVISÃO de prova (comissão de previsão).
 *
 * Ideia: para cada tópico do edital, estimar o "peso esperado" na próxima prova
 * combinando três sinais mensuráveis a partir do histórico:
 *  - Frequência ponderada por RECÊNCIA (anos recentes pesam mais);
 *  - TENDÊNCIA (a inclinação da série de share ao longo dos anos);
 *  - CONSISTÊNCIA (o inverso da dispersão entre anos — quão previsível é).
 *
 * Tudo é normalizado por % da prova de cada ano (os cadernos variam de ~87 a
 * 180 questões), então nunca comparamos contagens absolutas entre anos.
 *
 * IMPORTANTE (honestidade estatística): a amostra por tópico costuma ser
 * pequena. Por isso devolvemos também `sampleSize` e uma faixa estimada de
 * questões (lo/hi), para a UI mostrar incerteza em vez de fingir precisão.
 */

export type DimensionKey = 'topico_edital' | 'modulo'

// Meia-vida do peso por recência, em anos. Um tópico de 4 anos atrás vale ~metade
// de um do ano passado. Escolhido para privilegiar o perfil recente da banca.
const RECENCY_HALF_LIFE_YEARS = 4
// Quantos anos, do fim para o começo, contam como "recente" no cálculo da tendência.
const TREND_SPLIT = 3

export type TopicPrediction = {
  tagId: string
  label: string
  slug: string
  dimension: DimensionKey
  /** Share (%) médio simples na janela toda. */
  shareAvg: number
  /** Share (%) ponderado por recência — base da previsão. */
  shareRecencyWeighted: number
  /** Inclinação da tendência em pontos percentuais por ano (regressão linear simples). */
  trendSlope: number
  /** Consistência 0–1 (1 = aparece de forma muito estável entre anos). */
  consistency: number
  /** Nº total de questões do tópico em todo o histórico (amostra). */
  sampleSize: number
  /** Último ano em que apareceu (null se nunca). */
  lastYear: number | null
  /** Score final 0–100 de prioridade de previsão. */
  score: number
  /** Projeção de questões na próxima prova (faixa e ponto central). */
  projLo: number
  projMid: number
  projHi: number
  /** Share (%) por ano — para sparkline/heatmap. */
  byYear: { year: number; share: number; count: number }[]
}

export type PrevisaoResult = {
  years: number[]
  /** Nº de questões por ano (denominador da normalização). */
  totalByYear: Record<number, number>
  /** Tamanho médio de prova usado para projetar a próxima. */
  avgExamSize: number
  predictions: TopicPrediction[]
  meta: {
    dimension: DimensionKey
    humanReviewedTagPct: number // % de tags revisadas por humano (qualidade do dado)
    generatedAtYear: number
    topicsNeverSeen: number
  }
}

function linregSlope(points: { x: number; y: number }[]): number {
  const n = points.length
  if (n < 2) return 0
  const sx = points.reduce((s, p) => s + p.x, 0)
  const sy = points.reduce((s, p) => s + p.y, 0)
  const sxx = points.reduce((s, p) => s + p.x * p.x, 0)
  const sxy = points.reduce((s, p) => s + p.x * p.y, 0)
  const denom = n * sxx - sx * sx
  if (denom === 0) return 0
  return (n * sxy - sx * sy) / denom
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/**
 * Calcula as previsões por tópico (ou módulo). `nextYear` é o ano-alvo da
 * projeção — usado só como referência do peso de recência (o ano mais recente
 * existente ganha peso máximo).
 */
export async function computePrevisao(opts: {
  dimension?: DimensionKey
  nextYear?: number
}): Promise<PrevisaoResult> {
  const dimension = opts.dimension ?? 'topico_edital'
  const service = createServiceClient()

  // 1) Questões com ano (só cadernos concluídos entram — questões existem só p/ done).
  const { data: qRows } = await service
    .from('questions')
    .select('id, exam_id, exams!inner(year)')
  const yearByQuestion = new Map<string, number>()
  for (const r of qRows ?? []) {
    const exam = r.exams as unknown as { year: number } | null
    if (exam?.year) yearByQuestion.set(r.id as string, exam.year)
  }

  // 2) Tags da dimensão pedida.
  const { data: tagRows } = await service
    .from('tags')
    .select('id, slug, label, dimension, is_active')
    .eq('dimension', dimension)
    .eq('is_active', true)
  const tagsById = new Map<string, { slug: string; label: string }>()
  for (const t of tagRows ?? []) {
    tagsById.set(t.id as string, { slug: t.slug as string, label: t.label as string })
  }

  // 3) Vínculos questão↔tag (+ origem, p/ medir qualidade do dado).
  const { data: qtRows } = await service
    .from('question_tags')
    .select('question_id, tag_id, added_by_type')
  let humanReviewed = 0
  let totalLinks = 0

  // Contagem por (tag, ano) e denominador por ano.
  const countByTagYear = new Map<string, Map<number, number>>()
  const totalByYear: Record<number, number> = {}
  const yearsSet = new Set<number>()

  // Denominador: nº de questões por ano (uma vez por questão).
  for (const [qid, year] of yearByQuestion) {
    void qid
    totalByYear[year] = (totalByYear[year] ?? 0) + 1
    yearsSet.add(year)
  }

  for (const link of qtRows ?? []) {
    const tagId = link.tag_id as string
    if (!tagsById.has(tagId)) continue
    const qid = link.question_id as string
    const year = yearByQuestion.get(qid)
    if (!year) continue
    totalLinks++
    if ((link.added_by_type as string) === 'human_review') humanReviewed++
    let m = countByTagYear.get(tagId)
    if (!m) {
      m = new Map<number, number>()
      countByTagYear.set(tagId, m)
    }
    m.set(year, (m.get(year) ?? 0) + 1)
  }

  const years = Array.from(yearsSet).sort((a, b) => a - b)
  const nextYear = opts.nextYear ?? (years.length ? years[years.length - 1] + 1 : 2026)
  const avgExamSize =
    years.length > 0
      ? Math.round(years.reduce((s, y) => s + (totalByYear[y] ?? 0), 0) / years.length)
      : 90

  // Peso de recência por ano (exponencial, ancorado no ano mais recente).
  const maxYear = years.length ? years[years.length - 1] : nextYear
  const recencyWeight = (year: number): number =>
    Math.pow(0.5, (maxYear - year) / RECENCY_HALF_LIFE_YEARS)
  const totalRecencyWeight = years.reduce((s, y) => s + recencyWeight(y), 0) || 1

  const predictions: TopicPrediction[] = []
  let topicsNeverSeen = 0

  for (const [tagId, meta] of tagsById) {
    const perYear = countByTagYear.get(tagId) ?? new Map<number, number>()

    const byYear = years.map((year) => {
      const count = perYear.get(year) ?? 0
      const denom = totalByYear[year] ?? 1
      return { year, count, share: (count / denom) * 100 }
    })

    const sampleSize = byYear.reduce((s, b) => s + b.count, 0)
    const lastYear =
      byYear.filter((b) => b.count > 0).map((b) => b.year).sort((a, b) => b - a)[0] ?? null
    if (sampleSize === 0) topicsNeverSeen++

    // Share médio simples.
    const shareAvg = byYear.reduce((s, b) => s + b.share, 0) / (byYear.length || 1)

    // Share ponderado por recência.
    const shareRecencyWeighted =
      byYear.reduce((s, b) => s + b.share * recencyWeight(b.year), 0) / totalRecencyWeight

    // Tendência: regressão do share ~ ano (pontos percentuais por ano).
    const trendSlope = linregSlope(byYear.map((b, i) => ({ x: i, y: b.share })))

    // Consistência: 1 − (desvio-padrão do share / (média + eps)). Clampeado 0–1.
    const sd = stddev(byYear.map((b) => b.share))
    const consistency = Math.max(0, Math.min(1, 1 - sd / (shareAvg + 1e-6)))

    // Score 0–100: recência (peso 55) + tendência (25) + consistência (20),
    // amortecido por amostra pequena (Bayesian shrink leve).
    // Normalizamos recência e tendência por escalas típicas desta prova.
    const recencyNorm = Math.min(1, shareRecencyWeighted / 8) // ~8% já é tópico muito pesado
    const trendNorm = Math.max(-1, Math.min(1, trendSlope / 1.5)) // ±1.5 pp/ano = extremo
    const shrink = sampleSize / (sampleSize + 3) // amostra <3 é puxada p/ baixo
    const rawScore =
      (recencyNorm * 55 + ((trendNorm + 1) / 2) * 25 + consistency * 20) * shrink
    const score = Math.round(Math.max(0, Math.min(100, rawScore)))

    // Projeção de questões na próxima prova: aplica share previsto ao tamanho médio.
    // Faixa = ± um erro grosseiro proporcional à dispersão e ao tamanho da amostra.
    const projShare = Math.max(shareRecencyWeighted + trendSlope, 0) / 100
    const projMidRaw = projShare * avgExamSize
    const spread = (sd / 100) * avgExamSize + 0.5 // meia questão de piso
    const projMid = Math.round(projMidRaw * 10) / 10
    const projLo = Math.max(0, Math.round((projMidRaw - spread) * 10) / 10)
    const projHi = Math.round((projMidRaw + spread) * 10) / 10

    predictions.push({
      tagId,
      label: meta.label,
      slug: meta.slug,
      dimension,
      shareAvg: Math.round(shareAvg * 10) / 10,
      shareRecencyWeighted: Math.round(shareRecencyWeighted * 10) / 10,
      trendSlope: Math.round(trendSlope * 100) / 100,
      consistency: Math.round(consistency * 100) / 100,
      sampleSize,
      lastYear,
      score,
      projLo,
      projMid,
      projHi,
      byYear,
    })
  }

  predictions.sort((a, b) => b.score - a.score)

  return {
    years,
    totalByYear,
    avgExamSize,
    predictions,
    meta: {
      dimension,
      humanReviewedTagPct: totalLinks > 0 ? Math.round((humanReviewed / totalLinks) * 1000) / 10 : 0,
      generatedAtYear: nextYear,
      topicsNeverSeen,
    },
  }
}
