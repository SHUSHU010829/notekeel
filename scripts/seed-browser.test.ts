import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

/**
 * seed-browser.js 是給瀏覽器主控台貼的，內容由 seed-notes.json 產生。
 * 兩份檔案很容易改一邊忘了另一邊，這個測試把它們釘在一起。
 */
describe('範例測資', () => {
  it('瀏覽器版與 seed-notes.json 的內容一致', async () => {
    const [json, browser] = await Promise.all([
      readFile(new URL('./seed-notes.json', import.meta.url), 'utf8'),
      readFile(new URL('./seed-browser.js', import.meta.url), 'utf8'),
    ])

    const expected: string[] = JSON.parse(json)
    const inlined = [...browser.matchAll(/^ {4}"(.*)",$/gm)].map(([, text]) =>
      JSON.parse(`"${text}"`),
    )

    expect(inlined).toEqual(expected)
  })
})
