/**
 * Harness de QA do pipeline de extração (P0-3).
 *
 * Avalia a fase TEXT-FIRST (offline, sem custo de API) contra um golden set
 * verificado à mão. Mede: cobertura do text-first, fidelidade de enunciado e
 * alternativas, e recall de "pista de figura" nas questões com imagem.
 *
 * Uso:
 *   npx tsx src/lib/extrator/eval/run-eval.ts src/lib/extrator/eval/golden/temi_2025_rosa.json
 *
 * A parte de Vision e de recorte de figuras exige rodada ao vivo (Supabase +
 * Anthropic); este harness cobre o que dá para medir de forma determinística e
 * gratuita, que é a maior parte do conteúdo. Estenda conforme necessário.
 */
import { readFileSync } from 'fs'
import { resolve, isAbsolute } from 'path'
import { extractTextFirst } from '../core/text-first'
import { detectarBanca, getBancaPorId } from '../bancas/registry'
import type { GoldenExam, ExamEvalReport, QuestionEval } from './types'

function normalize(s: string): string {
  return (s ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()
    .toLowerCase()
}

/** Similaridade 0..1 baseada em distância de Levenshtein normalizada. */
function similarity(a: string, b: string): number {
  a = normalize(a)
  b = normalize(b)
  if (a === b) return 1
  if (!a.length || !b.length) return 0
  const m = a.length
  const n = b.length
  const dp = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
      prev = tmp
    }
  }
  const dist = dp[n]
  return 1 - dist / Math.max(m, n)
}

const pct = (num: number, den: number): number =>
  den === 0 ? 0 : Number(((100 * num) / den).toFixed(1))

async function evaluate(goldenPath: string): Promise<ExamEvalReport> {
  const abs = isAbsolute(goldenPath) ? goldenPath : resolve(process.cwd(), goldenPath)
  const golden: GoldenExam = JSON.parse(readFileSync(abs, 'utf8'))

  const pdfAbs = isAbsolute(golden.pdf_path)
    ? golden.pdf_path
    : resolve(process.cwd(), golden.pdf_path)
  const pdfBuffer = readFileSync(pdfAbs)

  const banca = golden.extractor_id
    ? getBancaPorId(golden.extractor_id)
    : detectarBanca(pdfBuffer.toString('latin1').slice(0, 20000)).banca

  const text = await extractTextFirst(pdfBuffer, banca)
  const byNum = new Map(text.questions.map((q) => [q.question_number, q]))

  // Mesmos critérios de aceitação do pipeline (core/pipeline.ts).
  const TEXT_FIRST_MIN_CONFIDENCE = 0.7
  const acceptedByTextFirst = (qn: number): boolean => {
    const q = byNum.get(qn)
    if (!q) return false
    return (
      q.confidence >= TEXT_FIRST_MIN_CONFIDENCE &&
      !q.has_medical_image_hint &&
      Object.keys(q.alternatives).length >= 4 &&
      q.stem.length >= 30
    )
  }

  const per: QuestionEval[] = []
  let figGoldenTotal = 0
  let figHintHit = 0

  for (const g of golden.questions) {
    const ex = byNum.get(g.question_number)
    const found = !!ex
    const stemSim = ex ? similarity(g.stem, ex.stem) : 0
    const goldLetters = Object.keys(g.alternatives)
    let altCorrect = 0
    for (const L of goldLetters) {
      if (ex && normalize(ex.alternatives[L] ?? '') === normalize(g.alternatives[L] ?? '')) {
        altCorrect++
      }
    }
    const routed = !acceptedByTextFirst(g.question_number)

    if ((g.expected_figures ?? 0) > 0) {
      figGoldenTotal++
      if (ex?.has_medical_image_hint) figHintHit++
    }

    per.push({
      question_number: g.question_number,
      found,
      stem_exact: stemSim === 1,
      stem_similarity: Number(stemSim.toFixed(3)),
      alt_total: goldLetters.length,
      alt_correct: altCorrect,
      routed_to_vision: routed,
    })
  }

  const n = golden.questions.length
  const foundCount = per.filter((p) => p.found).length
  const stemExact = per.filter((p) => p.stem_exact).length
  const stemNear = per.filter((p) => p.stem_similarity >= 0.95).length
  const altTotal = per.reduce((s, p) => s + p.alt_total, 0)
  const altOk = per.reduce((s, p) => s + p.alt_correct, 0)
  const textFirstOk = per.filter((p) => !p.routed_to_vision).length

  return {
    label: golden.label,
    extractor_id: banca.id,
    golden_count: n,
    found_count: foundCount,
    stem_exact_pct: pct(stemExact, n),
    stem_near_pct: pct(stemNear, n),
    alt_accuracy_pct: pct(altOk, altTotal),
    text_first_coverage_pct: pct(textFirstOk, n),
    figure_hint_recall_pct: pct(figHintHit, figGoldenTotal),
    per_question: per,
  }
}

function printReport(r: ExamEvalReport): void {
  const line = '─'.repeat(56)
  console.log(line)
  console.log(`Avaliação de extração — ${r.label}  (banca: ${r.extractor_id})`)
  console.log(line)
  console.log(`Questões no golden:        ${r.golden_count}`)
  console.log(`Encontradas (text-first):  ${r.found_count}  (${pct(r.found_count, r.golden_count)}%)`)
  console.log(`Enunciado idêntico:        ${r.stem_exact_pct}%`)
  console.log(`Enunciado ~igual (≥0.95):  ${r.stem_near_pct}%`)
  console.log(`Alternativas corretas:     ${r.alt_accuracy_pct}%`)
  console.log(`Cobertura text-first:      ${r.text_first_coverage_pct}%  (resto → Vision)`)
  console.log(`Recall pista de figura:    ${r.figure_hint_recall_pct}%`)
  console.log(line)

  const problems = r.per_question.filter(
    (p) => !p.found || (p.stem_similarity < 0.95 && !p.routed_to_vision) || p.alt_correct < p.alt_total
  )
  if (problems.length) {
    console.log(`Itens a revisar (${problems.length}):`)
    for (const p of problems) {
      const flags = [
        !p.found ? 'NÃO ENCONTRADA' : null,
        p.found && p.stem_similarity < 0.95 ? `stem~${p.stem_similarity}` : null,
        p.alt_correct < p.alt_total ? `alts ${p.alt_correct}/${p.alt_total}` : null,
        p.routed_to_vision ? 'via Vision' : null,
      ]
        .filter(Boolean)
        .join(', ')
      console.log(`  Q${p.question_number}: ${flags}`)
    }
  } else {
    console.log('Sem divergências relevantes no text-first. ✅')
  }
  console.log(line)
}

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('Uso: npx tsx src/lib/extrator/eval/run-eval.ts <golden.json>')
    process.exit(1)
  }
  try {
    const report = await evaluate(arg)
    printReport(report)
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(report, null, 2))
    }
  } catch (err) {
    console.error('Falha na avaliação:', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

main()
