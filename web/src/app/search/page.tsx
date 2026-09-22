'use client'

import { useState } from 'react'
import { ApiError, searchNotes, type SearchHit } from '../../lib/api'
import { NoteCard } from '../../components/NoteCard'

/** 搜尋頁：用印象中的說法找回筆記，用詞不同也沒關係。 */
export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchHit[] | null>(null)
  const [searchedQuery, setSearchedQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed || searching) return

    setSearching(true)
    setError(null)
    try {
      const hits = await searchNotes(trimmed)
      setResults(hits)
      setSearchedQuery(trimmed)
    } catch (err) {
      setResults(null)
      setError(err instanceof ApiError ? err.message : '搜尋失敗，請稍後再試。')
    } finally {
      setSearching(false)
    }
  }

  return (
    <main>
      <form className="searchbar" onSubmit={submit}>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="用大概的印象搜尋⋯⋯"
          aria-label="搜尋筆記"
          autoFocus
        />
        <button className="btn primary" type="submit" disabled={!query.trim() || searching}>
          {searching ? '搜尋中⋯' : '搜尋'}
        </button>
      </form>

      {error ? <p className="error-text">{error}</p> : null}

      {results === null ? (
        <div className="empty">輸入幾個關鍵字，意思相近的筆記就會出現。</div>
      ) : results.length === 0 ? (
        <div className="empty">找不到與「{searchedQuery}」相近的筆記。</div>
      ) : (
        <>
          <h2 className="section-label">
            與「{searchedQuery}」最相近的 {results.length} 則
          </h2>
          <div className="notes">
            {results.map((hit) => (
              <NoteCard key={hit.id} note={hit} />
            ))}
          </div>
        </>
      )}
    </main>
  )
}
