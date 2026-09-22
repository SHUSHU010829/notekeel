import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetLocalNotes } from '../../../lib/server/notes'
import { GET, POST } from './route'
import { POST as BULK } from './bulk/route'
import { DELETE } from './[id]/route'
import { GET as SEARCH } from './search/route'

// 這些測試跑在「沒設定 Supabase」的本機模式：route handler 走記憶體存取層
// 與本機假 embedder，因此可以端到端地驗證驗證邏輯與回應格式。
beforeEach(resetLocalNotes)

function postNote(content: unknown) {
  return POST(
    new Request('http://localhost/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }),
  )
}

describe('POST /api/notes', () => {
  it('新增成功回 201 與筆記本體', async () => {
    const response = await postNote('用 pgvector 做語意搜尋的筆記')
    expect(response.status).toBe(201)

    const created = await response.json()
    expect(created.content).toBe('用 pgvector 做語意搜尋的筆記')
    expect(created.id).toBeTruthy()
    expect(created.createdAt).toBeTruthy()
  })

  it('內容前後空白會被去掉', async () => {
    const created = await (await postNote('   有空白   ')).json()
    expect(created.content).toBe('有空白')
  })

  it('空內容回 400 與可顯示的訊息', async () => {
    const response = await postNote('   \n ')
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('筆記內容不可為空')
  })

  it('過長內容回 400', async () => {
    const response = await postNote('字'.repeat(20001))
    expect(response.status).toBe(400)
  })

  it('壞掉的 JSON 回 400', async () => {
    const response = await POST(
      new Request('http://localhost/api/notes', { method: 'POST', body: '{not json' }),
    )
    expect(response.status).toBe(400)
  })
})

describe('GET /api/notes', () => {
  it('列出剛才記下的筆記，新的在前', async () => {
    await postNote('第一則')
    await new Promise((resolve) => setTimeout(resolve, 2))
    await postNote('第二則')

    const { notes } = await (await GET(new Request('http://localhost/api/notes'))).json()
    expect(notes.map((note: { content: string }) => note.content)).toEqual(['第二則', '第一則'])
  })

  it('limit 會被收斂在上限內', async () => {
    await postNote('一則')
    const response = await GET(new Request('http://localhost/api/notes?limit=99999'))
    expect(response.status).toBe(200)
  })
})

describe('GET /api/notes/search', () => {
  it('找回相近的筆記並附上相似度', async () => {
    await postNote('pgvector 的 HNSW 索引不需要先訓練')
    await postNote('晚餐想吃拉麵')

    const response = await SEARCH(new Request('http://localhost/api/notes/search?q=HNSW 索引'))
    expect(response.status).toBe(200)

    const { query, results } = await response.json()
    expect(query).toBe('HNSW 索引')
    expect(results[0].content).toContain('HNSW')
    expect(results[0].similarity).toBeGreaterThan(0)
  })

  it('沒有 Voyage 金鑰時不做 rerank，回應標明 reranked=false', async () => {
    await postNote('一則筆記')
    const body = await (await SEARCH(new Request('http://localhost/api/notes/search?q=筆記'))).json()
    expect(body.reranked).toBe(false)
  })

  it('回應帶上這次實際套用的相似度下限', async () => {
    await postNote('一則筆記')
    const { minSimilarity } = await (
      await SEARCH(new Request('http://localhost/api/notes/search?q=筆記'))
    ).json()
    expect(minSimilarity).toBe(0)
  })

  it('?min= 可以臨時覆寫門檻，不合法的值則忽略', async () => {
    await postNote('完全無關的內容')

    const filtered = await (
      await SEARCH(new Request('http://localhost/api/notes/search?q=毫不相干的查詢&min=0.99'))
    ).json()
    expect(filtered.minSimilarity).toBe(0.99)
    expect(filtered.results).toHaveLength(0)

    const ignored = await (
      await SEARCH(new Request('http://localhost/api/notes/search?q=內容&min=abc'))
    ).json()
    expect(ignored.minSimilarity).toBe(0)
  })

  it('沒帶 q 回 400', async () => {
    const response = await SEARCH(new Request('http://localhost/api/notes/search'))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('請輸入搜尋關鍵字')
  })
})

function bulk(contents: unknown) {
  return BULK(
    new Request('http://localhost/api/notes/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
    }),
  )
}

describe('POST /api/notes/bulk', () => {
  it('一次匯入多則，之後列表與搜尋都找得到', async () => {
    const response = await bulk(['第一則匯入', '第二則匯入', '第三則匯入'])
    expect(response.status).toBe(201)

    const body = await response.json()
    expect(body.created).toBe(3)
    expect(body.notes).toHaveLength(3)

    const { notes } = await (await GET(new Request('http://localhost/api/notes'))).json()
    expect(notes).toHaveLength(3)
  })

  it('去掉空白後為空的項目會被略過', async () => {
    const body = await (await bulk(['有內容', '   ', '', '也有內容'])).json()
    expect(body.created).toBe(2)
  })

  it('格式不對或全空回 400', async () => {
    expect((await bulk('不是陣列')).status).toBe(400)
    expect((await bulk([])).status).toBe(400)
    expect((await bulk(['  ', ''])).status).toBe(400)
  })

  it('超過單次上限回 400', async () => {
    const response = await bulk(Array.from({ length: 101 }, (_, i) => `第 ${i} 則`))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('一次最多')
  })
})

function removeNote(id: string) {
  return DELETE(new Request(`http://localhost/api/notes/${id}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  })
}

describe('DELETE /api/notes/:id', () => {
  it('刪除成功回 204，之後列表就找不到了', async () => {
    const created = await (await postNote('要被刪掉的筆記')).json()
    await postNote('要留著的筆記')

    const response = await removeNote(created.id)
    expect(response.status).toBe(204)

    const { notes } = await (await GET(new Request('http://localhost/api/notes'))).json()
    expect(notes.map((note: { content: string }) => note.content)).toEqual(['要留著的筆記'])
  })

  it('刪不存在的筆記回 404', async () => {
    const response = await removeNote('11111111-1111-4111-8111-111111111111')
    expect(response.status).toBe(404)
    expect((await response.json()).error).toBe('找不到這則筆記')
  })

  it('刪掉的筆記也不會再出現在搜尋結果', async () => {
    const created = await (await postNote('獨一無二的關鍵內容')).json()
    await removeNote(created.id)

    const { results } = await (
      await SEARCH(new Request('http://localhost/api/notes/search?q=獨一無二的關鍵內容'))
    ).json()
    expect(results).toHaveLength(0)
  })
})

describe('登入狀態', () => {
  it('設定了 Supabase 但沒有登入時回 401', async () => {
    vi.resetModules()
    vi.doMock('../../../lib/supabase/env', () => ({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
      authEnabled: true,
    }))
    vi.doMock('../../../lib/supabase/server', () => ({
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
    }))

    const { POST: guardedPost } = await import('./route')
    const response = await guardedPost(
      new Request('http://localhost/api/notes', { method: 'POST', body: JSON.stringify({ content: '嗨' }) }),
    )

    expect(response.status).toBe(401)
    expect((await response.json()).error).toBe('請先登入')
    vi.doUnmock('../../../lib/supabase/env')
    vi.doUnmock('../../../lib/supabase/server')
  })
})
