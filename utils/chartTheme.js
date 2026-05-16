/**
 * MoodPay - QuickChart 統一主題（dark fintech dashboard）
 */

const CHART_DEFAULTS = {
  width: 520,
  height: 340,
  devicePixelRatio: 2,
  backgroundColor: "#0B1220",
  format: "png",
};

const FONT_FAMILY = "'Helvetica Neue', 'PingFang TC', 'Noto Sans TC', sans-serif";

const TEXT = {
  primary: "#F1F5F9",
  secondary: "#94A3B8",
  muted: "#64748B",
};

const GRID = {
  color: "rgba(148, 163, 184, 0.12)",
  borderColor: "rgba(148, 163, 184, 0.2)",
};

/** 分類色盤（漸層感、區隔明顯） */
const CATEGORY_COLORS = {
  food: "#FF6B6B",
  drink: "#4ECDC4",
  transport: "#45B7D1",
  shopping: "#A78BFA",
  grocery: "#F59E0B",
  entertainment: "#F472B6",
  travel: "#38BDF8",
  rent: "#FB923C",
  utility: "#94A3B8",
  medical: "#34D399",
  pet: "#C084FC",
  subscription: "#60A5FA",
  gift: "#FB7185",
  study: "#2DD4BF",
  beauty: "#E879F9",
  work: "#818CF8",
  debt: "#F87171",
  transfer: "#9CA3AF",
  other: "#6B7280",
};

/** 分類顯示名稱與 emoji */
const CATEGORY_META = {
  food: { label: "食物", emoji: "🍜" },
  drink: { label: "飲料", emoji: "🧋" },
  transport: { label: "交通", emoji: "🚗" },
  shopping: { label: "購物", emoji: "🛍️" },
  grocery: { label: "超市", emoji: "🛒" },
  entertainment: { label: "娛樂", emoji: "🎮" },
  travel: { label: "旅遊", emoji: "✈️" },
  rent: { label: "房租", emoji: "🏠" },
  utility: { label: "水電", emoji: "💡" },
  medical: { label: "醫療", emoji: "🏥" },
  pet: { label: "寵物", emoji: "🐾" },
  subscription: { label: "訂閱", emoji: "📱" },
  gift: { label: "禮物", emoji: "🎁" },
  study: { label: "學習", emoji: "📚" },
  beauty: { label: "美容", emoji: "💄" },
  work: { label: "工作", emoji: "💼" },
  debt: { label: "還款", emoji: "💳" },
  transfer: { label: "轉帳", emoji: "↔️" },
  other: { label: "其他", emoji: "💰" },
};

const DEBT_COLORS = {
  positive: "#34D399",
  negative: "#F87171",
  neutral: "#64748B",
};

const GRADIENT_LINE = {
  borderColor: "#6366F1",
  backgroundColor: "rgba(99, 102, 241, 0.25)",
  pointBackgroundColor: "#818CF8",
  pointBorderColor: "#E0E7FF",
  pointRadius: 4,
  pointHoverRadius: 6,
  tension: 0.42,
  fill: true,
};

/** 橫條圖漸層（由深到亮） */
const BAR_GRADIENT = [
  "#6366F1",
  "#818CF8",
  "#A78BFA",
  "#C084FC",
  "#38BDF8",
  "#2DD4BF",
  "#F472B6",
  "#FB923C",
];

/**
 * Chart.js 共用 options 基底
 * @param {string} title
 */
function baseChartOptions(title) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    layout: { padding: { top: 12, right: 16, bottom: 8, left: 8 } },
    plugins: {
      legend: {
        display: true,
        position: "bottom",
        labels: {
          color: TEXT.secondary,
          font: { family: FONT_FAMILY, size: 11 },
          padding: 14,
          usePointStyle: true,
          boxWidth: 8,
        },
      },
      title: {
        display: true,
        text: title,
        color: TEXT.primary,
        font: { family: FONT_FAMILY, size: 16, weight: "600" },
        padding: { bottom: 16 },
      },
      datalabels: {
        display: false,
      },
    },
  };
}

/**
 * @param {string} key
 */
function getCategoryMeta(key) {
  const k = (key || "other").toLowerCase();
  return CATEGORY_META[k] || { label: k, emoji: "📌" };
}

/**
 * @param {string} key
 * @param {number} index
 */
function getCategoryColor(key, index = 0) {
  const k = (key || "other").toLowerCase();
  if (CATEGORY_COLORS[k]) return CATEGORY_COLORS[k];
  const fallback = ["#6366F1", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];
  return fallback[index % fallback.length];
}

module.exports = {
  CHART_DEFAULTS,
  FONT_FAMILY,
  TEXT,
  GRID,
  CATEGORY_COLORS,
  CATEGORY_META,
  DEBT_COLORS,
  GRADIENT_LINE,
  BAR_GRADIENT,
  baseChartOptions,
  getCategoryMeta,
  getCategoryColor,
};
