import 'server-only'

/** 只在伺服器端讀得到的設定（不會進到瀏覽器 bundle）。 */
export const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY ?? ''
export const VOYAGE_MODEL = process.env.VOYAGE_MODEL ?? 'voyage-4-lite'
export const VOYAGE_BASE_URL = (process.env.VOYAGE_BASE_URL ?? 'https://api.voyageai.com').replace(/\/+$/, '')
export const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS ?? 512)

/**
 * 向量搜尋的相似度下限（0–1），0＝不過濾（預設）。
 * cosine 分數沒有校準，實測正確命中可能只有 0.18–0.60，
 * 憑感覺設高會把對的答案砍掉 —— 要過濾請優先用 rerank 的分數。
 */
export const SEARCH_MIN_SIMILARITY = Number(process.env.SEARCH_MIN_SIMILARITY ?? 0)

export const voyageEnabled = Boolean(VOYAGE_API_KEY)

/**
 * Rerank：把向量搜到的候選丟給 Voyage 的 rerank 模型重新評分。
 * 向量的 cosine 分數沒有校準（0.4 可能已是好命中），rerank 分數才適合設絕對門檻。
 * 代價是每次搜尋多一次 Voyage 請求。
 */
export const VOYAGE_RERANK_MODEL = process.env.VOYAGE_RERANK_MODEL ?? 'rerank-2.5-lite'
export const rerankEnabled = voyageEnabled && process.env.SEARCH_RERANK !== 'false'

/** 進 rerank 的候選數量：先用向量粗篩，再由 rerank 細排 */
export const SEARCH_CANDIDATES = Number(process.env.SEARCH_CANDIDATES ?? 30)

/** rerank 分數下限（0–1）。預設 0＝不過濾，請用 calibrate-browser.js 量過再設。 */
export const RERANK_MIN_SCORE = Number(process.env.RERANK_MIN_SCORE ?? 0)

export const DEFAULT_SEARCH_LIMIT = 8
export const MAX_SEARCH_LIMIT = 50
export const DEFAULT_LIST_LIMIT = 50
export const MAX_LIST_LIMIT = 200
export const MAX_CONTENT_LENGTH = 20000

/**
 * 自動標籤：用 Claude 幫每則筆記標 1–3 個標籤，方便之後瀏覽。
 * 沒設 ANTHROPIC_API_KEY 就整個功能關閉（筆記照常記錄，只是沒有標籤）。
 */
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5'
export const taggingEnabled = Boolean(ANTHROPIC_API_KEY)

/** 一則筆記最多幾個標籤 */
export const MAX_TAGS_PER_NOTE = 3
/** 補標籤時一次處理幾則 */
export const MAX_TAG_BATCH = 30
