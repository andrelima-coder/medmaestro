import type { BancaParser, GabaritoResult, GabaritoEntry } from '../core/types'

const VERSOES = ['AMARELO', 'AZUL', 'ROSA', 'VERDE'] as const
type Versao = (typeof VERSOES)[number]

const REGEX_QUESTAO = /(?:^|\n)\s*QUEST[ÃA]O\s+(\d{1,3})\s*\b/gi
// Aceita "A.", "A)", "A -", "A:" como início de alternativa.
const REGEX_ALTERNATIVA = /(^|\n)\s*([A-E])[\s.\)\-:]+/g

const PROMPT = `Você é um extrator de questões de provas médicas brasileiras (AMIB / TEMI - Medicina Intensiva).
Analise estas páginas e extraia TODAS as questões visíveis.

As páginas estão numeradas a partir de 0 (primeira imagem = índice 0, segunda = 1, etc.).

Para cada questão, retorne um objeto JSON com:
- question_number: número da questão (inteiro)
- stem: enunciado completo
- alternatives: { "A": "...", "B": "...", "C": "...", "D": "...", "E": "" }
  → Para alternativa que é IMAGEM (ECG, gráfico, capnografia, etc.), preencha como STRING VAZIA "". A figura será extraída via images[] abaixo.
- has_images: boolean (true se a questão contém qualquer figura médica)
- images: ARRAY de objetos, UM POR FIGURA distinta na questão. Vazio se has_images=false.
  Cada item tem:
    - scope: "statement" | "alternative_a" | "alternative_b" | "alternative_c" | "alternative_d" | "alternative_e"
    - type: "ecg"|"radiografia"|"tomografia"|"ultrassom"|"grafico_pv"|"grafico_guyton"|"grafico_ventilacao"|"capnografia"|"rotem"|"eeg"|"tabela"|"esquema"|"outro"
    - page_index: ÍNDICE (0-based) da imagem dentro deste batch que CONTÉM esta figura
    - bbox_pct: [x, y, w, h] em PORCENTAGEM (0–100) delimitando APENAS esta figura na página (x,y = canto superior esquerdo, w,h = largura/altura). NÃO inclua a letra A/B/C/D adjacente, apenas o gráfico.
- confidence: 1 a 5 (confiança na extração — 5 = perfeito, 1 = muito incerto)
- is_complete: boolean (true se todas as alternativas estão visíveis nestas páginas)

IMPORTANTE:
- provas TEMI possuem 4 alternativas (A-D) na maioria das questões; preencha "E" como "" se não existir.
- Quando uma questão tem 4 alternativas em IMAGEM (ex.: 4 ECGs), retorne 4 itens em images[], um para cada (scope alternative_a, alternative_b, alternative_c, alternative_d), CADA UM com seu próprio bbox_pct.
- NUNCA marque has_images=true para a página de capa/instruções da prova (ex.: "PROVA ROSA", "CADERNO DE QUESTÕES"). Ela não pertence a nenhuma questão.
- bbox_pct é OBRIGATÓRIO em todo item de images[]. Sem ele a figura não é capturada.

Retorne APENAS um JSON array. Sem markdown, sem explicação.`

const VOCAB_IMAGENS = [
  'ecg',
  'radiografia',
  'tomografia',
  'ultrassom',
  'grafico_pv',
  'grafico_guyton',
  'grafico_ventilacao',
  'capnografia',
  'rotem',
  'eeg',
  'tabela',
  'esquema',
  'outro',
]

function normalizarLetra(token: string): string | null {
  const t = token.toUpperCase().trim()
  if (/^[A-E]$/.test(t)) return t
  if (/ANULAD/i.test(t)) return 'X'
  return null
}

// Tabela com colunas AMARELO/AZUL/ROSA/VERDE (layout TEMI clássico).
function parseTabelaCores(
  lines: string[]
): Record<Versao, Record<number, string>> | null {
  const headerIdx = lines.findIndex(
    (l) => VERSOES.filter((c) => l.includes(c)).length >= 2
  )
  if (headerIdx < 0) return null

  const headerLine = lines[headerIdx]
  const colorOrder = VERSOES.filter((c) => headerLine.includes(c))
  if (colorOrder.length === 0) return null

  const byColor = {} as Record<Versao, Record<number, string>>
  for (const c of VERSOES) byColor[c] = {}

  // Detecta tabela em 2 colunas lado a lado.
  const blocksInHeader = VERSOES.reduce(
    (n, c) => n + (headerLine.split(c).length - 1),
    0
  )
  const blocks = blocksInHeader >= colorOrder.length * 2 ? 2 : 1
  const blockSize = colorOrder.length + 1

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/ALTERA/i.test(line)) break

    const tokens = line.split(/\s+/)

    for (let b = 0; b < blocks; b++) {
      const offset = b * blockSize
      const qNum = parseInt(tokens[offset] ?? '', 10)
      if (isNaN(qNum) || qNum <= 0) continue

      colorOrder.forEach((color, ci) => {
        const ans = normalizarLetra(tokens[offset + ci + 1] ?? '')
        if (ans) byColor[color][qNum] = ans
      })
    }
  }

  const totalEntries = Object.values(byColor).reduce(
    (s, m) => s + Object.keys(m).length,
    0
  )
  return totalEntries > 0 ? byColor : null
}

function parseAlteracoes(
  text: string,
  byColor: Record<Versao, Record<number, string>>
): Array<{ question: number; version: string; from: string; to: string }> {
  const altSection = text.match(/ALTERA[ÇC][OÕ]ES?([\s\S]*)/i)?.[1] ?? ''
  const alteracoes: Array<{ question: number; version: string; from: string; to: string }> = []

  // Padrão clássico: "Cadernos: AMARELA questão 70, AZUL questão 20, ... alterados de B para A"
  // ou "Questão 12 COR AZUL: gabarito alterado de A para B"
  const padrao =
    /[Qq]uest[aã]o\s+(\d+)[^A-Z]{0,40}(AMAREL[OA]|AZUL|ROSA|VERDE)[^A-E]{0,20}([A-E])[^A-E]{1,20}([A-E])/gi
  let m: RegExpExecArray | null

  while ((m = padrao.exec(altSection)) !== null) {
    const question = parseInt(m[1], 10)
    let version = m[2].toUpperCase()
    if (version === 'AMARELA') version = 'AMARELO'
    const from = m[3].toUpperCase()
    const to = m[4].toUpperCase()
    alteracoes.push({ question, version, from, to })
    if (byColor[version as Versao]) byColor[version as Versao][question] = to
  }

  // Padrão coletivo: "Cadernos: AMARELA questão 70, AZUL questão 20, ROSA questão 30 e VERDE questão 47, alterados de B para A"
  const padraoColetivo =
    /Cadernos?:\s*([\s\S]*?)alterad[oa]s?\s+de\s+([A-E])\s+para\s+([A-E])/gi
  let mc: RegExpExecArray | null
  while ((mc = padraoColetivo.exec(altSection)) !== null) {
    const blocoCadernos = mc[1]
    const from = mc[2].toUpperCase()
    const to = mc[3].toUpperCase()
    const itens =
      /(AMAREL[OA]|AZUL|ROSA|VERDE)\s+quest[aã]o\s+(\d+)/gi
    let mi: RegExpExecArray | null
    while ((mi = itens.exec(blocoCadernos)) !== null) {
      let version = mi[1].toUpperCase()
      if (version === 'AMARELA') version = 'AMARELO'
      const question = parseInt(mi[2], 10)
      if (alteracoes.some((a) => a.question === question && a.version === version)) continue
      alteracoes.push({ question, version, from, to })
      if (byColor[version as Versao]) byColor[version as Versao][question] = to
    }
  }

  return alteracoes
}

export const bancaAmibTemi: BancaParser = {
  id: 'amib_temi',
  nome: 'AMIB - TEMI',
  versoesConhecidas: VERSOES,
  vocabImagens: VOCAB_IMAGENS,

  detectar(pdfText: string): number {
    let score = 0
    if (/AMIB/i.test(pdfText)) score += 0.4
    if (/TEMI/i.test(pdfText)) score += 0.4
    if (/MEDICINA\s+INTENSIVA/i.test(pdfText)) score += 0.2
    if (/PROVA\s+(AMARELA|AZUL|ROSA|VERDE)/i.test(pdfText)) score += 0.2
    if (/QUEST[ÃA]O\s+\d+/i.test(pdfText)) score += 0.1
    return Math.min(1, score)
  },

  detectarVersao(pdfText: string): string | null {
    const m = pdfText.match(/PROVA\s+(AMARELA|AZUL|ROSA|VERDE)/i)
    if (!m) return null
    const v = m[1].toUpperCase()
    return v === 'AMARELA' ? 'AMARELO' : v
  },

  regexQuestao(): RegExp {
    return new RegExp(REGEX_QUESTAO.source, REGEX_QUESTAO.flags)
  },

  regexAlternativa(): RegExp {
    return new RegExp(REGEX_ALTERNATIVA.source, REGEX_ALTERNATIVA.flags)
  },

  promptVision(): string {
    return PROMPT
  },

  parseGabarito(text: string): GabaritoResult {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    const byColorRaw =
      parseTabelaCores(lines) ??
      ((): Record<Versao, Record<number, string>> => {
        const empty = {} as Record<Versao, Record<number, string>>
        for (const c of VERSOES) empty[c] = {}
        return empty
      })()

    const alteracoes = parseAlteracoes(text, byColorRaw)

    const byVersion: Record<string, Record<number, GabaritoEntry>> = {}
    for (const [version, answers] of Object.entries(byColorRaw)) {
      byVersion[version] = {}
      for (const [qNumStr, letra] of Object.entries(answers)) {
        const qNum = parseInt(qNumStr, 10)
        const alteracao = alteracoes.find(
          (a) => a.question === qNum && a.version === version
        )
        byVersion[version][qNum] = {
          letra,
          alterada: !!alteracao,
          nota: alteracao ? `Alterada de ${alteracao.from} para ${alteracao.to}` : null,
        }
      }
    }

    return { byVersion, alteracoes, raw: text }
  },
}
