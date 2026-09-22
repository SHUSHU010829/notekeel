import 'server-only'

/** 只在伺服器端讀得到的設定（不會進到瀏覽器 bundle）。 */
export const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY ?? ''
export const VOYAGE_MODEL = process.env.VOYAGE_MODEL ?? 'voyage-4-lite'
export const VOYAGE_BASE_URL = (process.env.VOYAGE_BASE_URL ?? 'https://api.voyageai.com').replace(/\/+$/, '')
export const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS ?? 512)

/**
 * 搜尋結果的相似度下限（0–1），0＝不過濾。
 * 接上真實 Voyage 向量後建議 0.4–0.6，才不會讓完全無關的筆記湊數。
 */
export const SEARCH_MIN_SIMILARITY = Number(process.env.SEARCH_MIN_SIMILARITY ?? 0)

export const DEFAULT_SEARCH_LIMIT = 8
export const MAX_SEARCH_LIMIT = 50
export const DEFAULT_LIST_LIMIT = 50
export const MAX_LIST_LIMIT = 200
export const MAX_CONTENT_LENGTH = 20000

export const voyageEnabled = Boolean(VOYAGE_API_KEY)
