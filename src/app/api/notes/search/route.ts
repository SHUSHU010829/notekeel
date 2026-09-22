import { NextResponse } from 'next/server'
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  SEARCH_MIN_SIMILARITY,
} from '../../../../lib/server/config'
import { embed } from '../../../../lib/server/embedding'
import { badRequest, clampLimit, errorResponse } from '../../../../lib/server/respond'
import { notesForRequest } from '../../../../lib/server/session'

/** GET /api/notes/search?q=... — 用意思相近的說法找回筆記。 */
export async function GET(request: Request) {
  try {
    const notes = await notesForRequest()

    const { searchParams } = new URL(request.url)
    const query = (searchParams.get('q') ?? '').trim()
    if (!query) return badRequest('請輸入搜尋關鍵字')

    const limit = clampLimit(searchParams.get('limit'), DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT)
    const [embedding] = await embed([query], 'query')
    const results = await notes.search(embedding, limit, SEARCH_MIN_SIMILARITY)

    return NextResponse.json({ query, results })
  } catch (error) {
    return errorResponse(error)
  }
}
