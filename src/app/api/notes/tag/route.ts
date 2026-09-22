import { NextResponse } from 'next/server'
import { MAX_TAG_BATCH, taggingEnabled } from '../../../../lib/server/config'
import { errorResponse } from '../../../../lib/server/respond'
import { notesForRequest } from '../../../../lib/server/session'
import { tagNotes } from '../../../../lib/server/tag-notes'

/**
 * POST /api/notes/tag — 替還沒有標籤的筆記補標籤。
 * 一次最多處理 MAX_TAG_BATCH 則，前端可以重複呼叫直到 remaining 為 0。
 */
export async function POST() {
  try {
    if (!taggingEnabled) {
      return NextResponse.json({ error: '尚未設定 ANTHROPIC_API_KEY，自動標籤未啟用' }, { status: 400 })
    }

    const notes = await notesForRequest()
    const untagged = await notes.listUntagged(MAX_TAG_BATCH + 1)
    const batch = untagged.slice(0, MAX_TAG_BATCH)

    const tagged = await tagNotes(notes, batch)
    return NextResponse.json({ tagged, remaining: Math.max(untagged.length - batch.length, 0) })
  } catch (error) {
    return errorResponse(error)
  }
}
