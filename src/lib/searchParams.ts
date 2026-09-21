import { currentRocYear } from '../utils/format'
import {
  DetailSortType,
  SummarySortType,
  type IncomeType,
  type WithholdingFilter,
} from '../types/withholding'
import { INCOME_TYPE_OPTIONS } from '../constants/incomeTypes'

export type RawSearchParams = Record<string, string | string[] | undefined>

/** 網址參數名刻意維持短而好讀：?year=114&type=51&q=王小明&page=2 */
export const PARAM = {
  year: 'year',
  month: 'month',
  type: 'type',
  name: 'q',
  amountMin: 'min',
  amountMax: 'max',
  withholding: 'w',
  nhi: 'n',
  sort: 'sort',
  desc: 'desc',
  page: 'page',
  // L2 自己的表格狀態，與 L1 的 sort/desc/page 分開，回列表時條件才不會被蓋掉
  detailSort: 'dsort',
  detailDesc: 'ddesc',
  detailPage: 'dpage',
  /** 回到 L1 時要還原的查詢字串 */
  returnQuery: 'ret',
} as const

export const PAGE_SIZE = 20

function one(params: RawSearchParams, key: string): string | undefined {
  const value = params[key]
  const raw = Array.isArray(value) ? value[0] : value
  return raw?.trim() ? raw.trim() : undefined
}

function num(params: RawSearchParams, key: string): number | undefined {
  const raw = one(params, key)
  if (raw == null) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** `w=unremit` → isRemitWithholding: false（群組內存在未繳納） */
function remitFlag(params: RawSearchParams, key: string): boolean | undefined {
  const raw = one(params, key)
  if (raw === 'unremit') return false
  if (raw === 'remit') return true
  return undefined
}

export interface ListQuery extends WithholdingFilter {
  page: number
  limitCount: number
}

export function parseListQuery(params: RawSearchParams): ListQuery {
  const month = num(params, PARAM.month)
  const type = one(params, PARAM.type)
  const page = num(params, PARAM.page) ?? 1

  return {
    paymentYear: num(params, PARAM.year) ?? currentRocYear(),
    paymentMonth: month && month >= 1 && month <= 12 ? month : undefined,
    incomeType: INCOME_TYPE_OPTIONS.includes(type as IncomeType) ? (type as IncomeType) : undefined,
    name: one(params, PARAM.name),
    amountMin: num(params, PARAM.amountMin),
    amountMax: num(params, PARAM.amountMax),
    isRemitWithholding: remitFlag(params, PARAM.withholding),
    isRemitNhi: remitFlag(params, PARAM.nhi),
    isDesc: one(params, PARAM.desc) === '1',
    page: page >= 1 ? page : 1,
    limitCount: PAGE_SIZE,
  }
}

const SUMMARY_SORTS = new Set<number>(Object.values(SummarySortType) as number[])
const DETAIL_SORTS = new Set<number>(Object.values(DetailSortType) as number[])

/** 非法或未傳一律視為預設值（規格：sortType 非法或未傳視為 1） */
export function parseSummarySort(params: RawSearchParams): SummarySortType {
  const value = num(params, PARAM.sort)
  return value && SUMMARY_SORTS.has(value) ? (value as SummarySortType) : SummarySortType.RecipientName
}

export function parseDetailSort(params: RawSearchParams): DetailSortType {
  const value = num(params, PARAM.detailSort)
  return value && DETAIL_SORTS.has(value) ? (value as DetailSortType) : DetailSortType.PaymentDate
}

/** L2 只沿用年／月這層「決定哪些明細屬於此群組」的範圍條件 */
export function parseDetailQuery(params: RawSearchParams): {
  paymentYear: number
  paymentMonth?: number
  page: number
  limitCount: number
  isDesc: boolean
} {
  const month = num(params, PARAM.month)
  const page = num(params, PARAM.detailPage) ?? 1
  return {
    paymentYear: num(params, PARAM.year) ?? currentRocYear(),
    paymentMonth: month && month >= 1 && month <= 12 ? month : undefined,
    page: page >= 1 ? page : 1,
    limitCount: PAGE_SIZE,
    isDesc: one(params, PARAM.detailDesc) === '1',
  }
}

/** 回程網址：進下一層時以 ret 帶著上一層的完整網址，返回時條件、排序、頁碼都不會遺失 */
export function returnHref(fallback: string, params: RawSearchParams): string {
  const raw = one(params, PARAM.returnQuery)
  return raw?.startsWith('/') ? raw : fallback
}

/** 把目前的 pathname + 查詢參數收成一段可放進 ret 的相對網址 */
export function currentHref(
  pathname: string,
  params: RawSearchParams,
  /** 本頁自己的 ret 是否一併帶下去（L2 進 L3 時需要，才能一路退回 L1） */
  keepReturn = false,
): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    const raw = Array.isArray(value) ? value[0] : value
    if (raw && (keepReturn || key !== PARAM.returnQuery)) search.set(key, raw)
  }
  const query = search.toString()
  return query ? `${pathname}?${query}` : pathname
}

/** 以現有查詢為底，套用差異後產生新網址；值為 undefined 代表移除該參數 */
export function buildHref(
  pathname: string,
  current: RawSearchParams,
  patch: Record<string, string | number | undefined>,
): string {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries(current)) {
    const raw = Array.isArray(value) ? value[0] : value
    if (raw) next.set(key, raw)
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === '') next.delete(key)
    else next.set(key, String(value))
  }
  // 條件變動時回到第 1 頁，避免停在不存在的頁碼
  if (!(PARAM.page in patch)) next.delete(PARAM.page)
  if (!(PARAM.detailPage in patch)) next.delete(PARAM.detailPage)
  const query = next.toString()
  return query ? `${pathname}?${query}` : pathname
}
