/**
 * MoodPay - QuickChart 圖表 URL 產生
 * https://quickchart.io/documentation/
 */

const {
  CHART_DEFAULTS,
  TEXT,
  GRID,
  DEBT_COLORS,
  GRADIENT_LINE,
  BAR_GRADIENT,
  baseChartOptions,
  getCategoryMeta,
  getCategoryColor,
} = require("../utils/chartTheme");
const {
  summarizeByCategory,
  filterCurrentMonth,
  calculateTotalExpense,
} = require("./settlement");
const { parseTransactionDate } = require("../utils/date");

const QUICKCHART_BASE = "https://quickchart.io/chart";

/**
 * @param {object} chartConfig - Chart.js config
 * @param {object} [size]
 */
function buildQuickChartUrl(chartConfig, size = {}) {
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
 * 圓餅圖僅顯示百分比（不顯示原始金額數字）
 */
function pieDatalabelsPlugin() {
  return {
    datalabels: {
      display: true,
      color: "#F8FAFC",
      font: { weight: "600", size: 12 },
      textStrokeColor: "rgba(15, 23, 42, 0.5)",
      textStrokeWidth: 2,
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
function generateDashboardBarChart(transactions) {
  const byCategory = summarizeByCategory(transactions);
  let entries = Object.entries(byCategory)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (entries.length === 0) return null;

  const now = new Date();
  const title = `MoodPay Dashboard · ${now.getFullYear()}/${now.getMonth() + 1}`;

  const labels = entries.map(([cat]) => {
    const { label, emoji } = getCategoryMeta(cat);
    return `${emoji} ${label}`;
  });
  const data = entries.map(([, v]) => Math.round(v));
  const colors = entries.map(([cat], i) =>
    cat === "other"
      ? "rgba(100, 116, 139, 0.55)"
      : BAR_GRADIENT[i % BAR_GRADIENT.length]
  );

  const chartConfig = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderRadius: 8,
          borderSkipped: false,
          barThickness: 22,
        },
      ],
    },
    options: {
      ...baseChartOptions(title),
      indexAxis: "y",
      scales: {
        x: {
          ticks: { color: TEXT.muted, font: { size: 10 } },
          grid: { color: GRID.color },
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
          color: TEXT.secondary,
          font: { size: 10 },
          formatter: (v) => `${formatMoney(v)}`,
        },
        tooltip: {
          backgroundColor: "#1E293B",
          titleColor: TEXT.primary,
          bodyColor: TEXT.secondary,
          callbacks: {
            label(ctx) {
              const total = data.reduce((a, b) => a + b, 0);
              const pct = total ? Math.round((ctx.raw / total) * 100) : 0;
              return ` ${formatMoney(ctx.raw)} 元 (${pct}%)`;
            },
          },
        },
      },
    },
  };

  return buildQuickChartUrl(chartConfig, {
    height: 280 + entries.length * 32,
    width: 540,
  });
}

/**
 * /category — 已分類支出圓餅圖（排除 other，避免 94% 灰牆）
 * @param {object[]} transactions
 * @returns {string|null}
 */
function generateCategoryPieChart(transactions) {
  const byCategory = summarizeByCategory(transactions);
  const entries = Object.entries(byCategory)
    .filter(([cat, v]) => v > 0 && cat !== "other")
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) return null;

  const labels = entries.map(([cat]) => {
    const { label, emoji } = getCategoryMeta(cat);
    return `${emoji} ${label}`;
  });
  const data = entries.map(([, v]) => Math.round(v));
  const colors = entries.map(([cat], i) => getCategoryColor(cat, i));
  const total = data.reduce((a, b) => a + b, 0);

  const now = new Date();
  const title = [
    `已分類支出 · ${now.getMonth() + 1}月`,
    `合計 ${formatMoney(total)} 元`,
  ];

  const chartConfig = {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderColor: "#0F172A",
          borderWidth: 2,
          hoverOffset: 10,
          hoverBorderColor: "#E2E8F0",
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
            padding: 16,
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: "rgba(30, 41, 59, 0.95)",
          titleColor: TEXT.primary,
          bodyColor: TEXT.secondary,
          padding: 12,
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

  return buildQuickChartUrl(chartConfig, { height: 400, width: 520 });
}

/**
 * 本月每日支出折線圖
 * @param {object[]} transactions
 */
function generateMonthlyLineChart(transactions) {
  const daily = aggregateDailySpending(transactions);
  if (daily.labels.length === 0) return null;

  const now = new Date();
  const title = `MoodPay · ${now.getFullYear()}/${now.getMonth() + 1} 每日支出`;

  const chartConfig = {
    type: "line",
    data: {
      labels: daily.labels,
      datasets: [
        {
          label: "支出（台幣）",
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
          grid: { color: GRID.color },
        },
        y: {
          ticks: { color: TEXT.secondary },
          grid: { color: GRID.color },
          beginAtZero: true,
        },
      },
      plugins: {
        ...baseChartOptions(title).plugins,
        legend: { display: false },
      },
    },
  };

  return buildQuickChartUrl(chartConfig);
}

/**
 * 欠款／代墊 bar chart
 * @param {Record<string, number>} balances
 */
function generateDebtBarChart(balances) {
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
          borderRadius: 8,
          borderSkipped: false,
        },
      ],
    },
    options: {
      ...baseChartOptions("MoodPay · 欠款／代墊透視"),
      indexAxis: "y",
      scales: {
        x: {
          ticks: { color: TEXT.secondary },
          grid: { color: GRID.color },
        },
        y: {
          ticks: { color: TEXT.primary, font: { size: 12 } },
          grid: { display: false },
        },
      },
      plugins: {
        ...baseChartOptions("MoodPay · 欠款／代墊透視").plugins,
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1E293B",
          callbacks: {
            label(ctx) {
              const v = ctx.raw;
              if (v > 0) return ` 別人欠 TA ${formatMoney(v)} 元`;
              if (v < 0) return ` 欠別人 ${formatMoney(Math.abs(v))} 元`;
              return " 平衡";
            },
          },
        },
      },
    },
  };

  return buildQuickChartUrl(chartConfig, { height: 300 + entries.length * 36 });
}

/**
 * 成員消費比較
 * @param {object[]} transactions
 */
function generateMemberComparisonChart(transactions) {
  const byMember = summarizeByMember(transactions);
  const entries = Object.entries(byMember)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) return null;

  const labels = entries.map(([name]) => name);
  const data = entries.map(([, v]) => Math.round(v));
  const colors = labels.map((_, i) =>
    i === 0 ? "#818CF8" : `hsla(234, 89%, ${68 - i * 8}%, 0.85)`
  );

  const now = new Date();
  const title = `MoodPay · ${now.getFullYear()}/${now.getMonth() + 1} 成員消費`;

  const chartConfig = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "消費金額（台幣）",
          data,
          backgroundColor: colors,
          borderRadius: 10,
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
          grid: { color: GRID.color },
          beginAtZero: true,
        },
      },
      plugins: {
        ...baseChartOptions(title).plugins,
        legend: { display: false },
      },
    },
  };

  return buildQuickChartUrl(chartConfig);
}

/**
 * 依 consumer 統計本月消費（台幣）
 * @param {object[]} transactions
 */
function summarizeByMember(transactions) {
  const totals = {};

  for (const tx of transactions) {
    const amount = tx.twdAmount || tx.amount || 0;
    if (amount <= 0) continue;

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
  const daily = {};

  for (const tx of transactions) {
    const amount = tx.twdAmount || tx.amount || 0;
    if (amount <= 0) continue;

    const d = parseTransactionDate(tx.date);
    let label = "未知";
    if (d) {
      label = `${d.getMonth() + 1}/${d.getDate()}`;
    } else if (tx.date && String(tx.date).length === 8) {
      const s = String(tx.date);
      label = `${parseInt(s.slice(4, 6), 10)}/${parseInt(s.slice(6, 8), 10)}`;
    }

    daily[label] = (daily[label] || 0) + amount;
  }

  const sorted = Object.entries(daily).sort((a, b) => {
    const pa = a[0].split("/").map(Number);
    const pb = b[0].split("/").map(Number);
    return pa[0] - pb[0] || pa[1] - pb[1];
  });

  return {
    labels: sorted.map(([l]) => l),
    values: sorted.map(([, v]) => Math.round(v)),
  };
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
  const now = new Date();
  return {
    monthTx,
    meta: {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      total: calculateTotalExpense(monthTx),
      count: monthTx.length,
    },
  };
}

module.exports = {
  buildQuickChartUrl,
  generateDashboardBarChart,
  generateCategoryPieChart,
  generateMonthlyLineChart,
  generateDebtBarChart,
  generateMemberComparisonChart,
  summarizeByMember,
  aggregateDailySpending,
  getCurrentMonthContext,
};
