import type { MetadataRoute } from 'next'

/** 讓手機可以「加到主畫面」，開起來像 app 一樣少一層瀏覽器介面。 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '隨手記',
    short_name: '隨手記',
    description: '快速記下想法，之後用意思相近的說法就能找回來。',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f7f5',
    theme_color: '#2f6f4f',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }
}
