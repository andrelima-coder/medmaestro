import type { BancaParser, GabaritoResult, GabaritoEntry } from '../core/types'

// Cobre formatos comuns de outras bancas:
//   "QUESTÃO 12", "QUESTAO 12", "Questão 12", "12.", "12)", "Q12"
const REGEX_QUESTAO =
  /(?:^|\n)\s*(?:QUEST[ÃA]O\s+|Q\.?\s*)(\d{1,3})\s*\b|(?:^|\n)\s*(\d{1,3})[\s.\)\-]+(?=[A-ZÁÉÍÓÚÂÊÔÇ])/g

const REGEX_ALTERNATIVA = /(^|\n)\s*\(?([A-E])\)?[\s.\)\-:]+/g

const PROMPT = `Você é um extrator de questões de provas médicas brasileiras.
Analise estas páginas e extraia TODAS as questões visíveis.

As páginas estão numeradas a partir de 0 (primeira imagem = índice 0, segunda = 1, etc.).

Para cada questão, retorne um objeto JSON com:
- question_number: número da questão (inteiro)
- stem: enunciado completo
- alternatives: { "A": "...", "B": "...", "C": "...", "D": "...", "E": "..." }
- has_images: boolean (true se a questão contém imagens médicas, figuras, gráficos ou tabelas)
- image_type: "ecg"|"radiografia"|"tomografia"|"ultrassom"|"grafico"|"tabela"|"esquema"|"foto_clinica"|"outro" (null se has_images=false)
- image_scope: "statement"|"alternative_a"|"alternative_b"|"alternative_c"|"alternative_d"|"alternative_e" (null se sem imagem)
- image_page_index: ÍNDICE (0-based) da imagem dentro deste batch que CONTÉM a figura/gráfico da questão. Null se has_images=false.
- confidence: 1 a 5
- is_complete: boolean (true se todas as alternativas estão visíveis)

Algumas alternativas podem ser imagens (gráficos, ECGs, etc) — quando isso ocorrer, descreva brevemente em texto.

IMPORTANTE: NUNCA marque has_images=true para páginas de capa, instruções ou cabeçalhos de prova. image_page_index é OBRIGATÓRIO quando has_images=true.

Retorne APENAS um JSON array. Sem markdown, sem explicação.`

const VOCAB_IMAGENS = [
  'ecg',
  'radiografia',
  'tomografia',
  'ultrassom',
  'grafico',
  'tabela',
  'esquema',
  'foto_clinica',
  'outro',
]

function normalizarLetra(token: string): string | null {
  const t = token.toUpperCase().trim()
  if (/^[A-E]$/.test(t)) return t
  if (/ANULAD/i.test(t)) return 'X'
  return null
}

// Lista simples: "1. A", "1) A", "1 - A", "Questão 1: A"
function parseListaSimples(
  text: string
): Record<number, string> | null {
  const padrao =
    /(?:^|\n)\s*(?:Quest[aã]o\s+)?(\d{1,3})\s*[.):\-]\s*([A-EXx]|ANULAD\w*)\s*$/gim
  const answers: Record<number, string> = {}
  let m: RegExpExecArray | null
  while ((m = padrao.exec(text)) !== null) {
    const qNum = parseInt(m[1], 10)
    const ans = normalizarLetra(m[2])
    if (!ans || qNum <= 0) continue
    answers[qNum] = ans
  }
  return Object.keys(answers).length > 0 ? answers : null
}

export const bancaGenerica: BancaParser = {
  id: 'generico',
  nome: 'Genérico (auto-detecção)',
  versoesConhecidas: [],
  vocabImagens: VOCAB_IMAGENS,

  // Sempre retorna 0.1 — só vence se nenhuma banca específica casou.
  detectar(): number {
    return 0.1
  },

  detectarVersao(): string | null {
    return null
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
    const answers = parseListaSimples(text) ?? {}
    const byVersion: Record<string, Record<number, GabaritoEntry>> = {
      UNICA: {},
    }
    for (const [qNumStr, letra] of Object.entries(answers)) {
      byVersion.UNICA[parseInt(qNumStr, 10)] = {
        letra,
        alterada: false,
        nota: null,
      }
    }
    return { byVersion, alteracoes: [], raw: text }
  },
}
