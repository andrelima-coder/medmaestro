// Ponto único de exportação dos plugins de banca.
// Para adicionar uma nova banca:
//   1. crie ./minha_banca.ts implementando BancaParser
//   2. adicione no array BANCAS em registry.ts
export { bancaAmibTemi } from './amib_temi'
export { bancaGenerica } from './generico'
export {
  detectarBanca,
  getBancaPorId,
  listarBancas,
} from './registry'
