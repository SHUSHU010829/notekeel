# 隨手記 notekeel

快速記下任何想法，之後用**意思相近**的說法就能找回來 —— 不需要記得當初的用詞。

```
瀏覽器 ─► Next.js（頁面 + route handler，整包跑在 Vercel）
              ├─► Voyage AI            文字 → 向量
              └─► Supabase Postgres    原文 + 向量 + 時間（pgvector）
```

帳號與資料庫與 [taskeel](https://github.com/SHUSHU010829/taskeel) 共用：同一個 Supabase
專案、同一組 `auth.users`，用 Google 登入哪一邊都是同一個帳號。

## 快速開始（不需要資料庫與金鑰）

```bash
npm install
npm run dev     # http://localhost:3000
```

沒設定 Supabase 時不需要登入、筆記存在伺服器記憶體；沒設定 Voyage 金鑰時用本機假
embedder。整條流程（記錄 → 搜尋 → 顯示相似度）可以直接跑起來試，但
**假 embedder 只比對字面、沒有語意能力**，正式使用一定要設金鑰。

## 接上 Supabase 與 Voyage

1. **建資料表**：Supabase → SQL Editor 貼上 [`supabase/schema.sql`](supabase/schema.sql) 執行一次。
   它會建立 `notes`（含指向 `auth.users` 的外鍵、RLS 政策、`authenticated` 的表格權限）
   與語意搜尋用的 `match_notes()` function，不會動到 taskeel 既有的任何表。
   整份腳本可重複執行；SQL Editor 是包在一個 transaction 裡跑，中途出錯會整份 rollback。
2. **登入設定**：Supabase → Authentication → URL Configuration，把
   `https://<你的網域>/auth/callback` 加進允許清單。Google provider 沿用 taskeel 既有設定。
3. **環境變數**：`cp .env.example .env.local` 後填入。

| 變數 | 預設 | 說明 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 空（免登入） | 與 taskeel 相同的專案位址 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 空 | 與 taskeel 相同的 publishable key |
| `VOYAGE_API_KEY` | 空（假 embedder） | Voyage AI 金鑰，**伺服器端專用** |
| `VOYAGE_MODEL` | `voyage-4-lite` | embedding 模型 |
| `EMBEDDING_DIMENSIONS` | `512` | 需與 `notes.embedding` 的維度一致 |
| `SEARCH_MIN_SIMILARITY` | `0`（不過濾） | 相似度下限，接上真實向量後建議 0.4–0.6 |

## 部署

推上 GitHub 後在 Vercel 匯入這個 repo，Root Directory 保持預設（repo 根目錄就是
Next.js 專案），把上表的變數填進 Settings → Environment Variables 即可。
不需要另外的後端服務或資料庫託管 —— 資料在 Supabase，運算在 Vercel functions。

## API

前端打的是自己的 route handler（同源），登入狀態靠 cookie 帶過去。

| Method | Path | 說明 |
| --- | --- | --- |
| `POST` | `/api/notes` | 新增筆記：`{"content": "..."}` → `{id, content, createdAt}` |
| `POST` | `/api/notes/bulk` | 一次匯入多則：`{"contents": ["…"]}`（上限 100 則，只用一次 Voyage 請求） |
| `GET` | `/api/notes/search?q=...&limit=8` | 語意搜尋 → `{query, results:[{…, similarity}]}` |
| `GET` | `/api/notes?limit=50` | 依時間新到舊列出 |

`similarity` 是 0–1 的 cosine 相似度（1 最接近）。未登入回 `401`，
錯誤一律回 `{"error": "可直接顯示的訊息", "detail": "底層錯誤"}`。

**Voyage 的 rate limit**：免費方案沒綁付款方式時只有 3 RPM / 10K TPM，
逐則匯入很快就會被限流（回 429）。批次匯入請走 `/api/notes/bulk`，
不論幾則都只會用掉一次請求額度。

## 程式結構

| 路徑 | 用途 |
| --- | --- |
| `src/app/page.tsx` | 記錄頁：自動 focus、⌘/Ctrl+Enter 送出、最近五則 |
| `src/app/search/page.tsx` | 搜尋頁：相似度、時間、長筆記點擊展開 |
| `src/app/api/notes/` | route handler：新增／列表／搜尋 |
| `src/lib/server/embedding.ts` | Voyage 串接（document/query 分開、依 index 歸位、429/5xx 重試）與本機假 embedder |
| `src/lib/server/notes.ts` | 存取層：Supabase（RLS）與本機記憶體兩種實作 |
| `src/lib/server/session.ts` | 取得登入者；未登入丟 401 |
| `src/lib/supabase/` | 瀏覽器／伺服器端的 Supabase client |
| `src/middleware.ts` | 更新 session、擋未登入（`/api` 交給 route handler 自己回 401） |
| `supabase/schema.sql` | 資料表、RLS、`match_notes()` |

## 安全性怎麼保證

每則筆記都有 `owner_id`，RLS 政策與 taskeel 各表同一套寫法：

```sql
create policy "own notes" on notes
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
```

route handler 用的是**使用者自己的 session**（publishable key + cookie），不是 secret key，
所以資料庫層就擋住了跨使用者存取 —— 應用層寫錯也偷不到別人的筆記。
`match_notes()` 宣告為 `security invoker`，搜尋同樣受 RLS 約束。

表格權限只給 `authenticated`（RLS 管「哪些列」，GRANT 管「能不能碰這張表」，兩層都要）；
未登入的 `anon` 角色連 `notes` 都讀不到。

## 範例測資

`scripts/seed-notes.json` 有 26 則範例筆記，用詞刻意與預期的搜尋字不同，方便驗證
語意搜尋（而不是字面比對）：

**已部署到 Vercel、想灌進正式資料庫**（最省事，不需要本機環境）：
登入隨手記網頁 → 開瀏覽器主控台（F12 → Console）→ 貼上
[`scripts/seed-browser.js`](scripts/seed-browser.js) 整段執行。
它打的是同源的 `/api/notes/bulk`，自動帶登入 cookie，向量由伺服器端的 Voyage 產生。
已存在的相同內容會自動略過，重跑不會產生重複資料。

**在本機開發**：

```bash
node scripts/seed.mjs                                  # 灌進本機跑著的 app
VOYAGE_API_KEY=... node scripts/seed.mjs --sql --email you@example.com > seed.sql
```

`--sql` 會用 Voyage 算好向量再輸出 INSERT，貼進 SQL Editor 執行即可；
它強制要金鑰，因為本機假 embedder 產生的向量與線上查詢不在同一個空間，灌進去會搜不準。

（`scripts/seed-browser.js` 由 `seed-notes.json` 產生，有測試確保兩邊一致；要改內容改 JSON 那份。）

灌完可以試試「房東 漲價 → 租金調漲」「腰痛 運動 → 深蹲要練核心」
「向量資料庫 索引 → pgvector HNSW」這類用詞不同的查詢。

## 測試

```bash
npm test
```

涵蓋 Voyage client（input_type、依 index 歸位、重試與不重試的情況）、
兩種存取層（相似度排序、相似度下限、使用者隔離、`match_notes` 參數），
以及 route handler 的驗證與回應格式（含未登入回 401）。

## 與原開發計畫的差異

- **沒有獨立的 Go 後端**：計畫書寫的是 Go API + Fly.io；改成 Next.js route handler 後
  整包跑在 Vercel，少一個部署目標，也不用自己驗 JWT（session 從 cookie 來）與過濾 owner（RLS 負責）。
- **索引用 HNSW 而不是 ivfflat**：ivfflat 需要先有足夠資料才能訓練分群，空表建起來初期召回不穩。
- **與 taskeel 共用 Supabase 專案**：因此有 `owner_id`、RLS 與 Google 登入。
- **多了 `SEARCH_MIN_SIMILARITY`**：只取 Top-K 會讓完全不相關的筆記也被列出來。
- **多了本機 fallback**（記憶體儲存、假 embedder）：還沒申請金鑰、還沒開 Supabase 也能開發。

## 之後可以再加

自動標籤／摘要、瀏覽器擴充或分享目標、Discord/LINE Bot 記錄入口、時間軸瀏覽。
多裝置同步不需要額外開發 —— 資料已經在 Supabase，手機與電腦開同一個網址就是同一份筆記。
