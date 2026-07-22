/**
 * AUDITORIA 2026-07: este módulo foi UNIFICADO com `@/lib/utils/sanitize-html`.
 *
 * Antes existiam dois sanitizadores divergentes: este (que NÃO permitia <img>
 * nem tabelas) e o de utils (que permite <img> do proxy interno/data: e
 * tabelas). Flashcards salvos por um fluxo eram mutilados pelo outro —
 * imagens coladas sumiam silenciosamente.
 *
 * Agora há UMA política de sanitização (a de utils). Este arquivo permanece
 * apenas como camada de compatibilidade de import.
 */
export {
  sanitizeRichTextHtml,
  sanitizeRichTextHtml as sanitizeHtml,
  htmlToPlainText,
  isHtml,
} from '@/lib/utils/sanitize-html'
