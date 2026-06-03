// Tipos do golden set (gabarito-ouro) para avaliação do pipeline de extração.
// Ver README.md nesta pasta.

export type GoldenQuestion = {
  question_number: number
  stem: string
  alternatives: Record<string, string> // { "A": "...", "B": "...", ... }
  /** nº de figuras esperadas na questão (0 se questão puramente textual) */
  expected_figures?: number
  /** tipos de figura esperados, vocabulário da banca (ecg, curva_pv, ...) */
  expected_figure_types?: string[]
}

export type GoldenExam = {
  /** identificador legível, ex.: "TEMI 2025 ROSA" */
  label: string
  /** id do extrator/banca esperado, ex.: "amib_temi" (opcional: autodetecta) */
  extractor_id?: string
  /** caminho do PDF relativo à raiz do projeto OU absoluto */
  pdf_path: string
  questions: GoldenQuestion[]
}

export type QuestionEval = {
  question_number: number
  found: boolean
  stem_exact: boolean
  stem_similarity: number // 0..1
  alt_total: number
  alt_correct: number
  routed_to_vision: boolean // text-first rejeitaria → cairia na Vision
}

export type ExamEvalReport = {
  label: string
  extractor_id: string
  golden_count: number
  found_count: number
  stem_exact_pct: number
  stem_near_pct: number // similaridade >= 0.95
  alt_accuracy_pct: number
  text_first_coverage_pct: number // % aceitas direto pelo text-first (sem IA)
  figure_hint_recall_pct: number // dentre questões com figura no golden, % com pista detectada
  per_question: QuestionEval[]
}
