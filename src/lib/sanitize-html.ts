const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 'br', 'p', 'div', 'span',
  'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'code', 'pre',
  'a',
])

const ALLOWED_ATTRS_BY_TAG: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
}

const URL_SCHEME_OK = /^(https?:|mailto:|#|\/)/i

function sanitizeNode(node: Node, out: string[]): void {
  if (node.nodeType === 3) {
    out.push(escapeText(node.nodeValue ?? ''))
    return
  }
  if (node.nodeType !== 1) return
  const el = node as Element
  const tag = el.tagName.toLowerCase()
  if (!ALLOWED_TAGS.has(tag)) {
    el.childNodes.forEach((c) => sanitizeNode(c, out))
    return
  }
  const allowedAttrs = ALLOWED_ATTRS_BY_TAG[tag] ?? new Set<string>()
  let attrStr = ''
  for (const attr of Array.from(el.attributes)) {
    if (!allowedAttrs.has(attr.name)) continue
    if (attr.name === 'href' && !URL_SCHEME_OK.test(attr.value)) continue
    attrStr += ` ${attr.name}="${escapeAttr(attr.value)}"`
  }
  if (tag === 'a') attrStr += ' rel="noopener noreferrer" target="_blank"'
  if (tag === 'br') {
    out.push('<br>')
    return
  }
  out.push(`<${tag}${attrStr}>`)
  el.childNodes.forEach((c) => sanitizeNode(c, out))
  out.push(`</${tag}>`)
}

function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
}

function escapeAttr(s: string): string {
  return s.replace(/[&"<>]/g, (c) =>
    c === '&' ? '&amp;' : c === '"' ? '&quot;' : c === '<' ? '&lt;' : '&gt;'
  )
}

export function sanitizeHtml(input: string): string {
  if (!input) return ''
  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(`<div>${input}</div>`, 'text/html')
    const root = doc.body.firstChild as Element | null
    if (!root) return ''
    const out: string[] = []
    root.childNodes.forEach((c) => sanitizeNode(c, out))
    return out.join('')
  }
  return sanitizeServer(input)
}

const SERVER_TAG_RE = /<\/?([a-z][a-z0-9]*)(?:\s+[^>]*)?\s*\/?>/gi

function sanitizeServer(input: string): string {
  return input.replace(SERVER_TAG_RE, (match, tag: string) => {
    const lower = tag.toLowerCase()
    if (!ALLOWED_TAGS.has(lower)) return ''
    if (match.startsWith('</')) return `</${lower}>`
    if (lower === 'br') return '<br>'
    if (lower === 'a') {
      const hrefMatch = /href="([^"]*)"/i.exec(match)
      const href =
        hrefMatch && URL_SCHEME_OK.test(hrefMatch[1]) ? hrefMatch[1] : ''
      const hrefAttr = href ? ` href="${escapeAttr(href)}"` : ''
      return `<a${hrefAttr} rel="noopener noreferrer" target="_blank">`
    }
    return `<${lower}>`
  })
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function isHtml(text: string): boolean {
  return /<[a-z][^>]*>/i.test(text)
}
