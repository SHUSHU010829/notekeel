import { NextResponse } from 'next/server'
import { MAX_CONTENT_LENGTH } from '../../../../lib/server/config'
import { embed } from '../../../../lib/server/embedding'
import { badRequest, errorResponse } from '../../../../lib/server/respond'
import { notesForRequest } from '../../../../lib/server/session'

/** 一次最多匯入幾則：Voyage 單一請求的上限與 token 量都要留餘裕 */
const MAX_BULK = 100

/**
 * POST /api/notes/bulk — 一次匯入多則筆記。
 *
 * 全部內容併成「一個」Voyage 請求，所以匯入 100 則也只用掉一次額度
 * （Voyage 免費方案沒綁付款方式時只有 3 RPM，逐則送很快就會撞到）。
 */
export async function POST(request: Request) {
  try {
    const notes = await notesForRequest()

    const body = (await request.json().catch(() => null)) as { contents?: unknown } | null
    if (!Array.isArray(body?.contents)) {
      return badRequest('請以 { "contents": ["…"] } 的格式送出')
    }

    const contents = body.contents
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)

    if (contents.length === 0) return badRequest('沒有可以匯入的內容')
    if (contents.length > MAX_BULK) return badRequest(`一次最多匯入 ${MAX_BULK} 則`)
    if (contents.some((content) => [...content].length > MAX_CONTENT_LENGTH)) {
      return badRequest('有筆記內容過長，請分成多則')
    }

    const embeddings = await embed(contents, 'document')
    const created = await notes.createMany(
      contents.map((content, index) => ({ content, embedding: embeddings[index] })),
    )

    return NextResponse.json({ created: created.length, notes: created }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
