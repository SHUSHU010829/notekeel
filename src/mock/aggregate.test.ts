import { describe, expect, it } from 'vitest'
import { buildGroupKey, groupFilter, summaryFilter } from './aggregate'
import { MOCK_COMPANY_UUID, MOCK_RECORDS } from './records'
import { SummarySortType, type SummaryGroup } from '../types/withholding'

const base = { companyUuid: MOCK_COMPANY_UUID, paymentYear: 114 }

function all(): SummaryGroup[] {
  return summaryFilter(MOCK_RECORDS, { ...base, limitCount: 999 }).list
}

function find(predicate: (g: SummaryGroup) => boolean): SummaryGroup {
  const group = all().find(predicate)
  if (!group) throw new Error('找不到預期的群組')
  return group
}

describe('彙總列表（L1）', () => {
  it('同一所得人同一類別彙總成一列，金額為群組加總', () => {
    const group = find((g) => g.recipientName === '張雅婷' && g.incomeType === '9A')
    expect(group.recordCount).toBe(6)
    expect(group.totalGrossIncome).toBe(45000 * 6)
    expect(group.totalWithholdingAmount).toBe(4500 * 6)
    expect(group.firstPaymentMonth).toBe(1)
    expect(group.lastPaymentMonth).toBe(6)
  })

  it('同一人不同類別拆成兩列', () => {
    const groups = all().filter((g) => g.recipientName === '林建宏')
    expect(groups.map((g) => g.incomeType).sort()).toEqual(['9A', '9B'])
  })

  it('租金以租賃地址分群，房東姓名以「、」串接且身分證留空', () => {
    const group = find((g) => g.incomeType === '51' && g.recipientName.includes('王小明'))
    expect(group.recipientName).toBe('王小明、王小華')
    expect(group.recipientIdNo).toBe('')
    expect(group.rentalAddress).toContain('復興南路')
    expect(group.recordCount).toBe(12)
  })

  it('非租金類別不回傳 rentalAddress', () => {
    expect(find((g) => g.incomeType === '9A' && g.recipientName === '張雅婷').rentalAddress).toBeUndefined()
  })

  it('身分證與統編皆空的舊資料退回以姓名分群', () => {
    const group = find((g) => g.recipientName === '無統編舊資料')
    expect(group.recipientIdNo).toBe('')
    expect(group.recordCount).toBe(2)
  })

  it('無二代健保的類別回 0 而不是省略欄位', () => {
    const group = find((g) => g.incomeType === '97')
    expect(group).toHaveProperty('totalNhiAmount')
    expect(group.totalNhiAmount).toBe(0)
  })

  it('未繳納筆數以群組內計數', () => {
    const rental = find((g) => g.incomeType === '51' && g.recipientName.includes('王小明'))
    expect(rental.unremitWithholdingCount).toBe(2)
    expect(rental.unremitNhiCount).toBe(0)
  })

  it('groupKey 在同一公司同一類別下穩定且 URL-safe', () => {
    const [record] = MOCK_RECORDS
    const key = buildGroupKey(MOCK_COMPANY_UUID, record)
    expect(key).toBe(buildGroupKey(MOCK_COMPANY_UUID, record))
    expect(key.length).toBeLessThanOrEqual(64)
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('彙總層篩選與分頁', () => {
  it('類別篩選只決定出現哪些列，不改變彙總行為', () => {
    const rentalOnly = summaryFilter(MOCK_RECORDS, { ...base, incomeType: '51', limitCount: 999 })
    expect(rentalOnly.list.every((g) => g.incomeType === '51')).toBe(true)
    const beforeFilter = find((g) => g.incomeType === '51' && g.recipientName.includes('陳美玲'))
    const afterFilter = rentalOnly.list.find((g) => g.recipientName.includes('陳美玲'))
    expect(afterFilter?.totalGrossIncome).toBe(beforeFilter.totalGrossIncome)
  })

  it('金額區間比對群組加總後的金額', () => {
    const min = 500000
    const result = summaryFilter(MOCK_RECORDS, { ...base, amountMin: min, limitCount: 999 })
    expect(result.list.length).toBeGreaterThan(0)
    expect(result.list.every((g) => g.totalGrossIncome >= min)).toBe(true)
  })

  it('isRemitWithholding=false 表示群組內「存在」未繳納', () => {
    const result = summaryFilter(MOCK_RECORDS, { ...base, isRemitWithholding: false, limitCount: 999 })
    expect(result.list.length).toBeGreaterThan(0)
    expect(result.list.every((g) => g.unremitWithholdingCount > 0)).toBe(true)
  })

  it('分頁單位是群組，searchTotalGroupCount 為篩選後群組總數', () => {
    const total = all().length
    const firstPage = summaryFilter(MOCK_RECORDS, { ...base, page: 1, limitCount: 3 })
    expect(firstPage.list).toHaveLength(3)
    expect(firstPage.searchTotalGroupCount).toBe(total)
    const lastPage = summaryFilter(MOCK_RECORDS, {
      ...base,
      page: Math.ceil(total / 3),
      limitCount: 3,
    })
    expect(lastPage.list.length).toBeGreaterThan(0)
    expect(lastPage.searchTotalGroupCount).toBe(total)
  })

  it('searchTotal 為篩選後全部群組的加總，不只當頁', () => {
    const page = summaryFilter(MOCK_RECORDS, { ...base, page: 1, limitCount: 2 })
    const expected = all().reduce((sum, g) => sum + g.totalGrossIncome, 0)
    expect(page.searchTotalGrossIncome).toBe(expected)
    expect(page.searchTotalRecordCount).toBe(all().reduce((sum, g) => sum + g.recordCount, 0))
  })

  it('yearly 統計只受 paymentYear 影響', () => {
    const wide = summaryFilter(MOCK_RECORDS, { ...base })
    const narrow = summaryFilter(MOCK_RECORDS, { ...base, incomeType: '51', paymentMonth: 3 })
    expect(narrow.yearlyTotalGrossIncome).toBe(wide.yearlyTotalGrossIncome)
    expect(narrow.yearlyTotalCount).toBe(wide.yearlyTotalCount)
    expect(narrow.searchTotalGrossIncome).toBeLessThan(narrow.yearlyTotalGrossIncome)
  })

  it('排序依彙總層語意，非法 sortType 視為 1（姓名）', () => {
    const byAmount = summaryFilter(MOCK_RECORDS, {
      ...base,
      sortType: SummarySortType.GrossIncome,
      isDesc: true,
      limitCount: 999,
    }).list
    const amounts = byAmount.map((g) => g.totalGrossIncome)
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts)

    const fallback = summaryFilter(MOCK_RECORDS, {
      ...base,
      sortType: 99 as SummarySortType,
      limitCount: 999,
    }).list
    const byName = summaryFilter(MOCK_RECORDS, { ...base, limitCount: 999 }).list
    expect(fallback.map((g) => g.groupKey)).toEqual(byName.map((g) => g.groupKey))
  })
})

describe('群組內明細（L2）', () => {
  const rental = () => find((g) => g.incomeType === '51' && g.recipientName.includes('王小明'))

  it('回傳群組標頭與該群組的逐期明細', () => {
    const group = rental()
    const result = groupFilter(MOCK_RECORDS, {
      ...base,
      incomeType: '51',
      groupKey: group.groupKey,
      limitCount: 999,
    })
    expect(result.group.recipientName).toBe(group.recipientName)
    expect(result.searchTotalCount).toBe(12)
    expect(result.list.map((r) => r.paymentMonth)).toEqual([...Array(12)].map((_, i) => i + 1))
    expect(result.searchTotalGrossIncome).toBe(group.totalGrossIncome)
  })

  it('此層的繳納條件比對單筆，標頭仍維持整個群組的彙總', () => {
    const group = rental()
    const result = groupFilter(MOCK_RECORDS, {
      ...base,
      incomeType: '51',
      groupKey: group.groupKey,
      isRemitWithholding: false,
      limitCount: 999,
    })
    expect(result.list).toHaveLength(2)
    expect(result.list.every((r) => !r.isRemitWithholding)).toBe(true)
    expect(result.group.recordCount).toBe(12)
  })

  it('groupKey 失效時丟出可顯示的錯誤訊息', () => {
    expect(() =>
      groupFilter(MOCK_RECORDS, { ...base, incomeType: '51', groupKey: 'gdeadbeef' }),
    ).toThrow(/群組/)
  })
})
