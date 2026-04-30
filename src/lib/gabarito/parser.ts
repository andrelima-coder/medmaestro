// Compat shim. O parsing universal agora é responsabilidade dos plugins de
// banca (ver @/lib/extrator/bancas/*). Esta API antiga continua disponível
// somente para AMIB-TEMI, mantida para qualquer caller legado.
import { bancaAmibTemi } from '@/lib/extrator/bancas/amib_temi'

const COLORS = ['AMARELO', 'AZUL', 'ROSA', 'VERDE'] as const

export type GabaritoResult = {
  byColor: Record<string, Record<number, string>>
  alteracoes: Array<{ question: number; color: string; from: string; to: string }>
  raw: string
}

export function parseGabarito(text: string): GabaritoResult {
  const result = bancaAmibTemi.parseGabarito(text)
  const byColor: Record<string, Record<number, string>> = {}
  for (const c of COLORS) byColor[c] = {}
  for (const [version, entries] of Object.entries(result.byVersion)) {
    if (!COLORS.includes(version as (typeof COLORS)[number])) continue
    for (const [qNum, entry] of Object.entries(entries)) {
      byColor[version][parseInt(qNum, 10)] = entry.letra
    }
  }
  return {
    byColor,
    alteracoes: result.alteracoes.map((a) => ({
      question: a.question,
      color: a.version,
      from: a.from,
      to: a.to,
    })),
    raw: result.raw,
  }
}
