import Link from 'next/link'
import { buildHref, PARAM, type RawSearchParams } from '../lib/searchParams'
import { incomeTypeLabel } from '../constants/incomeTypes'
import type { IncomeType } from '../types/withholding'
import { money } from '../utils/format'
import type { ListQuery } from '../lib/searchParams'

interface Props {
  pathname: string
  params: RawSearchParams
  query: ListQuery
}

/** 已套用條件：每個條件一枚可單獨移除的標籤，年度不列入（永遠存在） */
export function AppliedFilters({ pathname, params, query }: Props) {
  const chips: { key: string; label: string; value: string; remove: string[] }[] = []

  if (query.paymentMonth) {
    chips.push({ key: 'month', label: '月份', value: `${query.paymentMonth} 月`, remove: [PARAM.month] })
  }
  if (query.incomeType) {
    chips.push({
      key: 'type',
      label: '類別',
      value: `${query.incomeType} ${incomeTypeLabel(query.incomeType as IncomeType)}`,
      remove: [PARAM.type],
    })
  }
  if (query.name) {
    chips.push({ key: 'name', label: '姓名', value: query.name, remove: [PARAM.name] })
  }
  if (query.amountMin != null || query.amountMax != null) {
    const min = query.amountMin != null ? money(query.amountMin) : ''
    const max = query.amountMax != null ? money(query.amountMax) : ''
    chips.push({
      key: 'amount',
      label: '所得金額',
      value: min && max ? `${min} – ${max}` : min ? `${min} 以上` : `${max} 以下`,
      remove: [PARAM.amountMin, PARAM.amountMax],
    })
  }
  if (query.isRemitWithholding === false) {
    chips.push({ key: 'w', label: '扣繳稅額', value: '有未繳納', remove: [PARAM.withholding] })
  }
  if (query.isRemitNhi === false) {
    chips.push({ key: 'n', label: '二代健保', value: '有未繳納', remove: [PARAM.nhi] })
  }

  if (chips.length === 0) return null

  const clearAll = buildHref(pathname, {}, { [PARAM.year]: query.paymentYear })

  return (
    <div className="applied">
      {chips.map((chip) => (
        <span className="chip" key={chip.key}>
          {chip.label}：<b>{chip.value}</b>
          <Link
            href={buildHref(
              pathname,
              params,
              Object.fromEntries(chip.remove.map((key) => [key, undefined])),
            )}
            aria-label={`移除${chip.label}條件`}
          >
            ✕
          </Link>
        </span>
      ))}
      {chips.length > 1 ? (
        <Link className="btn ghost" href={clearAll}>
          清除全部
        </Link>
      ) : null}
    </div>
  )
}
