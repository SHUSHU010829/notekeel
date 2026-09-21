import Link from 'next/link'
import { buildHref, PARAM, type RawSearchParams } from '../lib/searchParams'

interface Props {
  pathname: string
  params: RawSearchParams
  label: string
  sortType: number
  activeSort: number
  isDesc: boolean
  align?: 'left' | 'right'
  /** L2 用 dsort/ddesc */
  sortParam?: string
  descParam?: string
}

/** 點同一欄切換升降冪；未排序的欄位不顯示箭頭，避免表頭一排符號 */
export function SortHeader({
  pathname,
  params,
  label,
  sortType,
  activeSort,
  isDesc,
  align,
  sortParam = PARAM.sort,
  descParam = PARAM.desc,
}: Props) {
  const active = activeSort === sortType
  const nextDesc = active ? !isDesc : true
  const href = buildHref(pathname, params, {
    [sortParam]: sortType,
    [descParam]: nextDesc ? '1' : undefined,
  })

  return (
    <th className={[align === 'right' ? 'num' : '', active ? 'active' : ''].join(' ').trim()} scope="col"
      aria-sort={active ? (isDesc ? 'descending' : 'ascending') : 'none'}>
      <Link className="sort-link" href={href}>
        {label}
        {active ? <span className="arrow">{isDesc ? '↓' : '↑'}</span> : null}
      </Link>
    </th>
  )
}
