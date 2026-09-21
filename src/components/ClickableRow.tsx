'use client'

import { useRouter } from 'next/navigation'

/** 整列可點；列內仍保留真正的連結，確保鍵盤與「在新分頁開啟」可用 */
export function ClickableRow({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter()
  return (
    <tr
      className="clickable"
      onClick={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('a')) return
        router.push(href)
      }}
    >
      {children}
    </tr>
  )
}
