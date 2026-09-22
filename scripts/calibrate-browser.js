// 校準 SEARCH_MIN_SIMILARITY —— 在「已登入的隨手記網頁」主控台貼上執行。
//
// 它會用幾組「用詞完全不同」的查詢去搜，強制 min=0（不過濾），
// 印出每組的最高分與是否命中預期，最後建議一個門檻值。
//
// Voyage 免費方案沒綁付款方式只有 3 RPM，所以每次查詢間隔 21 秒，
// 整份跑完約兩分鐘。綁了付款方式的話可以把 INTERVAL_MS 改小。
;(async () => {
  const INTERVAL_MS = 21_000

  const cases = [
    { query: '節稅', expect: '報稅' },
    { query: '腰痛', expect: '深蹲' },
    { query: '想存錢', expect: '預備金' },
    { query: '怎麼沖咖啡不會苦', expect: '淺焙' },
    { query: '向量資料庫怎麼建索引', expect: 'HNSW' },
    { query: '量子力學的測不準原理', expect: null }, // 反例：應該什麼都不像
  ]

  const rows = []

  for (const [index, testCase] of cases.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS))

    const params = new URLSearchParams({ q: testCase.query, min: '0', limit: '3' })
    const response = await fetch(`/api/notes/search?${params}`)
    if (!response.ok) {
      console.error(`✗ ${response.status}`, await response.text())
      return
    }

    const { results } = await response.json()
    const top = results[0]
    const hit = testCase.expect ? results.findIndex((r) => r.content.includes(testCase.expect)) : -1

    rows.push({
      查詢: testCase.query,
      最高分: top ? Number(top.similarity.toFixed(3)) : null,
      命中第幾名: testCase.expect ? (hit === -1 ? '沒進前三' : hit + 1) : '(反例)',
      命中該則的分數:
        hit >= 0 ? Number(results[hit].similarity.toFixed(3)) : testCase.expect ? null : '—',
      最高分的內容: top ? top.content.slice(0, 18) + '…' : '(無結果)',
    })
    console.log(`${index + 1}/${cases.length} 完成：${testCase.query}`)
  }

  console.table(rows)

  const hits = rows.filter((r) => typeof r.命中該則的分數 === 'number').map((r) => r.命中該則的分數)
  const noise = rows.filter((r) => r.命中第幾名 === '(反例)').map((r) => r.最高分 ?? 0)

  if (hits.length === 0) {
    console.warn('沒有任何一組命中預期，先確認測資有灌進去（列表頁看得到嗎）。')
    return
  }

  const lowestHit = Math.min(...hits)
  const highestNoise = noise.length ? Math.max(...noise) : 0
  console.log(`該找到的最低分：${lowestHit.toFixed(3)}　無關查詢的最高分：${highestNoise.toFixed(3)}`)

  if (highestNoise < lowestHit) {
    const suggestion = ((lowestHit + highestNoise) / 2).toFixed(2)
    console.log(`建議 SEARCH_MIN_SIMILARITY = ${suggestion}（取中間值，兩邊都留餘裕）`)
  } else {
    console.log('相關與無關的分數重疊，先設 0（不過濾）靠排序就好，之後再依體感微調。')
  }
})()
