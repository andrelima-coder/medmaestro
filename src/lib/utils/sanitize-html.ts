// Sanitizador minimalista para HTML produzido pelo RichTextEditor.
// Whitelist conservadora: tags estruturais, formatação inline e <img>.
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
  'img',
])

// <img> recebe tratamento especial: preservamos src/alt/width/height,
// mas só src apontando para nosso proxy interno ou data: image.
const IMG_SRC_OK = /^(\/api\/qa-image\/|data:image\/(png|jpeg|jpg|webp);)/i

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*)?>/g

function sanitizeImg(attrs: string): string | null {
  const srcMatch = attrs.match(/\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)
  const src = srcMatch?.[2] ?? srcMatch?.[3] ?? srcMatch?.[4] ?? ''
  if (!src || !IMG_SRC_OK.test(src)) return null

  const altMatch = attrs.match(/\balt\s*=\s*("([^"]*)"|'([^']*)')/i)
  const alt = (altMatch?.[2] ?? altMatch?.[3] ?? '')
    .replace(/[<>"]/g, '')
    .slice(0, 240)

  return `<img src="${src.replace(/[<>"]/g, '')}" alt="${alt}">`
}

export function sanitizeRichTextHtml(input: string | null | undefined): string {
  if (!input) return ''
  let html = input.replace(/<script\b[\s\S]*?<\/script>/gi, '')
  html = html.replace(/<style\b[\s\S]*?<\/style>/gi, '')
  html = html.replace(TAG_RE, (_match, slash: string, tag: string, attrs: string | undefined) => {
    const lower = tag.toLowerCase()
    if (!ALLOWED_TAGS.has(lower)) return ''
    if (lower === 'img') {
      if (slash) return ''
      const sanitized = sanitizeImg(attrs ?? '')
      return sanitized ?? ''
    }
    return `<${slash}${lower}>`
  })
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
