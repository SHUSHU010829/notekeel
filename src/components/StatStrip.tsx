import { money } from '../utils/format'

export interface Stat {
  label: string
  value: number
}

/** 只放四個關鍵數字，不加卡片框、不上色 */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="stats">
      {stats.map((stat) => (
        <div className="stat" key={stat.label}>
          <div className="label">{stat.label}</div>
          <div className="value">{money(stat.value)}</div>
        </div>
      ))}
    </div>
  )
}
