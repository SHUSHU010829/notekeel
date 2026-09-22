/** 相對時間：剛剛 / 12 分鐘前 / 3 天前；超過一週改顯示日期。 */
export function relativeTime(iso: string, now = new Date()): string {
  const target = new Date(iso)
  const diffMs = now.getTime() - target.getTime()
  const minutes = Math.floor(diffMs / 60000)

  if (minutes < 1) return '剛剛'
  if (minutes < 60) return `${minutes} 分鐘前`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小時前`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`

  return target.toLocaleDateString('zh-Hant-TW', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** 完整時間，供 title 屬性顯示 */
export function fullTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-Hant-TW', { dateStyle: 'long', timeStyle: 'short' })
}
