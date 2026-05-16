/**
 * MoodPay - 梗句與選用 Giphy
 * LINE 圖片訊息僅支援 JPEG/PNG，需用 Giphy still 圖而非 .gif
 */

const axios = require("axios");

/** @type {{ test: (item: string, amount: number, text?: string) => boolean, lines: string[] }[]} */
const RULES = [
  {
    test: (item, amount) =>
      /豆花|豆漿/i.test(item) ||
      (amount > 0 && amount <= 35 && /豆/i.test(item)),
    lines: [
      "我的豆花 30 塊，你這碗是在特價？🧊",
      "豆花 25？我 30 塊的尊嚴何在 😤",
      "老闆：你豆花比我便宜，我心情複雜",
    ],
  },
  {
    test: (item) => /吐司|麵包|toast/i.test(item),
    lines: [
      "吐司：碳水界的溫柔陷阱 🍞",
      "這片吐司貴到可以當護身符了",
    ],
  },
  {
    test: (item) => /便當/i.test(item),
    lines: [
      "便當打開那一刻，人生還有什麼不能忍 🍱",
      "今日便當：胃的 KPI 達標",
    ],
  },
  {
    test: (_item, amount) => amount === 0,
    lines: [
      "0 元還記帳，你是會計界的行為藝術 🎭",
      "免費的最貴，但這筆真的免費 ✨",
    ],
  },
  {
    test: (item) => /火鍋|麻辣/i.test(item),
    lines: [
      "火鍋：社交與腸胃的雙重修煉 🌶️",
      "麻辣鍋：眼淚與錢包一起蒸發",
    ],
  },
  {
    test: (item) => /拉麵|ramen|麵/i.test(item),
    lines: [
      "吸麵聲太大，鄰桌以為在開演唱會 🍜",
      "這碗麵的熱量，夠跑半場馬拉松",
    ],
  },
];

/**
 * @param {object} data
 * @returns {string|null}
 */
function pickRuleMeme(data) {
  const item = data.item || "";
  const amount = Number(data.amount) || 0;
  const text = data.rawText || "";

  for (const rule of RULES) {
    if (rule.test(item, amount, text)) {
      return rule.lines[Math.floor(Math.random() * rule.lines.length)];
    }
  }
  return null;
}

/**
 * 從 Giphy 物件選 LINE 可用的靜態圖（僅 JPEG/PNG）
 * Giphy 的 *_still 多為 .gif，需優先 480w_still（.jpg）
 * @param {object} gif
 * @returns {string|null}
 */
function pickLineImageUrl(gif) {
  if (!gif?.images) return null;

  const img = gif.images;
  const candidates = [
    img["480w_still"]?.url,
    img.fixed_height_still?.url,
    img.downsized_still?.url,
    img.original_still?.url,
    img.fixed_width_still?.url,
  ].filter(Boolean);

  for (const url of candidates) {
    if (isLineSafeImageUrl(url)) return url;
  }

  return null;
}

/**
 * LINE image message 僅支援 JPEG / PNG
 * @param {string} url
 */
function isLineSafeImageUrl(url) {
  if (!url || !url.startsWith("https://")) return false;
  const lower = url.toLowerCase().split("?")[0];
  return (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png")
  );
}

/** 經典迷因模板（真人／動物反應，非插畫貼圖） */
const CLASSIC_MEMES = [
  "surprised pikachu meme",
  "woman yelling at cat meme",
  "distracted boyfriend meme",
  "drake meme",
  "this is fine meme",
  "confused nick young meme",
  "expanding brain meme",
  "spongebob meme reaction",
  "hasbulla meme",
  "mr bean waiting meme",
];

/** 網路梗／反應圖 */
const REACTION_MEMES = [
  "reaction meme shocked",
  "dramatic reaction meme",
  "facepalm meme funny",
  "side eye meme",
  "wtf meme reaction",
  "over it meme",
];

/** 貓狗寵物梗 */
const PET_MEMES = [
  "funny cat meme",
  "cat judgmental meme",
  "dog shocked meme",
  "dog reaction meme",
  "pet funny meme",
  "cute cat chaos meme",
  "dog guilty meme",
];

/** 花錢／錢包梗 */
const MONEY_MEMES = [
  "broke wallet meme",
  "spending money regret meme",
  "empty wallet funny meme",
  "paying bills meme reaction",
];

const GENERIC_MEME_FALLBACKS = [
  ...CLASSIC_MEMES,
  ...REACTION_MEMES,
  ...PET_MEMES.slice(0, 3),
];

/**
 * 品項／輸入文字 → Giphy 搜尋（越前面越具體）
 * @type {{ pattern: RegExp, queries: string[] }[]}
 */
const ITEM_GIPHY_PATTERNS = [
  {
    pattern: /天使雞排/,
    queries: [
      "taiwan fried chicken meme",
      "fried chicken cutlet funny",
      "eating fried chicken reaction",
    ],
  },
  {
    pattern: /雞排|鹽酥雞|炸雞/,
    queries: [
      "fried chicken meme funny",
      "fried chicken eating reaction",
      "chicken cutlet taiwan",
    ],
  },
  {
    pattern: /雞|chicken/i,
    queries: ["fried chicken meme", "chicken funny reaction"],
  },
  {
    pattern: /珍珠奶茶|手搖|奶茶|boba|bubble tea/i,
    queries: ["boba milk tea meme", "bubble tea reaction funny"],
  },
  {
    pattern: /咖啡|拿鐵|latte/i,
    queries: ["coffee meme reaction", "latte funny"],
  },
  {
    pattern: /豆花/,
    queries: ["taiwan dessert meme", "shaved ice dessert funny"],
  },
  {
    pattern: /便當/,
    queries: ["bento box meme", "lunch box eating funny"],
  },
  {
    pattern: /火鍋|麻辣/,
    queries: ["hot pot meme reaction", "spicy food sweating funny"],
  },
  {
    pattern: /拉麵|ramen/i,
    queries: ["ramen eating meme", "noodle slurp funny reaction"],
  },
  {
    pattern: /寿司|壽司|sushi/i,
    queries: ["sushi eating meme funny"],
  },
  {
    pattern: /牛排|steak/i,
    queries: ["steak eating meme reaction"],
  },
  {
    pattern: /披萨|披薩|pizza/i,
    queries: ["pizza eating meme funny"],
  },
  {
    pattern: /汉堡|漢堡|burger/i,
    queries: ["burger eating meme funny"],
  },
  {
    pattern: /吐司|toast/i,
    queries: ["toast breakfast meme funny"],
  },
  {
    pattern: /啤酒|bar|酒吧/i,
    queries: ["beer cheers meme funny"],
  },
  {
    pattern: /蛋糕|甜點|甜品|dessert/i,
    queries: ["dessert happy meme", "cake eating funny"],
  },
  {
    pattern: /超市|全聯|costco|ikea/i,
    queries: ["grocery shopping meme", "shopping cart funny"],
  },
  {
    pattern: /机票|機票|飛機|flight/i,
    queries: ["airport travel meme", "plane tired funny"],
  },
];

/** 插畫／貼圖／諧音梗（如 SEND NOODS） */
const BLOCK_MEME_PATTERN =
  /send[- ]?noods|noods-happy|happy-frog|tea[- ]?time[- ]?eating|fork-and-kn|illustration|sticker[- ]?pack|kawaii[- ]?art|greeting[- ]?card|cartoon[- ]?eating/i;

/**
 * 是否為「網路迷因」而非插畫貼圖
 * @param {object} gif
 */
function isMemeGif(gif) {
  if (!gif || gif.type !== "gif") return false;

  const slug = (gif.slug || "").toLowerCase();
  const title = (gif.title || "").toLowerCase();
  const tags = (gif.tags || []).join(" ").toLowerCase();
  const blob = `${slug} ${title} ${tags}`;

  if (BLOCK_MEME_PATTERN.test(blob)) return false;

  const MEME_SIGNAL =
    /meme|reaction|moodman|mood-man|viral|relatable|facepalm|side-eye|shocked|surprised|pikachu|drake|boyfriend|yelling-at-cat|woman-yelling|this-is-fine|spongebob|hasbulla|shiba|doge|judgmental|guilty|broke|wallet|wtf|over-it|dramatic|big-mood|main-character|artestpage-meme/i;

  if (MEME_SIGNAL.test(blob)) return true;

  if (
    /cat|dog|puppy|kitten|shiba|doge|pikachu/.test(blob) &&
    /funny|reaction|shocked|angry|judgmental|guilty|mood|meme|surprised/.test(
      blob
    )
  ) {
    return true;
  }

  if (/eating|noodle|noods|beverage|drink/.test(blob) && !/meme|reaction/.test(blob)) {
    return false;
  }

  return false;
}

/**
 * 品項導向搜尋：允許食物／吃喝反應類 GIF（仍排除貼圖風）
 * @param {object} gif
 */
function isItemContextGif(gif) {
  if (!gif || gif.type !== "gif") return false;

  const slug = (gif.slug || "").toLowerCase();
  const title = (gif.title || "").toLowerCase();
  const tags = (gif.tags || []).join(" ").toLowerCase();
  const blob = `${slug} ${title} ${tags}`;

  if (BLOCK_MEME_PATTERN.test(blob)) return false;
  if (isMemeGif(gif)) return true;

  const ITEM_SIGNAL =
    /chicken|fried|food|eating|eat|drink|boba|tea|coffee|ramen|noodle|hot.?pot|steak|pizza|burger|sushi|dessert|cake|hungry|yummy|delicious|tasty|mukbang|chef|cooking|restaurant|snack|美食|吃|喝|雞|排|奶茶|火鍋|麵/i;

  return ITEM_SIGNAL.test(blob);
}

/**
 * @param {object} gif
 * @param {{ itemContext?: boolean }} [options]
 */
function isAcceptableGif(gif, options = {}) {
  if (options.itemContext) return isItemContextGif(gif);
  return isMemeGif(gif);
}

/**
 * @template T
 * @param {T[]} arr
 * @param {number} n
 * @returns {T[]}
 */
function pickRandom(arr, n = 1) {
  const pool = [...arr];
  const out = [];
  while (out.length < n && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/**
 * @param {string} q
 * @param {Set<string>} seen
 */
function pushQuery(seen, list, q) {
  const trimmed = (q || "").trim();
  if (!trimmed) return;
  const key = trimmed.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  list.push(trimmed);
}

/**
 * 從品項、原始輸入、tags 組出「品項優先」的 Giphy 關鍵字
 * @param {object} data
 * @returns {string[]}
 */
function buildItemLedGiphyQueries(data) {
  const item = (data.item || "").trim();
  const raw = (data.rawText || "").trim();
  const combined = `${item} ${raw}`.trim();
  /** @type {string[]} */
  const queries = [];
  const seen = new Set();

  for (const { pattern, queries: qs } of ITEM_GIPHY_PATTERNS) {
    if (pattern.test(item) || pattern.test(raw) || pattern.test(combined)) {
      for (const q of qs) pushQuery(seen, queries, q);
    }
  }

  const coreItem = item
    .replace(/\d+(\.\d+)?/g, "")
    .replace(/[元塊块¥$€£]/g, "")
    .trim();

  if (coreItem.length >= 2) {
    pushQuery(seen, queries, `${coreItem} funny`);
    if (/[\u4e00-\u9fff]/.test(coreItem)) {
      pushQuery(seen, queries, `${coreItem} 搞笑`);
      pushQuery(seen, queries, `${coreItem} 美食`);
    } else {
      pushQuery(seen, queries, `${coreItem} meme funny`);
      pushQuery(seen, queries, `${coreItem} reaction`);
    }
  }

  const rawCore = raw
    .replace(/\d+(\.\d+)?/g, "")
    .replace(/[元塊块]/g, "")
    .trim();
  if (rawCore && rawCore !== coreItem && rawCore.length >= 2) {
    pushQuery(seen, queries, `${rawCore} funny`);
    if (/[\u4e00-\u9fff]/.test(rawCore)) {
      pushQuery(seen, queries, `${rawCore} 搞笑`);
    }
  }

  if (Array.isArray(data.tags)) {
    for (const tag of data.tags.slice(0, 3)) {
      const t = String(tag || "").trim();
      if (t.length < 2) continue;
      pushQuery(seen, queries, `${t} funny`);
      if (/[\u4e00-\u9fff]/.test(t)) pushQuery(seen, queries, `${t} 美食`);
    }
  }

  const english = combined.match(/[a-zA-Z]{3,}/gi) || [];
  for (const word of [...new Set(english.map((w) => w.toLowerCase()))].slice(0, 2)) {
    pushQuery(seen, queries, `${word} meme funny`);
  }

  return queries.slice(0, 10);
}

/**
 * 分類級備援搜尋（品項搜不到時）
 * @param {object} data
 * @returns {string[]}
 */
function buildCategoryGiphyQueries(data) {
  const item = data.item || "";
  const category = data.category || "";
  const amount = Number(data.amount) || 0;
  const twd = Number(data.twdAmount) || 0;
  /** @type {string[]} */
  const queries = [];
  const seen = new Set();

  const isPet =
    category === "pet" ||
    /貓|狗|寵|毛孩|pet|cat|dog|hamster|兔子/i.test(item);
  const isDrink =
    category === "drink" ||
    /牛奶|豆漿|手搖|奶茶|綠豆|紅豆|鮮奶|拿鐵|咖啡|茶|飲料|果汁|汽水|boba|bubble/i.test(
      item
    );
  const isFood =
    !isDrink &&
    (category === "food" ||
      category === "grocery" ||
      /吃|餐|飯|麵|便當|豆花|火鍋|拉麵|吐司|早餐|午餐|晚餐/i.test(item));
  const isTravel =
    category === "travel" ||
    /博物館|旅|景點|娘惹|機票|飯店|住宿|出國|度假/i.test(item);
  const isShop = category === "shopping" || /買|購物|逛街/i.test(item);

  if (isPet) {
    for (const q of pickRandom(PET_MEMES, 2)) pushQuery(seen, queries, q);
  } else if (isDrink) {
    pushQuery(seen, queries, "boba milk tea meme reaction");
    pushQuery(seen, queries, "drinking meme funny reaction");
  } else if (isFood) {
    pushQuery(seen, queries, "food reaction meme funny");
    pushQuery(seen, queries, "mukbang meme reaction");
  } else if (isTravel) {
    pushQuery(seen, queries, "travel tired meme");
    pushQuery(seen, queries, "vacation meme funny");
  } else if (isShop) {
    pushQuery(seen, queries, "shopping regret meme");
  } else {
    for (const q of pickRandom(REACTION_MEMES, 1)) pushQuery(seen, queries, q);
  }

  if (twd >= 500 || amount >= 100) {
    for (const q of pickRandom(MONEY_MEMES, 1)) pushQuery(seen, queries, q);
  }

  for (const q of pickRandom(CLASSIC_MEMES, 2)) pushQuery(seen, queries, q);

  return queries.slice(0, 8);
}

/**
 * 梗圖搜尋計畫：先品項、再分類、最後通用
 * @param {object} data
 * @returns {{ itemQueries: string[], fallbackQueries: string[] }}
 */
function buildGiphySearchPlan(data) {
  const itemQueries = buildItemLedGiphyQueries(data);
  const fallbackQueries = buildCategoryGiphyQueries(data);
  return { itemQueries, fallbackQueries };
}

/**
 * 依記帳內容組出多組 Giphy 搜尋字（相容舊 API）
 * @param {object} data
 * @returns {string[]}
 */
function buildGiphySearchQueries(data) {
  const { itemQueries, fallbackQueries } = buildGiphySearchPlan(data);
  return [...itemQueries, ...fallbackQueries].slice(0, 14);
}

/**
 * 刪除帳目用的梗圖搜尋（仍優先該筆品項）
 * @param {object} [deleted]
 * @returns {{ itemQueries: string[], fallbackQueries: string[] }}
 */
function buildDeleteGiphyQueries(deleted = {}) {
  const itemQueries = buildItemLedGiphyQueries(deleted);
  const seen = new Set();
  /** @type {string[]} */
  const fallbackQueries = [];

  pushQuery(seen, fallbackQueries, "delete undo meme funny");
  pushQuery(seen, fallbackQueries, "oops reaction meme");
  for (const q of pickRandom(PET_MEMES, 1)) pushQuery(seen, fallbackQueries, q);
  for (const q of pickRandom(CLASSIC_MEMES, 2)) pushQuery(seen, fallbackQueries, q);

  return { itemQueries, fallbackQueries };
}

/**
 * 單次 Giphy 搜尋（隨機 offset 增加變化）
 * @param {string} apiKey
 * @param {string} query
 * @param {{ itemContext?: boolean }} [options]
 */
async function fetchGiphyOnce(apiKey, query, options = {}) {
  const lang = /[\u4e00-\u9fff]/.test(query) ? "zh" : "en";

  const res = await axios.get("https://api.giphy.com/v1/gifs/search", {
    params: {
      api_key: apiKey,
      q: query,
      limit: 15,
      offset: Math.floor(Math.random() * 40),
      rating: "g",
      lang,
    },
    timeout: 8000,
  });

  const list = res.data?.data || [];
  const shuffled = pickRandom(list, list.length);

  for (const gif of shuffled) {
    if (!isAcceptableGif(gif, options)) continue;
    const url = pickLineImageUrl(gif);
    if (url) return url;
  }

  if (list.length > 0) {
    console.warn(
      `[Meme] 「${query}」有 ${list.length} 筆但無合格圖（itemContext=${!!options.itemContext}）`
    );
  }
  return null;
}

/**
 * Giphy 搜尋（需 GIPHY_API_KEY）
 * @param {string|string[]} queryOrQueries
 * @param {{ itemQueries?: string[] }} [options]
 * @returns {Promise<string|null>}
 */
async function searchGiphyUrl(queryOrQueries, options = {}) {
  const apiKey = process.env.GIPHY_API_KEY?.trim();
  if (!apiKey) {
    console.log("[Meme] 略過 Giphy：未設定 GIPHY_API_KEY");
    return null;
  }

  const itemLed = (options.itemQueries || []).filter(Boolean);
  const list = Array.isArray(queryOrQueries)
    ? queryOrQueries
    : queryOrQueries
      ? [queryOrQueries]
      : [];

  const fallbacks = [...list, ...pickRandom(GENERIC_MEME_FALLBACKS, 3)];

  const tried = new Set();

  for (const q of itemLed) {
    const key = q.toLowerCase();
    if (!q || tried.has(key)) continue;
    tried.add(key);

    try {
      const url = await fetchGiphyOnce(apiKey, q, { itemContext: true });
      if (url) {
        console.log("[Meme] Giphy 品項:", q, "→", url.slice(0, 70) + "...");
        return url;
      }
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      console.warn(`[Meme] Giphy 品項搜尋失敗 (${q}):`, status || msg);
      if (status === 403 || status === 401) return null;
    }
  }

  for (const q of fallbacks) {
    const key = q.toLowerCase();
    if (!q || tried.has(key)) continue;
    tried.add(key);

    try {
      const url = await fetchGiphyOnce(apiKey, q, { itemContext: false });
      if (url) {
        console.log("[Meme] Giphy 備援:", q, "→", url.slice(0, 70) + "...");
        return url;
      }
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      console.warn(`[Meme] Giphy 搜尋失敗 (${q}):`, status || msg);
      if (status === 403 || status === 401) break;
    }
  }

  console.warn("[Meme] Giphy 梗圖無結果");
  return null;
}

/**
 * @param {object} data
 * @returns {{ itemQueries: string[], fallbackQueries: string[] }}
 */
function giphySearchQuery(data) {
  return buildGiphySearchPlan(data);
}

function pickDeleteMeme(deleted) {
  const lines = [
    "這筆帳已蒸發，錢包假裝沒發生過 🫥",
    `「${deleted.item}」：存在過，但現在失蹤了 🔍`,
    "刪除成功，會計之魂得到救贖 ✨",
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

module.exports = {
  pickRuleMeme,
  searchGiphyUrl,
  giphySearchQuery,
  buildGiphySearchPlan,
  buildItemLedGiphyQueries,
  buildGiphySearchQueries,
  buildDeleteGiphyQueries,
  pickDeleteMeme,
  pickLineImageUrl,
  isLineSafeImageUrl,
  isMemeGif,
  isItemContextGif,
};
