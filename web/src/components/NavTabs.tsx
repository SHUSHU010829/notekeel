'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/', label: '記錄' },
  { href: '/search', label: '搜尋' },
]

export function NavTabs() {
  const pathname = usePathname()
  return (
    <nav className="tabs">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} aria-current={pathname === tab.href ? 'page' : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
