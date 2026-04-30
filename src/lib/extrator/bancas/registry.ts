import type { BancaParser, BancaDetectResult } from '../core/types'
import { bancaAmibTemi } from './amib_temi'
import { bancaGenerica } from './generico'

// Ordem importa apenas para desempate; o vencedor é quem dá maior score.
// `generico` é o fallback — fica por último.
const BANCAS: BancaParser[] = [bancaAmibTemi, bancaGenerica]

const MIN_SCORE_PARA_BANCA_ESPECIFICA = 0.5

export function listarBancas(): BancaParser[] {
  return [...BANCAS]
}

export function getBancaPorId(id: string): BancaParser {
  return BANCAS.find((b) => b.id === id) ?? bancaGenerica
}

export function detectarBanca(pdfText: string): BancaDetectResult {
  const scored = BANCAS.map((b) => ({ banca: b, score: b.detectar(pdfText) }))
  scored.sort((a, b) => b.score - a.score)
  const vencedor = scored[0]
  const banca =
    vencedor && vencedor.score >= MIN_SCORE_PARA_BANCA_ESPECIFICA && vencedor.banca.id !== 'generico'
      ? vencedor.banca
      : bancaGenerica
  return {
    banca,
    score: vencedor?.score ?? 0,
    versao: banca.detectarVersao(pdfText),
  }
}
