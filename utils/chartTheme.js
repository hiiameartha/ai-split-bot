/**
 * MoodPay - QuickChart 主題（粉彩可愛 · 品牌色）
 * 對應品牌：薄荷綠、粉紅、淡黃、薰衣草紫、海軍藍字
 */

const CHART_DEFAULTS = {
  width: 520,
  height: 340,
  devicePixelRatio: 2,
  backgroundColor: "#EAF9F4",
  format: "png",
};

const FONT_FAMILY =
  "'PingFang TC', 'Noto Sans TC', 'Helvetica Neue', sans-serif";

/** 品牌色 */
const BRAND = {
  mint: "#B8EBD8",
  mintLight: "#EAF9F4",
  pink: "#FFB8D4",
  yellow: "#FFE494",
  lavender: "#C4B5FD",
  sky: "#93C5FD",
  coral: "#FDA4AF",
  navy: "#2D3A5C",
  navySoft: "#5C6B8A",
  white: "#FFFFFF",
  card: "#F7FDFB",
};

const TEXT = {
  primary: BRAND.navy,
  secondary: BRAND.navySoft,
  muted: "#8B9BB5",
};

const GRID = {
  color: "rgba(45, 58, 92, 0.06)",
  borderColor: "rgba(45, 58, 92, 0.1)",
};

/** 分類色（粉彩、對應品牌插畫圓餅） */
const CATEGORY_COLORS = {
  food: "#FFB5C2",
  drink: "#7EEDD9",
  transport: "#93C5FD",
  shopping: "#C4B5FD",
  grocery: "#FFE494",
  entertainment: "#F9A8D4",
  travel: "#7DD3FC",
  rent: "#FDBA74",
  utility: "#A5B4FC",
  medical: "#86EFAC",
  pet: "#D8B4FE",
  subscription: "#BAE6FD",
  gift: "#FDA4AF",
  study: "#99F6E4",
  beauty: "#F0ABFC",
  work: "#A5B4FC",
  debt: "#FCA5A5",
  transfer: "#CBD5E1",
  other: "#D1D5DB",
};

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
  other: { label: "其他", emoji: "📦" },
};

const DEBT_COLORS = {
  positive: "#6EE7B7",
  negative: "#FDA4AF",
  neutral: "#D1D5DB",
};

/** 折線圖：薰衣草線 + 薄荷填色 */
const GRADIENT_LINE = {
  borderColor: BRAND.lavender,
  backgroundColor: "rgba(196, 181, 253, 0.35)",
  pointBackgroundColor: BRAND.white,
  pointBorderColor: BRAND.lavender,
  pointBorderWidth: 2,
  pointRadius: 5,
  pointHoverRadius: 7,
  tension: 0.45,
  fill: true,
};

/** 成員排行等無分類時的色序 */
const PASTEL_SEQUENCE = [
  BRAND.lavender,
  BRAND.pink,
  BRAND.mint,
  BRAND.yellow,
  BRAND.sky,
  BRAND.coral,
  "#99F6E4",
  "#F9A8D4",
];

/** @deprecated 請用 getCategoryColor */
const BAR_GRADIENT = PASTEL_SEQUENCE;

function baseChartOptions(title) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    layout: { padding: { top: 16, right: 20, bottom: 12, left: 12 } },
    plugins: {
      legend: {
        display: false,
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
        font: { family: FONT_FAMILY, size: 15, weight: "bold" },
        padding: { bottom: 14 },
      },
      datalabels: {
        display: false,
      },
    },
  };
}

function productTooltip() {
  return {
    backgroundColor: BRAND.white,
    titleColor: TEXT.primary,
    bodyColor: TEXT.secondary,
    borderColor: "rgba(45, 58, 92, 0.12)",
    borderWidth: 1,
    padding: 12,
    cornerRadius: 10,
    displayColors: true,
  };
}

function pieDatalabelStyle() {
  return {
    display: true,
    color: BRAND.navy,
    font: { weight: "bold", size: 11, family: FONT_FAMILY },
    textStrokeColor: BRAND.white,
    textStrokeWidth: 3,
  };
}

function doughnutSliceStyle() {
  return {
    borderColor: BRAND.white,
    borderWidth: 3,
    hoverOffset: 8,
    hoverBorderColor: BRAND.navy,
  };
}

function barStyle() {
  return {
    borderRadius: 14,
    borderSkipped: false,
    borderWidth: 0,
  };
}

function getCategoryMeta(key) {
  const k = (key || "other").toLowerCase();
  return CATEGORY_META[k] || { label: k, emoji: "📌" };
}

function getCategoryColor(key, index = 0) {
  const k = (key || "other").toLowerCase();
  if (CATEGORY_COLORS[k]) return CATEGORY_COLORS[k];
  return PASTEL_SEQUENCE[index % PASTEL_SEQUENCE.length];
}

/**
 * @param {string[]} categories
 */
function colorsForCategories(categories) {
  return categories.map((cat, i) => getCategoryColor(cat, i));
}

module.exports = {
  CHART_DEFAULTS,
  FONT_FAMILY,
  BRAND,
  TEXT,
  GRID,
  CATEGORY_COLORS,
  CATEGORY_META,
  DEBT_COLORS,
  GRADIENT_LINE,
  BAR_GRADIENT,
  PASTEL_SEQUENCE,
  baseChartOptions,
  productTooltip,
  pieDatalabelStyle,
  doughnutSliceStyle,
  barStyle,
  getCategoryMeta,
  getCategoryColor,
  colorsForCategories,
};
