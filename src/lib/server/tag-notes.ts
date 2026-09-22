import 'server-only'
import { MAX_TAG_BATCH, taggingEnabled } from './config'
import type { NotesStore } from './notes'
import { suggestTags } from './tagging'
import type { Note } from '../types'

/**
 * 替一批筆記產生標籤並寫回。
 * 回傳實際標到的則數；沒設定 ANTHROPIC_API_KEY 時直接跳過。
 */
export async function tagNotes(store: NotesStore, notes: Note[]): Promise<number> {
  if (!taggingEnabled || notes.length === 0) return 0

  const batch = notes.slice(0, MAX_TAG_BATCH)
  const vocabulary = (await store.tagCounts()).map((entry) => entry.tag)
  const tagsPerNote = await suggestTags(
    batch.map((note) => note.content),
    vocabulary,
  )

  let tagged = 0
  await Promise.all(
    batch.map(async (note, index) => {
      const tags = tagsPerNote[index]
      if (!tags || tags.length === 0) return
      await store.setTags(note.id, tags)
      tagged += 1
    }),
  )
  return tagged
}

/**
 * 給 after() 用的版本：標籤失敗不能影響已經成功的記錄，
 * 所以這裡把錯誤吞掉只留 log。
 */
export async function tagInBackground(store: NotesStore, notes: Note[]): Promise<void> {
  try {
    await tagNotes(store, notes)
  } catch (error) {
    console.error('背景標籤失敗', error)
  }
}
