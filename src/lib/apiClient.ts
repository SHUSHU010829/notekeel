import { headers } from 'next/headers'
import type { ApiEnvelope } from '../types/withholding'

/**
 * 後端上線前指向內建 mock route handler，上線後只要設定
 * WITHHOLDING_API_BASE_URL，前端程式碼不需要更動（見規格「過渡期說明」）。
 */
export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function resolveBaseUrl(): Promise<string> {
  const configured = process.env.WITHHOLDING_API_BASE_URL
  if (configured) return configured.replace(/\/+$/, '')

  const requestHeaders = await headers()
  const host = requestHeaders.get('host') ?? 'localhost:3000'
  const protocol =
    requestHeaders.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${protocol}://${host}/api`
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const baseUrl = await resolveBaseUrl()
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, { cache: 'no-store', ...init })
  } catch {
    throw new ApiError('無法連線到伺服器，請稍後再試。')
  }

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null
  if (!response.ok) {
    throw new ApiError(payload?.message ?? `查詢失敗（${response.status}），請稍後再試。`, response.status)
  }
  if (!payload || payload.data == null) {
    throw new ApiError('伺服器回應格式不正確。', response.status)
  }
  return payload.data
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function apiGet<T>(path: string, query: Record<string, string>): Promise<T> {
  const search = new URLSearchParams(query).toString()
  return request<T>(`${path}?${search}`, { method: 'GET' })
}
