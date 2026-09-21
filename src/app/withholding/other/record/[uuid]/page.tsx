import Link from 'next/link'
import { ErrorAlert } from '../../../../../components/ErrorAlert'
import { incomeTypeLabel } from '../../../../../constants/incomeTypes'
import { getCompanyUuid } from '../../../../../lib/company'
import { PARAM, type RawSearchParams } from '../../../../../lib/searchParams'
import { fetchWithholdingDetail } from '../../../../../lib/withholding'
import { RENTAL_INCOME_TYPE, type WithholdingDetail } from '../../../../../types/withholding'
import { maskIdNo, money } from '../../../../../utils/format'

/** L3：既有的單筆詳細頁，欄位沿用既有明細 DTO */
export default async function RecordDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ uuid: string }>
  searchParams: Promise<RawSearchParams>
}) {
  const { uuid } = await params
  const search = await searchParams
  const ret = search[PARAM.returnQuery]
  const backHref = typeof ret === 'string' && ret ? ret : '/withholding/other'
  const backLabel = backHref.includes('/group/') ? '← 群組明細' : '← 各類扣繳彙總'

  let record: WithholdingDetail | null = null
  let errorMessage: string | null = null
  try {
    record = await fetchWithholdingDetail(getCompanyUuid(), uuid)
  } catch (error) {
    errorMessage = (error as Error).message
  }

  return (
    <main className="page">
      <nav className="breadcrumb">
        <Link href={backHref}>{backLabel}</Link>
        <span>/</span>
        <span>單筆詳細</span>
      </nav>

      {errorMessage ? <ErrorAlert message={errorMessage} /> : null}

      {record ? (
        <>
          <header className="page-head">
            <h1 className="page-title">{record.recipientName}</h1>
            <p className="page-subtitle">
              {record.paymentDate} ・ {record.incomeType} {incomeTypeLabel(record.incomeType)}
            </p>
          </header>

          <section className="card">
            <div className="section-title">基本資料</div>
            <dl className="dl">
              <Item label="所得人">{record.recipientName}</Item>
              <Item label="身分證字號">{maskIdNo(record.identityNo) || '—'}</Item>
              <Item label="統一編號">{record.taxIdNo || '—'}</Item>
              <Item label="給付日期">{record.paymentDate}</Item>
              {record.incomeType === RENTAL_INCOME_TYPE ? (
                <>
                  <Item label="租賃地址">{record.rentalAddress || '—'}</Item>
                  <Item label="共同出租人">
                    {record.coRecipientNames?.length ? record.coRecipientNames.join('、') : '—'}
                  </Item>
                </>
              ) : null}
            </dl>
          </section>

          <section className="card">
            <div className="section-title">金額</div>
            <dl className="dl">
              <Item label="所得金額">{money(record.grossIncome)}</Item>
              <Item label="扣繳稅額">{money(record.withholdingAmount)}</Item>
              <Item label="二代健保">{money(record.nhiAmount)}</Item>
              <Item label="實付金額">{money(record.paymentAmount)}</Item>
            </dl>
          </section>

          <section className="card">
            <div className="section-title">繳納狀態</div>
            <dl className="dl">
              <Item label="扣繳稅額">
                {record.isRemitWithholding ? '已繳納' : <span className="badge">未繳納</span>}
              </Item>
              <Item label="二代健保">
                {record.nhiAmount === 0
                  ? '不適用'
                  : record.isRemitNhi
                    ? '已繳納'
                    : <span className="badge">未繳納</span>}
              </Item>
              <Item label="備註">{record.note || '—'}</Item>
            </dl>
          </section>
        </>
      ) : null}
    </main>
  )
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
