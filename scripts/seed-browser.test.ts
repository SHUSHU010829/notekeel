import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

/**
 * seed-browser.js 是給瀏覽器主控台貼的，內容由 seed-notes.json 產生。
 * 兩份檔案很容易改一邊忘了另一邊，這個測試把它們釘在一起。
 */
describe('範例測資', () => {
  async function inlinedNotes(file: string): Promise<string[]> {
    const source = await readFile(new URL(`./${file}`, import.meta.url), 'utf8')
    return [...source.matchAll(/^ {4}"(.*)",$/gm)].map(([, text]) => JSON.parse(`"${text}"`))
  }

  it.each(['seed-browser.js', 'unseed-browser.js'])(
    '%s 與 seed-notes.json 的內容一致',
    async (file) => {
      const expected: string[] = JSON.parse(
        await readFile(new URL('./seed-notes.json', import.meta.url), 'utf8'),
      )
      expect(await inlinedNotes(file)).toEqual(expected)
    },
  )
})
