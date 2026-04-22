import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, readdir, unlink } from 'fs/promises'
import { join } from 'path'

const execFileAsync = promisify(execFile)
const PDFTOPPM = process.env.PDFTOPPM_PATH ?? 'pdftoppm'

export type RasterizedPage = {
  pageNumber: number
  jpegBase64: string
  jpegBuffer: Buffer
}

export async function rasterizePdf(
  pdfBuffer: Buffer,
  options?: { dpi?: number; maxPages?: number }
): Promise<RasterizedPage[]> {
  const dpi = options?.dpi ?? 150
  const maxPages = options?.maxPages

  const id = crypto.randomUUID()
  const pdfPath = `/tmp/mm-${id}.pdf`
  const outPrefix = `/tmp/mm-${id}-page`

  await writeFile(pdfPath, pdfBuffer)

  try {
    const args = ['-jpeg', '-r', String(dpi)]
    if (maxPages) args.push('-l', String(maxPages))
    args.push(pdfPath, outPrefix)

    await execFileAsync(PDFTOPPM, args).catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        throw new Error(`pdftoppm não encontrado (PATH: ${PDFTOPPM}). Instale poppler-utils e configure PDFTOPPM_PATH se necessário.`)
      }
      throw new Error(`pdftoppm falhou: ${(err as Error).message}`)
    })

    const files = await readdir('/tmp')
    const pageFiles = files
      .filter((f) => f.startsWith(`mm-${id}-page`) && f.endsWith('.jpg'))
      .sort()

    const pages: RasterizedPage[] = await Promise.all(
      pageFiles.map(async (file) => {
        const match = file.match(/-(\d+)\.jpg$/)
        const pageNumber = match ? parseInt(match[1], 10) : 0
        const jpegBuffer = await readFile(join('/tmp', file))
        return { pageNumber, jpegBase64: jpegBuffer.toString('base64'), jpegBuffer }
      })
    )

    return pages.sort((a, b) => a.pageNumber - b.pageNumber)
  } finally {
    const files = await readdir('/tmp').catch(() => [] as string[])
    await Promise.all(
      files
        .filter((f) => f.startsWith(`mm-${id}`))
        .map((f) => unlink(join('/tmp', f)).catch(() => {}))
    )
  }
}
