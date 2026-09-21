import Link from 'next/link'
import { AppliedFilters } from '../../../components/AppliedFilters'
import { ClickableRow } from '../../../components/ClickableRow'
import { EmptyState } from '../../../components/EmptyState'
import { ErrorAlert } from '../../../components/ErrorAlert'
import { FilterBar } from '../../../components/FilterBar'
import { Pagination } from '../../../components/Pagination'
import { SortHeader } from '../../../components/SortHeader'
import { StatStrip } from '../../../components/StatStrip'
import { incomeTypeLabel } from '../../../constants/incomeTypes'
import { getCompanyUuid } from '../../../lib/company'
import {
  PAGE_SIZE,
  PARAM,
  parseListQuery,
  parseSummarySort,
  currentHref,
  type RawSearchParams,
} from '../../../lib/searchParams'
import { fetchSummaryList } from '../../../lib/withholding'
import { RENTAL_INCOME_TYPE, SummarySortType, type SummaryFilterResponse } from '../../../types/withholding'
import { collapseNames, maskIdNo, money, monthRange } from '../../../utils/format'

const PATHNAME = '/withholding/other'

export default async function SummaryListPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const params = await searchParams
  const query = parseListQuery(params)
  const sortType = parseSummarySort(params)

  let data: SummaryFilterResponse | null = null
  let errorMessage: string | null = null
  try {
    data = await fetchSummaryList({ companyUuid: getCompanyUuid(), sortType, ...query })
  } catch (error) {
    errorMessage = (error as Error).message
  }

  const sortProps = { pathname: PATHNAME, params, activeSort: sortType, isDesc: query.isDesc ?? false }

  return (
    <main className="page">
      <header className="page-head">
        <h1 className="page-title">各類扣繳彙總</h1>
        <p className="page-subtitle">
          同一所得人、同一所得類別彙總為一列；租金以租賃地址彙總。點選任一列可查看逐期明細。
        </p>
      </header>

      <section className="card">
        <FilterBar
          pathname={PATHNAME}
          values={{
            year: query.paymentYear,
            month: query.paymentMonth,
            type: query.incomeType,
            name: query.name,
            amountMin: query.amountMin,
            amountMax: query.amountMax,
            unremitWithholding: query.isRemitWithholding === false,
            unremitNhi: query.isRemitNhi === false,
          }}
          preserve={Object.fromEntries(
            [PARAM.sort, PARAM.desc]
              .map((key) => [key, params[key]])
              .filter(([, value]) => typeof value === 'string'),
          ) as Record<string, string>}
        />
        <div style={{ padding: '0 14px 12px' }}>
          <AppliedFilters pathname={PATHNAME} params={params} query={query} />
        </div>
      </section>

      {errorMessage ? (
        <div style={{ marginTop: 16 }}>
          <ErrorAlert message={errorMessage} />
        </div>
      ) : null}

      {data ? (
        <>
          <section className="card">
            <StatStrip
              stats={[
                { label: '所得金額', value: data.searchTotalGrossIncome },
                { label: '扣繳稅額', value: data.searchTotalWithholdingAmount },
                { label: '二代健保', value: data.searchTotalNhiAmount },
                { label: '支付金額', value: data.searchTotalPaymentAmount },
              ]}
            />
            <div className="result-line">
              <span>
                篩選結果 {data.searchTotalGroupCount} 組、{data.searchTotalRecordCount} 筆
              </span>
              <span>
                {query.paymentYear} 年度全部：{money(data.yearlyTotalGrossIncome)}（
                {data.yearlyTotalCount} 筆）
              </span>
            </div>
          </section>

          <section className="card">
            {data.list.length === 0 ? (
              <EmptyState
                title="沒有符合條件的資料"
                description="調整年度、類別或關鍵字後再試一次。"
              />
            ) : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <SortHeader
                          {...sortProps}
                          label="所得人"
                          sortType={SummarySortType.RecipientName}
                        />
                        <th scope="col">類別</th>
                        <th scope="col">期間</th>
                        <SortHeader
                          {...sortProps}
                          label="筆數"
                          sortType={SummarySortType.RecordCount}
                          align="right"
                        />
                        <SortHeader
                          {...sortProps}
                          label="所得金額"
                          sortType={SummarySortType.GrossIncome}
                          align="right"
                        />
                        <SortHeader
                          {...sortProps}
                          label="扣繳稅額"
                          sortType={SummarySortType.WithholdingAmount}
                          align="right"
                        />
                        <SortHeader
                          {...sortProps}
                          label="支付金額"
                          sortType={SummarySortType.PaymentAmount}
                          align="right"
                        />
                        <th scope="col">繳納狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.list.map((group) => {
                        const isRental = group.incomeType === RENTAL_INCOME_TYPE
                        const href = groupHref(group.incomeType, group.groupKey, params)
                        const unremit = [
                          group.unremitWithholdingCount > 0
                            ? `扣繳 ${group.unremitWithholdingCount} 筆`
                            : null,
                          group.unremitNhiCount > 0 ? `健保 ${group.unremitNhiCount} 筆` : null,
                        ].filter(Boolean)

                        return (
                          <ClickableRow key={group.groupKey} href={href}>
                            <td>
                              <span className="primary-cell">
                                <Link className="name" href={href}>
                                  {collapseNames(group.recipientName)}
                                </Link>
                                <span className="sub">
                                  {isRental
                                    ? group.rentalAddress
                                    : maskIdNo(group.recipientIdNo) || '未填身分證／統編'}
                                </span>
                              </span>
                            </td>
                            <td>
                              <span className="tag">
                                {group.incomeType} {incomeTypeLabel(group.incomeType)}
                              </span>
                            </td>
                            <td className="muted">
                              {monthRange(group.firstPaymentMonth, group.lastPaymentMonth)}
                            </td>
                            <td className="num muted">{group.recordCount}</td>
                            <td className="num strong">{money(group.totalGrossIncome)}</td>
                            <td className="num">{money(group.totalWithholdingAmount)}</td>
                            <td className="num">{money(group.totalPaymentAmount)}</td>
                            <td>
                              {unremit.length > 0 ? (
                                <span className="badge">{unremit.join('、')}未繳納</span>
                              ) : (
                                <span className="muted">已繳納</span>
                              )}
                            </td>
                          </ClickableRow>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  pathname={PATHNAME}
                  params={params}
                  page={query.page}
                  pageSize={PAGE_SIZE}
                  totalCount={data.searchTotalGroupCount}
                  unit="組"
                />
              </>
            )}
          </section>
        </>
      ) : null}
    </main>
  )
}

/** 帶著目前查詢條件進 L2；ret 保留 L1 的完整查詢字串，返回時原樣還原 */
function groupHref(incomeType: string, groupKey: string, params: RawSearchParams): string {
  const current = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    const raw = Array.isArray(value) ? value[0] : value
    if (raw) current.set(key, raw)
  }

  // L2 只需要年／月這層範圍條件；其餘條件放進 ret，返回時原樣還原
  const next = new URLSearchParams()
  const year = current.get(PARAM.year)
  const month = current.get(PARAM.month)
  if (year) next.set(PARAM.year, year)
  if (month) next.set(PARAM.month, month)
  next.set(PARAM.returnQuery, currentHref(PATHNAME, params))

  const query = next.toString()
  return `${PATHNAME}/group/${incomeType}/${groupKey}${query ? `?${query}` : ''}`
}
