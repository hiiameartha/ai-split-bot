/**
 * MoodPay - AI 記帳解析服務
 */

const OpenAI = require("openai");
const {
  CATEGORIES,
  resolveCategory,
  resolveTags,
  resolveCategoryHint,
} = require("./category");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = "gpt-4o-mini";
const SUPPORTED_CURRENCIES = ["TWD", "MYR", "USD", "JPY", "KRW"];
const RELATIONS = ["self", "paid_for_me", "i_paid", "shared"];

const CATEGORY_LIST = CATEGORIES.join(", ");

const SYSTEM_PROMPT = `你是 MoodPay 記帳助手，解析繁體中文記帳訊息為 JSON。

{
  "payer": "付款人",
  "consumer": "受益人",
  "item": "消費項目名稱（簡短，如：娘惹博物館、海底撈）",
  "amount": 數字,
  "currency": "TWD|MYR|USD|JPY|KRW",
  "relation": "self|paid_for_me|i_paid|shared",
  "category": "必填英文，見清單",
  "tags": ["必填，3~6 個繁體中文語意標籤"],
  "sharedWith": ["僅 shared 時填寫"]
}

category 只能使用：${CATEGORY_LIST}

tags 規則（非常重要）：
1. tags 是「語意關鍵字」，用於搜尋與分析，不是把 item 整句複製進去
2. 每個 tag 建議 2~6 字，3~6 個為佳
3. 拆解：地點類型、文化、城市、品牌、活動、菜系
4. 不要把 category 含義重複進 tags（category 已是 travel 就不要 tag「旅遊」）
5. 不要放幣別、分攤、代墊進 tags（除非使用者明說）
6. 地名要具體：馬六甲、吉隆坡、東京

tags 範例：
- item「娘惹博物館」30 MYR → category:"travel", tags:["博物館","文化","景點","馬六甲","娘惹"]
- item「海底撈」→ category:"food", tags:["火鍋","聚餐","餐廳"]
- item「Grab去機場」→ category:"transport", tags:["Grab","機場","交通"]
- item「星巴克拿鐵」→ category:"drink", tags:["咖啡","星巴克"]

category 對照：
- travel：博物館、景點、古蹟、住宿、機票、門票、樂園、娘惹文化場館
- food：餐廳、正餐、小吃、夜市
- drink：咖啡、手搖、飲料
- transport：Grab、計程車、捷運、加油
- entertainment：電影、KTV、遊戲
- 其餘依字面語意判斷

relation：self / paid_for_me / i_paid / shared

規則：
1. 「我」保留為「我」
2. 未標幣別且寫「元」→ TWD；馬幣/MYR 語境→ MYR
3. 只回傳 JSON`;

async function parseExpense(text) {
  console.log("[AI] 開始解析:", text);

  const response = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `解析記帳。tags 請拆成語意關鍵字（3~6個），勿只填 item 全名：\n${text}`,
      },
    ],
    temperature: 0.2,
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("AI 未回傳解析結果");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("[AI] JSON 解析失敗:", raw);
    throw new Error("AI 回傳格式錯誤");
  }

  const result = normalizeParsedExpense(parsed, text);
  console.log("[AI] 解析完成:", JSON.stringify(result));
  return result;
}

function normalizeParsedExpense(parsed, rawText) {
  const currency = normalizeCurrency(parsed.currency);
  const relation = RELATIONS.includes(parsed.relation)
    ? parsed.relation
    : "self";

  let sharedWith = Array.isArray(parsed.sharedWith)
    ? parsed.sharedWith.map(String)
    : [];

  if (relation === "shared" && sharedWith.length === 0) {
    const participants = new Set(
      [parsed.payer, parsed.consumer].filter(Boolean).map(String)
    );
    sharedWith = [...participants];
  }

  const item = String(parsed.item || "未分類消費");
  const tagCtx = {
    item,
    rawText,
    relation,
    currency,
    sharedWith,
  };

  const categoryHint = resolveCategoryHint(tagCtx, parsed.tags);
  const tags = resolveTags(parsed.tags, tagCtx);
  const category = resolveCategory(
    parsed.category,
    item,
    rawText,
    tags,
    categoryHint
  );

  return {
    payer: String(parsed.payer || "我"),
    consumer: String(parsed.consumer || "我"),
    item,
    amount: Number(parsed.amount) || 0,
    currency,
    relation,
    category,
    tags,
    sharedWith,
    rawText,
  };
}

function normalizeCurrency(currency) {
  if (!currency) return "TWD";
  const upper = String(currency).toUpperCase();
  if (SUPPORTED_CURRENCIES.includes(upper)) return upper;

  const aliases = {
    台幣: "TWD",
    新台幣: "TWD",
    馬幣: "MYR",
    令吉: "MYR",
    美金: "USD",
    美元: "USD",
    日幣: "JPY",
    日圓: "JPY",
    円: "JPY",
    韓幣: "KRW",
    韓元: "KRW",
  };

  return aliases[currency] || aliases[upper] || "TWD";
}

module.exports = {
  parseExpense,
  normalizeParsedExpense,
  SUPPORTED_CURRENCIES,
};
