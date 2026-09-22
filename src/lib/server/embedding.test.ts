import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmbeddingError, embedLocally, embedWithVoyage } from './embedding'

const options = { apiKey: 'test-key', model: 'voyage-4-lite', baseUrl: 'https://voyage.test', dimensions: 2 }

function mockFetch(handler: (init: RequestInit) => Response | Promise<Response>) {
  const spy = vi.fn(async (_url: string, init: RequestInit) => handler(init))
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => vi.unstubAllGlobals())

describe('Voyage embeddings', () => {
  it('送出模型、input_type 與維度，並依 index 歸位後正規化', async () => {
    let captured: Record<string, unknown> = {}
    const spy = mockFetch((init) => {
      captured = JSON.parse(String(init.body))
      // 故意回顛倒的順序
      return new Response(
        JSON.stringify({ data: [{ index: 1, embedding: [0, 3] }, { index: 0, embedding: [4, 0] }] }),
        { status: 200 },
      )
    })

    const vectors = await embedWithVoyage(['第一段', '第二段'], 'document', options)

    expect(captured).toMatchObject({
      model: 'voyage-4-lite',
      input: ['第一段', '第二段'],
      input_type: 'document',
      output_dimension: 2,
    })
    expect(spy.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer test-key' })
    expect(vectors[0][0]).toBeCloseTo(1)
    expect(vectors[1][1]).toBeCloseTo(1)
  })

  it('搜尋時 input_type 用 query', async () => {
    let captured: Record<string, unknown> = {}
    mockFetch((init) => {
      captured = JSON.parse(String(init.body))
      return new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 0] }] }), { status: 200 })
    })

    await embedWithVoyage(['關鍵字'], 'query', options)
    expect(captured.input_type).toBe('query')
  })

  it('遇到 5xx 會重試', async () => {
    let calls = 0
    mockFetch(() => {
      calls += 1
      if (calls === 1) return new Response('{"detail":"boom"}', { status: 500 })
      return new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 0] }] }), { status: 200 })
    })

    await expect(embedWithVoyage(['內容'], 'document', options)).resolves.toHaveLength(1)
    expect(calls).toBe(2)
  })

  it('被限流（429）會重試，錯誤訊息點出免費方案的 RPM 限制', async () => {
    let calls = 0
    mockFetch(() => {
      calls += 1
      return new Response('{"detail":"reduced rate limits of 3 RPM"}', {
        status: 429,
        headers: { 'Retry-After': '1' },
      })
    })

    await expect(embedWithVoyage(['內容'], 'document', { ...options, maxRetries: 1 })).rejects.toThrow(
      /3 RPM/,
    )
    expect(calls).toBe(2)
  })

  it('金鑰錯誤（401）不重試，直接拋錯', async () => {
    let calls = 0
    mockFetch(() => {
      calls += 1
      return new Response('{"detail":"invalid api key"}', { status: 401 })
    })

    await expect(embedWithVoyage(['內容'], 'document', options)).rejects.toBeInstanceOf(EmbeddingError)
    expect(calls).toBe(1)
  })

  it('回傳筆數對不上時拋錯', async () => {
    mockFetch(() => new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 0] }] }), { status: 200 }))
    await expect(embedWithVoyage(['一', '二'], 'document', options)).rejects.toBeInstanceOf(EmbeddingError)
  })
})

describe('本機假 embedder', () => {
  it('同樣的輸入給同樣的向量，且已正規化', () => {
    const [first] = embedLocally(['隨手記'], 64)
    const [second] = embedLocally(['隨手記'], 64)

    expect(first).toHaveLength(64)
    expect(first).toEqual(second)
    expect(first.reduce((sum, value) => sum + value * value, 0)).toBeCloseTo(1)
  })
})
