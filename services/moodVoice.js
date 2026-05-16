/**
 * MoodPay - 產品語氣與情緒系統（AI 財務小精靈）
 */

const { getCategoryMeta } = require("../utils/chartTheme");
const { formatTransactionRoles } = require("./actor");

const BRAND = "✨ MoodPay";

const REPORT = {
  wrapped: "財務偷看報告",
  category: "吞錢排行榜",
  monthly: "每日燃燒曲線",
  debt: "代墊結算",
  members: "花錢戰力榜",
};

const KPI = {
  burn: "本月支出",
  income: "本月收入",
  net: "淨額（支−收）",
  swipes: "記帳筆數",
  dailyBurn: "平均每天支出",
  perSwipe: "平均每次支出",
};

const PHASE_HOOKS = {
  early: [
    "月初錢包還很樂觀，MoodPay 先幫你盯著 👀",
    "新的一月，新的花錢理由（我開玩笑的）",
    "MoodPay：你的財務小精靈已上線 🧚",
  ],
  mid: [
    "月中檢查：錢包還好嗎？我來偷看一下",
    "MoodPay 偵測到生活仍在進行中 📡",
    "花錢節奏穩定輸出中（穩定地少）",
  ],
  late: [
    "MoodPay 偵測到月底省錢人格已上線 🫠",
    "距離發薪還有幾天？我先不問，先看帳",
    "月底模式：能省則省，能笑則笑",
  ],
};

const CATEGORY_INSIGHTS = {
  drink: [
    "珍奶正在逐步接管你的財務主權 🧋",
    "你不是在喝飲料，是在投資糖分期貨 ☕",
    "手搖杯：今日份的快樂與明日份的後悔",
  ],
  travel: [
    "你們最近不是在生活，是在燃燒里程數 ✈️",
    "最近的錢包應該都在機場 ✈️",
    "護照比存款帳戶更活躍的一個月",
  ],
  shopping: [
    "購物車目前是你們家最活躍成員 🛍️",
    "買完才想起：原來錢包也會哭",
    "購物車比記憶力更可靠（也更貴）",
  ],
  food: [
    "胃袋永遠是 true MVP 🍜",
    "人生苦短，先吃再說",
    "這個月的快樂，很多都裝在肚子裡",
  ],
  entertainment: [
    "娛樂預算：快樂優先 🎮",
    "今晚的 KPI 是開心",
    "快樂要付費，但值得（通常）",
  ],
  grocery: [
    "冰箱滿了，錢包瘦了 🛒",
    "生活必需品：不必要地真實",
  ],
  transport: [
    "不是在移動，是在付移動費 🚗",
    "里程數換來的都市生存",
  ],
  other: [
    "有些錢花出去，連分類都想裝沒看見",
    "神秘金額：連 MoodPay 都想再問一次",
  ],
};

const HIGH_SPEND_HOOKS = [
  "這個月火力有點猛，MoodPay 先幫你記下來 🔥",
  "錢包：我感受到壓力了",
  "本月燃燒指數：偏高（但生活要過）",
];

const LOW_SPEND_HOOKS = [
  "本月出手很克制，錢包表示感謝 🙏",
  "省錢模式？還是只是還沒開始花",
  "低調的一月，MoodPay 替你守著",
];

const FREQUENT_HOOKS = [
  "出手很勤，MoodPay 跟得上你的節奏 ⚡",
  "交易密度偏高：生活感很強的一月",
];

/**
 * @param {{ year: number, month: number, total: number, count: number }} meta
 * @param {Record<string, number>} byCategory
 * @param {object[]} [monthTx]
 */
function analyzeSpendingMood(meta, byCategory, monthTx = []) {
  const now = new Date();
  const dim = daysInMonth(meta);
  const day = now.getMonth() + 1 === meta.month ? now.getDate() : 15;
  const phase = day <= 10 ? "early" : day >= dim - 4 ? "late" : "mid";

  const expenseTotal = meta.expenseTotal ?? meta.total ?? 0;
  const total = expenseTotal;
  const count = meta.expenseCount ?? meta.count ?? 0;
  const entries = Object.entries(byCategory || {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  const topEntry = entries.find(([c]) => c !== "other") || entries[0];
  const topCat = topEntry?.[0] || "other";
  const topShare = total > 0 && topEntry ? topEntry[1] / total : 0;

  const ratio = (key) => (total > 0 ? (byCategory[key] || 0) / total : 0);

  return {
    phase,
    topCat,
    topShare,
    total,
    count,
    drinkHeavy: ratio("drink") >= 0.22,
    travelHeavy: ratio("travel") >= 0.25,
    shoppingHeavy: ratio("shopping") >= 0.3,
    foodHeavy: ratio("food") >= 0.35,
    highBurn: total >= 15000 || (count >= 8 && total >= 8000),
    lowBurn: total > 0 && total < 3000,
    frequent: count >= 10,
    otherPct:
      total > 0 ? Math.round(((byCategory.other || 0) / total) * 100) : 0,
    txCount: monthTx.length || count,
  };
}

/**
 * @param {ReturnType<typeof analyzeSpendingMood>} mood
 */
function pickMoodHook(mood) {
  if (mood.drinkHeavy) return pick(CATEGORY_INSIGHTS.drink);
  if (mood.travelHeavy) return pick(CATEGORY_INSIGHTS.travel);
  if (mood.shoppingHeavy) return pick(CATEGORY_INSIGHTS.shopping);
  if (mood.foodHeavy) return pick(CATEGORY_INSIGHTS.food);
  if (mood.highBurn) return pick(HIGH_SPEND_HOOKS);
  if (mood.lowBurn) return pick(LOW_SPEND_HOOKS);
  if (mood.frequent) return pick(FREQUENT_HOOKS);
  return pick(PHASE_HOOKS[mood.phase] || PHASE_HOOKS.mid);
}

/**
 * @param {string} category
 */
function pickCategoryInsight(category) {
  const list = CATEGORY_INSIGHTS[category] || CATEGORY_INSIGHTS.other;
  return pick(list);
}

/**
 * @param {string} reportTitle
 * @param {{ year: number, month: number }} meta
 * @param {string} [hook]
 */
function formatBrandHeader(reportTitle, meta, hook) {
  const lines = [BRAND, `  ${reportTitle}`, `  ${meta.year} 年 ${meta.month} 月`];
  if (meta.scopeLabel) lines.push(`  ${meta.scopeLabel}`);
  if (hook) lines.push(`  ${hook}`);
  return lines;
}

/**
 * @param {object} meta
 */
function formatKpiBlock(meta) {
  const dim = daysInMonth(meta);
  const expenseTotal = meta.expenseTotal ?? 0;
  const incomeTotal = meta.incomeTotal ?? 0;
  const netTotal = meta.netTotal ?? meta.total ?? expenseTotal - incomeTotal;
  const expenseCount = meta.expenseCount ?? meta.count ?? 0;

  const dailyAvg =
    expenseCount > 0 ? Math.round(expenseTotal / Math.max(dim, 1)) : 0;
  const perTx =
    expenseCount > 0 ? Math.round(expenseTotal / expenseCount) : 0;

  const lines = [
    kpiRow(KPI.burn, `${formatMoney(expenseTotal)} 元`),
  ];

  if (incomeTotal > 0) {
    lines.push(kpiRow(KPI.income, `+${formatMoney(incomeTotal)} 元`));
    lines.push(kpiRow(KPI.net, `${formatMoney(netTotal)} 元`));
  }

  lines.push(
    kpiRow(KPI.swipes, `${meta.count ?? expenseCount} 次`),
    kpiRow(KPI.dailyBurn, `${formatMoney(dailyAvg)} 元`),
    kpiRow(KPI.perSwipe, `${formatMoney(perTx)} 元`)
  );

  return lines;
}

function kpiRow(label, value) {
  return `  ${label}　${value}`;
}

/**
 * @param {object} data - 記帳資料
 */
function formatRecordAck(data, viewer) {
  const { emoji } = getCategoryMeta(data.category);
  const raw = Math.abs(Number(data.amount) || 0);
  const prefix = data.relation === "income" ? "+" : "";
  const amt =
    data.currency === "TWD"
      ? `${prefix}${raw} 元`
      : `${prefix}${raw} ${data.currency}`;
  const roleLine = formatTransactionRoles(data, viewer);
  const openers = [
    `記下了 ${emoji} ${data.item} · ${amt}`,
    `錢包感受到一擊 ${emoji} ${data.item} ${amt}`,
    `MoodPay 幫你記住 ${emoji} ${data.item} ${amt}`,
  ];
  return `${pick(openers)}\n  ${roleLine}`;
}

/**
 * @param {object} deleted
 */
function formatDeleteAck(deleted) {
  const amt =
    deleted.currency === "TWD"
      ? `${deleted.amount} 元`
      : `${deleted.amount} ${deleted.currency}`;
  return pick([
    `這筆退場了 🗑️ ${deleted.item} · ${amt}`,
    `已把 ${deleted.item} 從帳本送走（${amt}）`,
    `刪掉了 ${deleted.item}，錢包深呼吸一下`,
  ]);
}

function formatMoney(n) {
  return Math.round(n).toLocaleString("zh-TW");
}

function daysInMonth(meta) {
  return new Date(meta.year, meta.month, 0).getDate();
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

module.exports = {
  BRAND,
  REPORT,
  KPI,
  analyzeSpendingMood,
  pickMoodHook,
  pickCategoryInsight,
  formatBrandHeader,
  formatKpiBlock,
  formatRecordAck,
  formatDeleteAck,
  formatMoney,
  pick,
};
