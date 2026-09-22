'use client'

import { createBrowserClient } from '@supabase/ssr'
import { SUPABASE_ANON_KEY, SUPABASE_URL, authEnabled } from './env'

/** 瀏覽器端 Supabase client；未設定環境變數時回 null（本機單人模式）。 */
export function createClient() {
  if (!authEnabled) return null
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}
