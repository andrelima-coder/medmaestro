// Textos de feedback reutilizados nas telas de revisão. AGENTS.md pede pra
// não hardcodar strings de usuário direto no componente — este arquivo é o
// início dessa consolidação (a maior parte do app ainda não segue a regra;
// não é uma tentativa de migrar tudo de uma vez, só de não crescer o problema).

export const REVIEW_FEEDBACK = {
  approveFailed: 'Falha ao aprovar — o card continua pendente (sem permissão?).',
  discardFailed: 'Falha ao descartar — o card continua na fila (sem permissão?).',
  editSavedApproveFailed: 'Edição salva, mas a aprovação falhou — card continua pendente.',
  variationApproveFailed: (detail?: string) =>
    `Erro: ${detail ?? 'não foi possível aprovar (sem permissão?)'}`,
  variationDiscardFailed: 'Erro: não foi possível descartar (sem permissão?)',
} as const
