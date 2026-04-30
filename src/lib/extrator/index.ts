// API pública do extrator universal de provas.
// Para adicionar uma nova banca: crie um arquivo em ./bancas/<id>.ts
// implementando BancaParser e registre-o em ./bancas/registry.ts.

export * from './core'
export {
  detectarBanca,
  getBancaPorId,
  listarBancas,
  bancaAmibTemi,
  bancaGenerica,
} from './bancas'
export { parseGabaritoForExam } from './gabarito/run'
export type { ParseGabaritoResult } from './gabarito/run'
