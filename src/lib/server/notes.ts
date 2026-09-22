import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Note, SearchHit } from '../types'

/**
 * 筆記的存取層。
 * 正式環境走 Supabase（RLS 負責只讓使用者看到自己的資料）；
 * 沒設定 Supabase 時退回記憶體版，讓本機零設定就能跑。
 */
export interface NotesStore {
  create(content: string, embedding: number[]): Promise<Note>
  search(embedding: number[], limit: number, minSimilarity: number): Promise<SearchHit[]>
  list(limit: number): Promise<Note[]>
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
        .select('id, content, created_at')
        .single()

      if (error) throw storeError(error)
      return toNote(data)
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

    async list(limit) {
      const { data, error } = await client
        .from('notes')
        .select('id, content, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw storeError(error)
      return ((data ?? []) as RawNote[]).map(toNote)
    },
  }
}

interface RawNote {
  id: string
  content: string
  created_at: string
}

interface RawHit extends RawNote {
  similarity: number
}

function toNote(row: RawNote): Note {
  return { id: row.id, content: row.content, createdAt: row.created_at }
}

// ── 本機模式 ────────────────────────────────────────────────
// 存在行程記憶體，重啟就消失；只有在沒設定 Supabase 時才會用到。
interface LocalRecord {
  ownerId: string
  note: Note
  embedding: number[]
}

const localRecords: LocalRecord[] = []

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
      }
      localRecords.push({ ownerId, note, embedding })
      return note
    },

    async search(embedding, limit, minSimilarity) {
      return mine()
        .map((record) => ({ ...record.note, similarity: cosine(embedding, record.embedding) }))
        .filter((hit) => hit.similarity >= minSimilarity)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
    },

    async list(limit) {
      return mine()
        .map((record) => record.note)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
    },
  }
}

/** 測試用：清掉記憶體模式的資料。 */
export function resetLocalNotes() {
  localRecords.length = 0
}
