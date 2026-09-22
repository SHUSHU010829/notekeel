'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  createNote,
  deleteNote,
  listNotes,
  tagUntaggedNotes,
  type Note,
} from '../lib/api'
import { NoteCard } from '../components/NoteCard'

/** 記錄頁：打開就能打字，Cmd/Ctrl + Enter 直接送出。 */
export default function ComposePage() {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null)
  const [recent, setRecent] = useState<Note[]>([])
  const [loadingRecent, setLoadingRecent] = useState(true)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [tagging, setTagging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // 標籤是背景產生的，剛記完那幾秒還不會有；重新抓一次就看得到
  const reload = useCallback(async (tag: string | null) => {
    setLoadingRecent(true)
    try {
      setRecent(await listNotes(tag ? 20 : 5, tag ?? undefined))
    } catch {
      // 讀不到最近筆記不是致命問題，維持原本畫面就好
    } finally {
      setLoadingRecent(false)
    }
  }, [])

  useEffect(() => {
    void reload(activeTag)
  }, [reload, activeTag])

  // 提示訊息自己淡出，不需要使用者關掉
  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => setFlash(null), 2600)
    return () => clearTimeout(timer)
  }, [flash])

  const removeNote = useCallback(async (id: string) => {
    const previous = recent
    setRecent((notes) => notes.filter((note) => note.id !== id)) // 先從畫面移除，失敗再還原
    try {
      await deleteNote(id)
      setFlash({ tone: 'ok', message: '已刪除' })
    } catch (error) {
      setRecent(previous)
      setFlash({
        tone: 'error',
        message: error instanceof ApiError ? error.message : '刪除失敗，請稍後再試。',
      })
    }
  }, [recent])

  const submit = useCallback(async () => {
    const trimmed = content.trim()
    if (!trimmed || saving) return

    setSaving(true)
    try {
      const created = await createNote(trimmed)
      setContent('')
      setRecent((prev) => [created, ...prev].slice(0, activeTag ? 20 : 5))
      setFlash({ tone: 'ok', message: '已記錄' })
      textareaRef.current?.focus()
      // 標籤在伺服器端背景產生，等幾秒再抓一次就會出現
      setTimeout(() => void reload(activeTag), 4000)
    } catch (error) {
      setFlash({
        tone: 'error',
        message: error instanceof ApiError ? error.message : '記錄失敗，請稍後再試。',
      })
    } finally {
      setSaving(false)
    }
  }, [content, saving, activeTag, reload])

  async function tagAll() {
    setTagging(true)
    try {
      const { tagged, remaining } = await tagUntaggedNotes()
      setFlash({
        tone: 'ok',
        message: remaining > 0 ? `標了 ${tagged} 則，還有 ${remaining} 則` : `標了 ${tagged} 則`,
      })
      await reload(activeTag)
    } catch (error) {
      setFlash({
        tone: 'error',
        message: error instanceof ApiError ? error.message : '加標籤失敗，請稍後再試。',
      })
    } finally {
      setTagging(false)
    }
  }

  const untaggedCount = recent.filter((note) => note.tags.length === 0).length

  return (
    <main>
      <div className="composer">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              void submit()
            }
          }}
          placeholder="想到什麼就貼上來⋯⋯"
          aria-label="筆記內容"
        />
        <div className="composer-bar">
          <span className="hint">⌘/Ctrl + Enter 送出</span>
          <button className="btn primary" onClick={() => void submit()} disabled={!content.trim() || saving}>
            {saving ? '記錄中⋯' : '記錄'}
          </button>
        </div>
      </div>

      {flash ? <div className={`flash${flash.tone === 'error' ? ' error' : ''}`}>{flash.message}</div> : null}

      {activeTag ? (
        <div className="tagbar">
          <span className="muted">標籤</span>
          <span className="tag active">{activeTag}</span>
          <button className="linklike" onClick={() => setActiveTag(null)}>
            清除
          </button>
        </div>
      ) : null}

      <div className="section-head">
        <h2 className="section-label">{activeTag ? `「${activeTag}」的筆記` : '最近記錄'}</h2>
        {untaggedCount > 0 ? (
          <button className="linklike" onClick={() => void tagAll()} disabled={tagging}>
            {tagging ? '整理中⋯' : '整理標籤'}
          </button>
        ) : null}
      </div>
      {loadingRecent ? (
        <div className="empty">讀取中⋯</div>
      ) : recent.length === 0 ? (
        <div className="empty">還沒有任何筆記，上面貼一段話就開始了。</div>
      ) : (
        <div className="notes">
          {recent.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onDelete={removeNote}
              onTagClick={setActiveTag}
            />
          ))}
        </div>
      )}
    </main>
  )
}
