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
const { applyParseHints, RELATIONS } = require("./parseHints");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = "gpt-4o-mini";
const SUPPORTED_CURRENCIES = ["TWD", "MYR", "USD", "JPY", "KRW"];

const CATEGORY_LIST = CATEGORIES.join(", ");

const SYSTEM_PROMPT = `你是 MoodPay 記帳助手，解析繁體中文記帳訊息為 JSON。

{
  "payer": "付款人",
  "consumer": "受益人",
  "item": "消費項目名稱（簡短，如：娘惹博物館、海底撈）",
  "amount": 數字,
  "currency": "TWD|MYR|USD|JPY|KRW",
  "relation": "self|paid_for_me|i_paid|shared|income|treat",
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
- item「鍵盤」2000元 → category:"shopping", tags:["鍵盤","3C","電腦配件"]
- item「影印紙」→ category:"work", tags:["文具","辦公"]
- item「椅子推進器」10元 → category:"shopping", tags:["椅子","家具","家居"]

category 對照（務必選最貼近的一項，避免 other）：
- food：餐廳、正餐、小吃、夜市、外送
- drink：咖啡、手搖、飲料
- transport：Grab、計程車、捷運、加油、停車
- grocery：超市採買、食材、泡麵、衛生紙、洗沐用品
- shopping：3C、鍵盤滑鼠螢幕、衣服鞋包、家具家居（椅子、沙發、家電、收納）
- entertainment：電影、KTV、演唱會、遊玩消費（非買硬體）
- travel：住宿、機票、景點門票、博物館
- rent：房租、租金
- utility：水電瓦斯、網路費、電話費
- medical：醫院、診所、藥局
- pet：寵物、飼料、獸醫
- subscription：Netflix、Spotify、軟體訂閱
- gift：禮物、紅包
- study：學費、課程、書籍
- beauty：美容、美髮、美甲、化妝保養
- work：文具、影印、辦公桌椅（非一般家具）
- debt：還款
- transfer：轉帳
- other：僅在以上皆不符合時使用

relation：self / paid_for_me / i_paid / shared / income / treat

relation 規則（非常重要）：
- self：我付、我自己花
- paid_for_me：別人代墊、幫我付（之後可能要還；payer=墊款人, consumer=我）
- i_paid：我幫別人付（payer=我, consumer=對方）
- shared：多人分攤
- income：收到錢、塞進錢包、紅包入帳（payer=給錢的人, consumer=我）
- treat：請客／招待／包養／不用付錢（不算債；amount 填 0，參考價值寫在 item 備註如「buffet（價值30萬，女朋友請客）」）

relation 範例：
- 「男友幫我付 25 馬幣火鍋」→ paid_for_me（代墊要還）
- 「我幫小胖付了 500」→ i_paid
- 「被女朋友包養吃 buffet 不用付錢，價值30萬」→ treat, amount:0, payer:女朋友, item 含價值備註
- 「我阿嬤塞了 300 進錢包」→ income

金額算式：
- 原文若有 3000+5000-80、30x10 等算式，amount 必須先算出正確總和（7920、300），勿漏減項
- treat 時 amount 必為 0，勿把「價值」當實付金額

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
  let relation = RELATIONS.includes(parsed.relation)
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

  const base = {
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

  return applyParseHints(base, rawText);
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
