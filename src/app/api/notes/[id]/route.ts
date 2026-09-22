import { NextResponse } from 'next/server'
import { errorResponse } from '../../../../lib/server/respond'
import { notesForRequest } from '../../../../lib/server/session'

/** DELETE /api/notes/:id — 刪掉自己的一則筆記。 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const notes = await notesForRequest()
    const { id } = await context.params

    const removed = await notes.remove(id)
    if (!removed) {
      return NextResponse.json({ error: '找不到這則筆記' }, { status: 404 })
    }

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return errorResponse(error)
  }
}
