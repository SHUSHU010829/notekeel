import type { Metadata, Viewport } from 'next'
import { AppHeader } from '../components/AppHeader'
import './globals.css'

export const metadata: Metadata = {
  title: '隨手記',
  description: '快速記下想法，之後用意思相近的說法就能找回來。',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: '隨手記', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7f5' },
    { media: '(prefers-color-scheme: dark)', color: '#131413' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <div className="shell">
          <AppHeader />
          {children}
        </div>
      </body>
    </html>
  )
}
