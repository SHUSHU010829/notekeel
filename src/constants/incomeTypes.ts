import type { IncomeType } from '../types/withholding'

/** 顯示用名稱；代號以後端為準，名稱僅影響畫面文案。 */
export const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  '51': '租金',
  '9A': '執行業務',
  '9B': '稿費講演',
  '53': '競賽獎金',
  '5B': '利息',
  '91': '財產交易',
  '93': '退職所得',
  '97': '受贈',
  '92': '其他所得',
}

/** 篩選列的類別順序 */
export const INCOME_TYPE_OPTIONS = Object.keys(INCOME_TYPE_LABELS) as IncomeType[]

export function incomeTypeLabel(type: IncomeType): string {
  return INCOME_TYPE_LABELS[type] ?? type
}
