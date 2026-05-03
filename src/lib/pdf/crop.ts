import { Jimp } from 'jimp'

export type BboxPct = [x: number, y: number, w: number, h: number]

export type CropResult = {
  buffer: Buffer
  width: number
  height: number
  bbox_px: { x: number; y: number; w: number; h: number }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isValidBbox(bbox: unknown): bbox is BboxPct {
  if (!Array.isArray(bbox) || bbox.length !== 4) return false
  return bbox.every((v) => typeof v === 'number' && Number.isFinite(v))
}

export async function cropPageByBbox(
  pageBuffer: Buffer,
  bbox: unknown,
  options: { padPct?: number; quality?: number } = {}
): Promise<CropResult> {
  if (!isValidBbox(bbox)) {
    throw new Error(`bbox_pct inválido: ${JSON.stringify(bbox)}`)
  }

  const padPct = options.padPct ?? 1.5
  const quality = options.quality ?? 88

  const image = await Jimp.read(pageBuffer)
  const W = image.bitmap.width
  const H = image.bitmap.height

  const [xPct, yPct, wPct, hPct] = bbox
  const x = clamp(Math.round(((xPct - padPct) / 100) * W), 0, W - 1)
  const y = clamp(Math.round(((yPct - padPct) / 100) * H), 0, H - 1)
  const w = clamp(Math.round(((wPct + padPct * 2) / 100) * W), 1, W - x)
  const h = clamp(Math.round(((hPct + padPct * 2) / 100) * H), 1, H - y)

  const cropped = image.clone().crop({ x, y, w, h })
  const buffer = await cropped.getBuffer('image/jpeg', { quality })

  return {
    buffer,
    width: cropped.bitmap.width,
    height: cropped.bitmap.height,
    bbox_px: { x, y, w, h },
  }
}
