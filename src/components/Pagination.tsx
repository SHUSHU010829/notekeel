import Link from 'next/link'
import { buildHref, PARAM, type RawSearchParams } from '../lib/searchParams'

interface Props {
  pathname: string
  params: RawSearchParams
  page: number
  pageSize: number
  totalCount: number
  unit: string
  /** L2 用 dpage，與 L1 的 page 分開 */
  pageParam?: string
}

/** 後端會回總數（searchTotalGroupCount／searchTotalCount），因此可以算出真實總頁數 */
export function Pagination({ pathname, params, page, pageSize, totalCount, unit, pageParam = PARAM.page }: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  if (totalCount <= pageSize) return null

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)
  const href = (target: number) => buildHref(pathname, params, { [pageParam]: target })

  return (
    <nav className="pagination" aria-label="分頁">
      <span>
        第 {from}–{to} {unit}，共 {totalCount} {unit}
      </span>
      <span className="spacer" />
      {page > 1 ? (
        <Link className="btn" href={href(page - 1)}>
          上一頁
        </Link>
      ) : (
        <button className="btn" disabled>
          上一頁
        </button>
      )}
      <span>
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link className="btn" href={href(page + 1)}>
          下一頁
        </Link>
      ) : (
        <button className="btn" disabled>
          下一頁
        </button>
      )}
    </nav>
  )
}
