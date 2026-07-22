/**
 * Rótulo canônico de exame — AUDITORIA 2026-07.
 *
 * Antes o mesmo caderno aparecia como "AMIB 2024", "Medicina Intensiva 2024 rosa"
 * e "Medicina Intensiva 2024 · rosa" dependendo da tela/export. Formato único:
 *
 *   "<nome> <ano> · <cor>"   (cor omitida quando ausente)
 *
 * `name` aceita o que estiver disponível no contexto (specialty.name ou
 * exam_boards.short_name) — preferir specialty quando houver.
 */
export function examLabel(parts: {
  name?: string | null
  year?: number | null
  bookletColor?: string | null
}): string {
  const name = parts.name?.trim() || 'Exame'
  const year = parts.year != null ? ` ${parts.year}` : ''
  const color = parts.bookletColor ? ` · ${parts.bookletColor}` : ''
  return `${name}${year}${color}`.trim()
}
