import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Note, SearchHit } from '../types'

/**
 * 筆記的存取層。
 * 正式環境走 Supabase（RLS 負責只讓使用者看到自己的資料）；
 * 沒設定 Supabase 時退回記憶體版，讓本機零設定就能跑。
 */
export interface NewNote {
  content: string
  embedding: number[]
}

export interface NotesStore {
  create(content: string, embedding: number[]): Promise<Note>
  /** 一次寫入多則：匯入時可以把 embedding 併成一個 Voyage 請求，省下大量 rate limit */
  createMany(items: NewNote[]): Promise<Note[]>
  search(embedding: number[], limit: number, minSimilarity: number): Promise<SearchHit[]>
  /** tag 有值時只列出帶該標籤的筆記 */
  list(limit: number, tag?: string): Promise<Note[]>
  /** 刪除自己的一則筆記；找不到（或不是自己的）回 false */
  remove(id: string): Promise<boolean>
  /** 還沒有標籤的筆記，供補標籤用 */
  listUntagged(limit: number): Promise<Note[]>
  /** 寫入標籤 */
  setTags(id: string, tags: string[]): Promise<void>
  /** 目前用過的所有標籤與各自的筆記數，由多到少 */
  tagCounts(): Promise<{ tag: string; count: number }[]>
}

export class StoreError extends Error {}

/** PostgREST 的錯誤把 code／details／hint 一起帶出來，否則只看 message 常常不知道問題在哪。 */
function storeError(error: { message: string; code?: string; details?: string; hint?: string }): StoreError {
  const parts = [error.message]
  if (error.code) parts.push(`code=${error.code}`)
  if (error.details) parts.push(error.details)
  if (error.hint) parts.push(error.hint)
  return new StoreError(parts.join(' | '))
}

/** Supabase：insert／select 靠 RLS 綁 owner，搜尋走 match_notes function。 */
export function createSupabaseNotes(client: SupabaseClient, ownerId: string): NotesStore {
  return {
    async create(content, embedding) {
      const { data, error } = await client
        .from('notes')
        .insert({ owner_id: ownerId, content, embedding })
        .select(NOTE_COLUMNS)
        .single()

      if (error) throw storeError(error)
      return toNote(data)
    },

    async createMany(items) {
      if (items.length === 0) return []

      const { data, error } = await client
        .from('notes')
        .insert(items.map((item) => ({ owner_id: ownerId, content: item.content, embedding: item.embedding })))
        .select(NOTE_COLUMNS)

      if (error) throw storeError(error)
      return ((data ?? []) as RawNote[]).map(toNote)
    },

    async search(embedding, limit, minSimilarity) {
      const { data, error } = await client.rpc('match_notes', {
        query_embedding: embedding,
        match_count: limit,
        min_similarity: minSimilarity,
      })

      if (error) throw storeError(error)
      return ((data ?? []) as RawHit[]).map((row) => ({ ...toNote(row), similarity: row.similarity }))
    },

    async list(limit, tag) {
      let query = client
        .from('notes')
        .select(NOTE_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (tag) query = query.contains('tags', [tag])

      const { data, error } = await query
      if (error) throw storeError(error)
      return ((data ?? []) as RawNote[]).map(toNote)
    },

    async listUntagged(limit) {
      const { data, error } = await client
        .from('notes')
        .select(NOTE_COLUMNS)
        .eq('tags', '{}')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw storeError(error)
      return ((data ?? []) as RawNote[]).map(toNote)
    },

    async setTags(id, tags) {
      const { error } = await client.from('notes').update({ tags }).eq('id', id)
      if (error) throw storeError(error)
    },

    async tagCounts() {
      // 標籤量不大，直接抓回來在應用層統計即可
      const { data, error } = await client.from('notes').select('tags').limit(1000)
      if (error) throw storeError(error)

      const counts = new Map<string, number>()
      for (const row of (data ?? []) as { tags: string[] | null }[]) {
        for (const tag of row.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
      return [...counts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-Hant'))
    },

    async remove(id) {
      // RLS 已經限定只能刪自己的；select 回傳空陣列即代表沒有這一筆
      const { data, error } = await client.from('notes').delete().eq('id', id).select('id')

      if (error) throw storeError(error)
      return (data ?? []).length > 0
    },
  }
}

const NOTE_COLUMNS = 'id, content, created_at, tags'

interface RawNote {
  id: string
  content: string
  created_at: string
  tags: string[] | null
}

interface RawHit extends RawNote {
  similarity: number
}

function toNote(row: RawNote): Note {
  return { id: row.id, content: row.content, createdAt: row.created_at, tags: row.tags ?? [] }
}

// ── 本機模式 ────────────────────────────────────────────────
// 存在行程記憶體，重啟就消失；只有在沒設定 Supabase 時才會用到。
interface LocalRecord {
  ownerId: string
  note: Note
  embedding: number[]
  /** 同一毫秒建立的筆記靠這個決定先後 */
  seq: number
}

const localRecords: LocalRecord[] = []
let localSeq = 0

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function createLocalNotes(ownerId: string): NotesStore {
  const mine = () => localRecords.filter((record) => record.ownerId === ownerId)

  return {
    async create(content, embedding) {
      const note: Note = {
        id: crypto.randomUUID(),
        content,
        createdAt: new Date().toISOString(),
        tags: [],
      }
      localSeq += 1
      localRecords.push({ ownerId, note, embedding, seq: localSeq })
      return note
    },

    async createMany(items) {
      const created: Note[] = []
      for (const item of items) created.push(await this.create(item.content, item.embedding))
      return created
    },

    async search(embedding, limit, minSimilarity) {
      return mine()
        .map((record) => ({ ...record.note, similarity: cosine(embedding, record.embedding) }))
        .filter((hit) => hit.similarity >= minSimilarity)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
    },

    async list(limit, tag) {
      return mine()
        .filter((record) => !tag || record.note.tags.includes(tag))
        .sort(newestFirst)
        .slice(0, limit)
        .map((record) => record.note)
    },

    async listUntagged(limit) {
      return mine()
        .filter((record) => record.note.tags.length === 0)
        .sort(newestFirst)
        .slice(0, limit)
        .map((record) => record.note)
    },

    async setTags(id, tags) {
      const record = localRecords.find(
        (item) => item.ownerId === ownerId && item.note.id === id,
      )
      if (record) record.note = { ...record.note, tags }
    },

    async tagCounts() {
      const counts = new Map<string, number>()
      for (const record of mine()) {
        for (const tag of record.note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
      return [...counts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-Hant'))
    },

    async remove(id) {
      const index = localRecords.findIndex(
        (record) => record.ownerId === ownerId && record.note.id === id,
      )
      if (index === -1) return false
      localRecords.splice(index, 1)
      return true
    },
  }
}

/** 測試用：清掉記憶體模式的資料。 */
function newestFirst(a: LocalRecord, b: LocalRecord): number {
  return b.note.createdAt.localeCompare(a.note.createdAt) || b.seq - a.seq
}

export function resetLocalNotes() {
  localRecords.length = 0
  localSeq = 0
}
