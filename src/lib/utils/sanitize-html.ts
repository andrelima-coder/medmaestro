// Sanitizador minimalista para HTML produzido pelo RichTextEditor.
// Whitelist conservadora: tags estruturais e formatação inline.
// Não usa DOM — funciona em runtime Node sem dependências.

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'sub',
  'sup',
  'ul',
  'ol',
  'li',
  'span',
])

// Remove qualquer tag com atributos (style/onerror/href etc.). O editor
// nunca injeta atributos, então uma tag "limpa" é suficiente.
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*)?>/g

export function sanitizeRichTextHtml(input: string | null | undefined): string {
  if (!input) return ''
  // 1) Remove scripts/styles inteiros
  let html = input.replace(/<script\b[\s\S]*?<\/script>/gi, '')
  html = html.replace(/<style\b[\s\S]*?<\/style>/gi, '')
  // 2) Filtra tags fora do whitelist e descarta atributos das permitidas
  html = html.replace(TAG_RE, (_match, slash: string, tag: string) => {
    const lower = tag.toLowerCase()
    if (!ALLOWED_TAGS.has(lower)) return ''
    return `<${slash}${lower}>`
  })
  // 3) Remove handlers javascript: residuais (defensivo)
  html = html.replace(/javascript:/gi, '')
  return html.trim()
}

export function htmlToPlainText(input: string | null | undefined): string {
  if (!input) return ''
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
