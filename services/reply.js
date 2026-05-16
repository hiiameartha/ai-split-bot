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
const { getCategoryMeta } = require("../utils/chartTheme");
const {
  formatRecordAck,
  formatDeleteAck,
  pickCategoryInsight,
} = require("./moodVoice");

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
async function generateFunnyReply(data, viewer) {
  console.log("[Reply] 產生記帳回覆...");

  const line1 = formatRecordLine1(data, viewer);
  const ruleMeme = pickRuleMeme(data);
  let line2 = ruleMeme;

  if (!line2) {
    line2 = await generateAiMemeLine(data, "record");
  }

  const text = clampReply(line1, line2);

  let imageUrl = null;
  if (process.env.GIPHY_API_KEY?.trim()) {
    const plan = giphySearchQuery(data);
    imageUrl = await searchGiphyUrl(plan.fallbackQueries, {
      itemQueries: plan.itemQueries,
    });
  }

  return { text, imageUrl: imageUrl || undefined };
}

/**
 * 刪除成功回覆
 * @param {object} deleted
 * @returns {Promise<{ text: string, imageUrl?: string }>}
 */
async function generateDeleteReply(deleted) {
  const line1 = formatDeleteAck(deleted);
  const line2 = pickDeleteMeme(deleted) || (await generateAiMemeLine(deleted, "delete"));
  const text = clampReply(line1, line2);

  let imageUrl = null;
  if (process.env.GIPHY_API_KEY?.trim()) {
    const plan = buildDeleteGiphyQueries(deleted);
    imageUrl = await searchGiphyUrl(plan.fallbackQueries, {
      itemQueries: plan.itemQueries,
    });
  }

  return { text, imageUrl: imageUrl || undefined };
}

/**
 * @param {object} data
 */
function formatRecordLine1(data, viewer) {
  return formatRecordAck(data, viewer);
}

/**
 * AI 補一句梗（僅在規則未命中時）
 */
async function generateAiMemeLine(data, mode) {
  const item = data.item || "消費";
  const cat = data.category || "other";
  const toneHint = buildReplyToneHint(data, mode);
  const prompt =
    mode === "delete"
      ? `刪除「${item}」。${toneHint} 寫一句台灣網路梗，≤25字，繁中。只回一句。`
      : `記了「${item}」${data.amount}元，分類${cat}。${toneHint} 寫一句朋友吐槽，≤25字，繁中。只回一句。`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "你是 MoodPay，LINE 上的 AI 財務小精靈。語氣：可愛、幽默、像朋友吐槽、不油、不官方。只用繁體中文，超短，像 Threads / 小紅書 meme。禁止：已記錄、成功、系統、使用者、支出總額。",
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

function buildReplyToneHint(data, mode) {
  if (mode === "delete") return "語氣：輕鬆、安慰錢包。";
  const cat = (data.category || "other").toLowerCase();
  const amt = Number(data.twdAmount || data.amount) || 0;
  if (cat === "drink") return "語氣：吐槽手搖/珍奶。";
  if (cat === "travel") return "語氣：吐槽旅遊燒錢/里程。";
  if (cat === "shopping") return "語氣：吐槽購物車。";
  if (cat === "food") return "語氣：吐槽吃貨。";
  if (amt >= 1000) return "語氣：大額出手，誇張但可愛。";
  return "語氣：輕鬆吐槽。";
}

function fallbackMemeLine(data, mode) {
  if (mode === "delete") return "這筆退場，錢包深呼吸 🫁";
  const cat = (data.category || "other").toLowerCase();
  if (cat === "drink") return pickCategoryInsight("drink");
  if (cat === "travel") return pickCategoryInsight("travel");
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
  return getCategoryMeta(category).emoji;
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
