/**
 * Definições centrais de tipos de arquivo aceitos nos uploads da plataforma.
 *
 * Antes este conhecimento estava espalhado em `accept=` no JSX, no `mimeMap`
 * dentro de actions.ts e nas listas ALLOWED de anexos. Centralizar evita que um
 * formato seja aceito no seletor mas rejeitado no servidor (ou vice-versa).
 */

export type SourceFormat = 'pdf' | 'docx' | 'pptx'

/** MIME oficial por extensão. */
export const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  md: 'text/markdown',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

/** Extensões de documento Office que exigem conversão para PDF antes da extração. */
export const OFFICE_EXTS = ['docx', 'pptx'] as const

export function extOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

export function mimeForExt(ext: string): string {
  return MIME_BY_EXT[ext.toLowerCase()] ?? 'application/octet-stream'
}

/** É um caderno Office (docx/pptx) que precisa virar PDF? */
export function isOfficeExt(ext: string): boolean {
  return (OFFICE_EXTS as readonly string[]).includes(ext.toLowerCase())
}

/** Mapeia a extensão de um caderno para o `source_format` persistido em `exams`. */
export function sourceFormatForExt(ext: string): SourceFormat {
  const e = ext.toLowerCase()
  if (e === 'docx') return 'docx'
  if (e === 'pptx') return 'pptx'
  return 'pdf'
}

/** Monta uma string `accept` (MIME + extensão) a partir de uma lista de extensões. */
function buildAccept(exts: string[]): string {
  const parts: string[] = []
  for (const ext of exts) {
    const mime = MIME_BY_EXT[ext]
    if (mime) parts.push(mime)
    parts.push(`.${ext}`)
  }
  return parts.join(',')
}

const MB = 1024 * 1024

/* ── Caderno da prova (PDF / DOCX / PPTX) ─────────────────────────────────── */
export const CADERNO_EXTS = ['pdf', 'docx', 'pptx']
export const CADERNO_ACCEPT = buildAccept(CADERNO_EXTS)
export const CADERNO_MAX_BYTES = 100 * MB
export const CADERNO_ACCEPT_DISPLAY = 'PDF, DOCX, PPTX (até 100MB)'

/* ── Gabarito (PDF / DOCX / TXT / MD) ─────────────────────────────────────── */
export const GABARITO_EXTS = ['pdf', 'docx', 'txt', 'md']
export const GABARITO_ACCEPT = buildAccept(GABARITO_EXTS)
export const GABARITO_MAX_BYTES = 100 * MB
export const GABARITO_ACCEPT_DISPLAY = 'PDF, DOCX, TXT, MD'

/* ── Anexos de revisão (documentos + imagens) ─────────────────────────────── */
// AUDITORIA 2026-07: docx/pptx removidos — o CHECK `mime_allowed` da tabela
// question_attachments em produção só aceita png/jpeg/webp/pdf. Com docx o
// upload subia pro Storage e o INSERT falhava, deixando arquivo órfão.
// Para voltar a aceitar Office, criar migration relaxando o CHECK primeiro.
export const ATTACHMENT_EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'webp']
export const ATTACHMENT_ACCEPT = buildAccept(ATTACHMENT_EXTS)
export const ATTACHMENT_MAX_BYTES = 25 * MB
export const ATTACHMENT_ALLOWED_MIME: string[] = ATTACHMENT_EXTS.map((e) => MIME_BY_EXT[e]).filter(
  (m, i, a) => m && a.indexOf(m) === i
)

/** MIMEs liberados no bucket `exam-pdfs` (caderno original + convertido + gabarito). */
export const EXAM_BUCKET_ALLOWED_MIME: string[] = [
  MIME_BY_EXT.pdf,
  MIME_BY_EXT.docx,
  MIME_BY_EXT.pptx,
  MIME_BY_EXT.txt,
  MIME_BY_EXT.md,
  'application/octet-stream',
]
