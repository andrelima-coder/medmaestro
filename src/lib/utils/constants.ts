// Textos de feedback reutilizados nas telas de revisão. AGENTS.md pede pra
// não hardcodar strings de usuário direto no componente — este arquivo é o
// início dessa consolidação (a maior parte do app ainda não segue a regra;
// não é uma tentativa de migrar tudo de uma vez, só de não crescer o problema).

// Emoji ilustrativo dos módulos do edital (tags dimension='modulo').
// Atribuição automática: slug conhecido > palavra-chave no nome > fallback.
// Módulo novo cadastrado no banco ganha emoji sem precisar mexer aqui,
// desde que o nome contenha um dos termos abaixo.
export const MODULO_EMOJI: Record<string, string> = {
  cardiovascular: '🫀',
  respiratorio: '🫁',
  neurologico: '🧠',
  renal: '🫘',
  infeccioso: '🦠',
  gastro_nutricao: '🍽️',
  hemato_onco: '🩸',
  trauma_cirurgia: '🚑',
  medicina_perioperatoria: '💉',
  etica_qualidade: '⚖️',
  metodologia_mbe: '📊',
  endocrino: '🧪',
  toxicologia: '☠️',
}

export const MODULO_EMOJI_FALLBACK = '📚'

// Ordem importa: o primeiro termo encontrado no texto define o emoji.
const MODULO_EMOJI_KEYWORDS: [string, string][] = [
  ['cardio', '🫀'],
  ['coracao', '🫀'],
  ['respirat', '🫁'],
  ['pulm', '🫁'],
  ['ventila', '🫁'],
  ['neuro', '🧠'],
  ['renal', '🫘'],
  ['nefro', '🫘'],
  ['infec', '🦠'],
  ['sepse', '🦠'],
  ['microbio', '🦠'],
  ['gastro', '🍽️'],
  ['nutri', '🍽️'],
  ['hepat', '🍽️'],
  ['hemato', '🩸'],
  ['onco', '🩸'],
  ['coagula', '🩸'],
  ['trauma', '🚑'],
  ['cirurg', '🚑'],
  ['emergencia', '🚑'],
  ['perioperat', '💉'],
  ['anestes', '💉'],
  ['etica', '⚖️'],
  ['qualidade', '⚖️'],
  ['gestao', '⚖️'],
  ['metodolog', '📊'],
  ['estatistic', '📊'],
  ['mbe', '📊'],
  ['endocrino', '🧪'],
  ['metabol', '🧪'],
  ['diabet', '🧪'],
  ['toxico', '☠️'],
  ['intoxica', '☠️'],
  ['imagem', '🩻'],
  ['radiolog', '🩻'],
  ['ultrassom', '🩻'],
  ['ecograf', '🩻'],
  ['pediatr', '🧒'],
  ['obstetr', '🤰'],
  ['gesta', '🤰'],
  ['dermato', '🩹'],
  ['reumato', '🦴'],
  ['ortoped', '🦴'],
  ['psiquiatr', '💭'],
  ['paliativ', '🕊️'],
  ['imuno', '🛡️'],
  ['farmaco', '💊'],
]

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Atribui o emoji de um módulo automaticamente a partir do slug e do nome. */
export function getModuloEmoji(slug: string, label: string): string {
  const explicito = MODULO_EMOJI[slug]
  if (explicito) return explicito
  const texto = `${normalizar(slug.replace(/_/g, ' '))} ${normalizar(label)}`
  for (const [termo, emoji] of MODULO_EMOJI_KEYWORDS) {
    if (texto.includes(termo)) return emoji
  }
  return MODULO_EMOJI_FALLBACK
}

export const REVIEW_FEEDBACK = {
  approveFailed: 'Falha ao aprovar — o card continua pendente (sem permissão?).',
  discardFailed: 'Falha ao descartar — o card continua na fila (sem permissão?).',
  editSavedApproveFailed: 'Edição salva, mas a aprovação falhou — card continua pendente.',
  variationApproveFailed: (detail?: string) =>
    `Erro: ${detail ?? 'não foi possível aprovar (sem permissão?)'}`,
  variationDiscardFailed: 'Erro: não foi possível descartar (sem permissão?)',
} as const
