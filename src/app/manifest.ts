import type { MetadataRoute } from 'next'

/** 讓手機可以「加到主畫面」，開起來像 app 一樣少一層瀏覽器介面。 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Notekeel',
    short_name: 'Notekeel',
    description: '快速記下想法，之後用意思相近的說法就能找回來。',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d0e10',
    theme_color: '#0d0e10',
    lang: 'zh-Hant',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }
}
