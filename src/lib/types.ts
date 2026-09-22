/** 前後端共用的資料形狀。 */

export interface Note {
  id: string
  content: string
  /** ISO 8601 */
  createdAt: string
}

export interface SearchHit extends Note {
  /** 0–1，越大越相近 */
  similarity: number
}
