'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '../lib/supabase/client'

const TABS = [
  { href: '/', label: '記錄' },
  { href: '/search', label: '搜尋' },
]

export function AppHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return

    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setEmail(data.user?.email ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function signOut() {
    const supabase = createClient()
    if (!supabase) return
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  // 登入頁不顯示導覽列
  if (pathname.startsWith('/login')) return null

  return (
    <header className="topbar">
      <div className="brand">
        隨手記 <span>notekeel</span>
      </div>
      <nav className="tabs">
        {TABS.map((tab) => (
          <Link key={tab.href} href={tab.href} aria-current={pathname === tab.href ? 'page' : undefined}>
            {tab.label}
          </Link>
        ))}
      </nav>
      {email ? (
        <button className="account" onClick={() => void signOut()} title={`${email}　（點擊登出）`}>
          {email.split('@')[0]}
        </button>
      ) : null}
    </header>
  )
}
