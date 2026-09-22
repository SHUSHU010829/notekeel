// 校準搜尋門檻 —— 在「已登入的隨手記網頁」主控台貼上執行。
//
// 它用幾組「用詞完全不同」的查詢去搜（外加一組刻意無關的反例），
// 強制不過濾，印出每組的分數，最後建議門檻值。
//
// 有跑 rerank 的話會以 relevance 為準：那個分數有校準過，適合設絕對門檻
// （寫進 RERANK_MIN_SCORE）；沒有 rerank 才退而看 similarity。
;(async () => {
  // Voyage 免費方案沒綁付款方式只有 3 RPM，那種情況請把這個值調成 21000
  const INTERVAL_MS = 1_200

  const cases = [
    { query: '節稅', expect: '報稅' },
    { query: '腰痛', expect: '深蹲' },
    { query: '想存錢', expect: '預備金' },
    { query: '怎麼沖咖啡不會苦', expect: '淺焙' },
    { query: '向量資料庫怎麼建索引', expect: 'HNSW' },
    { query: '量子力學的測不準原理', expect: null }, // 反例：應該什麼都不像
  ]

  const rows = []
  let usedRerank = false

  for (const [index, testCase] of cases.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS))

    const params = new URLSearchParams({
      q: testCase.query,
      min: '0',
      minRelevance: '0',
      limit: '5',
    })
    const response = await fetch(`/api/notes/search?${params}`)
    if (!response.ok) {
      console.error(`✗ ${response.status}`, await response.text())
      return
    }

    const { results, reranked } = await response.json()
    usedRerank = usedRerank || reranked

    // 有 rerank 就以 relevance 為準
    const scoreOf = (hit) => (hit.relevance ?? hit.similarity)
    const top = results[0]
    const hitIndex = testCase.expect
      ? results.findIndex((hit) => hit.content.includes(testCase.expect))
      : -1

    rows.push({
      查詢: testCase.query,
      最高分: top ? Number(scoreOf(top).toFixed(3)) : null,
      命中第幾名: testCase.expect ? (hitIndex === -1 ? '沒進前五' : hitIndex + 1) : '(反例)',
      命中分數: hitIndex >= 0 ? Number(scoreOf(results[hitIndex]).toFixed(3)) : testCase.expect ? null : '—',
      最高分的內容: top ? top.content.slice(0, 18) + '…' : '(無結果)',
    })

    const label = `${index + 1}/${cases.length}　「${testCase.query}」`
    if (!testCase.expect) {
      console.log(`${label}（反例）最高分 ${top ? scoreOf(top).toFixed(3) : '—'}`)
    } else if (hitIndex === -1) {
      console.warn(`${label}沒在前五名找到含「${testCase.expect}」的筆記`)
    } else {
      console.log(`${label}命中第 ${hitIndex + 1} 名，分數 ${scoreOf(results[hitIndex]).toFixed(3)}`)
    }
  }

  console.table(rows)
  console.log(usedRerank ? '分數來源：rerank 的 relevance' : '分數來源：向量的 similarity（沒跑 rerank）')

  const hits = rows.filter((row) => typeof row.命中分數 === 'number').map((row) => row.命中分數)
  const noise = rows.filter((row) => row.命中第幾名 === '(反例)').map((row) => row.最高分 ?? 0)

  if (hits.length === 0) {
    console.warn('沒有任何一組命中預期，先確認測資有灌進去（列表頁看得到嗎）。')
    return
  }

  const lowestHit = Math.min(...hits)
  const highestNoise = noise.length ? Math.max(...noise) : 0
  const variable = usedRerank ? 'RERANK_MIN_SCORE' : 'SEARCH_MIN_SIMILARITY'
  console.log(`該找到的最低分：${lowestHit.toFixed(3)}　無關查詢的最高分：${highestNoise.toFixed(3)}`)

  if (highestNoise < lowestHit) {
    console.log(`建議 ${variable} = ${((lowestHit + highestNoise) / 2).toFixed(2)}（取中間值，兩邊都留餘裕）`)
  } else {
    console.log(`相關與無關的分數重疊，${variable} 先設 0（不過濾）靠排序就好。`)
    if (!usedRerank) console.log('開啟 rerank 之後通常就切得開了。')
  }
})()
