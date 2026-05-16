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
  /^(刪除|删除|取消記帳|取消记账|作廢|作废|撤銷|撤销|undo|delete|remove)\s*/i;

const DELETE_LAST_PATTERN =
  /^(刪除|删除|undo|delete)\s*(上一筆|上一笔|最後一筆|最后笔|最新一筆|最新一笔|last|latest)?\s*$/i;

const DELETE_PICK_PATTERN = /^(刪除|删除|delete)\s*#?(\d+)\s*$/i;

const IMPORT_CONFIRM_PATTERN = /^(匯入|导入|確認匯入|确认导入|寫入|写入)$/i;

const RECORD_BLOCK_PATTERN =
  /^(我|男友|女友|小胖|大家).*(買了|付了|代墊|吃|花)/;

/**
 * 解析使用者文字意圖
 * @param {string} text
 * @returns {Promise<{ intent: 'record'|'delete'|'delete_pick', target?: string, pickIndex?: number }>}
 */
async function classifyIntent(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return { intent: "record" };
  }

  const pickMatch = trimmed.match(DELETE_PICK_PATTERN);
  if (pickMatch) {
    return {
      intent: "delete_pick",
      pickIndex: parseInt(pickMatch[2], 10),
    };
  }

  if (IMPORT_CONFIRM_PATTERN.test(trimmed)) {
    return { intent: "import_confirm" };
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
  const hints = ["刪掉", "删掉", "不要這筆", "不要这笔", "拿掉", "移除這筆", "移除这笔"];
  return hints.some((h) => text.includes(h));
}

/**
 * AI 意圖分類（僅模糊句）
 * @param {string} text
 */
async function classifyIntentWithAi(text) {
  if (!openai) {
    if (/刪|取消|作廢|撤銷|undo|delete|remove/i.test(text)) {
      return { intent: "delete", target: text.replace(/.*?(刪|取消)/, "").trim() || "__last__" };
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
delete 時 target 為要刪的項目關鍵字；若刪上一筆則 target 為 "__last__"。
「刪除測試吐司」→ delete, target「測試吐司」。`,
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
  return /免費|免钱|零元|0元|不用錢|請客|招待|free|complimentary/i.test(combined);
}

module.exports = {
  classifyIntent,
  isExplicitFreeContext,
};
