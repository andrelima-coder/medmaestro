// Compat shim: a implementação real vive em @/lib/extrator/core/text-first.
// O novo módulo é parametrizado por banca; esta re-exportação preserva os
// símbolos para qualquer caller legado.
export { extractTextFirst, runPdftotext } from '@/lib/extrator/core/text-first'
export type {
  TextExtractedQuestion,
  TextExtractionResult,
} from '@/lib/extrator/core/text-first'
