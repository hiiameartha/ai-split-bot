/**
 * MoodPay - 固定英文 category + 關鍵字推斷
 */

/** Dashboard 固定分類（不可自創） */
const CATEGORIES = [
  "food",
  "drink",
  "transport",
  "shopping",
  "grocery",
  "entertainment",
  "travel",
  "rent",
  "utility",
  "medical",
  "pet",
  "subscription",
  "gift",
  "study",
  "beauty",
  "work",
  "debt",
  "transfer",
  "other",
];

/** 中文／舊版／別名 → 標準 category */
const CATEGORY_ALIASES = {
  food: "food",
  餐飲: "food",
  餐饮: "food",
  meal: "food",
  dining: "food",
  restaurant: "food",

  drink: "drink",
  飲料: "drink",
  饮料: "drink",
  beverage: "drink",
  coffee: "drink",
  咖啡: "drink",
  手搖: "drink",

  transport: "transport",
  交通: "transport",
  commute: "transport",
  taxi: "transport",

  shopping: "shopping",
  購物: "shopping",
  购物: "shopping",
  retail: "shopping",
  家具: "shopping",
  家居: "shopping",
  家電: "shopping",
  "3c": "shopping",

  grocery: "grocery",
  超市: "grocery",
  全聯: "grocery",
  家樂福: "grocery",

  entertainment: "entertainment",
  娛樂: "entertainment",
  娱乐: "entertainment",
  game: "entertainment",
  movie: "entertainment",
  電影: "entertainment",
  ktv: "entertainment",

  travel: "travel",
  旅遊: "travel",
  旅游: "travel",
  住宿: "travel",
  hotel: "travel",
  飯店: "travel",
  酒店: "travel",
  民宿: "travel",
  airbnb: "travel",
  機票: "travel",

  rent: "rent",
  房租: "rent",
  租金: "rent",

  utility: "utility",
  水電: "utility",
  電費: "utility",
  水費: "utility",
  瓦斯: "utility",
  網路費: "utility",
  phone: "utility",
  電話費: "utility",

  medical: "medical",
  醫療: "medical",
  医疗: "medical",
  看醫生: "medical",
  藥: "medical",

  pet: "pet",
  寵物: "pet",
  宠物: "pet",

  subscription: "subscription",
  訂閱: "subscription",
  订阅: "subscription",
  netflix: "subscription",
  spotify: "subscription",

  gift: "gift",
  禮物: "gift",
  礼物: "gift",

  study: "study",
  學費: "study",
  学费: "study",
  課程: "study",
  课程: "study",
  書: "study",

  beauty: "beauty",
  美容: "beauty",
  化妝: "beauty",
  保養: "beauty",
  美甲: "beauty",

  work: "work",
  办公: "work",
  辦公: "work",

  debt: "debt",
  還款: "debt",
  还款: "debt",
  借貸: "debt",

  transfer: "transfer",
  轉帳: "transfer",
  转账: "transfer",

  other: "other",
  其他: "other",
  misc: "other",
};

const KEYWORD_RULES = [
  {
    category: "food",
    keywords: [
      "便當",
      "午餐",
      "晚餐",
      "早餐",
      "宵夜",
      "拉麵",
      "火鍋",
      "海底撈",
      "麻辣",
      "壽司",
      "燒肉",
      "炸雞",
      "漢堡",
      "pizza",
      "餐廳",
      "小吃",
      "外送",
      "foodpanda",
      "uber eats",
      "美食",
      "吃飯",
      "吐司",
      "豆花",
      "便當",
      "麵",
      "hotpot",
      "haidilao",
    ],
  },
  {
    category: "drink",
    keywords: [
      "奶茶",
      "手搖",
      "飲料",
      "咖啡",
      "星巴克",
      "可樂",
      "茶",
      "bubble tea",
      "starbucks",
    ],
  },
  {
    category: "transport",
    keywords: [
      "計程車",
      "taxi",
      "uber",
      "捷運",
      "mrt",
      "公車",
      "高鐵",
      "台鐵",
      "火車",
      "加油",
      "停車",
      "youbike",
    ],
  },
  {
    category: "grocery",
    keywords: [
      "全聯",
      "家樂福",
      "costco",
      "超市",
      "grocery",
      "px mart",
      "菜市場",
      "衛生紙",
      "衛生棉",
      "洗髮",
      "沐浴",
      "牙膏",
      "牙刷",
      "洗衣精",
      "柔軟精",
      "洗碗精",
      "醬油",
      "米",
      "麵條",
      "泡麵",
      "零食",
      "食材",
      "生鮮",
      "日用品",
    ],
  },
  {
    category: "shopping",
    keywords: [
      "蝦皮",
      "momo",
      "pchome",
      "amazon",
      "3c",
      "鍵盤",
      "keyboard",
      "滑鼠",
      "mouse",
      "螢幕",
      "顯示器",
      "monitor",
      "耳機",
      "headset",
      "硬碟",
      "ssd",
      "隨身碟",
      "usb hub",
      "充電器",
      "行動電源",
      "筆電",
      "電腦",
      "平板",
      "ipad",
      "電腦配件",
      "3c配件",
      "電子產品",
      "椅子",
      "沙發",
      "家具",
      "家居",
      "家居用品",
      "居家",
      "家飾",
      "寢具",
      "枕頭",
      "床墊",
      "床單",
      "收納",
      "衣架",
      "茶几",
      "書桌",
      "衣櫃",
      "燈具",
      "檯燈",
      "家電",
      "吸塵",
      "掃地機器人",
      "掃地機",
      "電風扇",
      "冷氣",
      "洗衣機",
      "ikea",
      "宜家",
      "無印",
      "muji",
      "uniclo",
      "優衣庫",
      "衣服",
      "鞋子",
      "包包",
      "手錶",
      "飾品",
      "玩具",
      "購物",
      "shopping",
    ],
  },
  {
    category: "entertainment",
    keywords: [
      "電影",
      "演唱會",
      "遊戲",
      "ktv",
      "遊樂園",
      "迪士尼",
      "按摩",
      "spa",
      "concert",
    ],
  },
  {
    category: "travel",
    keywords: [
      "住宿",
      "飯店",
      "酒店",
      "民宿",
      "airbnb",
      "機票",
      "旅館",
      "hotel",
      "出國",
      "博物館",
      "美術館",
      "紀念館",
      "娘惹",
      "古蹟",
      "景點",
      "觀光",
      "門票",
      "樂園",
      "動物園",
      "水族館",
      "馬六甲",
      "吉隆坡",
      "檳城",
      "museum",
      "attraction",
    ],
  },
  {
    category: "rent",
    keywords: ["房租", "租金", "租屋"],
  },
  {
    category: "utility",
    keywords: ["水電", "電費", "水費", "瓦斯", "網路費", "電話費"],
  },
  {
    category: "medical",
    keywords: ["醫院", "診所", "看醫生", "掛號", "藥局", "牙醫"],
  },
  {
    category: "pet",
    keywords: ["寵物", "貓砂", "狗糧", "獸醫"],
  },
  {
    category: "subscription",
    keywords: ["訂閱", "netflix", "spotify", "icloud", "youtube premium"],
  },
  {
    category: "gift",
    keywords: ["禮物", "紅包", "生日禮"],
  },
  {
    category: "study",
    keywords: ["學費", "補習", "課程", "書局", "教科書"],
  },
  {
    category: "beauty",
    keywords: ["美容", "美甲", "美髮", "化妝", "保養品"],
  },
  {
    category: "work",
    keywords: [
      "辦公",
      "办公",
      "文具",
      "影印",
      "碳粉",
      "墨水匣",
      "墨水",
      "白板筆",
      "白板",
      "釘書機",
      "資料夾",
      "便利貼",
      "碎紙機",
      "辦公椅",
      "辦公桌",
      "office supply",
    ],
  },
  {
    category: "transfer",
    keywords: ["轉帳", "匯款", "line pay 轉"],
  },
  {
    category: "debt",
    keywords: ["還款", "還債", "借貸利息"],
  },
];

/**
 * 語意 tag 片段 → category（item 難辨時用 AI tags 補強）
 * @type {{ sub: string, category: string }[]}
 */
const TAG_CATEGORY_HINTS = [
  { sub: "家具", category: "shopping" },
  { sub: "家居", category: "shopping" },
  { sub: "居家", category: "shopping" },
  { sub: "寢具", category: "shopping" },
  { sub: "家電", category: "shopping" },
  { sub: "3c", category: "shopping" },
  { sub: "電腦配件", category: "shopping" },
  { sub: "電子產品", category: "shopping" },
  { sub: "服飾", category: "shopping" },
  { sub: "文具", category: "work" },
  { sub: "辦公用品", category: "work" },
  { sub: "食材", category: "grocery" },
  { sub: "生鮮", category: "grocery" },
  { sub: "日用品", category: "grocery" },
  { sub: "餐廳", category: "food" },
  { sub: "小吃", category: "food" },
  { sub: "咖啡", category: "drink" },
  { sub: "手搖", category: "drink" },
  { sub: "交通", category: "transport" },
  { sub: "景點", category: "travel" },
  { sub: "住宿", category: "travel" },
  { sub: "門票", category: "travel" },
  { sub: "寵物", category: "pet" },
  { sub: "美容", category: "beauty" },
  { sub: "醫療", category: "medical" },
  { sub: "訂閱", category: "subscription" },
  { sub: "禮物", category: "gift" },
];

/**
 * @param {string[]} tags
 * @returns {string|null}
 */
function inferCategoryFromTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return null;

  for (const tag of tags) {
    const t = String(tag).trim();
    if (!t) continue;
    const lower = t.toLowerCase();

    for (const hint of TAG_CATEGORY_HINTS) {
      const needle = hint.sub.toLowerCase();
      if (lower.includes(needle) || needle.includes(lower)) {
        return hint.category;
      }
    }
  }

  return null;
}

/**
 * @param {string} [value]
 * @returns {string|null}
 */
function normalizeCategory(value) {
  if (value == null || value === "") return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (CATEGORIES.includes(lower)) return lower;
  if (CATEGORY_ALIASES[raw]) return CATEGORY_ALIASES[raw];
  if (CATEGORY_ALIASES[lower]) return CATEGORY_ALIASES[lower];

  return null;
}

/**
 * @param {string} item
 * @param {string} [rawText]
 * @param {string[]} [tags]
 */
function inferCategoryFromItem(item, rawText = "", tags = []) {
  const tagStr = Array.isArray(tags) ? tags.join(" ") : "";
  const haystack = `${item || ""} ${rawText || ""} ${tagStr}`.toLowerCase();

  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      const needle = kw.toLowerCase().trim();
      if (needle && haystack.includes(needle)) {
        return rule.category;
      }
    }
  }

  return null;
}

/**
 * @param {string} [aiCategory]
 * @param {string} item
 * @param {string} [rawText]
 * @param {string[]} [tags]
 * @param {string|null} [categoryHint]
 */
function resolveCategory(aiCategory, item, rawText, tags = [], categoryHint = null) {
  const fromAi = normalizeCategory(aiCategory);
  const aiIsWeak = !fromAi || fromAi === "other";

  if (fromAi && !aiIsWeak) {
    console.log("[Category] AI/別名:", fromAi);
    return fromAi;
  }

  const hint = normalizeCategory(categoryHint);
  if (hint && hint !== "other") {
    console.log("[Category] 語意提示:", hint, "←", item);
    return hint;
  }

  const fromKeywords = inferCategoryFromItem(item, rawText, tags);
  if (fromKeywords) {
    console.log("[Category] 關鍵字:", fromKeywords, "←", item);
    return fromKeywords;
  }

  const fromTags = inferCategoryFromTags(tags);
  if (fromTags) {
    console.log("[Category] 語意 tag:", fromTags, "←", item);
    return fromTags;
  }

  if (fromAi) return fromAi;

  console.log("[Category] 預設: other");
  return "other";
}

/** 從原文擷取情境標籤 */
const TAG_CONTEXT_RULES = [
  { pattern: /宵夜|深夜/, tag: "宵夜" },
  { pattern: /早餐/, tag: "早餐" },
  { pattern: /午餐/, tag: "午餐" },
  { pattern: /晚餐/, tag: "晚餐" },
  { pattern: /外送|外賣/, tag: "外送" },
  { pattern: /一起|分攤|aa|聚餐/, tag: "聚餐" },
  { pattern: /火鍋/, tag: "火鍋" },
  { pattern: /海鮮/, tag: "海鮮" },
];

const CURRENCY_TAG = {
  JPY: "日幣",
  KRW: "韓幣",
  MYR: "馬幣",
  USD: "美金",
};

const RELATION_TAGS = {
  shared: "分攤",
  paid_for_me: "代墊",
  i_paid: "代付",
  treat: "請客",
};

/**
 * @param {unknown} tags
 * @param {string} item
 * @param {string} rawText
 * @returns {string[]}
 */
function normalizeTags(tags, item, rawText) {
  let list = [];

  if (Array.isArray(tags)) {
    list = tags.map((t) => String(t).trim()).filter(Boolean);
  } else if (typeof tags === "string" && tags.trim()) {
    list = tags
      .split(/[,，、]/)
      .map((t) => t.trim())
      .filter(Boolean);
  }

  return dedupeTags(list);
}

/**
 * AI 未給 tags 時，從 item / 原文 / 關係 / 幣別推斷
 * @param {object} ctx
 * @param {string} ctx.item
 * @param {string} ctx.rawText
 * @param {string} ctx.relation
 * @param {string} ctx.currency
 * @param {string[]} [ctx.sharedWith]
 * @param {string[]} [existing]
 */
function inferTags(ctx, existing = []) {
  const tags = dedupeTags(existing);
  const seen = new Set(tags.map((t) => t.toLowerCase()));

  const add = (t) => {
    const s = String(t).trim();
    if (!s || s.length > 24) return;
    const key = s.toLowerCase();
    if (seen.has(key) || tags.length >= 8) return;
    seen.add(key);
    tags.push(s);
  };

  const item = ctx.item || "";
  const rawText = ctx.rawText || "";
  const combined = `${item} ${rawText}`;

  if (item && item !== "未分類消費" && tags.length < 2) {
    add(item);
  }

  if (ctx.relation && RELATION_TAGS[ctx.relation]) {
    add(RELATION_TAGS[ctx.relation]);
  }

  for (const rule of TAG_CONTEXT_RULES) {
    if (rule.pattern.test(combined)) {
      add(rule.tag);
    }
  }

  if (ctx.relation === "shared" && /男友|女友|朋友|大家/.test(rawText)) {
    add("聚餐");
  }

  return tags;
}

const { enrichSemanticTags } = require("./tagEnrich");

/**
 * 合併 AI tags + 語意強化（優先語意標籤，非整句 item）
 */
function resolveTags(aiTags, ctx) {
  const enriched = enrichSemanticTags({
    item: ctx.item,
    rawText: ctx.rawText,
    aiTags: normalizeTags(aiTags, ctx.item, ctx.rawText),
    currency: ctx.currency,
    relation: ctx.relation,
  });

  if (enriched.tags.length >= 2) {
    console.log("[Tags] 語意:", enriched.tags.join(","));
    return enriched.tags;
  }

  const fromAi = normalizeTags(aiTags, ctx.item, ctx.rawText);
  if (fromAi.length > 0) {
    return dedupeTags(fromAi, 6);
  }

  const inferred = inferTags(ctx);
  if (inferred.length > 0) {
    console.log("[Tags] 推斷:", inferred.join(","));
  }
  return inferred;
}

/**
 * 取得語意 category 提示（供 resolveCategory 使用）
 */
function resolveCategoryHint(ctx, aiTags) {
  return enrichSemanticTags({
    item: ctx.item,
    rawText: ctx.rawText,
    aiTags: normalizeTags(aiTags, ctx.item, ctx.rawText),
    currency: ctx.currency,
    relation: ctx.relation,
  }).categoryHint;
}

/**
 * @param {string[]} list
 * @returns {string[]}
 */
function dedupeTags(list) {
  const seen = new Set();
  const unique = [];
  for (const t of list) {
    const key = String(t).trim().toLowerCase();
    if (!key || seen.has(key) || unique.length >= 8) continue;
    seen.add(key);
    unique.push(String(t).trim());
  }
  return unique;
}

/**
 * 寫入 Sheet 用（逗號分隔）
 * @param {string[]} tags
 */
function serializeTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return "";
  return tags.join(",");
}

/**
 * 從 Sheet 讀取
 * @param {string} value
 * @returns {string[]}
 */
function parseTags(value) {
  if (!value) return [];
  return String(value)
    .split(/[,，、]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

module.exports = {
  CATEGORIES,
  normalizeCategory,
  inferCategoryFromItem,
  resolveCategory,
  normalizeTags,
  inferTags,
  resolveTags,
  resolveCategoryHint,
  serializeTags,
  parseTags,
};
