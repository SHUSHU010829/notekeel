'use client'

import { useState } from 'react'
import { createClient } from '../../lib/supabase/client'

/** 與 taskeel 相同的 Google 登入；同一個 Supabase 專案＝同一個帳號。 */
export default function LoginPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signInWithGoogle() {
    const supabase = createClient()
    if (!supabase) return

    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <div className="login-card">
        <h1>隨手記</h1>
        <p className="login-sub">快速記下想法，之後用意思相近的說法就能找回來。</p>
        <button className="btn primary login-btn" onClick={() => void signInWithGoogle()} disabled={busy}>
          {busy ? '前往 Google⋯' : '使用 Google 繼續'}
        </button>
        {error ? <p className="error-text">{error}</p> : null}
        <p className="login-hint">與 Taskeel 同一組帳號，登入後看到的是同一份資料。</p>
      </div>
    </main>
  )
}
