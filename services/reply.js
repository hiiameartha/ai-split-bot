/**
 * MoodPay - AI 幽默回覆服務
 * 短句 + 規則梗，可選 Giphy
 */

const OpenAI = require("openai");
const {
  pickRuleMeme,
  pickDeleteMeme,
  searchGiphyUrl,
  giphySearchQuery,
  buildDeleteGiphyQueries,
} = require("./meme");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = "gpt-4o-mini";
const MAX_CHARS = 80;

/**
 * 記帳成功回覆
 * @param {object} data
 * @returns {Promise<{ text: string, imageUrl?: string }>}
 */
async function generateFunnyReply(data) {
  console.log("[Reply] 產生記帳回覆...");

  const line1 = formatRecordLine1(data);
  const ruleMeme = pickRuleMeme(data);
  let line2 = ruleMeme;

  if (!line2) {
    line2 = await generateAiMemeLine(data, "record");
  }

  const text = clampReply(line1, line2);

  let imageUrl = null;
  if (process.env.GIPHY_API_KEY?.trim()) {
    imageUrl = await searchGiphyUrl(giphySearchQuery(data));
  }

  return { text, imageUrl: imageUrl || undefined };
}

/**
 * 刪除成功回覆
 * @param {object} deleted
 * @returns {Promise<{ text: string, imageUrl?: string }>}
 */
async function generateDeleteReply(deleted) {
  const line1 = `已刪除 🗑️ ${deleted.item} ${deleted.amount} ${deleted.currency}`;
  const line2 = pickDeleteMeme(deleted) || (await generateAiMemeLine(deleted, "delete"));
  const text = clampReply(line1, line2);

  let imageUrl = null;
  if (process.env.GIPHY_API_KEY?.trim()) {
    imageUrl = await searchGiphyUrl(buildDeleteGiphyQueries());
  }

  return { text, imageUrl: imageUrl || undefined };
}

/**
 * @param {object} data
 */
function formatRecordLine1(data) {
  const emoji = categoryEmoji(data.category);
  const amt =
    data.currency === "TWD"
      ? `${data.amount}元`
      : `${data.amount} ${data.currency}`;
  return `已記錄 ${emoji} ${data.item} ${amt}`;
}

/**
 * AI 補一句梗（僅在規則未命中時）
 */
async function generateAiMemeLine(data, mode) {
  const item = data.item || "消費";
  const prompt =
    mode === "delete"
      ? `刪除記帳「${item}」。寫一句台灣網路梗/諧音，≤25字，繁中，不要捏造新聞。只回一句。`
      : `記帳「${item}」${data.amount}元。寫一句台灣網路梗/諧音/meme感，≤25字，繁中。只回一句。`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "你是 MoodPay 梗王，只用繁體中文，超短、好笑、像 Threads 留言。",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.85,
      max_tokens: 60,
    });

    const line = response.choices[0]?.message?.content?.trim();
    return line || fallbackMemeLine(data, mode);
  } catch (err) {
    console.warn("[Reply] AI 梗句失敗:", err.message);
    return fallbackMemeLine(data, mode);
  }
}

function fallbackMemeLine(data, mode) {
  if (mode === "delete") return "帳目已刪，錢包假裝沒事 💸";
  return `錢包：又少了 ${data.twdAmount || data.amount} 的靈魂 🫠`;
}

/**
 * 合併兩行並限制總字數
 */
function clampReply(line1, line2) {
  if (!line2) return truncate(line1, MAX_CHARS);
  const combined = `${line1}\n${line2}`;
  if (combined.length <= MAX_CHARS) return combined;
  const budget = MAX_CHARS - line1.length - 1;
  if (budget < 8) return truncate(line1, MAX_CHARS);
  return `${line1}\n${truncate(line2, budget)}`;
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

function categoryEmoji(category) {
  const map = {
    food: "🍜",
    drink: "🧋",
    transport: "🚗",
    shopping: "🛍️",
    grocery: "🛒",
    entertainment: "🎮",
    travel: "✈️",
    rent: "🏠",
    utility: "💡",
    medical: "🏥",
    pet: "🐾",
    subscription: "📱",
    gift: "🎁",
    study: "📚",
    beauty: "💄",
    work: "💼",
    debt: "💳",
    transfer: "↔️",
    other: "💰",
  };
  return map[category] || "💰";
}

function buildFallbackReply(data) {
  return {
    text: formatRecordLine1(data),
  };
}

module.exports = {
  generateFunnyReply,
  generateDeleteReply,
  buildFallbackReply,
  formatRecordLine1,
};
