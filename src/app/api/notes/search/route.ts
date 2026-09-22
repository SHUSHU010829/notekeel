import { NextResponse } from 'next/server'
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  SEARCH_MIN_SIMILARITY,
} from '../../../../lib/server/config'
import { embed } from '../../../../lib/server/embedding'
import { badRequest, clampLimit, errorResponse } from '../../../../lib/server/respond'
import { notesForRequest } from '../../../../lib/server/session'

function parseMinSimilarity(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === '') return undefined
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0 || value > 1) return undefined
  return value
}

/** GET /api/notes/search?q=... — 用意思相近的說法找回筆記。 */
export async function GET(request: Request) {
  try {
    const notes = await notesForRequest()

    const { searchParams } = new URL(request.url)
    const query = (searchParams.get('q') ?? '').trim()
    if (!query) return badRequest('請輸入搜尋關鍵字')

    const limit = clampLimit(searchParams.get('limit'), DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT)
    // ?min= 可臨時覆寫相似度下限，用來校準門檻（min=0 就是完全不過濾）
    const minSimilarity = parseMinSimilarity(searchParams.get('min')) ?? SEARCH_MIN_SIMILARITY

    const [embedding] = await embed([query], 'query')
    const results = await notes.search(embedding, limit, minSimilarity)

    return NextResponse.json({ query, minSimilarity, results })
  } catch (error) {
    return errorResponse(error)
  }
}
