/**
 * Conversão de documentos Office (DOCX/PPTX) para PDF via Gotenberg.
 *
 * Gotenberg roda como serviço sidecar (container Debian com LibreOffice + fontes
 * embutidas) e expõe a rota `POST /forms/libreoffice/convert`. Mantemos o app
 * Next enxuto: nenhuma dependência pesada na imagem, e o LibreOffice fica
 * isolado num processo que não derruba o app se travar.
 *
 * Configurar `GOTENBERG_URL` (ex.: http://gotenberg:3000) no ambiente. Sem ele,
 * `convertToPdf` lança erro claro — afeta apenas uploads DOCX/PPTX; PDF segue
 * intacto.
 */

import { mimeForExt } from '@/lib/uploads/file-types'

const GOTENBERG_URL = process.env.GOTENBERG_URL ?? ''
const CONVERT_TIMEOUT_MS = Number(process.env.GOTENBERG_TIMEOUT_MS ?? 120_000)

export class OfficeConversionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OfficeConversionError'
  }
}

export function isGotenbergConfigured(): boolean {
  return GOTENBERG_URL.trim().length > 0
}

/**
 * Converte um buffer DOCX/PPTX em PDF. Lança `OfficeConversionError` em qualquer
 * falha (sem Gotenberg configurado, timeout, resposta não-OK).
 */
export async function convertToPdf(
  buffer: Buffer,
  fileName: string,
  ext: string
): Promise<Buffer> {
  if (!isGotenbergConfigured()) {
    throw new OfficeConversionError(
      'Conversão de DOCX/PPTX indisponível: GOTENBERG_URL não está configurado no servidor.'
    )
  }

  const endpoint = `${GOTENBERG_URL.replace(/\/$/, '')}/forms/libreoffice/convert`
  const form = new FormData()
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeForExt(ext) })
  // Gotenberg usa o nome do arquivo (extensão) para escolher o filtro de conversão.
  form.append('files', blob, fileName)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CONVERT_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(endpoint, { method: 'POST', body: form, signal: controller.signal })
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'AbortError'
        ? `tempo excedido (${CONVERT_TIMEOUT_MS}ms)`
        : err instanceof Error
          ? err.message
          : String(err)
    throw new OfficeConversionError(`Falha ao contatar o conversor (Gotenberg): ${reason}`)
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new OfficeConversionError(
      `Conversor retornou ${res.status} ${res.statusText}${detail ? `: ${detail.slice(0, 300)}` : ''}`
    )
  }

  const out = Buffer.from(await res.arrayBuffer())
  if (out.byteLength === 0) {
    throw new OfficeConversionError('Conversor retornou um PDF vazio.')
  }
  return out
}

/** Probe leve para o health check: confirma que o Gotenberg responde. */
export async function probeGotenberg(): Promise<{ ok: boolean; detail: string }> {
  if (!isGotenbergConfigured()) return { ok: false, detail: 'GOTENBERG_URL não configurado' }
  try {
    const res = await fetch(`${GOTENBERG_URL.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(5_000),
    })
    return { ok: res.ok, detail: res.ok ? 'online' : `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}
