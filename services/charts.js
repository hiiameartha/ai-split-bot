/**
 * MoodPay - QuickChart 圖表 URL 產生
 * https://quickchart.io/documentation/
 */

const axios = require("axios");
const {
  CHART_DEFAULTS,
  TEXT,
  GRID,
  DEBT_COLORS,
  GRADIENT_LINE,
  PASTEL_SEQUENCE,
  baseChartOptions,
  productTooltip,
  pieDatalabelStyle,
  doughnutSliceStyle,
  barStyle,
  getCategoryMeta,
  getCategoryColor,
  colorsForCategories,
} = require("../utils/chartTheme");
const { getSignedTransactionAmount } = require("./parseHints");
const { summarizeLedger, aggregateDailyExpense } = require("./ledger");
const { filterCurrentMonth } = require("./settlement");
const { parseTransactionDate, formatChartDayLabel } = require("../utils/date");
const {
  relabelTotalsForViewer,
  filterTransactionsForViewer,
} = require("./actor");

const QUICKCHART_BASE = "https://quickchart.io/chart";
const QUICKCHART_CREATE = "https://quickchart.io/chart/create";

/** LINE 圖片 originalContentUrl 上限約 2000 字元 */
const LINE_IMAGE_URL_MAX = 2000;

/**
 * GET 長網址（備援）
 * @param {object} chartConfig
 * @param {object} [size]
 */
function buildQuickChartGetUrl(chartConfig, size = {}) {
  const w = size.width || CHART_DEFAULTS.width;
  const h = size.height || CHART_DEFAULTS.height;
  const bkg = (size.backgroundColor || CHART_DEFAULTS.backgroundColor).replace(
    "#",
    ""
  );

  const params = new URLSearchParams();
  params.set("c", JSON.stringify(chartConfig));
  params.set("w", String(w));
  params.set("h", String(h));
  params.set("bkg", bkg);
  params.set("f", CHART_DEFAULTS.format);
  params.set("devicePixelRatio", String(CHART_DEFAULTS.devicePixelRatio));

  return `${QUICKCHART_BASE}?${params.toString()}`;
}

/**
 * 優先 POST 短網址，避免 LINE 400（URL 過長）
 * @param {object} chartConfig
 * @param {object} [size]
 * @returns {Promise<string|null>}
 */
async function resolveQuickChartUrl(chartConfig, size = {}) {
  const w = size.width || CHART_DEFAULTS.width;
  const h = size.height || CHART_DEFAULTS.height;
  const backgroundColor = size.backgroundColor || CHART_DEFAULTS.backgroundColor;

  try {
    const res = await axios.post(
      QUICKCHART_CREATE,
      {
        chart: chartConfig,
        width: w,
        height: h,
        backgroundColor,
        format: CHART_DEFAULTS.format,
        devicePixelRatio: CHART_DEFAULTS.devicePixelRatio,
      },
      { timeout: 20000, headers: { "Content-Type": "application/json" } }
    );

    const url = res.data?.url;
    if (res.data?.success && url && url.length <= LINE_IMAGE_URL_MAX) {
      console.log("[Chart] 短網址 OK", url.length, "字元");
      return url;
    }
  } catch (err) {
    console.warn("[Chart] 短網址建立失敗:", err.message);
  }

  const fallback = buildQuickChartGetUrl(chartConfig, size);
  if (fallback.length <= LINE_IMAGE_URL_MAX) {
    console.log("[Chart] 使用 GET 網址", fallback.length, "字元");
    return fallback;
  }

  console.warn("[Chart] 圖表 URL 過長，略過圖片", fallback.length);
  return null;
}

/** 圖表軸標籤（分類 emoji + 名稱） */
function chartCategoryLabel(cat) {
  const { label, emoji } = getCategoryMeta(cat);
  return `${emoji} ${label}`;
}

/**
 * 圓餅圖僅顯示百分比（不顯示原始金額數字）
 */
function pieDatalabelsPlugin() {
  return {
    datalabels: {
      ...pieDatalabelStyle(),
      formatter: (value, ctx) => {
        const data = ctx.chart.data.datasets[0].data;
        const total = data.reduce((a, b) => a + b, 0);
        if (!total || !value) return "";
        const pct = Math.round((value / total) * 100);
        return pct >= 5 ? `${pct}%` : "";
      },
    },
  };
}

/**
 * /chart — Dashboard 橫向長條圖（全部分類，含待分類）
 * @param {object[]} transactions
 */
async function generateDashboardBarChart(transactions) {
  const byCategory = summarizeLedger(transactions).byCategoryExpense;
  let entries = Object.entries(byCategory)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (entries.length === 0) return null;

  const now = new Date();
  const title = `✨ MoodPay 財務偷看 ${now.getFullYear()}/${now.getMonth() + 1}`;

  const labels = entries.map(([cat]) => chartCategoryLabel(cat));
  const data = entries.map(([, v]) => Math.round(v));
  const cats = entries.map(([cat]) => cat);
  const colors = colorsForCategories(cats);

  const chartConfig = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "本月燃燒（台幣）",
          data,
          backgroundColor: colors,
          ...barStyle(),
          barThickness: 24,
        },
      ],
    },
    options: {
      ...baseChartOptions(title),
      indexAxis: "y",
      scales: {
        x: {
          ticks: { color: TEXT.muted, font: { size: 10 } },
          grid: { color: GRID.color, drawBorder: false },
          beginAtZero: true,
        },
        y: {
          ticks: { color: TEXT.primary, font: { size: 12, weight: "500" } },
          grid: { display: false },
        },
      },
      plugins: {
        ...baseChartOptions(title).plugins,
        legend: { display: false },
        datalabels: {
          display: true,
          anchor: "end",
          align: "end",
          color: TEXT.primary,
          font: { size: 10, weight: "600" },
          formatter: (v) => `${formatMoney(v)}`,
        },
        tooltip: {
          ...productTooltip(),
          callbacks: {
            label(ctx) {
              const total = data.reduce((a, b) => a + b, 0);
              const pct = total ? Math.round((ctx.raw / total) * 100) : 0;
              return ` ${formatMoney(ctx.raw)} 元 · ${pct}%`;
            },
          },
        },
      },
    },
  };

  return resolveQuickChartUrl(chartConfig, {
    height: 280 + entries.length * 32,
    width: 540,
  });
}

/**
 * /category — 已分類支出圓餅圖（排除 other，避免 94% 灰牆）
 * @param {object[]} transactions
 * @returns {Promise<string|null>}
 */
async function generateCategoryPieChart(transactions) {
  const byCategory = summarizeLedger(transactions).byCategoryExpense;
  const entries = Object.entries(byCategory)
    .filter(([cat, v]) => v > 0 && cat !== "other")
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) return null;

  const labels = entries.map(([cat]) => chartCategoryLabel(cat));
  const data = entries.map(([, v]) => Math.round(v));
  const colors = entries.map(([cat], i) => getCategoryColor(cat, i));
  const total = data.reduce((a, b) => a + b, 0);

  const now = new Date();
  const title = `🍰 吞錢排行 ${now.getMonth()}月 · ${formatMoney(total)} 元`;

  const chartConfig = {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          label: "已分類",
          data,
          backgroundColor: colors,
          ...doughnutSliceStyle(),
        },
      ],
    },
    options: {
      ...baseChartOptions(title),
      cutout: "62%",
      plugins: {
        ...baseChartOptions(title).plugins,
        ...pieDatalabelsPlugin(),
        legend: {
          display: true,
          position: "bottom",
          labels: {
            color: TEXT.secondary,
            font: { size: 11 },
            padding: 14,
            usePointStyle: true,
            pointStyle: "circle",
          },
        },
        tooltip: {
          ...productTooltip(),
          callbacks: {
            label(ctx) {
              const v = ctx.raw;
              const pct = total ? Math.round((v / total) * 100) : 0;
              return ` ${formatMoney(v)} 元 · ${pct}%`;
            },
          },
        },
      },
    },
  };

  return resolveQuickChartUrl(chartConfig, { height: 400, width: 520 });
}

/**
 * 本月每日支出折線圖
 * @param {object[]} transactions
 */
async function generateMonthlyLineChart(transactions) {
  const daily = aggregateDailySpending(transactions);
  if (daily.labels.length === 0) return null;

  const now = new Date();
  const title = `📈 每日燃燒曲線 · ${now.getFullYear()}/${now.getMonth() + 1}`;

  const chartConfig = {
    type: "line",
    data: {
      labels: daily.labels,
      datasets: [
        {
          label: "當日燃燒（台幣）",
          data: daily.values,
          ...GRADIENT_LINE,
          borderWidth: 2.5,
        },
      ],
    },
    options: {
      ...baseChartOptions(title),
      scales: {
        x: {
          ticks: { color: TEXT.secondary, maxRotation: 45, font: { size: 10 } },
          grid: { color: GRID.color, drawBorder: false },
        },
        y: {
          ticks: { color: TEXT.secondary },
          grid: { color: GRID.color, drawBorder: false },
          beginAtZero: true,
        },
      },
      plugins: {
        ...baseChartOptions(title).plugins,
        legend: { display: false },
        tooltip: productTooltip(),
      },
    },
  };

  return resolveQuickChartUrl(chartConfig);
}

/**
 * 欠款／代墊 bar chart
 * @param {Record<string, number>} balances
 */
async function generateDebtBarChart(balances) {
  const entries = Object.entries(balances).filter(([, v]) => v !== 0);
  if (entries.length === 0) return null;

  entries.sort((a, b) => b[1] - a[1]);

  const labels = entries.map(([name]) => name);
  const data = entries.map(([, v]) => v);
  const colors = data.map((v) =>
    v > 0 ? DEBT_COLORS.positive : v < 0 ? DEBT_COLORS.negative : DEBT_COLORS.neutral
  );

  const chartConfig = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "淨額（台幣）",
          data,
          backgroundColor: colors,
          ...barStyle(),
        },
      ],
    },
    options: {
      ...baseChartOptions("🧋 代墊結算"),
      indexAxis: "y",
      scales: {
        x: {
          ticks: { color: TEXT.secondary },
          grid: { color: GRID.color, drawBorder: false },
        },
        y: {
          ticks: { color: TEXT.primary, font: { size: 12 } },
          grid: { display: false },
        },
      },
      plugins: {
        ...baseChartOptions("🧋 代墊結算").plugins,
        legend: { display: false },
        tooltip: {
          ...productTooltip(),
          callbacks: {
            label(ctx) {
              const v = ctx.raw;
              if (v > 0) return ` 應收 ${formatMoney(v)} 元`;
              if (v < 0) return ` 應付 ${formatMoney(Math.abs(v))} 元`;
              return " 平衡";
            },
          },
        },
      },
    },
  };

  return resolveQuickChartUrl(chartConfig, { height: 300 + entries.length * 36 });
}

/**
 * 成員消費比較
 * @param {object[]} transactions
 */
async function generateMemberComparisonChart(transactions, viewer) {
  const byMember = relabelTotalsForViewer(
    summarizeByMember(transactions),
    viewer,
    transactions
  );
  const entries = Object.entries(byMember)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) return null;

  const memberEmojis = ["🥇", "🥈", "🥉", "👤", "👤", "👤", "👤", "👤"];
  const labels = entries.map(([name], i) => {
    const medal = memberEmojis[i] || "·";
    return i < 3 ? `${medal} ${name}` : `👤 ${name}`;
  });
  const data = entries.map(([, v]) => Math.round(v));
  const colors = labels.map((_, i) => PASTEL_SEQUENCE[i % PASTEL_SEQUENCE.length]);

  const now = new Date();
  const title = `🏆 花錢戰力榜 · ${now.getFullYear()}/${now.getMonth() + 1}`;

  const chartConfig = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "消費金額（台幣）",
          data,
          backgroundColor: colors,
          ...barStyle(),
        },
      ],
    },
    options: {
      ...baseChartOptions(title),
      scales: {
        x: {
          ticks: { color: TEXT.primary },
          grid: { display: false },
        },
        y: {
          ticks: { color: TEXT.secondary },
          grid: { color: GRID.color, drawBorder: false },
          beginAtZero: true,
        },
      },
      plugins: {
        ...baseChartOptions(title).plugins,
        legend: { display: false },
        tooltip: productTooltip(),
      },
    },
  };

  return resolveQuickChartUrl(chartConfig);
}

/**
 * 依 consumer 統計本月消費（台幣）
 * @param {object[]} transactions
 */
function summarizeByMember(transactions) {
  const totals = {};

  for (const tx of transactions) {
    const amount = getSignedTransactionAmount(tx);
    if (amount === 0) continue;

    const relation = tx.relation || "self";

    if (relation === "shared") {
      const parts = getSharedMembers(tx);
      const share = amount / parts.length;
      for (const name of parts) {
        totals[name] = (totals[name] || 0) + share;
      }
    } else {
      const who = tx.consumer || tx.payer || "我";
      totals[who] = (totals[who] || 0) + amount;
    }
  }

  for (const k of Object.keys(totals)) {
    totals[k] = Math.round(totals[k]);
  }

  return totals;
}

/**
 * @param {object} tx
 */
function getSharedMembers(tx) {
  if (tx.sharedWith?.length) {
    return [...new Set(tx.sharedWith.map(String))];
  }
  return [...new Set([tx.payer, tx.consumer].filter(Boolean).map(String))];
}

/**
 * @param {object[]} transactions
 */
function aggregateDailySpending(transactions) {
  return aggregateDailyExpense(transactions);
}

function formatMoney(n) {
  return Math.round(n).toLocaleString("zh-TW");
}

/**
 * 本月圖表上下文
 * @param {object[]} allTransactions
 */
function getCurrentMonthContext(allTransactions) {
  const monthTx = filterCurrentMonth(allTransactions);
  return buildMonthContext(monthTx);
}

/**
 * 個人本月（僅自己記帳的列，同 chatId）
 * @param {object[]} allTransactions
 * @param {object} actor
 */
function getPersonalMonthContext(allTransactions, actor) {
  const { getPersonalMonthLedger } = require("./ledger");
  return getPersonalMonthLedger(allTransactions, actor);
}

/**
 * @param {object[]} monthTx
 * @param {object} [extraMeta]
 */
function buildMonthContext(monthTx, extraMeta = {}) {
  const now = new Date();
  const actor = extraMeta.actor;
  const scopeLabel =
    extraMeta.personalScope && actor?.displayName
      ? `你的帳本 · ${actor.displayName}`
      : undefined;
  const ledger = summarizeLedger(monthTx);

  return {
    monthTx,
    meta: {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      ...ledger,
      personalScope: Boolean(extraMeta.personalScope),
      scopeLabel,
    },
  };
}

module.exports = {
  buildQuickChartGetUrl,
  resolveQuickChartUrl,
  LINE_IMAGE_URL_MAX,
  generateDashboardBarChart,
  generateCategoryPieChart,
  generateMonthlyLineChart,
  generateDebtBarChart,
  generateMemberComparisonChart,
  summarizeByMember,
  aggregateDailySpending,
  getCurrentMonthContext,
  getPersonalMonthContext,
};
