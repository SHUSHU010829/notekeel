import { NextResponse } from 'next/server'
import {
  DEFAULT_LIST_LIMIT,
  MAX_CONTENT_LENGTH,
  MAX_LIST_LIMIT,
} from '../../../lib/server/config'
import { embed } from '../../../lib/server/embedding'
import { badRequest, clampLimit, errorResponse } from '../../../lib/server/respond'
import { notesForRequest } from '../../../lib/server/session'

/** POST /api/notes — 記下一則筆記：先轉成向量，再連同原文寫入。 */
export async function POST(request: Request) {
  try {
    const notes = await notesForRequest()

    const body = (await request.json().catch(() => null)) as { content?: unknown } | null
    const content = typeof body?.content === 'string' ? body.content.trim() : ''

    if (!content) return badRequest('筆記內容不可為空')
    if ([...content].length > MAX_CONTENT_LENGTH) {
      return badRequest('筆記內容過長，請分成多則記錄')
    }

    const [embedding] = await embed([content], 'document')
    const created = await notes.create(content, embedding)
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}

/** GET /api/notes — 依時間新到舊列出。 */
export async function GET(request: Request) {
  try {
    const notes = await notesForRequest()
    const { searchParams } = new URL(request.url)
    const limit = clampLimit(searchParams.get('limit'), DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT)

    return NextResponse.json({ notes: await notes.list(limit) })
  } catch (error) {
    return errorResponse(error)
  }
}
