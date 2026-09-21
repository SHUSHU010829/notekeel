'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { INCOME_TYPE_LABELS, INCOME_TYPE_OPTIONS } from '../constants/incomeTypes'
import { PARAM } from '../lib/searchParams'
import { currentRocYear } from '../utils/format'

export interface FilterBarValues {
  year: number
  month?: number
  type?: string
  name?: string
  amountMin?: number
  amountMax?: number
  unremitWithholding: boolean
  unremitNhi: boolean
}

interface Props {
  pathname: string
  values: FilterBarValues
  /** 排序等非篩選參數，送出時保留 */
  preserve?: Record<string, string>
}

const YEARS = Array.from({ length: 6 }, (_, i) => currentRocYear() - i)
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

/**
 * 主要條件固定一行（年度／月份／類別／姓名），金額區間與繳納狀態收在「更多篩選」。
 * 已套用的條件另以可移除的標籤呈現，畫面上永遠只看得到一排控制項。
 */
export function FilterBar({ pathname, values, preserve = {} }: Props) {
  const router = useRouter()
  const [draft, setDraft] = useState(values)
  const advancedApplied =
    values.amountMin != null || values.amountMax != null || values.unremitWithholding || values.unremitNhi
  const [open, setOpen] = useState(advancedApplied)

  function submit(next: FilterBarValues) {
    const params = new URLSearchParams(preserve)
    const set = (key: string, value: string | number | undefined | null) => {
      if (value === undefined || value === null || value === '') params.delete(key)
      else params.set(key, String(value))
    }
    set(PARAM.year, next.year)
    set(PARAM.month, next.month)
    set(PARAM.type, next.type)
    set(PARAM.name, next.name?.trim())
    set(PARAM.amountMin, next.amountMin)
    set(PARAM.amountMax, next.amountMax)
    set(PARAM.withholding, next.unremitWithholding ? 'unremit' : undefined)
    set(PARAM.nhi, next.unremitNhi ? 'unremit' : undefined)
    params.delete(PARAM.page)
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  function update<K extends keyof FilterBarValues>(key: K, value: FilterBarValues[K], immediate = false) {
    const next = { ...draft, [key]: value }
    setDraft(next)
    if (immediate) submit(next)
  }

  function numberValue(raw: string): number | undefined {
    if (!raw.trim()) return undefined
    const parsed = Number(raw.replace(/[,\s]/g, ''))
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return (
    <form
      className="filters"
      onSubmit={(event) => {
        event.preventDefault()
        submit(draft)
      }}
    >
      <div className="filter-row">
        <select
          className="field"
          aria-label="年度"
          value={draft.year}
          onChange={(event) => update('year', Number(event.target.value), true)}
        >
          {YEARS.map((year) => (
            <option key={year} value={year}>
              {year} 年度
            </option>
          ))}
        </select>

        <select
          className="field"
          aria-label="月份"
          value={draft.month ?? ''}
          onChange={(event) =>
            update('month', event.target.value ? Number(event.target.value) : undefined, true)
          }
        >
          <option value="">全年</option>
          {MONTHS.map((month) => (
            <option key={month} value={month}>
              {month} 月
            </option>
          ))}
        </select>

        <select
          className="field"
          aria-label="所得類別"
          value={draft.type ?? ''}
          onChange={(event) => update('type', event.target.value || undefined, true)}
        >
          <option value="">全部類別</option>
          {INCOME_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {type}　{INCOME_TYPE_LABELS[type]}
            </option>
          ))}
        </select>

        <div className="search grow">
          <input
            className="field"
            type="search"
            placeholder="搜尋所得人姓名"
            aria-label="所得人姓名"
            value={draft.name ?? ''}
            onChange={(event) => update('name', event.target.value)}
          />
        </div>

        <button
          type="button"
          className="btn"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          更多篩選{advancedApplied ? ' ·' : ''}
        </button>
        <button type="submit" className="btn primary">
          查詢
        </button>
      </div>

      {open ? (
        <div className="advanced">
          <div>
            <span className="label">所得金額（彙總後）</span>
            <div className="range">
              <input
                className="field"
                inputMode="numeric"
                placeholder="最低"
                aria-label="所得金額最低"
                defaultValue={draft.amountMin ?? ''}
                onChange={(event) => update('amountMin', numberValue(event.target.value))}
              />
              <span>–</span>
              <input
                className="field"
                inputMode="numeric"
                placeholder="最高"
                aria-label="所得金額最高"
                defaultValue={draft.amountMax ?? ''}
                onChange={(event) => update('amountMax', numberValue(event.target.value))}
              />
            </div>
          </div>

          <div>
            <span className="label">繳納狀態</span>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.unremitWithholding}
                onChange={(event) => update('unremitWithholding', event.target.checked)}
              />
              有未繳納的扣繳稅額
            </label>
          </div>

          <div>
            <span className="label">&nbsp;</span>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.unremitNhi}
                onChange={(event) => update('unremitNhi', event.target.checked)}
              />
              有未繳納的二代健保
            </label>
          </div>
        </div>
      ) : null}
    </form>
  )
}
