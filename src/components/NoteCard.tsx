'use client'

import { useState } from 'react'
import type { Note, SearchHit } from '../lib/api'
import { fullTime, relativeTime } from '../lib/time'

/** 預設收合成三行，點一下展開完整內容。 */
export function NoteCard({ note }: { note: Note | SearchHit }) {
  const [expanded, setExpanded] = useState(false)
  const similarity = 'similarity' in note ? note.similarity : undefined
  const isLong = note.content.length > 90 || note.content.includes('\n')

  return (
    <article
      className={`note${isLong ? ' clickable' : ''}`}
      onClick={isLong ? () => setExpanded((prev) => !prev) : undefined}
    >
      <p className={`note-text${isLong && !expanded ? ' clamped' : ''}`}>{note.content}</p>
      <div className="note-meta">
        <time dateTime={note.createdAt} title={fullTime(note.createdAt)}>
          {relativeTime(note.createdAt)}
        </time>
        {similarity !== undefined ? (
          <span className="score" title="與搜尋字句的相似度">
            相似度 {Math.round(similarity * 100)}%
          </span>
        ) : null}
        {isLong ? <span>{expanded ? '收合' : '展開'}</span> : null}
      </div>
    </article>
  )
}
