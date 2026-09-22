import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL, MAX_TAGS_PER_NOTE } from './config'

export class TaggingError extends Error {}

/**
 * 結構化輸出：一次標多則，用 index 對回原本的順序。
 * 讓模型自己回 index 比依賴陣列順序可靠。
 */
const TaggedNotesSchema = z.object({
  notes: z.array(
    z.object({
      index: z.number().int(),
      tags: z.array(z.string()),
    }),
  ),
})

const SYSTEM_PROMPT = `你是一個筆記整理助手。使用者會給你數則隨手記下的筆記，請替每一則標上標籤。

規則：
- 每則 1 到 ${MAX_TAGS_PER_NOTE} 個標籤，寧少勿多；真的很短或沒有主題的筆記可以只給 1 個。
- 標籤用繁體中文，2 到 6 個字，不加 # 或標點符號。
- 標籤是為了「之後瀏覽時能分堆」，所以要用可以重複套用在多則筆記上的詞
  （例如「租屋」「理財」「健康」「開發筆記」），不要用只適用於這一則的細節
  （例如「房東調漲兩千」）。
- 使用者已經在用的標籤會列在下方。意思相近時「一定」要沿用既有標籤，不要自己造新的近義詞
  （已有「理財」就不要再造「財務」「金錢管理」）。真的沒有合適的才新增。
- 每則都要回，用 index 對應輸入的編號。`

function client(): Anthropic {
  if (!ANTHROPIC_API_KEY) throw new TaggingError('未設定 ANTHROPIC_API_KEY')
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY })
}

function buildPrompt(contents: string[], vocabulary: string[]): string {
  const notes = contents.map((content, index) => `[${index}] ${content}`).join('\n\n')
  const existing = vocabulary.length > 0 ? vocabulary.join('、') : '（目前還沒有任何標籤）'
  return `使用者已經在用的標籤：${existing}\n\n筆記：\n\n${notes}`
}

/** 整理模型回傳的標籤：去空白、去重、限制數量與長度 */
function cleanTags(tags: string[]): string[] {
  const seen = new Set<string>()
  for (const raw of tags) {
    const tag = raw.trim().replace(/^#+/, '').trim()
    if (!tag || tag.length > 12) continue
    seen.add(tag)
    if (seen.size >= MAX_TAGS_PER_NOTE) break
  }
  return [...seen]
}

/**
 * 替多則筆記產生標籤，回傳與輸入同順序的陣列。
 * vocabulary 是使用者現有的標籤，用來避免同義詞爆炸。
 */
export async function suggestTags(
  contents: string[],
  vocabulary: string[] = [],
): Promise<string[][]> {
  if (contents.length === 0) return []

  const response = await client().messages.parse({
    model: ANTHROPIC_MODEL,
    max_tokens: 4000,
    // 標籤屬於分類任務，低 effort 就夠，也讓背景標籤不會拖太久
    output_config: { effort: 'low', format: zodOutputFormat(TaggedNotesSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildPrompt(contents, vocabulary) }],
  })

  if (response.stop_reason === 'refusal') {
    throw new TaggingError('模型拒絕處理這批筆記')
  }

  const parsed = response.parsed_output
  if (!parsed) throw new TaggingError('模型沒有回傳可解析的標籤')

  const byIndex = new Map(parsed.notes.map((note) => [note.index, note.tags]))
  return contents.map((_, index) => cleanTags(byIndex.get(index) ?? []))
}
