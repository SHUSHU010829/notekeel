/** 與 Go API 的介面；型別對齊後端的 JSON 欄位。 */

import { createClient } from './supabase/client'

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

/**
 * 帶上 Supabase 的存取權杖，API 才知道這些筆記屬於誰。
 * 沒有設定 Supabase（本機單人模式）時不帶，後端也不會要求。
 */
async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createClient()
  if (!supabase) return {}

  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()), ...init?.headers },
    })
  } catch {
    throw new ApiError('連不上伺服器，請確認 API 是否啟動。')
  }

  if (response.status === 401) {
    throw new ApiError('登入已過期，請重新登入。')
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
