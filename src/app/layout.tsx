import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '各類扣繳彙總',
  description: '同一所得人同類別彙總一列，點列再看逐期明細。',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  )
}
