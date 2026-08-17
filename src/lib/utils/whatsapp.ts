// Normalização de número de WhatsApp brasileiro para E.164.
//
// Aceita entrada com máscara, espaços, +55, zero de operadora etc. e devolve
// sempre `+55DDXXXXXXXXX` (celular com 9º dígito). Não verifica existência do
// número — apenas formato plausível de celular BR (DDD 11–99 + 9 dígitos).

export function normalizeWhatsapp(raw: string): string | null {
  let d = raw.replace(/\D/g, '')
  if (!d) return null
  d = d.replace(/^0+/, '')
  // Remove o DDI 55 quando presente (12–13 dígitos restantes).
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2)

  if (d.length !== 10 && d.length !== 11) return null

  const ddd = Number(d.slice(0, 2))
  if (ddd < 11 || ddd > 99) return null

  if (d.length === 11) {
    // Celular atual: 9º dígito obrigatório.
    if (d[2] !== '9') return null
    return `+55${d}`
  }

  // 10 dígitos: celular antigo (6–9 no início) ganha o 9; fixo não é WhatsApp.
  if (!'6789'.includes(d[2])) return null
  return `+55${d.slice(0, 2)}9${d.slice(2)}`
}
