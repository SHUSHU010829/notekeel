/** 金額：千分位，0 也照實顯示（規格要求不省略欄位） */
export function money(value: number): string {
  return value.toLocaleString('zh-Hant-TW')
}

/** 民國年月日：112/03/05 */
export function rocDate(value: string): string {
  return value
}

/** 期間標籤：同月只顯示「3月」，跨月顯示「1–12月」 */
export function monthRange(first: number, last: number): string {
  return first === last ? `${first}月` : `${first}–${last}月`
}

/** 身分證／統編遮罩：A123456789 → A12345****（列表上不必要地曝露全碼） */
export function maskIdNo(idNo: string): string {
  if (!idNo) return ''
  if (idNo.length <= 4) return idNo
  return idNo.slice(0, idNo.length - 4) + '****'
}

/** 以「、」串接房東姓名，超過 2 位收斂成「王小明 等 3 人」避免撐爆欄位 */
export function collapseNames(name: string, count = 2): string {
  const names = name.split('、').filter(Boolean)
  if (names.length <= count) return name
  return `${names.slice(0, count).join('、')} 等 ${names.length} 人`
}

/** 今年的民國年 */
export function currentRocYear(now = new Date()): number {
  return now.getFullYear() - 1911
}
