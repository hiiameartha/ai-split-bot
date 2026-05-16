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
 * 依記帳內容組出多組「梗圖向」搜尋字（非寫實場景）
 * @param {object} data
 * @returns {string[]}
 */
function buildGiphySearchQueries(data) {
  const item = data.item || "";
  const category = data.category || "";
  const amount = Number(data.amount) || 0;
  const twd = Number(data.twdAmount) || 0;
  /** @type {string[]} */
  const queries = [];

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
    queries.push(...pickRandom(PET_MEMES, 3));
  } else if (isDrink) {
    queries.push(
      "boba milk tea meme reaction",
      "sweet drink sugar meme reaction",
      "drinking meme funny reaction",
      "spongebob drinking meme",
      ...pickRandom(PET_MEMES, 1)
    );
  } else if (isFood) {
    queries.push(
      "food reaction meme",
      "mukbang meme reaction funny",
      "hungry shiba meme",
      ...pickRandom(PET_MEMES, 1)
    );
  } else if (isTravel) {
    queries.push(
      "travel tired meme",
      "vacation broke meme funny",
      "lost tourist meme",
      "airport delay meme reaction"
    );
  } else if (isShop) {
    queries.push(
      "shopping regret meme",
      "online shopping meme funny",
      "buying stuff broke meme"
    );
  } else if (/豆花/i.test(item)) {
    queries.push("dessert meme funny", "shocked cat meme", "food reaction meme");
  } else if (/火鍋|麻辣/i.test(item)) {
    queries.push("spicy food meme reaction", "sweating meme funny");
  } else {
    queries.push(...pickRandom(REACTION_MEMES, 2));
  }

  if (twd >= 500 || amount >= 100) {
    queries.push(...pickRandom(MONEY_MEMES, 2));
  }

  queries.push(...pickRandom(PET_MEMES, 2));
  queries.push(...pickRandom(REACTION_MEMES, 1));
  queries.push(...pickRandom(MONEY_MEMES, 1));

  const head = pickRandom(CLASSIC_MEMES, 3);
  const unique = [
    ...new Set([...head, ...queries].map((q) => q.trim()).filter(Boolean)),
  ];
  return unique.slice(0, 14);
}

/**
 * 刪除帳目用的梗圖搜尋
 */
function buildDeleteGiphyQueries() {
  return [
    ...pickRandom(CLASSIC_MEMES, 2),
    "delete undo meme funny",
    "cat guilty meme",
    "dog oops meme",
    "nope reaction meme",
    ...pickRandom(PET_MEMES, 2),
  ];
}

/**
 * 單次 Giphy 搜尋（隨機 offset 增加變化）
 * @param {string} apiKey
 * @param {string} query
 */
async function fetchGiphyOnce(apiKey, query) {
  const res = await axios.get("https://api.giphy.com/v1/gifs/search", {
    params: {
      api_key: apiKey,
      q: query,
      limit: 15,
      offset: Math.floor(Math.random() * 40),
      rating: "g",
      lang: "en",
    },
    timeout: 8000,
  });

  const list = res.data?.data || [];
  const shuffled = pickRandom(list, list.length);

  for (const gif of shuffled) {
    if (!isMemeGif(gif)) continue;
    const url = pickLineImageUrl(gif);
    if (url) return url;
  }

  if (list.length > 0) {
    console.warn(
      `[Meme] 「${query}」有 ${list.length} 筆但無合格迷因圖（已過濾貼圖/插畫）`
    );
  }
  return null;
}

/**
 * Giphy 搜尋（需 GIPHY_API_KEY）
 * @param {string|string[]} queryOrQueries
 * @returns {Promise<string|null>}
 */
async function searchGiphyUrl(queryOrQueries) {
  const apiKey = process.env.GIPHY_API_KEY?.trim();
  if (!apiKey) {
    console.log("[Meme] 略過 Giphy：未設定 GIPHY_API_KEY");
    return null;
  }

  const list = Array.isArray(queryOrQueries)
    ? queryOrQueries
    : queryOrQueries
      ? [queryOrQueries]
      : [];

  const fallbacks = [...list, ...pickRandom(GENERIC_MEME_FALLBACKS, 4)];

  const tried = new Set();
  for (const q of fallbacks) {
    const key = q.toLowerCase();
    if (!q || tried.has(key)) continue;
    tried.add(key);

    try {
      const url = await fetchGiphyOnce(apiKey, q);
      if (url) {
        console.log("[Meme] Giphy 梗圖:", q, "→", url.slice(0, 70) + "...");
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
 * @returns {string[]}
 */
function giphySearchQuery(data) {
  return buildGiphySearchQueries(data);
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
  buildGiphySearchQueries,
  buildDeleteGiphyQueries,
  pickDeleteMeme,
  pickLineImageUrl,
  isLineSafeImageUrl,
  isMemeGif,
};
