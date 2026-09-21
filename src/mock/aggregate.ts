import {
  DetailSortType,
  RENTAL_INCOME_TYPE,
  SummarySortType,
  type GroupFilterRequest,
  type GroupFilterResponse,
  type SummaryFilterRequest,
  type SummaryFilterResponse,
  type SummaryGroup,
  type WithholdingDetail,
} from '../types/withholding'

/**
 * 規格中分群／彙總規則的可執行參照。
 * 前端只用它產生 mock 回應；後端上線後整層會被真實 API 取代，但規則應一致。
 */

/** FNV-1a：中文地址不直出，換成穩定且 URL-safe 的代理鍵 */
function hashKey(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** 群組的原始鍵：身分證／統編，皆空則退回姓名；租金一律以租賃地址 */
function rawGroupKey(record: WithholdingDetail): string {
  if (record.incomeType === RENTAL_INCOME_TYPE) {
    return `addr:${record.rentalAddress ?? ''}`
  }
  const idNo = record.identityNo || record.taxIdNo
  return idNo ? `id:${idNo}` : `name:${record.recipientName}`
}

/** groupKey 在同一 companyUuid + incomeType 下穩定且唯一 */
export function buildGroupKey(companyUuid: string, record: WithholdingDetail): string {
  return `g${hashKey(`${companyUuid}|${record.incomeType}|${rawGroupKey(record)}`)}`
}

function landlordNames(records: WithholdingDetail[]): string[] {
  const names = new Set<string>()
  for (const record of records) {
    names.add(record.recipientName)
    for (const co of record.coRecipientNames ?? []) names.add(co)
  }
  return [...names]
}

function summarise(companyUuid: string, records: WithholdingDetail[]): SummaryGroup {
  const [first] = records
  const isRental = first.incomeType === RENTAL_INCOME_TYPE
  const landlords = isRental ? landlordNames(records) : []
  const months = records.map((r) => r.paymentMonth)
  const sum = (pick: (r: WithholdingDetail) => number) =>
    records.reduce((total, r) => total + pick(r), 0)

  return {
    groupKey: buildGroupKey(companyUuid, first),
    incomeType: first.incomeType,
    recipientName: isRental ? landlords.join('、') : first.recipientName,
    // 租金多房東時身分證留空（規格：可為空字串）
    recipientIdNo:
      isRental && landlords.length > 1 ? '' : first.identityNo || first.taxIdNo,
    ...(isRental ? { rentalAddress: first.rentalAddress ?? '' } : {}),
    recordCount: records.length,
    totalGrossIncome: sum((r) => r.grossIncome),
    totalWithholdingAmount: sum((r) => r.withholdingAmount),
    totalNhiAmount: sum((r) => r.nhiAmount),
    totalPaymentAmount: sum((r) => r.paymentAmount),
    unremitWithholdingCount: records.filter((r) => !r.isRemitWithholding).length,
    unremitNhiCount: records.filter((r) => !r.isRemitNhi).length,
    firstPaymentMonth: Math.min(...months),
    lastPaymentMonth: Math.max(...months),
  }
}

/** 年月／類別等「決定哪些明細進入彙總」的前置條件 */
function inScope(record: WithholdingDetail, req: SummaryFilterRequest | GroupFilterRequest): boolean {
  if (record.paymentYear !== req.paymentYear) return false
  if (req.paymentMonth != null && record.paymentMonth !== req.paymentMonth) return false
  if (req.incomeType && record.incomeType !== req.incomeType) return false
  return true
}

function groupRecords(
  companyUuid: string,
  records: WithholdingDetail[],
): Map<string, WithholdingDetail[]> {
  const groups = new Map<string, WithholdingDetail[]>()
  for (const record of records) {
    const key = buildGroupKey(companyUuid, record)
    const bucket = groups.get(key)
    if (bucket) bucket.push(record)
    else groups.set(key, [record])
  }
  return groups
}

function sortGroups(groups: SummaryGroup[], sortType: SummarySortType, isDesc: boolean): SummaryGroup[] {
  const pick: Record<SummarySortType, (g: SummaryGroup) => number | string> = {
    [SummarySortType.RecipientName]: (g) => g.recipientName,
    [SummarySortType.GrossIncome]: (g) => g.totalGrossIncome,
    [SummarySortType.WithholdingAmount]: (g) => g.totalWithholdingAmount,
    [SummarySortType.PaymentAmount]: (g) => g.totalPaymentAmount,
    [SummarySortType.RecordCount]: (g) => g.recordCount,
  }
  const value = pick[sortType] ?? pick[SummarySortType.RecipientName]
  return [...groups].sort((a, b) => {
    const left = value(a)
    const right = value(b)
    const compared =
      typeof left === 'string' && typeof right === 'string'
        ? left.localeCompare(right as string, 'zh-Hant')
        : (left as number) - (right as number)
    return isDesc ? -compared : compared
  })
}

function sortDetails(list: WithholdingDetail[], sortType: DetailSortType, isDesc: boolean) {
  const pick: Record<DetailSortType, (r: WithholdingDetail) => number | string> = {
    [DetailSortType.PaymentDate]: (r) => r.paymentDate,
    [DetailSortType.RecipientName]: (r) => r.recipientName,
    [DetailSortType.GrossIncome]: (r) => r.grossIncome,
    [DetailSortType.WithholdingAmount]: (r) => r.withholdingAmount,
    [DetailSortType.NhiAmount]: (r) => r.nhiAmount,
    [DetailSortType.PaymentAmount]: (r) => r.paymentAmount,
  }
  const value = pick[sortType] ?? pick[DetailSortType.PaymentDate]
  return [...list].sort((a, b) => {
    const left = value(a)
    const right = value(b)
    const compared =
      typeof left === 'string' && typeof right === 'string'
        ? left.localeCompare(right as string, 'zh-Hant')
        : (left as number) - (right as number)
    return isDesc ? -compared : compared
  })
}

function paginate<T>(list: T[], page = 1, limitCount = 20): T[] {
  const start = (Math.max(page, 1) - 1) * limitCount
  return list.slice(start, start + limitCount)
}

/** POST /ael/withholding/summary/filter */
export function summaryFilter(
  records: WithholdingDetail[],
  req: SummaryFilterRequest,
): SummaryFilterResponse {
  const scoped = records.filter((r) => inScope(r, req))
  const groups = [...groupRecords(req.companyUuid, scoped).values()].map((bucket) =>
    summarise(req.companyUuid, bucket),
  )

  // 群組層條件：金額比對加總、繳納狀態比對「群組內是否存在未繳納」
  const matched = groups.filter((group) => {
    if (req.name && !group.recipientName.includes(req.name)) return false
    if (req.amountMin != null && group.totalGrossIncome < req.amountMin) return false
    if (req.amountMax != null && group.totalGrossIncome > req.amountMax) return false
    if (req.isRemitWithholding === false && group.unremitWithholdingCount === 0) return false
    if (req.isRemitWithholding === true && group.unremitWithholdingCount > 0) return false
    if (req.isRemitNhi === false && group.unremitNhiCount === 0) return false
    if (req.isRemitNhi === true && group.unremitNhiCount > 0) return false
    return true
  })

  const sorted = sortGroups(matched, req.sortType ?? SummarySortType.RecipientName, req.isDesc ?? false)
  const sum = (pick: (g: SummaryGroup) => number) => matched.reduce((t, g) => t + pick(g), 0)

  // yearly 僅受 paymentYear 影響
  const yearly = records.filter((r) => r.paymentYear === req.paymentYear)
  const yearlySum = (pick: (r: WithholdingDetail) => number) =>
    yearly.reduce((t, r) => t + pick(r), 0)

  return {
    list: paginate(sorted, req.page, req.limitCount),
    searchTotalGroupCount: matched.length,
    searchTotalRecordCount: sum((g) => g.recordCount),
    searchTotalGrossIncome: sum((g) => g.totalGrossIncome),
    searchTotalWithholdingAmount: sum((g) => g.totalWithholdingAmount),
    searchTotalNhiAmount: sum((g) => g.totalNhiAmount),
    searchTotalPaymentAmount: sum((g) => g.totalPaymentAmount),
    yearlyTotalGrossIncome: yearlySum((r) => r.grossIncome),
    yearlyTotalWithholdingAmount: yearlySum((r) => r.withholdingAmount),
    yearlyTotalNhiAmount: yearlySum((r) => r.nhiAmount),
    yearlyTotalPaymentAmount: yearlySum((r) => r.paymentAmount),
    yearlyTotalCount: yearly.length,
  }
}

/** POST /ael/withholding/summary/group/filter */
export function groupFilter(
  records: WithholdingDetail[],
  req: GroupFilterRequest,
): GroupFilterResponse {
  const scoped = records.filter(
    (r) => inScope(r, req) && buildGroupKey(req.companyUuid, r) === req.groupKey,
  )
  if (scoped.length === 0) {
    throw new Error('找不到對應的群組（groupKey 可能已失效，請回列表重新查詢）')
  }

  // 標頭沿用 L1 的群組彙總，不受本層單筆條件影響
  const group = summarise(req.companyUuid, scoped)

  const matched = scoped.filter((record) => {
    if (req.amountMin != null && record.grossIncome < req.amountMin) return false
    if (req.amountMax != null && record.grossIncome > req.amountMax) return false
    if (req.isRemitWithholding != null && record.isRemitWithholding !== req.isRemitWithholding) {
      return false
    }
    if (req.isRemitNhi != null && record.isRemitNhi !== req.isRemitNhi) return false
    return true
  })

  const sorted = sortDetails(matched, req.sortType ?? DetailSortType.PaymentDate, req.isDesc ?? false)
  const sum = (pick: (r: WithholdingDetail) => number) => matched.reduce((t, r) => t + pick(r), 0)

  return {
    group,
    list: paginate(sorted, req.page, req.limitCount),
    searchTotalCount: matched.length,
    searchTotalGrossIncome: sum((r) => r.grossIncome),
    searchTotalWithholdingAmount: sum((r) => r.withholdingAmount),
    searchTotalNhiAmount: sum((r) => r.nhiAmount),
    searchTotalPaymentAmount: sum((r) => r.paymentAmount),
  }
}
