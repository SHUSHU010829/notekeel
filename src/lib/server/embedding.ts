import 'server-only'
import { EMBEDDING_DIMENSIONS, VOYAGE_API_KEY, VOYAGE_BASE_URL, VOYAGE_MODEL, voyageEnabled } from './config'

/** Voyage 會依用途調整向量：存檔用 document、查詢用 query。 */
export type InputType = 'document' | 'query'

export class EmbeddingError extends Error {}

/** L2 normalize，讓 cosine 相似度等同內積。 */
function normalize(vector: number[]): number[] {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (length === 0) return vector
  return vector.map((value) => value / length)
}

interface VoyageOptions {
  apiKey?: string
  model?: string
  baseUrl?: string
  dimensions?: number
  /** 429／5xx 的重試次數 */
  maxRetries?: number
}

/** 呼叫 Voyage AI 的 embeddings API，回傳與輸入同順序的向量。 */
export async function embedWithVoyage(
  texts: string[],
  inputType: InputType,
  options: VoyageOptions = {},
): Promise<number[][]> {
  if (texts.length === 0) return []

  const {
    apiKey = VOYAGE_API_KEY,
    model = VOYAGE_MODEL,
    baseUrl = VOYAGE_BASE_URL,
    dimensions = EMBEDDING_DIMENSIONS,
    maxRetries = 2,
  } = options

  const body = JSON.stringify({
    model,
    input: texts,
    input_type: inputType,
    output_dimension: dimensions,
  })

  let lastError: Error = new EmbeddingError('轉換向量失敗')
  let nextDelayMs = 0

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (nextDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, nextDelayMs))

    let response: Response
    try {
      response = await fetch(`${baseUrl}/v1/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body,
      })
    } catch {
      lastError = new EmbeddingError('連不上 Voyage，請稍後再試。')
      nextDelayMs = backoffMs(attempt)
      continue
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 200)
      const prefix =
        response.status === 429
          ? 'Voyage 限流（免費方案未綁付款方式只有 3 RPM）'
          : `Voyage 回應 ${response.status}`
      lastError = new EmbeddingError(`${prefix}：${detail}`)

      // 4xx（金鑰錯、參數錯）重試也沒用
      if (response.status !== 429 && response.status < 500) throw lastError

      // 429 優先照 Retry-After 等；但函式有執行時間上限，等太久不如讓前端重試
      nextDelayMs = retryAfterMs(response) ?? backoffMs(attempt)
      continue
    }

    const payload = (await response.json()) as {
      data?: { index: number; embedding: number[] }[]
    }
    const items = payload.data ?? []
    if (items.length !== texts.length) {
      throw new EmbeddingError(`Voyage 回傳 ${items.length} 筆向量，預期 ${texts.length} 筆`)
    }

    // data 不保證照順序，依 index 歸位
    const vectors: number[][] = new Array(texts.length)
    for (const item of items) {
      if (item.index < 0 || item.index >= texts.length) {
        throw new EmbeddingError(`Voyage 回傳非預期的 index ${item.index}`)
      }
      vectors[item.index] = normalize(item.embedding)
    }
    return vectors
  }

  throw lastError
}

/** 指數退避：0.5s → 1s → 2s，上限 2 秒 */
function backoffMs(attempt: number): number {
  return Math.min(500 * 2 ** attempt, 2000)
}

function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('Retry-After')
  if (!header) return undefined
  const seconds = Number(header)
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined
  // serverless function 有執行時間上限，最多只等 3 秒
  return Math.min(seconds * 1000, 3000)
}

/**
 * 本機開發用的假 embedder：把字元 n-gram 雜湊進固定維度。
 * 只反映字面重疊，沒有語意能力 —— 正式環境一定要設 VOYAGE_API_KEY。
 */
export function embedLocally(texts: string[], dimensions = EMBEDDING_DIMENSIONS): number[][] {
  return texts.map((text) => {
    const vector = new Array<number>(dimensions).fill(0)
    const chars = [...text]
    for (let size = 1; size <= 3; size += 1) {
      for (let start = 0; start + size <= chars.length; start += 1) {
        const gram = chars.slice(start, start + size).join('')
        let hash = 0x811c9dc5
        for (const char of gram) {
          hash ^= char.codePointAt(0) ?? 0
          hash = Math.imul(hash, 0x01000193) >>> 0
        }
        vector[hash % dimensions] += 1
      }
    }
    return normalize(vector)
  })
}

/** 有金鑰就用 Voyage，沒有就退回本機假 embedder。 */
export function embed(texts: string[], inputType: InputType): Promise<number[][]> {
  return voyageEnabled ? embedWithVoyage(texts, inputType) : Promise.resolve(embedLocally(texts))
}
