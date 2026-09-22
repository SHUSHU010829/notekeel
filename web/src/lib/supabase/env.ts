/**
 * 與 taskeel 共用同一個 Supabase 專案：兩邊填一樣的 URL 與 publishable key，
 * 登入後拿到的就是同一組 auth.users 帳號。
 * 沒設定時整個 app 走「本機單人模式」，不需要登入也能用。
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const authEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
