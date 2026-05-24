/**
 * MoodPay - 意圖分流
 * 關鍵字規則優先，模糊情況可選用 AI
 */

const OpenAI = require("openai");

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const MODEL = "gpt-4o-mini";

const DELETE_PREFIX =
  /^(刪除|删除|移除|取消記帳|取消记账|作廢|作废|撤銷|撤销|undo|delete|remove)\s*/i;

const DELETE_LAST_PATTERN =
  /^(刪除|删除|undo|delete)\s*(上一筆|上一笔|最後一筆|最后笔|最新一筆|最新一笔|last|latest)?\s*$/i;

const DELETE_PICK_PATTERN = /^(刪除|删除|delete)\s*#?(\d+)\s*$/i;

const DELETE_CONFIRM_PATTERN =
  /^(確認刪除|確認|確定刪除|確定|好的刪除|好\s*的|刪吧|是|ok|yes|y)\s*$/i;

const DELETE_CANCEL_PATTERN = /^(取消刪除|取消|不要了|算了|不用刪|no|n)\s*$/i;

const RECORD_BLOCK_PATTERN =
  /^(我|男友|女友|小胖|大家).*(買了|付了|代墊|吃|花)/;

const DELETE_MARKER_SCREENSHOT = "[截圖]";

/**
 * 「移除這16筆」「移除以上這16種記帳」等批次刪除筆數
 * @param {string} text
 * @returns {number|null}
 */
function parseBulkDeleteCount(text) {
  const m = String(text).match(
    /(?:移除|刪除|删除)\s*(?:這|以上)?\s*(?:這)?\s*(\d+)\s*(?:筆|项項|种種|種記帳|種)/i
  );
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 解析使用者文字意圖
 * @param {string} text
 * @returns {Promise<object>}
 */
async function classifyIntent(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return { intent: "record" };
  }

  if (DELETE_CONFIRM_PATTERN.test(trimmed)) {
    return { intent: "delete_confirm" };
  }

  if (DELETE_CANCEL_PATTERN.test(trimmed)) {
    return { intent: "delete_cancel" };
  }

  const pickMatch = trimmed.match(DELETE_PICK_PATTERN);
  if (pickMatch) {
    return {
      intent: "delete_pick",
      pickIndex: parseInt(pickMatch[2], 10),
    };
  }

  const bulkCount = parseBulkDeleteCount(trimmed);
  if (bulkCount) {
    return { intent: "delete_bulk", count: Math.min(bulkCount, 50) };
  }

  if (DELETE_LAST_PATTERN.test(trimmed) || /^\/undo\s*$/i.test(trimmed)) {
    return { intent: "delete", target: "__last__" };
  }

  if (DELETE_PREFIX.test(trimmed)) {
    const target = trimmed.replace(DELETE_PREFIX, "").trim();
    if (!target || /^(上一筆|上一笔|最後一筆|最后笔|last|latest)$/i.test(target)) {
      return { intent: "delete", target: "__last__" };
    }
    return { intent: "delete", target };
  }

  if (RECORD_BLOCK_PATTERN.test(trimmed)) {
    return { intent: "record" };
  }

  if (needsAiIntent(trimmed)) {
    return classifyIntentWithAi(trimmed);
  }

  return { intent: "record" };
}

/**
 * 是否需 AI 輔助（含刪除語意但非標準前綴）
 * @param {string} text
 */
function needsAiIntent(text) {
  if (/^(移除|刪掉|删掉|拿掉)/.test(text)) return true;
  const hints = ["不要這筆", "不要这笔", "移除這筆", "移除这笔", "移除這", "移除以上"];
  return hints.some((h) => text.includes(h));
}

/**
 * AI 意圖分類（僅模糊句）
 * @param {string} text
 */
async function classifyIntentWithAi(text) {
  if (!openai) {
    if (/刪|移除|取消|作廢|撤銷|undo|delete|remove/i.test(text)) {
      const bulk = parseBulkDeleteCount(text);
      if (bulk) return { intent: "delete_bulk", count: Math.min(bulk, 50) };
      return {
        intent: "delete",
        target: text.replace(/.*?(?:刪|移除|取消)/, "").trim() || "__last__",
      };
    }
    return { intent: "record" };
  }

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 80,
      messages: [
        {
          role: "system",
          content: `分類 MoodPay 使用者訊息。只回 JSON：
{"intent":"record"|"delete","target":""}
delete：刪除帳目（含「移除」「刪除」），target 為項目關鍵字；刪上一筆則 "__last__"。
「移除這16筆」「刪除測試吐司」→ delete，勿當記帳。`,
        },
        { role: "user", content: text },
      ],
    });

    const raw = response.choices[0]?.message?.content;
    const parsed = JSON.parse(raw || "{}");
    if (parsed.intent === "delete") {
      return {
        intent: "delete",
        target: parsed.target || "__last__",
      };
    }
  } catch (err) {
    console.warn("[Intent] AI 分類失敗，視為記帳:", err.message);
  }

  return { intent: "record" };
}

/**
 * 是否為明確免費／零元語境（允許 amount<=0 寫入）
 * @param {string} text
 * @param {object} [parsed]
 */
function isExplicitFreeContext(text, parsed) {
  const combined = `${text} ${parsed?.item || ""} ${parsed?.rawText || ""}`;
  return /免費|免钱|零元|0元|不用錢|不用付錢|不用付|沒付|免付|請客|招待|free|complimentary/i.test(
    combined
  );
}

module.exports = {
  classifyIntent,
  isExplicitFreeContext,
  parseBulkDeleteCount,
  DELETE_MARKER_SCREENSHOT,
};
