import Anthropic from '@anthropic-ai/sdk'

export const MODELS = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
} as const

export type ClaudeModel = (typeof MODELS)[keyof typeof MODELS]

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

// Exponential backoff: 60s, 120s, 240s (D08)
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < maxAttempts) {
        await sleep(60_000 * Math.pow(2, attempt - 1))
      }
    }
  }
  throw lastError
}

export type TextMessage = {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Text completion with optional prompt caching on the system prompt.
 * Use `cacheSystem = true` for large, reusable system prompts (e.g., curricular matrix).
 */
export async function complete({
  model,
  system,
  messages,
  maxTokens = 4096,
  cacheSystem = false,
}: {
  model: ClaudeModel
  system?: string
  messages: TextMessage[]
  maxTokens?: number
  cacheSystem?: boolean
}): Promise<string> {
  const response = await withRetry(() =>
    client.messages.create({
      model,
      max_tokens: maxTokens,
      ...(system && {
        system: cacheSystem
          ? ([{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] as Anthropic.TextBlockParam[])
          : system,
      }),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    })
  )

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude')
  return block.text
}

/**
 * Vision extraction using Claude Sonnet.
 * Accepts up to MAX_IMAGES_PER_CALL base64-encoded JPEG or PNG images.
 * Used for PDF page extraction (rasterized at 150 DPI).
 */
export const MAX_IMAGES_PER_CALL = 3 // D19: máx 3 páginas por chamada

export async function extractFromImages({
  imageBase64s,
  mediaType = 'image/jpeg',
  prompt,
  system,
}: {
  imageBase64s: string[]
  mediaType?: 'image/jpeg' | 'image/png'
  prompt: string
  system?: string
}): Promise<string> {
  if (imageBase64s.length > MAX_IMAGES_PER_CALL) {
    throw new Error(`Máximo ${MAX_IMAGES_PER_CALL} imagens por chamada (recebido ${imageBase64s.length})`)
  }

  const response = await withRetry(() =>
    client.messages.create({
      model: MODELS.sonnet,
      max_tokens: 8192,
      ...(system && { system }),
      messages: [
        {
          role: 'user',
          content: [
            ...imageBase64s.map((data) => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: mediaType, data },
            })),
            { type: 'text' as const, text: prompt },
          ],
        },
      ],
    })
  )

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude Vision')
  return block.text
}

/**
 * Parse JSON from a Claude response, stripping markdown code fences if present.
 */
export function parseJSON<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim()
  return JSON.parse(cleaned) as T
}
