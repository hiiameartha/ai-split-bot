# MoodPay 💸 — LINE AI 多人記帳與分帳 Bot

> 用繁體中文自然語言記帳，自動匯率換算、寫入 Google Sheet、計算代墊／欠款，並以 QuickChart 產生圖表與幽默回覆。

---

## 建議的 Notion 頁面結構

在 Notion 建立一個父頁面「MoodPay」，底下可拆成子頁面：

1. **總覽與架構**（本頁前半）
2. **請求與使用者流程**
3. **核心概念**（帳本、角色、分帳）
4. **Google Sheet 與 API 設定**
5. **指令參考**
6. **環境變數**
7. **本機開發與部署**
8. **測試與除錯**

匯入方式：Notion 左側 **⋯ → Import → Markdown & CSV** → 選此檔案。

---

# 一、系統架構

## 技術棧

| 元件 | 技術 |
|------|------|
| HTTP 伺服器 | Express 4 |
| LINE 整合 | `@line/bot-sdk` v9（Webhook + Messaging API） |
| 持久化 | Google Sheets（Service Account） |
| AI | OpenAI `gpt-4o-mini`（記帳 JSON、意圖、幽默句） |
| 圖表 | QuickChart（POST 短網址，避免 LINE 圖片 URL 長度上限） |
| 匯率 | ExchangeRate-API |

## HTTP 端點

| 路徑 | 方法 | 用途 |
|------|------|------|
| `/` | GET | 服務狀態 JSON |
| `/health` | GET | 健康檢查（部署監控用） |
| `/webhook` | POST | LINE 事件入口（需簽章驗證） |

## 架構圖（元件關係）

```
┌─────────────┐     HTTPS POST      ┌──────────────────────────────────┐
│ LINE 使用者 │ ──────────────────► │ MoodPay (Node.js + Express)      │
│ 群組 / 1:1  │ ◄────────────────── │  /webhook → 路由 → 意圖/AI/分帳  │
└─────────────┘     replyMessage    └──────────┬───────────────────────┘
                                               │
         ┌─────────────────────────────────────┼─────────────────────────┐
         ▼                 ▼                   ▼                         ▼
   OpenAI API      Google Sheets API    ExchangeRate-API          QuickChart.io
   (記帳/意圖)       (Transactions)      (多幣→TWD，含快取)         (圖表)
                                               │
                                         Giphy（選填，梗圖）
```

## 程式模組對應

| 模組 | 檔案 | 職責 |
|------|------|------|
| 入口 | `index.js` | Express、Webhook（先回 200）、事件與指令編排 |
| 意圖 | `services/intent.js` | 刪除 / 記帳分流（規則優先，必要時 AI） |
| 記帳 AI | `services/ai.js` | 自然語言 → 結構化 JSON + parseHints |
| 帳務 | `services/ledger.js` | 支出／收入／淨額口徑 |
| 角色 | `services/actor.js` | 「我」、關係人 scope、個人篩選、顯示標籤 |
| Sheet | `services/googleSheet.js` | CRUD、快取、欄位初始化 |
| 匯率 | `services/exchange.js` | 多幣別 → TWD（含匯率快取） |
| 分帳 | `services/settlement.js` | 欠款餘額、分類加總、化簡還款 |
| 圖表 | `services/charts.js` + `chartSummary.js` | QuickChart URL、配套文案 |
| 分類 | `services/category.js` | category / tags 正規化 |
| 回覆 | `services/reply.js` + `meme.js` + `moodVoice.js` | 幽默句、梗圖、品牌語氣 |
| Pending | `utils/pendingKey.js` | 群組刪除選號 key（chatId::userId） |

---

# 二、請求處理流程（後端）

## 主流程（每則 LINE 訊息）

1. LINE 將訊息事件 `POST` 到 `/webhook`；伺服器**立即回 200**，背景處理事件
2. `index.js` 的 `handleEvent` 只處理 `type === "message"`
3. 依訊息類型分支：
   - **非文字**（含圖片）→ 提示目前僅支援文字記帳
   - **文字且以 `/` 開頭** → `handleCommand`（指令表）
   - **一般文字** → `classifyIntent` → 記帳 / 刪除 / 刪除編號
4. 記帳：`parseExpense` → 匯率 `convertToTWD`（快取）→ `resolveActorsForStorage` → `appendTransaction` → `generateFunnyReply`
5. 讀 Sheet 有 TTL 快取；寫入／刪除時失效
6. 以 `replyMessage` 回覆：文字 + 選填圖片（圖表或梗圖）

## 文字訊息分流

```
文字訊息
    │
    ├─ /開頭 ──────────────► handleCommand（/help、/debt、/chart…）
    │
    └─ 一般文字 ──► classifyIntent
                      ├─ delete_pick ─────► 多筆刪除選編號
                      ├─ delete ──────────► 刪除上一筆 / 關鍵字
                      └─ record ──────────► handleExpense（AI 記帳）
```

## 記憶體暫存（重啟會消失）

| Map | Key | TTL | 用途 |
|-----|-----|-----|------|
| `pendingDeletes` | `chatId::userId` | 5 分鐘 | 關鍵字刪除命中多筆時，等「刪除 2」 |

---

# 三、使用者端完整流程

## 流程 A：自然語言記帳

```
使用者：「我跟男友一起吃 1200 日幣拉麵」
    → classifyIntent → record
    → AI 解析（payer、consumer、relation、category、tags…）
    → 匯率換算 twdAmount
    → 角色 scope（男友#userId）
    → 寫入 Google Sheet
    → 幽默回覆（可附梗圖）
```

**範例輸入與 relation**

| 使用者輸入 | 典型 relation |
|------------|----------------|
| 我買了 80 元便當 | `self` |
| 男友幫我付 25 馬幣火鍋 | `paid_for_me` |
| 我幫小胖付了 500 台幣 | `i_paid` |
| 我跟男友一起吃 1200 日幣拉麵 | `shared` |

## 流程 B：刪除交易

```
「刪除上一筆」或「/undo」     → 刪最後一筆
「刪除 火鍋」                 → 關鍵字搜尋
命中多筆                      → 列出清單，等「刪除 2」
```

## 流程 C：查詢與圖表

| 指令 | 使用者得到什麼 | 資料範圍 |
|------|----------------|----------|
| `/debt` | 代墊結算文字 | **個人**代墊 |
| `/debtchart` | 欠款長條圖 | **個人**代墊 |
| `/members` | 成員消費排行 | 整個 chatId 當月 |
| `/summary` `/month` | 本月摘要文案 | 個人（recordedBy） |
| `/chart` | Dashboard 橫條圖 + KPI | 個人 |
| `/category` | 分類圓餅圖 | 個人 |
| `/monthly` | 每日支出折線圖 | 個人 |

圖表失敗時僅回文字並註明略過圖表。

---

# 四、核心概念

## 帳本隔離（chatId）

同一支 Google Sheet 可服務多個 LINE 對話，以 `chatId` 區分：

| LINE 來源 | chatId |
|-----------|--------|
| 群組 | `groupId` |
| 聊天室 | `roomId` |
| 一對一 | `userId` |

舊資料無 `chatId` 時，可設 `LEGACY_CHAT_ID` 指定歸屬帳本。

## 記帳者與角色 scope

- 使用者說的 **「我」** 寫入時換成 **LINE 顯示名稱**
- **關係人**（如男友）存成 `男友#Uxxxxxxxx`（加上記帳者 userId），避免群組裡不同人的「男友」混在一起
- 回覆時改標籤：自己 →「我」；他人的關係人 →「男友（阿明）」
- 每筆有 `recordedBy` / `recordedByName`（誰在 LINE 上操作的）

## 交易關係 relation

| 值 | 語意 | 分帳效果 |
|----|------|----------|
| `self` | 自己付自己用 | 不產生欠款 |
| `paid_for_me` | 別人幫我付 | consumer 欠 payer |
| `i_paid` | 我幫別人付 | consumer 欠 payer |
| `shared` | 多人分攤 | 參與者均分，payer 代墊全額 |

**/debt 餘額**：正數 = 別人欠你；負數 = 你欠別人。顯示時用 `simplifyDebts` 化簡成「誰還給誰」。金額以 **台幣 twdAmount** 計算（記帳當下依 API 換算）。

## 分類與標籤

- **category**：固定英文枚舉（`food`、`travel`、`shopping`…），AI 選取後經 `category.js` 正規化
- **tags**：3～6 個繁體中文語意標籤（地點、品牌、活動），供搜尋與分析

## 意圖分流規則

優先 **規則**，必要時才呼叫 AI：

- `刪除 …`、`/undo` → 刪除
- `刪除 2` → 多筆刪除選號
- 含「刪掉、不要這筆」等模糊語 → AI 分類

金額 ≤ 0 預設拒絕；訊息含「免費、請客、0元」等則允許。

---

# 五、Google Sheet 資料模型

工作表名稱：`Transactions`（不存在時自動建立）

| 欄位 | 說明 |
|------|------|
| `date` | 記帳時間（依 MOODPAY_TIMEZONE） |
| `payer` | 付款人（可能含 #userId scope） |
| `consumer` | 受益人 |
| `item` | 消費項目 |
| `amount` | 原幣金額 |
| `currency` | TWD / MYR / USD / JPY / KRW |
| `twdAmount` | 換算台幣 |
| `relation` | self / paid_for_me / i_paid / shared |
| `category` | 英文分類 |
| `tags` | 標籤（序列化儲存） |
| `rawText` | 使用者原文 |
| `id` | 唯一 ID |
| `chatId` | LINE 帳本 ID |
| `recordedBy` | 記帳者 LINE userId |
| `recordedByName` | 記帳者顯示名稱 |
| `sharedWith` | 分攤參與者（逗號分隔） |

## Google Cloud 設定檢查清單

- [ ] Google Cloud 建立專案，啟用 **Google Sheets API**
- [ ] 建立 **Service Account**，下載 JSON
- [ ] JSON 放到 `credentials/credentials.json`（勿 commit）
- [ ] 試算表將 Service Account email 加為**編輯者**
- [ ] 試算表網址中的 ID 填入 `GOOGLE_SHEET_ID`

憑證載入順序：`GOOGLE_CREDENTIALS_JSON` → `GOOGLE_CREDENTIALS_PATH` → `credentials/credentials.json` → 根目錄 `credentials.json`

---

# 六、指令參考

## 斜線指令

| 指令 | 說明 |
|------|------|
| `/help` | 使用說明 |
| `/debt` | **你的**代墊結算文字 |
| `/summary` | 個人本月支出文案速覽 |
| `/month` | 個人本月簡短摘要 |
| `/chart` | 個人 Dashboard 橫條圖 + KPI |
| `/category` | 個人分類圓餅圖 |
| `/monthly` | 個人每日支出折線圖 |
| `/debtchart` | **你的**代墊長條圖 |
| `/members` | 群組戰力榜（每人自己記的） |
| `/undo` | 刪除**你自己**最後一筆 |
| `/delete [關鍵字]` | 刪除**你自己**符合的項目 |

## 自然語言（非 /）

- **記帳**：直接描述消費
- **刪除**：`刪除上一筆`、`刪除 火鍋`、`刪除 2`

---

# 七、環境變數

複製： `cp .env.example .env`

## 必填

| 變數 | 說明 |
|------|------|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API 長期 Token |
| `LINE_CHANNEL_SECRET` | Channel Secret |
| `OPENAI_API_KEY` | OpenAI API Key |
| `GOOGLE_SHEET_ID` | 試算表 ID |
| `EXCHANGE_API_KEY` | ExchangeRate-API Key |

## 選填

| 變數 | 說明 |
|------|------|
| `PORT` | HTTP port（預設 3000） |
| `MOODPAY_TIMEZONE` | 例 `Asia/Taipei` |
| `LEGACY_CHAT_ID` | 無 chatId 舊列歸屬 |
| `GOOGLE_CREDENTIALS_JSON` | 整份 SA JSON（雲端常用） |
| `GOOGLE_CREDENTIALS_PATH` | 自訂憑證路徑 |
| `GIPHY_API_KEY` | 梗圖（LINE 用 still JPEG） |
| `SHEET_CACHE_TTL_MS` | Sheet 讀取快取 TTL（毫秒，預設 30000） |
| `EXCHANGE_CACHE_TTL_MS` | 匯率快取 TTL（毫秒，預設 3600000） |

---

# 八、從零到上線：完整建置流程

## 階段 1：帳號與金鑰

- [ ] [LINE Developers](https://developers.line.biz/console/) 建立 Channel，取得 Token + Secret
- [ ] [OpenAI](https://platform.openai.com) API Key
- [ ] [ExchangeRate-API](https://www.exchangerate-api.com/) Key
- [ ] Google Cloud Service Account + Sheet ID
- [ ] （選填）[Giphy](https://developers.giphy.com/) API Key

## 階段 2：本機開發

```bash
npm install
cp .env.example .env
# 編輯 .env、放置 credentials/credentials.json
npm run dev
```

## 階段 3：LINE Webhook（本機需隧道）

- [ ] `ngrok http 3000`（或同 PORT）
- [ ] LINE Console → Webhook URL：`https://<ngrok>/webhook`
- [ ] 開啟 **Use webhook**，關閉 **Auto-reply messages**
- [ ] `GET https://<ngrok>/health` 確認存活

> 本機 + ngrok：關電腦或關 ngrok 即斷線；免費網址重開常會變，需更新 LINE Webhook。

## 階段 4：正式部署（24hr）

Bot 必須在**有固定 HTTPS** 的伺服器上執行。

| 方案 | 24hr | 說明 |
|------|------|------|
| Oracle Cloud Always Free VM | ✅ | 常駐；自行裝 Node + HTTPS |
| Render 免費 Web Service | ⚠️ | 閒置約 15 分鐘休眠；可用 UptimeRobot 每 10 分鐘 GET /health |
| 本機 + ngrok | ❌ | 僅開發測試 |

### Render 部署步驟

- [ ] 程式推上 GitHub（勿提交 `.env`、`credentials.json`）
- [ ] [Render](https://dashboard.render.com) → New Web Service → 連 repo
- [ ] Build: `npm install` · Start: `npm start` · Node ≥ 18
- [ ] Environment 填入所有必填變數
- [ ] Google 憑證：Secret File `credentials/credentials.json` 或 `GOOGLE_CREDENTIALS_JSON`
- [ ] LINE Webhook：`https://<服務名>.onrender.com/webhook`
- [ ] （免費）UptimeRobot 監控 `/health`，間隔 5～10 分鐘

**常見錯誤**：`DECODER routines::unsupported` → 私鑰 PEM 壞掉；重新下載 JSON 或檢查 Secret File 是否截斷。

## 相關後台

| 服務 | 網址 |
|------|------|
| LINE | https://developers.line.biz/console/ |
| Render | https://dashboard.render.com |
| OpenAI | https://platform.openai.com |
| Google Cloud | https://console.cloud.google.com |

---

# 九、專案目錄結構

```
ai-split-bot/
├── index.js
├── package.json
├── .env.example
├── credentials/
│   └── credentials.json.example
├── services/
│   ├── ai.js, intent.js, parseHints.js, ledger.js, actor.js
│   ├── googleSheet.js, exchange.js, settlement.js
│   ├── charts.js, chartSummary.js, category.js, tagEnrich.js
│   └── reply.js, meme.js, moodVoice.js
├── utils/
│   ├── chatId.js, pendingKey.js, date.js, formatter.js, chartTheme.js
├── .github/workflows/test.yml
└── scripts/
    ├── run-all-tests.js
    └── test-*.js
```

---

# 十、測試（不需啟動 LINE）

```bash
npm test                 # 全部測試（CI 同款）
npm run test:intent
npm run test:ledger
npm run test:google-sheet
```

---

# 十一、授權

MIT License
