# 各類扣繳彙總列表

`/withholding/other` 由「平鋪單筆明細」改為三層結構的前端實作（Next.js App Router）：

```
L1  /withholding/other                                    彙總列表（同一所得人同一類別一列）
     ↓ 點列
L2  /withholding/other/group/[incomeType]/[groupKey]      群組內逐期明細
     ↓ 點列
L3  /withholding/other/record/[uuid]                      單筆詳細
```

## 開發

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 分群／彙總規則的測試
npm run build
```

未設定後端位址時，前端會打專案內建的 mock route handler（路徑與規格完全一致），
因此不需要後端就能跑完整流程。

## 切換到真實後端

```bash
# .env.local
WITHHOLDING_API_BASE_URL=https://your-api-host
```

`src/lib/apiClient.ts` 只在解析 base url 時看這個變數，其餘程式碼不需更動。
端點與欄位命名對齊規格：

| 層 | 端點 | 對應程式 |
|---|---|---|
| L1 | `POST /ael/withholding/summary/filter` | `src/lib/withholding.ts` → `fetchSummaryList` |
| L2 | `POST /ael/withholding/summary/group/filter` | → `fetchGroupDetails` |
| L3 | `GET /ael/withholding/detail` | → `fetchWithholdingDetail` |

## 程式結構

| 路徑 | 用途 |
|---|---|
| `src/types/withholding.ts` | 與規格一字不差的請求／回應型別 |
| `src/lib/withholding.ts` | 三支端點的呼叫入口 |
| `src/lib/apiClient.ts` | base url 解析、錯誤訊息轉換（失敗時顯示訊息，不白屏） |
| `src/lib/searchParams.ts` | 網址參數 ↔ 查詢條件；L1／L2 的排序與頁碼分開 |
| `src/mock/aggregate.ts` | 分群與彙總規則的可執行參照（後端可照此核對） |
| `src/mock/records.ts` | 涵蓋租金多房東、無身分證舊資料、無健保類別等情境的假資料 |
| `src/app/api/ael/...` | mock route handler，路徑與規格相同 |
| `src/components/` | 篩選列、條件標籤、統計列、排序表頭、分頁 |

## 介面設計原則

畫面刻意維持「一排控制項」：

- 主篩選列固定四項（年度、月份、類別、姓名），金額區間與繳納狀態收在「更多篩選」。
- 已套用的條件以可單獨移除的標籤呈現，不在主列上堆按鈕。
- 統計只留四個關鍵數字，不加框、不上色；年度總額放在同一列右側的次要位置。
- 表格只保留判讀需要的欄位；二代健保在 L1 收進統計，進 L2 才逐筆呈現。
- 顏色只有一個強調色，紅色僅用於「未繳納」；已繳納以灰字呈現，不搶視覺。
- 進下一層時以 `ret` 參數帶著上一層的完整網址，返回時條件、排序、頁碼都不會遺失。

## 與後端的待確認項

- 所得類別的顯示名稱（`src/constants/incomeTypes.ts`）目前依代號暫定，請以後端字典為準。
- L2 目前只沿用年／月這層範圍條件，金額區間與繳納狀態不從 L1 繼承（避免進入群組後看到被截斷的明細）；
  端點本身仍支援這些參數。
- `groupKey` 由前端原樣傳回，不做任何解析；後端可自由更換代理鍵實作。
