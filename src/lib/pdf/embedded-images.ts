import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const execFileAsync = promisify(execFile)
const PDFTOHTML = process.env.PDFTOHTML_PATH ?? 'pdftohtml'

/**
 * Uma figura embutida (XObject de imagem) extraída do PDF na resolução ORIGINAL,
 * com sua posição na página em porcentagem (0–100).
 *
 * Diferente do recorte por bbox sobre a página rasterizada (150 DPI), aqui o
 * bitmap é o original embutido no PDF — tipicamente em resolução bem maior
 * (ex.: 1849×537 vs ~1240 px de uma rasterização A4 a 150 DPI). Ver P0-1 da
 * análise do pipeline.
 */
export type EmbeddedImage = {
  pageNumber: number // 1-based, igual ao pageNumber de RasterizedPage
  bbox_pct: [number, number, number, number] // [x, y, w, h] em % da página
  width: number // largura original em px
  height: number // altura original em px
  buffer: Buffer
  mime: 'image/jpeg' | 'image/png'
}

export type EmbeddedByPage = Map<number, EmbeddedImage[]>

function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /(\w[\w-]*)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tag)) !== null) attrs[m[1]] = m[2]
  return attrs
}

function mimeFromSrc(src: string): 'image/jpeg' | 'image/png' {
  return /\.png$/i.test(src) ? 'image/png' : 'image/jpeg'
}

/**
 * Extrai todas as imagens embutidas do PDF com posição, usando `pdftohtml -xml`
 * (parte do poppler-utils — já é dependência de runtime, sem nada novo).
 *
 * Falha de forma graciosa: se o binário não existir ou o parse falhar, retorna
 * um Map vazio e o pipeline cai no recorte por bbox (comportamento anterior).
 */
export async function extractEmbeddedImages(
  pdfBuffer: Buffer,
  options?: { firstPage?: number; lastPage?: number; minSidePct?: number }
): Promise<EmbeddedByPage> {
  // Ignora artefatos minúsculos (filetes, ícones) menores que ~3% do lado da página.
  const minSidePct = options?.minSidePct ?? 3
  const result: EmbeddedByPage = new Map()

  let dir: string
  try {
    dir = await mkdtemp(join(tmpdir(), 'mm-eimg-'))
  } catch {
    return result
  }

  const pdfPath = join(dir, 'in.pdf')
  const outPrefix = join(dir, 'out')

  try {
    await writeFile(pdfPath, pdfBuffer)

    const args = ['-xml', '-nodrm']
    if (options?.firstPage) args.push('-f', String(options.firstPage))
    if (options?.lastPage) args.push('-l', String(options.lastPage))
    args.push(pdfPath, outPrefix)

    await execFileAsync(PDFTOHTML, args)

    const xml = await readFile(`${outPrefix}.xml`, 'utf8')

    // Cada bloco <page ...> ... vai até o próximo <page> ou o fim do documento.
    const pageRe = /<page\b([^>]*)>([\s\S]*?)(?=<page\b|<\/pdf2xml>)/g
    let pm: RegExpExecArray | null
    while ((pm = pageRe.exec(xml)) !== null) {
      const pageAttrs = parseAttrs(pm[1])
      const pageNumber = parseInt(pageAttrs.number ?? '', 10)
      const pageW = parseFloat(pageAttrs.width ?? '')
      const pageH = parseFloat(pageAttrs.height ?? '')
      if (!pageNumber || !pageW || !pageH) continue

      const body = pm[2]
      const imgRe = /<image\b([^>]*)\/?>/g
      let im: RegExpExecArray | null
      const images: EmbeddedImage[] = []

      while ((im = imgRe.exec(body)) !== null) {
        const a = parseAttrs(im[1])
        const src = a.src
        if (!src) continue

        const left = parseFloat(a.left ?? '0')
        const top = parseFloat(a.top ?? '0')
        const w = parseFloat(a.width ?? '0')
        const h = parseFloat(a.height ?? '0')
        if (!(w > 0) || !(h > 0)) continue

        const wPct = (w / pageW) * 100
        const hPct = (h / pageH) * 100
        if (wPct < minSidePct || hPct < minSidePct) continue

        let buffer: Buffer
        try {
          buffer = await readFile(join(dir, src))
        } catch {
          continue
        }

        // Dimensões originais em px (cabeçalho JPEG/PNG). Best-effort.
        const { width: pxW, height: pxH } = readImageSize(buffer) ?? { width: w, height: h }

        images.push({
          pageNumber,
          bbox_pct: [
            (left / pageW) * 100,
            (top / pageH) * 100,
            wPct,
            hPct,
          ],
          width: pxW,
          height: pxH,
          buffer,
          mime: mimeFromSrc(src),
        })
      }

      if (images.length > 0) result.set(pageNumber, images)
    }
  } catch {
    // graceful: pipeline cai no recorte por bbox
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }

  return result
}

/** Lê width/height de um JPEG ou PNG sem dependência externa. */
function readImageSize(buf: Buffer): { width: number; height: number } | null {
  // PNG: assinatura 89 50 4E 47, IHDR em offset 16.
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  // JPEG: varre marcadores SOFn.
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off++
        continue
      }
      const marker = buf[off + 1]
      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
      const isSOF =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      if (isSOF) {
        const height = buf.readUInt16BE(off + 5)
        const width = buf.readUInt16BE(off + 7)
        return { width, height }
      }
      const len = buf.readUInt16BE(off + 2)
      if (len <= 0) break
      off += 2 + len
    }
  }
  return null
}

function iou(
  a: [number, number, number, number],
  b: [number, number, number, number]
): number {
  const [ax, ay, aw, ah] = a
  const [bx, by, bw, bh] = b
  const ix = Math.max(ax, bx)
  const iy = Math.max(ay, by)
  const ix2 = Math.min(ax + aw, bx + bw)
  const iy2 = Math.min(ay + ah, by + bh)
  const iw = Math.max(0, ix2 - ix)
  const ih = Math.max(0, iy2 - iy)
  const inter = iw * ih
  if (inter <= 0) return 0
  const union = aw * ah + bw * bh - inter
  return union > 0 ? inter / union : 0
}

function isWholePageBbox(b: [number, number, number, number]): boolean {
  return b[0] === 0 && b[1] === 0 && b[2] === 100 && b[3] === 100
}

/**
 * Escolhe, entre as imagens embutidas de uma página, a que melhor corresponde ao
 * bbox aproximado devolvido pela Vision. Retorna o índice ou -1 se nada casar bem.
 *
 * - Se o bbox da Vision for o fallback "página inteira", só casa quando há
 *   exatamente uma figura não usada na página (caso clássico de 1 figura/questão).
 * - Caso contrário, escolhe por maior IoU (limiar baixo, pois o bbox da IA é
 *   propositalmente folgado) ou por conter o centro do bbox da Vision.
 */
export function pickEmbeddedMatch(
  candidates: EmbeddedImage[],
  visionBbox: [number, number, number, number] | undefined,
  used: Set<number>
): number {
  const free = candidates
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => !used.has(i))
  if (free.length === 0) return -1

  if (!visionBbox || isWholePageBbox(visionBbox)) {
    return free.length === 1 ? free[0].i : -1
  }

  const [vx, vy, vw, vh] = visionBbox
  const cx = vx + vw / 2
  const cy = vy + vh / 2

  let best = -1
  let bestScore = 0
  for (const { c, i } of free) {
    const score = iou(visionBbox, c.bbox_pct)
    const [ex, ey, ew, eh] = c.bbox_pct
    const centerInside = cx >= ex && cx <= ex + ew && cy >= ey && cy <= ey + eh
    const effective = centerInside ? Math.max(score, 0.2) : score
    if (effective > bestScore) {
      bestScore = effective
      best = i
    }
  }

  return bestScore >= 0.1 ? best : -1
}
