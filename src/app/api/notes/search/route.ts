import { NextResponse } from 'next/server'
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  RERANK_MIN_SCORE,
  SEARCH_CANDIDATES,
  SEARCH_MIN_SIMILARITY,
  rerankEnabled,
} from '../../../../lib/server/config'
import { embed, rerankWithVoyage } from '../../../../lib/server/embedding'
import { badRequest, clampLimit, errorResponse } from '../../../../lib/server/respond'
import { notesForRequest } from '../../../../lib/server/session'
import type { SearchHit } from '../../../../lib/types'

function parseScore(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === '') return undefined
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0 || value > 1) return undefined
  return value
}

/**
 * GET /api/notes/search?q=... — 用意思相近的說法找回筆記。
 *
 * 兩段式：先用向量從全部筆記粗篩出候選，再用 rerank 模型細排。
 * rerank 失敗（例如撞到 rate limit）時退回向量排序，不讓整個搜尋掛掉。
 */
export async function GET(request: Request) {
  try {
    const notes = await notesForRequest()

    const { searchParams } = new URL(request.url)
    const query = (searchParams.get('q') ?? '').trim()
    if (!query) return badRequest('請輸入搜尋關鍵字')

    const limit = clampLimit(searchParams.get('limit'), DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT)
    // ?min= / ?minRelevance= 可臨時覆寫門檻，用來校準（0 就是完全不過濾）
    const minSimilarity = parseScore(searchParams.get('min')) ?? SEARCH_MIN_SIMILARITY
    const minRelevance = parseScore(searchParams.get('minRelevance')) ?? RERANK_MIN_SCORE
    const wantRerank = rerankEnabled && searchParams.get('rerank') !== 'false'

    const [embedding] = await embed([query], 'query')
    const candidates = await notes.search(
      embedding,
      wantRerank ? Math.max(limit, SEARCH_CANDIDATES) : limit,
      minSimilarity,
    )

    if (!wantRerank || candidates.length <= 1) {
      return NextResponse.json({
        query,
        minSimilarity,
        reranked: false,
        results: candidates.slice(0, limit),
      })
    }

    let results: SearchHit[]
    let reranked = true
    try {
      const ranked = await rerankWithVoyage(
        query,
        candidates.map((hit) => hit.content),
      )
      results = ranked
        .map(({ index, score }) => ({ ...candidates[index], relevance: score }))
        .filter((hit) => hit.relevance >= minRelevance)
        .slice(0, limit)
    } catch (error) {
      // rerank 是加分項，掛掉就用向量的排序，至少還搜得到東西
      console.error('rerank 失敗，退回向量排序', error)
      results = candidates.slice(0, limit)
      reranked = false
    }

    return NextResponse.json({ query, minSimilarity, minRelevance, reranked, results })
  } catch (error) {
    return errorResponse(error)
  }
}
