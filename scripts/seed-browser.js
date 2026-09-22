// notekeel 範例測資 —— 在「已登入的隨手記網頁」上打開瀏覽器主控台（F12 → Console），
// 整段貼上後按 Enter。它打的是同源的 /api/notes/bulk，會自動帶上你的登入 cookie。
//
// 走 bulk 端點的原因：所有內容會併成「一個」Voyage 請求，
// 免費方案沒綁付款方式時只有 3 RPM，逐則送到第 4 則就會被限流。
// 已經存在的相同內容會自動略過，重跑不會灌出重複資料。
//
// 內容由 scripts/seed-notes.json 產生（有測試確保兩邊一致），要改請改那一份。
;(async () => {
  const notes = [
    "房東今天說下個月起租金要調漲兩千，問我要不要先簽兩年約鎖住價格",
    "報稅前記得把去年的醫療費用收據整理出來，列舉扣除額可能比標準扣除划算",
    "健身教練說深蹲前要先練核心穩定，不然腰會代償受傷",
    "早上跟設計師討論新的配色，決定先用綠色系當主色，紫色留給強調狀態",
    "pgvector 的 HNSW 索引不需要先訓練，空表就能用；ivfflat 要有資料才建得準",
    "語意搜尋要記得把 query 跟 document 的 input_type 分開送，不然召回會明顯變差",
    "Supabase 的 RLS 政策寫 owner_id = auth.uid() 就夠了，function 記得宣告 security invoker",
    "Vercel 的 serverless function 有執行時間上限，長時間的工作要拆開或改用 queue",
    "訂閱制的定價策略：先做免費方案養使用者，看轉換率再決定要不要加中間層",
    "跟 A 公司的合約要在月底前回覆，重點是驗收條款跟付款週期",
    "下週三下午兩點跟客戶簡報，記得先把 demo 環境的假資料重新整理過",
    "團隊 retro 提到的最大痛點是需求變動太頻繁，考慮改成兩週一次的迭代",
    "媽媽生日在十月十二號，想訂那間她上次說好吃的日式料理",
    "貓砂快用完了，順便買罐頭跟化毛膏",
    "冰箱的牛奶這週五到期，記得先喝掉",
    "牙醫回診約在下個月初，要記得帶健保卡",
    "看完《原子習慣》最有感的一句：你不會達到目標的高度，只會落到系統的水準",
    "朋友推薦的 podcast：在講遠距團隊怎麼維持溝通密度，通勤時聽",
    "想學的東西清單：Rust、基礎樂理、還有把游泳的換氣練順",
    "咖啡店老闆說淺焙豆水溫要壓在 88 度左右，太高會把酸味煮成澀味",
    "京都自由行想排的點：伏見稻荷清晨去人少、二年坂、鴨川散步",
    "租車前記得確認國際駕照的有效期限，還有保險要保到全險",
    "這個月信用卡帳單比平常多三千，主要是年繳的軟體訂閱都撞在一起",
    "把緊急預備金的目標從三個月生活費提高到六個月，市場不確定性變高",
    "寫程式時卡住超過三十分鐘就該起來走一走，通常答案是在回座位的路上想到的",
    "跟同事聊到職涯，他說與其追求升遷，不如先確認自己想解決哪一類問題",
  ]

  const existing = new Set(
    ((await (await fetch('/api/notes?limit=200')).json()).notes ?? []).map((note) => note.content),
  )
  const pending = notes.filter((content) => !existing.has(content))

  if (pending.length === 0) {
    console.log('已經全部存在，不需要再灌。')
    return
  }
  console.log(`準備寫入 ${pending.length} 則（略過已存在的 ${notes.length - pending.length} 則）…`)

  const response = await fetch('/api/notes/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: pending }),
  })

  if (!response.ok) {
    console.error(`✗ ${response.status}`, await response.text())
    return
  }

  const { created } = await response.json()
  console.log(`完成：寫入 ${created} 則，重新整理頁面就看得到。`)
})()
