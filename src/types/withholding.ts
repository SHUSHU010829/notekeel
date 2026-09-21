/**
 * 型別完全對齊《各類扣繳彙總列表 — 後端 API 規格》。
 * 欄位命名與規格一字不差，後端上線後不需要再改前端轉換邏輯。
 */

/** 所得格式代號 */
export type IncomeType = '51' | '9A' | '9B' | '53' | '5B' | '91' | '93' | '97' | '92'

/** 租金＝唯一以租賃地址分群的類別 */
export const RENTAL_INCOME_TYPE = '51' satisfies IncomeType

/** 彙總層排序（與明細層 1–6 語意不同，故獨立定義） */
export enum SummarySortType {
  RecipientName = 1,
  GrossIncome = 2,
  WithholdingAmount = 3,
  PaymentAmount = 4,
  RecordCount = 5,
}

/** 明細層排序（沿用既有 1–6） */
export enum DetailSortType {
  PaymentDate = 1,
  RecipientName = 2,
  GrossIncome = 3,
  WithholdingAmount = 4,
  NhiAmount = 5,
  PaymentAmount = 6,
}

/** L1／L2 共用的篩選條件 */
export interface WithholdingFilter {
  /** 民國年 */
  paymentYear: number
  /** 1–12，省略＝全年 */
  paymentMonth?: number
  /** 省略＝全部類別 */
  incomeType?: IncomeType
  /** 所得人姓名模糊比對；租金比對房東姓名 */
  name?: string
  amountMin?: number
  amountMax?: number
  /** false ＝存在未繳納的扣繳稅額 */
  isRemitWithholding?: boolean
  /** false ＝存在未繳納的二代健保 */
  isRemitNhi?: boolean
  isDesc?: boolean
  page?: number
  limitCount?: number
}

/** POST /ael/withholding/summary/filter */
export interface SummaryFilterRequest extends WithholdingFilter {
  companyUuid: string
  sortType?: SummarySortType
}

/** L1 的一列＝一個群組 */
export interface SummaryGroup {
  /** 不透明、URL-safe，原樣回傳給 API 2 */
  groupKey: string
  incomeType: IncomeType
  /** 租金多房東以「、」串接 */
  recipientName: string
  /** 租金多房東時可為空字串 */
  recipientIdNo: string
  /** 僅 incomeType=51 回傳 */
  rentalAddress?: string
  recordCount: number
  totalGrossIncome: number
  totalWithholdingAmount: number
  totalNhiAmount: number
  totalPaymentAmount: number
  unremitWithholdingCount: number
  unremitNhiCount: number
  firstPaymentMonth: number
  lastPaymentMonth: number
}

export interface SummaryFilterResponse {
  list: SummaryGroup[]
  /** 篩選後的「群組」總數，前端據此算總頁數 */
  searchTotalGroupCount: number
  searchTotalRecordCount: number
  searchTotalGrossIncome: number
  searchTotalWithholdingAmount: number
  searchTotalNhiAmount: number
  searchTotalPaymentAmount: number
  /** 僅受 paymentYear 影響 */
  yearlyTotalGrossIncome: number
  yearlyTotalWithholdingAmount: number
  yearlyTotalNhiAmount: number
  yearlyTotalPaymentAmount: number
  yearlyTotalCount: number
}

/** POST /ael/withholding/summary/group/filter */
export interface GroupFilterRequest extends WithholdingFilter {
  companyUuid: string
  incomeType: IncomeType
  groupKey: string
  sortType?: DetailSortType
}

/** 既有明細 DTO 形狀（勿改） */
export interface WithholdingDetail {
  uuid: string
  incomeType: IncomeType
  /** 民國年 */
  paymentYear: number
  paymentMonth: number
  /** YYY/MM/DD（民國） */
  paymentDate: string
  recipientName: string
  identityNo: string
  taxIdNo: string
  grossIncome: number
  withholdingAmount: number
  nhiAmount: number
  paymentAmount: number
  isRemitWithholding: boolean
  isRemitNhi: boolean
  /** 僅租金 */
  rentalAddress?: string
  /** 僅租金：同一租約的其他房東 */
  coRecipientNames?: string[]
  note?: string
}

export interface GroupFilterResponse {
  group: SummaryGroup
  list: WithholdingDetail[]
  searchTotalCount: number
  searchTotalGrossIncome: number
  searchTotalWithholdingAmount: number
  searchTotalNhiAmount: number
  searchTotalPaymentAmount: number
}

/** 既有 API 回應外層信封 */
export interface ApiEnvelope<T> {
  code?: number
  message?: string
  data: T
}
