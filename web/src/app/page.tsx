'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, createNote, listNotes, type Note } from '../lib/api'
import { NoteCard } from '../components/NoteCard'

/** 記錄頁：打開就能打字，Cmd/Ctrl + Enter 直接送出。 */
export default function ComposePage() {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null)
  const [recent, setRecent] = useState<Note[]>([])
  const [loadingRecent, setLoadingRecent] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    let cancelled = false
    listNotes(5)
      .then((notes) => {
        if (!cancelled) setRecent(notes)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingRecent(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 提示訊息自己淡出，不需要使用者關掉
  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => setFlash(null), 2600)
    return () => clearTimeout(timer)
  }, [flash])

  const submit = useCallback(async () => {
    const trimmed = content.trim()
    if (!trimmed || saving) return

    setSaving(true)
    try {
      const created = await createNote(trimmed)
      setContent('')
      setRecent((prev) => [created, ...prev].slice(0, 5))
      setFlash({ tone: 'ok', message: '已記錄' })
      textareaRef.current?.focus()
    } catch (error) {
      setFlash({
        tone: 'error',
        message: error instanceof ApiError ? error.message : '記錄失敗，請稍後再試。',
      })
    } finally {
      setSaving(false)
    }
  }, [content, saving])

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

      <h2 className="section-label">最近記錄</h2>
      {loadingRecent ? (
        <div className="empty">讀取中⋯</div>
      ) : recent.length === 0 ? (
        <div className="empty">還沒有任何筆記，上面貼一段話就開始了。</div>
      ) : (
        <div className="notes">
          {recent.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </main>
  )
}
