'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '../lib/supabase/client'

const TABS = [
  { href: '/', label: '記錄' },
  { href: '/search', label: '搜尋' },
]

interface Account {
  name: string
  email: string
}

/** 與 taskeel 取同一個順序的名字，兩邊看到的稱呼才會一樣。 */
function accountName(meta: Record<string, string | undefined>, email: string) {
  return meta.full_name || meta.name || meta.user_name || email || '使用者'
}

export function AppHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const [account, setAccount] = useState<Account | null>(null)
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const acctRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return

    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return
      const meta = (data.user.user_metadata ?? {}) as Record<string, string | undefined>
      const email = data.user.email ?? ''
      setAccount({ name: accountName(meta, email), email })
    })
    return () => {
      cancelled = true
    }
  }, [])

  // layout 的開場 script 已經把 data-theme 寫上去了，這裡只是跟上它
  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme')
    setTheme(current === 'light' ? 'light' : 'dark')
  }, [])

  // 選單開著時，點外面或按 Esc 都要收起來
  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (!acctRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem('notekeel.theme', next)
    } catch {
      // 無痕模式寫不進去，換色本身仍然有效
    }
  }

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
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 4h9l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"
            fill="currentColor"
            opacity="0.25"
          />
          <path
            d="M9 9h6M9 13h6M9 17h4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        Notekeel
      </div>

      <nav className="tabs">
        {TABS.map((tab) => (
          <Link key={tab.href} href={tab.href} aria-current={pathname === tab.href ? 'page' : undefined}>
            {tab.label}
          </Link>
        ))}
      </nav>

      {account ? (
        <div className="acct" ref={acctRef}>
          <button
            className="acct-button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-haspopup="menu"
            title={account.email || account.name}
          >
            <span className="acct-avatar">{account.name[0]}</span>
            <span className="acct-name">{account.name}</span>
          </button>

          {open ? (
            <div className="acct-menu" role="menu">
              <div className="acct-who">
                <div className="acct-who-name">{account.name}</div>
                {account.email && account.email !== account.name ? (
                  <div className="acct-who-email">{account.email}</div>
                ) : null}
              </div>
              <div className="acct-sep" />
              <button className="acct-item" role="menuitem" onClick={toggleTheme}>
                {theme === 'dark' ? '切換為淺色' : '切換為深色'}
              </button>
              <div className="acct-sep" />
              <button className="acct-item" role="menuitem" onClick={() => void signOut()}>
                登出
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  )
}
