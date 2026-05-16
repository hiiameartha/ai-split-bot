/**
 * MoodPay - 圖表配套產品感文案
 */

const { getCategoryMeta } = require("../utils/chartTheme");

const INSIGHTS = {
  travel: ["你們最近不是在生活，是在燃燒里程數 ✈️", "護照比錢包更忙的一個月"],
  food: ["胃袋永遠是 true MVP 🍜", "人生苦短，先吃再說"],
  drink: ["手搖杯治百病，錢包治手搖 🧋", "今日水分來自糖分與快樂"],
  shopping: ["購物車比記憶力更可靠 🛍️", "買完才想起要存錢"],
  entertainment: ["娛樂預算：快樂優先 🎮", "今晚的 KPI 是開心"],
  grocery: ["冰箱滿了，錢包瘦了 🛒", "生活必需品，不必要地貴"],
  transport: ["不是在移動，是在付移動費 🚗", "里程數換來的都市生存"],
  other: ["有些錢花出去，連分類都想逃避 💸", "神秘支出，神秘到不想看"],
};

/**
 * /chart — Dashboard 總覽文案
 * @param {object[]} monthTx
 * @param {Record<string, number>} byCategory
 * @param {{ year: number, month: number, total: number, count: number }} meta
 */
function formatDashboardSummary(monthTx, byCategory, meta) {
  const entries = sortEntries(byCategory);
  if (entries.length === 0) {
    return "📊 本月尚無資料\n記一筆再開 Dashboard～";
  }

  const otherAmt = byCategory.other || 0;
  const categorized = meta.total - otherAmt;
  const otherPct = meta.total > 0 ? Math.round((otherAmt / meta.total) * 100) : 0;
  const dailyAvg =
    meta.count > 0 ? Math.round(meta.total / Math.max(daysInMonth(meta), 1)) : 0;
  const perTx = meta.count > 0 ? Math.round(meta.total / meta.count) : 0;

  const lines = [
    "✨ MoodPay Dashboard",
    "─────────────",
    `📅 ${meta.year} 年 ${meta.month} 月`,
    "",
    `💰 本月總支出　${formatMoney(meta.total)} 元`,
    `📝 交易筆數　　　${meta.count} 筆`,
    `📆 日均支出　　　${formatMoney(dailyAvg)} 元`,
    `🧾 每筆平均　　　${formatMoney(perTx)} 元`,
    "",
    "── 分類佔比 ──",
  ];

  for (const [cat, amount] of entries.slice(0, 6)) {
    lines.push(progressLine(cat, amount, meta.total));
  }

  if (otherPct >= 40) {
    lines.push("");
    lines.push(`⚠️ 待分類 ${otherPct}%（建議新帳目會自動帶 category）`);
    const topItems = topUncategorizedItems(monthTx, 3);
    if (topItems.length) {
      lines.push("待分類大戶：");
      topItems.forEach((t) => lines.push(`  · ${t.item} ${formatMoney(t.amount)} 元`));
    }
  }

  const topCat = entries.find(([c]) => c !== "other") || entries[0];
  if (topCat && topCat[0] !== "other") {
    const { emoji, label } = getCategoryMeta(topCat[0]);
    lines.push("");
    lines.push(`🏆 已分類冠軍：${emoji} ${label}`);
    lines.push(pickQuip(INSIGHTS[topCat[0]] || INSIGHTS.other));
  }

  lines.push("");
  lines.push("📎 /category 看「已分類」圓餅 · /monthly 看趨勢");

  return lines.join("\n");
}

/**
 * /category — 分類深度分析
 * @param {object[]} monthTx
 * @param {Record<string, number>} byCategory
 * @param {{ year: number, month: number, total: number, count: number }} meta
 */
function formatCategoryDeepSummary(monthTx, byCategory, meta) {
  const entries = sortEntries(byCategory);
  if (entries.length === 0) {
    return "🏷️ 本月尚無分類資料";
  }

  const otherAmt = byCategory.other || 0;
  const categorized = meta.total - otherAmt;
  const catPct =
    meta.total > 0 ? Math.round((categorized / meta.total) * 100) : 0;

  const lines = [
    "🏷️ 分類深度分析",
    "─────────────",
    `📅 ${meta.year} 年 ${meta.month} 月`,
    "",
    `✅ 已分類　${formatMoney(categorized)} 元（${catPct}%）`,
    `⬜ 待分類　${formatMoney(otherAmt)} 元（${100 - catPct}%）`,
    "",
    "── 已分類明細 ──",
  ];

  const nonOther = entries.filter(([c]) => c !== "other");
  if (nonOther.length === 0) {
    lines.push("（本月尚無已分類支出，圓餅圖無法顯示）");
    lines.push("新記帳會自動帶 food / travel 等標籤");
  } else {
    const catTotal = categorized || 1;
    for (const [cat, amount] of nonOther.slice(0, 8)) {
      const { label, emoji } = getCategoryMeta(cat);
      const pct = Math.round((amount / catTotal) * 100);
      lines.push(`${emoji} ${label}　${formatMoney(amount)}　${pct}%`);
    }
  }

  const topTags = summarizeTopTags(monthTx, 5);
  if (topTags.length) {
    lines.push("");
    lines.push("── 熱門 tags ──");
    topTags.forEach(([tag, n]) => lines.push(`  #${tag}（${n} 次）`));
  }

  if (otherAmt > 0) {
    lines.push("");
    lines.push("── 待分類 Top 項目 ──");
    topUncategorizedItems(monthTx, 5).forEach((t, i) => {
      lines.push(`${i + 1}. ${t.item}　${formatMoney(t.amount)} 元`);
    });
  }

  const hero = nonOther[0];
  if (hero) {
    const { emoji, label } = getCategoryMeta(hero[0]);
    lines.push("");
    lines.push(`本月已分類支出王：${emoji} ${label}`);
    lines.push(pickQuip(INSIGHTS[hero[0]] || INSIGHTS.other));
  }

  lines.push("");
  lines.push("📎 圓餅圖僅含「已分類」支出（不含待分類）");

  return lines.join("\n");
}

/** @deprecated 使用 formatDashboardSummary 或 formatCategoryDeepSummary */
function formatCategoryProductSummary(byCategory, meta) {
  return formatDashboardSummary([], byCategory, meta);
}

function progressLine(cat, amount, total) {
  const { label, emoji } = getCategoryMeta(cat);
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  const bar = renderBar(pct);
  return `${emoji} ${label} ${bar} ${pct}%`;
}

function renderBar(pct) {
  const filled = Math.min(10, Math.round(pct / 10));
  return "▓".repeat(filled) + "░".repeat(10 - filled);
}

function sortEntries(byCategory) {
  return Object.entries(byCategory)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
}

function topUncategorizedItems(monthTx, limit) {
  return monthTx
    .filter((tx) => (tx.category || "other").toLowerCase() === "other")
    .map((tx) => ({
      item: tx.item || "未命名",
      amount: tx.twdAmount || tx.amount || 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

function summarizeTopTags(monthTx, limit) {
  const counts = {};
  for (const tx of monthTx) {
    const tags = Array.isArray(tx.tags)
      ? tx.tags
      : String(tx.tags || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
    for (const tag of tags) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function daysInMonth(meta) {
  return new Date(meta.year, meta.month, 0).getDate();
}

function formatDebtChartSummary(balances) {
  const entries = Object.entries(balances);
  if (entries.length === 0) {
    return "💸 目前沒有欠款紀錄\n大家和平相處中 🎉";
  }

  const lines = ["💸 欠款透視", "─────────────"];
  const sorted = [...entries].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  for (const [name, balance] of sorted) {
    if (balance > 0) {
      lines.push(`✅ ${name}：別人欠 TA ${formatMoney(balance)} 元`);
    } else if (balance < 0) {
      lines.push(`😅 ${name}：欠別人 ${formatMoney(Math.abs(balance))} 元`);
    }
  }
  lines.push("─────────────");
  lines.push("（綠=應收 · 紅=應付）");
  return lines.join("\n");
}

function formatMemberChartSummary(byMember, meta) {
  const entries = Object.entries(byMember)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return "👥 本月尚無成員消費資料";
  }

  const lines = [
    "👥 成員消費排行",
    "─────────────",
    `📅 ${meta.year} 年 ${meta.month} 月`,
    "",
  ];

  entries.forEach(([name, amount], i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "▫️";
    lines.push(`${medal} ${name}：${formatMoney(amount)} 元`);
  });

  lines.push("");
  lines.push(`🏆 本月花最多：${entries[0][0]}`);

  return lines.join("\n");
}

function formatMonthlyChartSummary(daily, meta) {
  if (!daily.values.length) {
    return "📈 本月尚無每日支出資料";
  }

  const max = Math.max(...daily.values);
  const maxIdx = daily.values.indexOf(max);
  const peakDay = daily.labels[maxIdx] || "—";

  return [
    "📈 每日支出趨勢",
    "─────────────",
    `📅 ${meta.year} 年 ${meta.month} 月`,
    `💰 本月 ${formatMoney(meta.total)} 元`,
    "",
    `🔥 高峰日：${peakDay}（${formatMoney(max)} 元）`,
    "波動越大，代表生活越精彩（或越失控）📉📈",
  ].join("\n");
}

function formatMoney(n) {
  return Math.round(n).toLocaleString("zh-TW");
}

function pickQuip(list) {
  return list[Math.floor(Math.random() * list.length)];
}

module.exports = {
  formatDashboardSummary,
  formatCategoryDeepSummary,
  formatCategoryProductSummary,
  formatDebtChartSummary,
  formatMemberChartSummary,
  formatMonthlyChartSummary,
};
