'use client'

import { useState } from 'react'
import type { Note, SearchHit } from '../lib/types'
import { fullTime, relativeTime } from '../lib/time'

interface Props {
  note: Note | SearchHit
  /** 有給才會出現刪除按鈕；由呼叫端負責實際刪除與列表更新 */
  onDelete?: (id: string) => Promise<void> | void
}

/** 預設收合成三行，點一下展開完整內容。 */
export function NoteCard({ note, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const similarity = 'similarity' in note ? note.similarity : undefined
  const relevance = 'relevance' in note ? note.relevance : undefined
  const isLong = note.content.length > 90 || note.content.includes('\n')

  async function remove() {
    if (!onDelete) return
    setDeleting(true)
    try {
      await onDelete(note.id)
    } finally {
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <article className="note">
      <div
        className={isLong ? 'note-body clickable' : 'note-body'}
        onClick={isLong ? () => setExpanded((prev) => !prev) : undefined}
      >
        <p className={`note-text${isLong && !expanded ? ' clamped' : ''}`}>{note.content}</p>
      </div>

      <div className="note-meta">
        <time dateTime={note.createdAt} title={fullTime(note.createdAt)}>
          {relativeTime(note.createdAt)}
        </time>

        {/* rerank 的分數有校準，有的話優先顯示它 */}
        {relevance !== undefined ? (
          <span className="score" title="rerank 模型給的相關度">
            相關度 {Math.round(relevance * 100)}%
          </span>
        ) : similarity !== undefined ? (
          <span className="score" title="向量的 cosine 相似度">
            相似度 {Math.round(similarity * 100)}%
          </span>
        ) : null}

        {isLong ? (
          <button className="linklike" onClick={() => setExpanded((prev) => !prev)}>
            {expanded ? '收合' : '展開'}
          </button>
        ) : null}

        {onDelete ? (
          <span className="note-actions">
            {confirming ? (
              <>
                <span className="muted">確定刪除？</span>
                <button className="linklike danger" onClick={() => void remove()} disabled={deleting}>
                  {deleting ? '刪除中⋯' : '刪除'}
                </button>
                <button className="linklike" onClick={() => setConfirming(false)} disabled={deleting}>
                  取消
                </button>
              </>
            ) : (
              <button
                className="linklike"
                onClick={() => setConfirming(true)}
                aria-label="刪除這則筆記"
                title="刪除"
              >
                ✕
              </button>
            )}
          </span>
        ) : null}
      </div>
    </article>
  )
}
