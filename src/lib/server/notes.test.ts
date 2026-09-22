import { beforeEach, describe, expect, it } from 'vitest'
import { createLocalNotes, createSupabaseNotes, resetLocalNotes, StoreError } from './notes'

describe('本機記憶體存取層', () => {
  beforeEach(resetLocalNotes)

  const alice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

  it('搜尋依相似度由高到低排序', async () => {
    const notes = createLocalNotes(alice)
    await notes.create('貓咪在曬太陽', [1, 0, 0])
    await notes.create('會議記錄', [0, 1, 0])
    await notes.create('貓砂要補貨', [0.8, 0.6, 0])

    const hits = await notes.search([1, 0, 0], 2, 0)
    expect(hits).toHaveLength(2)
    expect(hits[0].content).toBe('貓咪在曬太陽')
    expect(hits[0].similarity).toBeGreaterThan(hits[1].similarity)
    expect(hits[0].similarity).toBeCloseTo(1)
  })

  it('低於相似度下限的不回傳', async () => {
    const notes = createLocalNotes(alice)
    await notes.create('相近的', [1, 0, 0])
    await notes.create('無關的', [0, 1, 0])

    const hits = await notes.search([1, 0, 0], 10, 0.5)
    expect(hits.map((hit) => hit.content)).toEqual(['相近的'])
  })

  it('看不到其他使用者的筆記', async () => {
    await createLocalNotes(alice).create('Alice 的祕密', [1, 0, 0])
    const bobNotes = createLocalNotes(bob)
    await bobNotes.create('Bob 的購物清單', [1, 0, 0])

    expect((await bobNotes.list(10)).map((note) => note.content)).toEqual(['Bob 的購物清單'])
    expect((await bobNotes.search([1, 0, 0], 10, 0)).map((hit) => hit.content)).toEqual([
      'Bob 的購物清單',
    ])
  })

  it('刪除只動得了自己的筆記', async () => {
    const aliceNotes = createLocalNotes(alice)
    const bobNotes = createLocalNotes(bob)
    const aliceNote = await aliceNotes.create('Alice 的祕密', [1, 0, 0])

    expect(await bobNotes.remove(aliceNote.id)).toBe(false)   // 別人刪不掉
    expect(await aliceNotes.remove(aliceNote.id)).toBe(true)  // 自己刪得掉
    expect(await aliceNotes.remove(aliceNote.id)).toBe(false) // 刪過就沒了
    expect(await aliceNotes.list(10)).toHaveLength(0)
  })

  it('列表依時間新到舊', async () => {
    const notes = createLocalNotes(alice)
    await notes.create('第一則', [1, 0, 0])
    await new Promise((resolve) => setTimeout(resolve, 2))
    await notes.create('第二則', [1, 0, 0])

    expect((await notes.list(10)).map((note) => note.content)).toEqual(['第二則', '第一則'])
  })
})

describe('Supabase 存取層', () => {
  const ownerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

  function fakeClient(overrides: Record<string, unknown> = {}) {
    const calls: Record<string, unknown> = {}
    const client = {
      from(table: string) {
        calls.table = table
        return {
          insert(row: unknown) {
            calls.inserted = row
            return {
              select: () => ({
                single: async () => ({
                  data: { id: 'note-1', content: '內容', created_at: '2026-09-22T00:00:00Z' },
                  error: null,
                }),
              }),
            }
          },
          select() {
            return {
              order: (column: string, opts: unknown) => {
                calls.order = [column, opts]
                return {
                  limit: async (value: number) => {
                    calls.limit = value
                    return {
                      data: [{ id: 'note-1', content: '內容', created_at: '2026-09-22T00:00:00Z' }],
                      error: null,
                    }
                  },
                }
              },
            }
          },
        }
      },
      async rpc(name: string, args: unknown) {
        calls.rpc = [name, args]
        return {
          data: [
            { id: 'note-1', content: '內容', created_at: '2026-09-22T00:00:00Z', similarity: 0.87 },
          ],
          error: null,
          ...(overrides.rpcResult as object | undefined),
        }
      },
      ...overrides,
    }
    return { client: client as never, calls }
  }

  it('新增時帶上 owner_id 與向量，並轉成前端的欄位名', async () => {
    const { client, calls } = fakeClient()
    const created = await createSupabaseNotes(client, ownerId).create('內容', [0.1, 0.2])

    expect(calls.table).toBe('notes')
    expect(calls.inserted).toEqual({ owner_id: ownerId, content: '內容', embedding: [0.1, 0.2] })
    expect(created).toEqual({ id: 'note-1', content: '內容', createdAt: '2026-09-22T00:00:00Z' })
  })

  it('搜尋呼叫 match_notes 並帶入筆數與相似度下限', async () => {
    const { client, calls } = fakeClient()
    const hits = await createSupabaseNotes(client, ownerId).search([0.1, 0.2], 5, 0.4)

    expect(calls.rpc).toEqual([
      'match_notes',
      { query_embedding: [0.1, 0.2], match_count: 5, min_similarity: 0.4 },
    ])
    expect(hits[0]).toEqual({
      id: 'note-1',
      content: '內容',
      createdAt: '2026-09-22T00:00:00Z',
      similarity: 0.87,
    })
  })

  it('列表依 created_at 由新到舊並套用筆數上限', async () => {
    const { client, calls } = fakeClient()
    await createSupabaseNotes(client, ownerId).list(20)

    expect(calls.order).toEqual(['created_at', { ascending: false }])
    expect(calls.limit).toBe(20)
  })

  it('資料庫回錯誤時轉成 StoreError', async () => {
    const { client } = fakeClient({ rpcResult: { data: null, error: { message: 'boom' } } })
    await expect(createSupabaseNotes(client, ownerId).search([0.1], 5, 0)).rejects.toBeInstanceOf(
      StoreError,
    )
  })
})
