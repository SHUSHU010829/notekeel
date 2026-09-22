import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // server-only 在測試環境會解析成「不可從 client 匯入」而丟錯，換成空模組
    alias: { 'server-only': new URL('./src/test/server-only.ts', import.meta.url).pathname },
  },
})
