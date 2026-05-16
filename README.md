# MoodPay 💸

LINE AI 多人記帳與分帳系統。透過自然語言即時記帳，自動匯率轉換、Google Sheet 儲存、分帳計算與幽默 AI 回覆。

## 功能特色

- 🤖 **AI 自然語言解析** — 繁體中文記帳，自動辨識付款人、金額、貨幣、分帳關係
- 👥 **多人記帳** — 支援代墊、分攤、多人欠款統計
- 🌏 **多貨幣** — TWD、MYR、USD、JPY、KRW，自動轉換台幣
- 📊 **Google Sheet** — 所有交易持久化儲存
- 💬 **幽默 AI 回覆** — 記帳確認訊息俏皮可愛
- 📈 **圖表 Dashboard** — QuickChart 圓餅／折線／長條圖，LINE 直接看圖
- 📌 **LINE 指令** — 記帳、分帳、圖表、截圖匯入

## 專案結構

```
moodpay-bot/
├── index.js                 # 主程式（Express + LINE Webhook）
├── package.json
├── .env.example
├── .gitignore
├── README.md
├── services/
│   ├── ai.js                # OpenAI 記帳解析
│   ├── charts.js            # QuickChart 圖表 URL
│   ├── chartSummary.js      # 圖表配套產品文案
│   ├── chatImage.js         # 聊天截圖 Vision 解析
│   ├── category.js          # 固定 category / tags
│   ├── exchange.js          # 匯率轉換
│   ├── googleSheet.js       # Google Sheets 讀寫
│   ├── settlement.js        # 分帳計算
│   └── reply.js             # 幽默回覆
├── utils/
│   ├── chartTheme.js        # 圖表主題色（dark fintech）
│   ├── date.js              # YYYYMMDD 日期
│   └── formatter.js         # 訊息格式化
└── credentials/
    └── credentials.json.example
```

## 安裝方式

### 1. 複製專案

```bash
git clone <your-repo-url>
cd moodpay-bot
```

### 2. 安裝依賴

```bash
npm install
```

### 3. 設定環境變數

```bash
cp .env.example .env
```

編輯 `.env`，填入以下變數：

```env
LINE_CHANNEL_ACCESS_TOKEN=你的_LINE_Channel_Access_Token
LINE_CHANNEL_SECRET=你的_LINE_Channel_Secret
OPENAI_API_KEY=你的_OpenAI_API_Key
GOOGLE_SHEET_ID=你的_Google_Sheet_ID
EXCHANGE_API_KEY=你的_ExchangeRate_API_Key
PORT=3000
```

### 4. 設定 Google 憑證

```bash
cp credentials/credentials.json.example credentials/credentials.json
```

將 Google Cloud Service Account 的 JSON 金鑰貼到 `credentials/credentials.json`。

## Google Sheet 設定

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立專案 → 啟用 **Google Sheets API**
3. 建立 **Service Account**，下載 JSON 金鑰至 `credentials/credentials.json`
4. 建立一個新的 Google 試算表
5. 將 Service Account 的 email（如 `xxx@xxx.iam.gserviceaccount.com`）加入試算表的**編輯者**
6. 從試算表網址取得 Sheet ID：
   ```
   https://docs.google.com/spreadsheets/d/【這段就是_SHEET_ID】/edit
   ```
7. 將 ID 填入 `.env` 的 `GOOGLE_SHEET_ID`

程式首次執行會自動建立 `Transactions` 工作表與標題列：

| 日期 | payer | consumer | item | amount | currency | twdAmount | relation | category | rawText |

## LINE Bot 設定

1. 前往 [LINE Developers Console](https://developers.line.biz/)
2. 建立 Provider → 建立 **Messaging API** Channel
3. 取得 **Channel Secret** 與 **Channel Access Token**（長期）
4. 填入 `.env`
5. 設定 Webhook URL（本地開發用 ngrok，部署用 Render URL）：
   ```
   https://你的網域/webhook
   ```
6. 開啟 **Use webhook**
7. 關閉 **Auto-reply messages**（避免與 Bot 衝突）

## OpenAI API 設定

1. 前往 [OpenAI Platform](https://platform.openai.com/)
2. 建立 API Key
3. 填入 `.env` 的 `OPENAI_API_KEY`
4. 模型使用 `gpt-4o-mini`（記帳解析 + 幽默回覆）

## Exchange API 設定

1. 前往 [ExchangeRate-API](https://www.exchangerate-api.com/)
2. 免費註冊取得 API Key
3. 填入 `.env` 的 `EXCHANGE_API_KEY`

支援貨幣：TWD、MYR、USD、JPY、KRW

## 啟動方式

### 開發模式（自動重啟）

```bash
npm run dev
```

### 正式執行

```bash
npm start
```

## ngrok 本地測試教學

1. 安裝 [ngrok](https://ngrok.com/)
2. 啟動 MoodPay：
   ```bash
   npm run dev
   ```
3. 另開終端機，執行：
   ```bash
   ngrok http 3000
   ```
4. 複製 ngrok 提供的 HTTPS 網址，例如：
   ```
   https://abc123.ngrok-free.app
   ```
5. 在 LINE Developers Console 設定 Webhook：
   ```
   https://abc123.ngrok-free.app/webhook
   ```
6. 點擊 **Verify** 確認連線成功
7. 用手機 LINE 掃描 Channel 的 QR Code 加好友，開始測試

## Render 部署教學

1. 將程式碼推送到 GitHub
2. 前往 [Render](https://render.com/) → **New Web Service**
3. 連接 GitHub repo
4. 設定：
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. 在 **Environment** 加入所有 `.env` 變數
6. Google 憑證處理方式（二選一）：
   - **方式 A**：在 Render 建立 Secret File，路徑設為 `credentials/credentials.json`
   - **方式 B**：將 JSON 內容以環境變數 `GOOGLE_CREDENTIALS_JSON` 傳入（需自行修改程式讀取）
7. 部署完成後，取得 Render 網址，例如：
   ```
   https://moodpay-bot.onrender.com
   ```
8. 在 LINE Console 設定 Webhook：
   ```
   https://moodpay-bot.onrender.com/webhook
   ```

> Render 免費方案會休眠，首次請求可能較慢。

## 指令教學

### 記帳與分帳

| 指令 | 說明 |
|------|------|
| `/debt` | 欠款文字統計（誰欠誰多少） |
| `/summary` | 本月支出分析文案（產品感摘要） |
| `/month` | 本月支出文字摘要 |
| `/undo` | 刪除最後一筆 |
| `/delete` | 刪除符合關鍵字的帳目 |
| `/help` | 顯示使用教學 |

### 圖表 Dashboard（QuickChart）

Bot 會回傳 **文字摘要 + 圖表圖片**（LINE image message），深色 fintech 風格，適合手機閱讀。

| 指令 | 圖表 | 說明 |
|------|------|------|
| `/chart` | Dashboard 橫條圖 | 本月全部分類佔比（含待分類）+ KPI 文案 |
| `/category` | 已分類圓餅圖 | **僅已分類**支出結構（排除 `other`，避免灰牆） |
| `/monthly` | 每日折線圖 | 本月每日支出趨勢（平滑曲線 + 區域填色） |
| `/debtchart` | 欠款長條圖 | 誰欠誰／代墊淨額（綠=應收、紅=應付） |
| `/members` | 成員長條圖 | 本月誰花最多（依消費受益人統計） |

**圖表技術**：使用 [QuickChart](https://quickchart.io/) 產生 Chart.js 圖表 URL，無需自建繪圖伺服器。

**分類（category）** 固定英文，例如：`food`、`drink`、`travel`、`shopping`、`transport` 等，方便 Dashboard 聚合。

### 聊天截圖匯入

| 方式 | 說明 |
|------|------|
| 傳送截圖 | 分析聊天記帳（正數=對方幫你付，負數=你付對方） |
| 回覆 `匯入` | 確認後寫入 Google Sheet |

### 圖表示範

```
/chart
→ 📊 本月支出分析（含 emoji 分類、最大支出王、趣味洞察）
→ [分類圓餅圖圖片]

/monthly
→ 📈 每日支出趨勢 + 高峰日
→ [折線圖圖片]
```

環境變數（截圖匯入，選填）：

```env
CHAT_IMPORT_POSITIVE_PAYER=男友
CHAT_IMPORT_USER=我
CHAT_IMPORT_CURRENCY=MYR
CHAT_IMPORT_YEAR=2025
```

## 記帳範例

直接輸入自然語言即可：

```
我買了80元便當
男友幫我付25馬幣火鍋
小胖幫大家買300元炸雞
我跟男友一起吃1200日幣拉麵
男友代墊韓幣20000住宿
我幫小胖付了500台幣
```

## 分帳邏輯說明

| relation | 說明 | 範例 |
|----------|------|------|
| `self` | 自己消費，無欠款 | 我買了80元便當 |
| `paid_for_me` | 別人幫我付 | 男友幫我付25馬幣火鍋 |
| `i_paid` | 我幫別人付 | 我幫小胖付了500台幣 |
| `shared` | 多人分攤 | 我跟男友一起吃拉麵 |

`/debt` 回傳格式：
- **正數** = 別人欠你
- **負數** = 你欠別人

## 授權

MIT License
