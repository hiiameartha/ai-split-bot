/**
 * MoodPay - 聊天室記帳截圖解析
 * 正數 = 對方幫「我」付；負數 = 「我」幫對方付
 */

const OpenAI = require("openai");
const { resolveCategory, resolveTags } = require("./category");
const { convertToTWD } = require("./exchange");
const {
  getImportConfig,
  applySignConvention,
  parseDateLabel,
} = require("./chatImageRules");

const MODEL = "gpt-4o-mini";

function getOpenAI() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * @param {Readable} stream
 * @returns {Promise<Buffer>}
 */
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

/**
 * 從 LINE 下載圖片並轉 base64
 * @param {import('@line/bot-sdk').messagingApi.MessagingApiBlobClient} blobClient
 * @param {string} messageId
 */
async function downloadLineImage(blobClient, messageId) {
  const stream = await blobClient.getMessageContent(messageId);
  const buffer = await streamToBuffer(stream);
  const mime = buffer[0] === 0xff && buffer[1] === 0xd8 ? "image/jpeg" : "image/png";
  return { buffer, mime };
}

/**
 * Vision 解析聊天截圖
 * @param {Buffer} buffer
 * @param {string} mime
 */
async function parseChatScreenshot(buffer, mime) {
  const base64 = buffer.toString("base64");
  const cfg = getImportConfig();

  const response = await getOpenAI().chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `你是記帳截圖 OCR 助手。從 LINE 聊天記帳截圖擷取每一筆「金額 + 說明」。
回傳 JSON：
{
  "currency": "MYR|TWD|USD|...",
  "entries": [
    {
      "rawAmount": 數字（保留正負號，如 14、-500、13.7）,
      "item": "項目描述",
      "dateLabel": "3/4 或 3/4(週四) 等區段日期，無則空字串"
    }
  ]
}
規則：
1. 略過日期標題列本身，只擷取右側白底氣泡內的帳目
2. 金額可能在描述前，支援小數
3. 負號表示支出方向相反（我付給對方）
4. 盡量擷取所有可見筆數，不要遺漏
5. currency 依情境推斷（grab/kopitiam/雞飯等多為 MYR）`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "請擷取此聊天記帳截圖中所有帳目，輸出 JSON。",
          },
          {
            type: "image_url",
            image_url: { url: `data:${mime};base64,${base64}` },
          },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("無法辨識截圖內容");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("截圖解析格式錯誤");
  }

  if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    throw new Error("截圖中找不到帳目，請確認圖片清晰");
  }

  return {
    currency: (parsed.currency || cfg.currency).toUpperCase(),
    entries: parsed.entries,
  };
}

/**
 * 將 Vision 結果轉為可寫入 Sheet 的交易
 * @param {{ currency: string, entries: object[] }} parsed
 */
async function buildTransactionsFromScreenshot(parsed) {
  const cfg = getImportConfig();
  const currency = parsed.currency || cfg.currency;
  const transactions = [];
  let lastDateLabel = "";

  for (const entry of parsed.entries) {
    const rawAmount = Number(entry.rawAmount);
    if (!rawAmount || isNaN(rawAmount)) continue;

    const sign = applySignConvention(rawAmount, cfg);
    if (!sign) continue;

    if (entry.dateLabel) {
      lastDateLabel = entry.dateLabel;
    }

    const item = String(entry.item || "未命名").trim();
    const rawText = `${rawAmount} ${item}`;
    const tagCtx = {
      item,
      rawText,
      relation: sign.relation,
      currency,
    };
    const tags = resolveTags(entry.tags || [], tagCtx);
    const category = resolveCategory(entry.category, item, rawText, tags);
    const twdAmount = await convertToTWD(sign.amount, currency);

    transactions.push({
      date: parseDateLabel(lastDateLabel, cfg.year),
      payer: sign.payer,
      consumer: sign.consumer,
      item,
      amount: sign.amount,
      currency,
      twdAmount,
      relation: sign.relation,
      category,
      tags,
      rawText: `[截圖] ${rawText}`,
      sharedWith: [],
    });
  }

  if (transactions.length === 0) {
    throw new Error("沒有有效的帳目可匯入");
  }

  return { transactions, cfg };
}

/**
 * @param {import('@line/bot-sdk').messagingApi.MessagingApiBlobClient} blobClient
 * @param {string} messageId
 */
async function analyzeChatImage(blobClient, messageId) {
  console.log("[ChatImage] 下載圖片:", messageId);
  const { buffer, mime } = await downloadLineImage(blobClient, messageId);
  const parsed = await parseChatScreenshot(buffer, mime);
  console.log("[ChatImage] 擷取", parsed.entries.length, "筆原始帳目");
  return buildTransactionsFromScreenshot(parsed);
}

module.exports = {
  analyzeChatImage,
  getImportConfig,
};
