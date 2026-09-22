import type { Metadata, Viewport } from 'next'
import { AppHeader } from '../components/AppHeader'
import './globals.css'

export const metadata: Metadata = {
  title: 'Notekeel',
  description: '快速記下想法，之後用意思相近的說法就能找回來。',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Notekeel', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  themeColor: '#0d0e10',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <body>
        {/* 在首次繪製前就把主題定下來，避免深色底閃一下白 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('notekeel.theme')||'dark';document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','dark')}",
          }}
        />
        <div className="shell">
          <AppHeader />
          {children}
        </div>
      </body>
    </html>
  )
}
