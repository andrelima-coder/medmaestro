const COLORS = ['AMARELO', 'AZUL', 'ROSA', 'VERDE'] as const
type Color = (typeof COLORS)[number]

export type GabaritoResult = {
  byColor: Record<string, Record<number, string>> // cor → qNum → 'A'..'E' | 'X'(anulada)
  alteracoes: Array<{ question: number; color: string; from: string; to: string }>
  raw: string
}

function normalizeAnswer(token: string): string | null {
  const t = token.toUpperCase().trim()
  if (/^[A-E]$/.test(t)) return t
  if (/ANULAD/i.test(t)) return 'X'
  return null
}

// Strategy 1: tabela com colunas AMARELO/AZUL/ROSA/VERDE
function parseTable(lines: string[]): Record<string, Record<number, string>> | null {
  const headerIdx = lines.findIndex((l) => COLORS.filter((c) => l.includes(c)).length >= 2)
  if (headerIdx < 0) return null

  const headerLine = lines[headerIdx]
  const colorOrder = COLORS.filter((c) => headerLine.includes(c))
  if (colorOrder.length === 0) return null

  const byColor: Record<string, Record<number, string>> = {}
  for (const c of COLORS) byColor[c] = {}

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/ALTERA/i.test(line)) break

    const tokens = line.split(/\s+/)
    const qNum = parseInt(tokens[0], 10)
    if (isNaN(qNum) || qNum <= 0) continue

    colorOrder.forEach((color, ci) => {
      const ans = normalizeAnswer(tokens[ci + 1] ?? '')
      if (ans) byColor[color][qNum] = ans
    })
  }

  const totalEntries = Object.values(byColor).reduce((s, m) => s + Object.keys(m).length, 0)
  return totalEntries > 0 ? byColor : null
}

// Strategy 2: lista simples "N. A" ou "N) A" — aplica a todas as cores
function parseSimpleList(text: string): Record<string, Record<number, string>> | null {
  const byColor: Record<string, Record<number, string>> = {}
  for (const c of COLORS) byColor[c] = {}

  const pattern = /^\s*(\d+)\s*[.)]\s*([A-EXx]|ANULAD\w*)\s*$/gim
  let match: RegExpExecArray | null
  let count = 0

  while ((match = pattern.exec(text)) !== null) {
    const qNum = parseInt(match[1], 10)
    const ans = normalizeAnswer(match[2])
    if (!ans || qNum <= 0) continue
    for (const c of COLORS) byColor[c][qNum] = ans
    count++
  }

  return count > 0 ? byColor : null
}

function parseAlteracoes(
  text: string,
  byColor: Record<string, Record<number, string>>
): Array<{ question: number; color: string; from: string; to: string }> {
  const altSection = text.match(/ALTERA[ÇC][OÕ]ES?([\s\S]*)/i)?.[1] ?? ''
  const alteracoes: Array<{ question: number; color: string; from: string; to: string }> = []

  // "Questão 12 COR AZUL: gabarito alterado de A para B"
  // "Questão 5 (AZUL): de C para D"
  const pattern =
    /[Qq]uest[aã]o\s+(\d+)[^A-Z]{0,40}(AMARELO|AZUL|ROSA|VERDE)[^A-E]{0,20}([A-E])[^A-E]{1,20}([A-E])/gi
  let m: RegExpExecArray | null

  while ((m = pattern.exec(altSection)) !== null) {
    const question = parseInt(m[1], 10)
    const color = m[2].toUpperCase()
    const from = m[3].toUpperCase()
    const to = m[4].toUpperCase()
    alteracoes.push({ question, color, from, to })
    if (byColor[color]) byColor[color][question] = to
  }

  return alteracoes
}

export function parseGabarito(text: string): GabaritoResult {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const byColor = parseTable(lines) ?? parseSimpleList(text) ?? (() => {
    const empty: Record<string, Record<number, string>> = {}
    for (const c of COLORS) empty[c] = {}
    return empty
  })()

  const alteracoes = parseAlteracoes(text, byColor)

  return { byColor, alteracoes, raw: text }
}
