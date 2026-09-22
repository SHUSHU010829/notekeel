/** 與 Go API 的介面；型別對齊後端的 JSON 欄位。 */

export interface Note {
  id: string
  content: string
  createdAt: string
}

export interface SearchHit extends Note {
  /** 0–1，越大越相近 */
  similarity: number
}

const BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, '')

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new ApiError('連不上伺服器，請確認 API 是否啟動。')
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
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

/** 依時間列出筆記 */
export async function listNotes(limit = 20): Promise<Note[]> {
  const data = await request<{ notes: Note[] | null }>(`/api/notes?limit=${limit}`)
  return data.notes ?? []
}
