// Tipos compartilhados pelo extrator universal de provas.
// Cada plugin de banca implementa BancaParser e é registrado em bancas/index.ts.

export type GabaritoEntry = {
  letra: string // 'A'..'E' ou 'X' para anuladas
  alterada: boolean
  nota: string | null // ex.: "Alterada de B para C"
}

export type GabaritoResult = {
  byVersion: Record<string, Record<number, GabaritoEntry>>
  alteracoes: Array<{ question: number; version: string; from: string; to: string }>
  raw: string
}

export type BancaDetectResult = {
  banca: BancaParser
  score: number
  versao: string | null
}

export interface BancaParser {
  /** Identificador estável (slug). Usado em exams.banca_id. */
  readonly id: string
  /** Nome legível para UI. */
  readonly nome: string

  /**
   * Confiança 0..1 de que este parser reconhece o PDF.
   * Recebe o texto bruto extraído via pdftotext.
   */
  detectar(pdfText: string): number

  /** Detecta a versão da prova (ex.: "ROSA"), se a banca tiver versões. */
  detectarVersao(pdfText: string): string | null

  /** Padrão regex global para localizar o início de cada questão. */
  regexQuestao(): RegExp

  /** Padrão regex para alternativas (A./A)/A-). Deve aceitar A..E. */
  regexAlternativa(): RegExp

  /** Lista de versões conhecidas (ex.: ['AMARELO','AZUL','ROSA','VERDE']) ou []. */
  readonly versoesConhecidas: readonly string[]

  /** Prompt customizado para extração via Claude Vision. */
  promptVision(): string

  /** Vocabulário de tipos de imagem que esta banca/especialidade costuma ter. */
  readonly vocabImagens: readonly string[]

  /** Parse do texto do PDF de gabarito. */
  parseGabarito(text: string): GabaritoResult
}
