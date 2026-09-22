/** 前後端共用的資料形狀。 */

export interface Note {
  id: string
  content: string
  /** ISO 8601 */
  createdAt: string
}

export interface SearchHit extends Note {
  /** 向量的 cosine 相似度（0–1）；沒有校準，只適合用來排序 */
  similarity: number
  /** rerank 模型給的相關度（0–1）；有校準，適合設絕對門檻。沒跑 rerank 時為 undefined */
  relevance?: number
}
