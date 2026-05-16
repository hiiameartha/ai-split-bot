/**
 * MoodPay - 語意化 tags 強化（地點、文化、類型拆解）
 */

/** 地點關鍵字 → tags */
const LOCATION_HINTS = [
  { pattern: /馬六甲|melaka/i, tags: ["馬六甲", "馬來西亞"] },
  { pattern: /吉隆坡|kl\b/i, tags: ["吉隆坡", "馬來西亞"] },
  { pattern: /檳城|penang/i, tags: ["檳城", "馬來西亞"] },
  { pattern: /新山|jb\b/i, tags: ["新山", "馬來西亞"] },
  { pattern: /新加坡|singapore/i, tags: ["新加坡"] },
  { pattern: /台北|taipei/i, tags: ["台北"] },
  { pattern: /東京|tokyo/i, tags: ["東京", "日本"] },
  { pattern: /大阪|osaka/i, tags: ["大阪", "日本"] },
  { pattern: /首爾|seoul/i, tags: ["首爾", "韓國"] },
  { pattern: /曼谷|bangkok/i, tags: ["曼谷", "泰國"] },
];

/**
 * 項目語意規則：從 item 拆解 tags，並可提示 category
 * @type {{ pattern: RegExp, tags: string[], category?: string }[]}
 */
const SEMANTIC_RULES = [
  {
    pattern: /博物館|美術館|紀念館|文物館|gallery|museum/i,
    tags: ["博物館", "文化", "景點"],
    category: "travel",
  },
  {
    pattern: /娘惹|峇峇|peranakan/i,
    tags: ["娘惹", "文化", "馬六甲"],
    category: "travel",
  },
  {
    pattern: /古蹟|遺址|古城|老街/i,
    tags: ["古蹟", "文化", "景點"],
    category: "travel",
  },
  {
    pattern: /寺廟|廟宇|教堂|清真寺/i,
    tags: ["宗教", "景點", "文化"],
    category: "travel",
  },
  {
    pattern: /樂園|主題樂園|迪士尼|環球/i,
    tags: ["樂園", "景點", "門票"],
    category: "travel",
  },
  {
    pattern: /動物園|水族館|海洋館/i,
    tags: ["動物園", "景點", "門票"],
    category: "travel",
  },
  {
    pattern: /溫泉|泡湯|onsen/i,
    tags: ["溫泉", "休閒"],
    category: "travel",
  },
  {
    pattern: /住宿|飯店|酒店|民宿|hostel|hotel/i,
    tags: ["住宿"],
    category: "travel",
  },
  {
    pattern: /機票|航空|airasia|亞航/i,
    tags: ["機票", "交通"],
    category: "travel",
  },
  {
    pattern: /kopitiam|咖啡店|咖啡廳|星巴克|starbucks/i,
    tags: ["咖啡"],
    category: "drink",
  },
  {
    pattern: /火鍋|麻辣|海底撈|haidilao/i,
    tags: ["火鍋"],
    category: "food",
  },
  {
    pattern: /拉麵|ramen/i,
    tags: ["拉麵"],
    category: "food",
  },
  {
    pattern: /夜市/i,
    tags: ["夜市", "小吃"],
    category: "food",
  },
  {
    pattern: /grab|計程車|taxi|uber/i,
    tags: ["交通"],
    category: "transport",
  },
];

/** 不應作為 tags 的泛用詞（除非無其他標籤） */
const GENERIC_TAG_BLOCKLIST = new Set([
  "消費",
  "未分類",
  "未分類消費",
  "其他",
  "馬幣",
  "台幣",
  "日幣",
  "韓幣",
  "美金",
  "元",
]);

/**
 * @param {object} input
 * @param {string} input.item
 * @param {string} [input.rawText]
 * @param {string[]} [input.aiTags]
 * @param {string} [input.currency]
 * @param {string} [input.relation]
 * @returns {{ tags: string[], categoryHint: string|null }}
 */
function enrichSemanticTags(input) {
  const item = String(input.item || "").trim();
  const rawText = String(input.rawText || "").trim();
  const combined = `${item} ${rawText}`;
  const collected = [];
  let categoryHint = null;

  for (const rule of SEMANTIC_RULES) {
    if (rule.pattern.test(combined)) {
      collected.push(...rule.tags);
      if (rule.category && !categoryHint) {
        categoryHint = rule.category;
      }
    }
  }

  for (const loc of LOCATION_HINTS) {
    if (loc.pattern.test(combined)) {
      collected.push(...loc.tags);
      if (!categoryHint) categoryHint = "travel";
    }
  }

  extractCompoundTokens(item).forEach((t) => collected.push(t));

  const aiNormalized = normalizeTagList(input.aiTags || []);
  for (const t of aiNormalized) {
    if (!isRedundantItemTag(t, item)) {
      collected.push(t);
    }
  }

  if (input.relation === "shared") {
    collected.push("分攤");
  }

  let tags = dedupeTags(collected, 6);

  tags = tags.filter((t) => !GENERIC_TAG_BLOCKLIST.has(t.toLowerCase()));

  if (tags.length === 0 && item && item !== "未分類消費") {
    tags = dedupeTags(splitItemTokens(item), 5);
  }

  return { tags, categoryHint };
}

/**
 * 複合名詞拆解（娘惹博物館 → 娘惹、博物館）
 * @param {string} item
 */
function extractCompoundTokens(item) {
  const tokens = [];
  const suffixes = [
    "博物館",
    "美術館",
    "紀念館",
    "文物館",
    "火鍋",
    "餐廳",
    "咖啡廳",
    "便利店",
    "便利商店",
    "超市",
    "藥局",
    "書店",
  ];

  let rest = item;
  for (const suf of suffixes) {
    if (rest.includes(suf)) {
      tokens.push(suf);
      const prefix = rest.replace(suf, "").trim();
      if (prefix.length >= 2 && prefix.length <= 8) {
        tokens.push(prefix);
      }
      rest = prefix;
    }
  }

  return tokens;
}

/**
 * 無法匹配規則時，嘗試拆詞
 * @param {string} item
 */
function splitItemTokens(item) {
  if (item.length <= 12) {
    return extractCompoundTokens(item).length
      ? extractCompoundTokens(item)
      : [item];
  }
  return [];
}

/**
 * tag 是否等於整個 item（冗餘）
 */
function isRedundantItemTag(tag, item) {
  if (!tag || !item) return false;
  const t = tag.trim();
  const i = item.trim();
  return t === i || (t.length > 6 && i.includes(t) && t.length / i.length > 0.7);
}

/**
 * @param {unknown} tags
 */
function normalizeTagList(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => String(t).trim()).filter(Boolean);
}

/**
 * @param {string[]} list
 * @param {number} max
 */
function dedupeTags(list, max = 6) {
  const seen = new Set();
  const out = [];
  for (const t of list) {
    const s = String(t).trim();
    if (!s || s.length > 12) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

module.exports = {
  enrichSemanticTags,
  SEMANTIC_RULES,
  LOCATION_HINTS,
};
