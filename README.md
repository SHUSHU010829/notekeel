# 隨手記 notekeel

快速記下任何想法，之後用**意思相近**的說法就能找回來 —— 不需要記得當初的用詞。

```
瀏覽器（Next.js）  ──►  Go API  ──►  Voyage AI  （文字 → 向量）
                          │
                          └─────►  PostgreSQL + pgvector  （原文 + 向量 + 時間）
```

搜尋時把查詢字串轉成向量，用 pgvector 的 cosine distance 取最相近的幾則。

## 專案結構

```
api/   Go API：三支端點、Voyage 串接、pgvector 儲存層
web/   Next.js 前端：記錄頁與搜尋頁
```

## 快速開始（不需要資料庫與金鑰）

```bash
cd api && go run ./cmd/server      # http://localhost:8080
cd web && npm install && npm run dev   # http://localhost:3000
```

沒有設定 `DATABASE_URL` 時用記憶體儲存、沒有 `VOYAGE_API_KEY` 時用本機假 embedder，
整條流程（記錄 → 搜尋 → 顯示相似度）可以直接跑起來試。
兩者都會在啟動日誌印出警告 —— **假 embedder 只比對字面，沒有語意能力**，正式使用一定要設金鑰。

## 接上真正的資料庫與 Voyage

```bash
cd api && cp .env.example .env     # 填入 DATABASE_URL 與 VOYAGE_API_KEY
export $(grep -v '^#' .env | xargs) && go run ./cmd/server
```

啟動時會自動套用 `internal/store/migrations/`（皆為 `IF NOT EXISTS`，可重複執行），
不需要另外手動建表。Supabase 只要在 SQL Editor 先 `create extension vector;` 即可。

| 變數 | 預設 | 說明 |
| --- | --- | --- |
| `DATABASE_URL` | 空（記憶體） | Supabase／任何啟用 pgvector 的 PostgreSQL |
| `VOYAGE_API_KEY` | 空（假 embedder） | Voyage AI 金鑰 |
| `VOYAGE_MODEL` | `voyage-4-lite` | embedding 模型 |
| `EMBEDDING_DIMENSIONS` | `512` | 需與 `notes.embedding` 的維度一致 |
| `SEARCH_MIN_SIMILARITY` | `0`（不過濾） | 相似度下限，接上真實向量後建議 0.4–0.6 |
| `CORS_ALLOWED_ORIGINS` | `*` | 正式環境請填前端網址 |
| `PORT` | `8080` | |

前端只需要 `NEXT_PUBLIC_API_BASE_URL`（預設 `http://localhost:8080`）。

## API

| Method | Path | 說明 |
| --- | --- | --- |
| `POST` | `/api/notes` | 新增筆記：`{"content": "..."}` → 回傳 `{id, content, createdAt}` |
| `GET` | `/api/notes/search?q=...&limit=8` | 語意搜尋，回傳 `{query, results:[{…, similarity}]}` |
| `GET` | `/api/notes?limit=50&offset=0` | 依時間新到舊列出 |
| `GET` | `/healthz` | 健康檢查 |

`similarity` 是 0–1 的 cosine 相似度（1 最接近）。錯誤一律回 `{"error": "可直接顯示的訊息"}`。

## 測試

```bash
cd api && go test ./...
```

`internal/store` 的測試用同一組合約同時驗證記憶體版與 pgvector 版；
後者需要資料庫，未設定 `TEST_DATABASE_URL` 時會自動略過：

```bash
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/notekeel_test go test ./internal/store/
```

## 部署

- **前端 → Vercel**：Root Directory 設為 `web/`，環境變數填 `NEXT_PUBLIC_API_BASE_URL`。
- **API → Fly.io**：`api/fly.toml` 已備妥。

  ```bash
  cd api
  fly launch --no-deploy --copy-config
  fly secrets set VOYAGE_API_KEY=... DATABASE_URL=...
  fly deploy
  ```

  記得把 `CORS_ALLOWED_ORIGINS` 改成實際的 Vercel 網址。
- **資料庫 → Supabase**：免費方案即可，連線字串記得加 `?sslmode=require`。

## 與原開發計畫的差異

- **索引用 HNSW 而不是 ivfflat**：ivfflat 需要先有足夠資料才能訓練分群，空表建起來初期召回不穩；
  HNSW 從第一筆就能用，個人筆記的資料量用它更合適。
- **多了兩個本機 fallback**（記憶體儲存、假 embedder）：讓「還沒申請金鑰、還沒開 Supabase」也能開發，
  兩者都只在對應環境變數未設定時啟用。
- **多了 `SEARCH_MIN_SIMILARITY`**：只取 Top-K 會讓完全不相關的筆記也被列出來，加個下限比較實用。

## 之後可以再加

自動標籤／摘要、瀏覽器擴充或分享目標、Discord/LINE Bot 記錄入口、時間軸瀏覽。
多裝置同步不需要額外開發 —— 資料已經在雲端資料庫，手機與電腦開同一個網址就是同一份筆記。
