import 'server-only'
import { authEnabled } from '../supabase/env'
import { createClient } from '../supabase/server'
import { createLocalNotes, createSupabaseNotes, type NotesStore } from './notes'

/** 沒設定 Supabase 時，所有筆記都記在這位「本機使用者」名下。 */
export const LOCAL_USER_ID = '00000000-0000-0000-0000-000000000000'

export class UnauthenticatedError extends Error {
  constructor() {
    super('請先登入')
  }
}

/**
 * 依登入狀態取得這次請求該用的存取層。
 * Supabase 模式下 session 來自 cookie，owner 直接取自已驗證的使用者 —
 * 不需要自己驗 JWT，RLS 也會再擋一層。
 */
export async function notesForRequest(): Promise<NotesStore> {
  if (!authEnabled) return createLocalNotes(LOCAL_USER_ID)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new UnauthenticatedError()
  return createSupabaseNotes(supabase, user.id)
}
