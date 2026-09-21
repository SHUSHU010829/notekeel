import Link from 'next/link'
import { ClickableRow } from '../../../../../../components/ClickableRow'
import { EmptyState } from '../../../../../../components/EmptyState'
import { ErrorAlert } from '../../../../../../components/ErrorAlert'
import { Pagination } from '../../../../../../components/Pagination'
import { SortHeader } from '../../../../../../components/SortHeader'
import { StatStrip } from '../../../../../../components/StatStrip'
import { incomeTypeLabel } from '../../../../../../constants/incomeTypes'
import { getCompanyUuid } from '../../../../../../lib/company'
import {
  PAGE_SIZE,
  PARAM,
  parseDetailQuery,
  parseDetailSort,
  returnHref,
  currentHref,
  type RawSearchParams,
} from '../../../../../../lib/searchParams'
import { fetchGroupDetails } from '../../../../../../lib/withholding'
import {
  DetailSortType,
  RENTAL_INCOME_TYPE,
  type GroupFilterResponse,
  type IncomeType,
} from '../../../../../../types/withholding'
import { maskIdNo, money, monthRange } from '../../../../../../utils/format'

const LIST_PATHNAME = '/withholding/other'

export default async function GroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ incomeType: string; groupKey: string }>
  searchParams: Promise<RawSearchParams>
}) {
  const { incomeType, groupKey } = await params
  const search = await searchParams
  const query = parseDetailQuery(search)
  const sortType = parseDetailSort(search)
  const pathname = `${LIST_PATHNAME}/group/${incomeType}/${groupKey}`
  const backHref = returnHref(LIST_PATHNAME, search)
  // 供 L3 原路返回本頁（含排序與頁碼）
  const currentUrl = currentHref(pathname, search, true)

  let data: GroupFilterResponse | null = null
  let errorMessage: string | null = null
  try {
    data = await fetchGroupDetails({
      companyUuid: getCompanyUuid(),
      incomeType: incomeType as IncomeType,
      groupKey,
      sortType,
      ...query,
    })
  } catch (error) {
    errorMessage = (error as Error).message
  }

  const group = data?.group
  const isRental = group?.incomeType === RENTAL_INCOME_TYPE
  const showRecipientColumn = Boolean(isRental && group && group.recipientName.includes('、'))
  const sortProps = {
    pathname,
    params: search,
    activeSort: sortType,
    isDesc: query.isDesc,
    sortParam: PARAM.detailSort,
    descParam: PARAM.detailDesc,
  }

  return (
    <main className="page">
      <nav className="breadcrumb">
        <Link href={backHref}>← 各類扣繳彙總</Link>
        <span>/</span>
        <span>{group ? group.recipientName : '群組明細'}</span>
      </nav>

      {errorMessage ? <ErrorAlert message={errorMessage} /> : null}

      {data && group ? (
        <>
          <section className="card">
            <div className="group-head">
              <div className="top">
                <h2>{group.recipientName}</h2>
                <span className="tag">
                  {group.incomeType} {incomeTypeLabel(group.incomeType)}
                </span>
              </div>
              <div className="meta">
                {isRental
                  ? group.rentalAddress
                  : maskIdNo(group.recipientIdNo) || '未填身分證／統編'}
                {' ・ '}
                {query.paymentYear} 年度{' '}
                {monthRange(group.firstPaymentMonth, group.lastPaymentMonth)}
                {' ・ '}
                共 {group.recordCount} 筆
              </div>
            </div>
            <StatStrip
              stats={[
                { label: '所得金額', value: group.totalGrossIncome },
                { label: '扣繳稅額', value: group.totalWithholdingAmount },
                { label: '二代健保', value: group.totalNhiAmount },
                { label: '支付金額', value: group.totalPaymentAmount },
              ]}
            />
          </section>

          <section className="card">
            {data.list.length === 0 ? (
              <EmptyState title="此群組沒有明細資料" />
            ) : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <SortHeader
                          {...sortProps}
                          label="給付日期"
                          sortType={DetailSortType.PaymentDate}
                        />
                        {showRecipientColumn ? (
                          <SortHeader
                            {...sortProps}
                            label="所得人"
                            sortType={DetailSortType.RecipientName}
                          />
                        ) : null}
                        <SortHeader
                          {...sortProps}
                          label="所得金額"
                          sortType={DetailSortType.GrossIncome}
                          align="right"
                        />
                        <SortHeader
                          {...sortProps}
                          label="扣繳稅額"
                          sortType={DetailSortType.WithholdingAmount}
                          align="right"
                        />
                        <SortHeader
                          {...sortProps}
                          label="二代健保"
                          sortType={DetailSortType.NhiAmount}
                          align="right"
                        />
                        <SortHeader
                          {...sortProps}
                          label="支付金額"
                          sortType={DetailSortType.PaymentAmount}
                          align="right"
                        />
                        <th scope="col">繳納狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.list.map((record) => {
                        const href = `${LIST_PATHNAME}/record/${record.uuid}?${new URLSearchParams(
                          { [PARAM.returnQuery]: currentUrl },
                        )}`
                        const unremit = [
                          !record.isRemitWithholding ? '扣繳' : null,
                          !record.isRemitNhi ? '健保' : null,
                        ].filter(Boolean)

                        return (
                          <ClickableRow key={record.uuid} href={href}>
                            <td>
                              <Link href={href}>{record.paymentDate}</Link>
                            </td>
                            {showRecipientColumn ? <td>{record.recipientName}</td> : null}
                            <td className="num strong">{money(record.grossIncome)}</td>
                            <td className="num">{money(record.withholdingAmount)}</td>
                            <td className="num">{money(record.nhiAmount)}</td>
                            <td className="num">{money(record.paymentAmount)}</td>
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
                  pathname={pathname}
                  params={search}
                  page={query.page}
                  pageSize={PAGE_SIZE}
                  totalCount={data.searchTotalCount}
                  unit="筆"
                  pageParam={PARAM.detailPage}
                />
              </>
            )}
          </section>
        </>
      ) : null}
    </main>
  )
}
