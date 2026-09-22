#!/usr/bin/env node
/**
 * 把 scripts/seed-notes.json 的範例筆記灌進去。兩種模式：
 *
 *   node scripts/seed.mjs                      # 丟給本機跑著的 app（預設 http://localhost:3000）
 *   node scripts/seed.mjs --url http://…       # 指定位址
 *   node scripts/seed.mjs --sql --email me@x.y # 產生 SQL，貼到 Supabase SQL Editor
 *
 * --sql 需要 VOYAGE_API_KEY：向量必須由「跟線上同一套」的 embedder 產生，
 * 否則存進去的向量跟查詢時算出來的不在同一個空間，搜尋會完全失準。
 */

import { readFile } from 'node:fs/promises'

const args = process.argv.slice(2)
const flag = (name) => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : (args[index + 1] ?? true)
}

const notes = JSON.parse(await readFile(new URL('./seed-notes.json', import.meta.url), 'utf8'))

if (args.includes('--sql')) {
  await emitSql()
} else {
  await postToApp()
}

/** 模式一：打本機 app 的 API，讓它自己算向量、自己寫進資料庫。 */
async function postToApp() {
  const baseUrl = String(flag('--url') ?? 'http://localhost:3000').replace(/\/+$/, '')
  let ok = 0

  for (const content of notes) {
    const response = await fetch(`${baseUrl}/api/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })

    if (response.ok) {
      ok += 1
      process.stdout.write('.')
      continue
    }

    const detail = await response.text().catch(() => '')
    console.error(`\n✗ ${response.status} ${content.slice(0, 20)}…　${detail.slice(0, 120)}`)
    if (response.status === 401) {
      console.error('\n需要登入。這個模式只適合沒設定 Supabase 的本機開發環境；')
      console.error('要灌進正式資料庫請改用：node scripts/seed.mjs --sql --email you@example.com')
      process.exit(1)
    }
  }

  console.log(`\n完成：寫入 ${ok}/${notes.length} 則到 ${baseUrl}`)
}

/** 模式二：產生 SQL（含向量），貼到 Supabase SQL Editor 執行。 */
async function emitSql() {
  const email = flag('--email')
  if (typeof email !== 'string') {
    console.error('請指定帳號：node scripts/seed.mjs --sql --email you@example.com')
    process.exit(1)
  }

  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) {
    console.error('--sql 需要 VOYAGE_API_KEY（向量要跟線上用同一個模型產生，否則搜不準）。')
    console.error('只是想在本機試玩的話，直接跑 node scripts/seed.mjs 就好。')
    process.exit(1)
  }

  const model = process.env.VOYAGE_MODEL ?? 'voyage-4-lite'
  const dimensions = Number(process.env.EMBEDDING_DIMENSIONS ?? 512)
  const baseUrl = (process.env.VOYAGE_BASE_URL ?? 'https://api.voyageai.com').replace(/\/+$/, '')

  const response = await fetch(`${baseUrl}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: notes, input_type: 'document', output_dimension: dimensions }),
  })

  if (!response.ok) {
    console.error(`Voyage 回應 ${response.status}：${(await response.text()).slice(0, 200)}`)
    process.exit(1)
  }

  const payload = await response.json()
  const vectors = new Array(notes.length)
  for (const item of payload.data ?? []) vectors[item.index] = normalize(item.embedding)

  const rows = notes.map((content, index) => {
    if (!vectors[index]) {
      console.error(`第 ${index} 則沒有拿到向量`)
      process.exit(1)
    }
    return `  (owner.id, ${quote(content)}, '[${vectors[index].join(',')}]')`
  })

  console.log(`-- notekeel 範例測資：${notes.length} 則，owner = ${email}
-- 在 Supabase SQL Editor 執行（需要先跑過 supabase/schema.sql）
with owner as (
  select id from auth.users where email = ${quote(email)}
)
insert into notes (owner_id, content, embedding)
select * from (values
${rows.join(',\n')}
) as seed(owner_id, content, embedding), owner;`)
}

function normalize(vector) {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  return length === 0 ? vector : vector.map((value) => value / length)
}

function quote(text) {
  return `'${String(text).replace(/'/g, "''")}'`
}
