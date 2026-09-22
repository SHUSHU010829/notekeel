/**
 * 前端只打自己的 Next.js route handler（同源），
 * 登入狀態靠 cookie 帶過去，不需要自己處理權杖。
 */

import type { Note, SearchHit } from './types'

export type { Note, SearchHit }

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new ApiError('連不上伺服器，請稍後再試。')
  }

  // 204 沒有內容
  const payload = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) throw new ApiError('登入已過期，請重新登入。')
    const message = payload && typeof payload.error === 'string' ? payload.error : `請求失敗（${response.status}）`
    throw new ApiError(message)
  }
  return payload as T
}

/** 記下一則筆記 */
export function createNote(content: string): Promise<Note> {
  return request<Note>('/api/notes', { method: 'POST', body: JSON.stringify({ content }) })
}

/** 語意搜尋 */
export async function searchNotes(query: string, limit = 8): Promise<SearchHit[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  const data = await request<{ results: SearchHit[] | null }>(`/api/notes/search?${params}`)
  return data.results ?? []
}

/** 刪除一則筆記 */
export async function deleteNote(id: string): Promise<void> {
  await request<null>(`/api/notes/${id}`, { method: 'DELETE' })
}

/** 依時間列出筆記 */
export async function listNotes(limit = 20): Promise<Note[]> {
  const data = await request<{ notes: Note[] | null }>(`/api/notes?limit=${limit}`)
  return data.notes ?? []
}
