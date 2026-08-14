import type { CommentsModelKey } from '@/lib/extraction/pipeline'

// Modelos de IA que o professor pode escolher ao gerar um comentário, com
// rótulo amigável e nota de custo/qualidade. Fonte única para UI + validação.
// Vive fora de comment-actions.ts porque um arquivo 'use server' só pode
// exportar funções async — uma const array aqui quebra o build.
export const COMMENT_MODEL_OPTIONS: { key: CommentsModelKey; label: string; hint: string }[] = [
  { key: 'sonnet', label: 'Claude Sonnet', hint: 'Equilíbrio custo/qualidade (padrão)' },
  { key: 'opus', label: 'Claude Opus', hint: 'Máxima qualidade, mais caro' },
  { key: 'haiku', label: 'Claude Haiku', hint: 'Rápido e econômico' },
]
