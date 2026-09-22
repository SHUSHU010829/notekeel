import 'server-only'
import { NextResponse } from 'next/server'
import { EmbeddingError } from './embedding'
import { StoreError } from './notes'
import { TaggingError } from './tagging'
import { UnauthenticatedError } from './session'

/** 把各層的錯誤轉成前端可以直接顯示的訊息。 */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }
  // detail 帶上底層訊息：這些端點都要登入才進得來，而少了它幾乎不可能除錯
  if (error instanceof EmbeddingError) {
    console.error('embedding 失敗', error)
    return NextResponse.json(
      { error: '轉換向量失敗，請稍後再試。', detail: error.message },
      { status: 502 },
    )
  }
  if (error instanceof TaggingError) {
    console.error('標籤失敗', error)
    return NextResponse.json(
      { error: '產生標籤失敗，請稍後再試。', detail: error.message },
      { status: 502 },
    )
  }
  if (error instanceof StoreError) {
    console.error('資料庫操作失敗', error)
    return NextResponse.json(
      { error: '資料庫忙線中，請稍後再試。', detail: error.message },
      { status: 502 },
    )
  }
  console.error('未預期的錯誤', error)
  return NextResponse.json({ error: '發生未預期的錯誤，請稍後再試。' }, { status: 500 })
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 })
}

/** 夾在預設值與上限之間 */
export function clampLimit(raw: string | null, fallback: number, max: number): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.min(Math.trunc(value), max)
}
