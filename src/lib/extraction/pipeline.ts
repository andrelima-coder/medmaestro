// Compat shim: a implementação real vive em @/lib/extrator/core/pipeline.
// Mantido para não quebrar rotas API e server actions já existentes.
export {
  runExtractionPipeline,
  generateComment,
  generateTeacherTips,
  ensureTeacherTips,
} from '@/lib/extrator/core/pipeline'
