import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * 只驗證我們自己的邏輯（prompt 組裝、清理、依 index 對回）；
 * Anthropic SDK 本身用 mock 取代，測試不會真的打 API。
 */
const parse = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { parse }
  },
}))
vi.mock('./config', () => ({
  ANTHROPIC_API_KEY: 'test-key',
  ANTHROPIC_MODEL: 'claude-opus-5',
  MAX_TAGS_PER_NOTE: 3,
  MAX_TAG_BATCH: 30,
  taggingEnabled: true,
}))

const { suggestTags, TaggingError } = await import('./tagging')

afterEach(() => parse.mockReset())

function reply(notes: { index: number; tags: string[] }[], extra: Record<string, unknown> = {}) {
  parse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: { notes }, ...extra })
}

describe('自動標籤', () => {
  it('依 index 對回原本的順序，而不是依回傳順序', async () => {
    reply([
      { index: 1, tags: ['理財'] },
      { index: 0, tags: ['租屋'] },
    ])

    expect(await suggestTags(['房東要漲租金', '緊急預備金'])).toEqual([['租屋'], ['理財']])
  })

  it('把現有標籤放進 prompt，避免造出同義詞', async () => {
    reply([{ index: 0, tags: ['理財'] }])
    await suggestTags(['存錢的筆記'], ['理財', '健康'])

    const request = parse.mock.calls[0][0]
    expect(request.model).toBe('claude-opus-5')
    expect(request.system).toContain('一定')
    expect(request.messages[0].content).toContain('理財、健康')
    expect(request.messages[0].content).toContain('[0] 存錢的筆記')
  })

  it('沒有任何標籤時也講得通', async () => {
    reply([{ index: 0, tags: ['理財'] }])
    await suggestTags(['第一則筆記'])
    expect(parse.mock.calls[0][0].messages[0].content).toContain('目前還沒有任何標籤')
  })

  it('清掉井字號與空白、去重，並限制數量', async () => {
    reply([{ index: 0, tags: ['#理財', ' 理財 ', '租屋', '健康', '第四個'] }])
    expect(await suggestTags(['內容'])).toEqual([['理財', '租屋', '健康']])
  })

  it('丟掉過長的標籤', async () => {
    reply([{ index: 0, tags: ['這是一個非常冗長不適合當標籤的句子', '理財'] }])
    expect(await suggestTags(['內容'])).toEqual([['理財']])
  })

  it('模型漏掉某一則時給空陣列，不會錯位', async () => {
    reply([{ index: 0, tags: ['理財'] }])
    expect(await suggestTags(['第一則', '第二則'])).toEqual([['理財'], []])
  })

  it('沒有筆記時不打 API', async () => {
    expect(await suggestTags([])).toEqual([])
    expect(parse).not.toHaveBeenCalled()
  })

  it('模型拒絕或無法解析時拋出 TaggingError', async () => {
    parse.mockResolvedValue({ stop_reason: 'refusal', parsed_output: null })
    await expect(suggestTags(['內容'])).rejects.toBeInstanceOf(TaggingError)

    parse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: null })
    await expect(suggestTags(['內容'])).rejects.toBeInstanceOf(TaggingError)
  })
})
