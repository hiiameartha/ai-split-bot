/**
 * MoodPay - 圖表配套產品感文案
 */

const { getCategoryMeta } = require("../utils/chartTheme");
const { formatDebtSettlementBody } = require("../utils/formatter");
const {
  BRAND,
  REPORT,
  analyzeSpendingMood,
  pickMoodHook,
  pickCategoryInsight,
  formatBrandHeader,
  formatKpiBlock,
  formatMoney,
  pick,
} = require("./moodVoice");

function actionFooter(lines) {
  return ["", ...lines.map((l) => `  ${l}`)].join("\n");
}

/**
 * /chart — 財務偷看報告
 */
function formatDashboardSummary(monthTx, byCategory, meta) {
  const entries = sortEntries(byCategory);
  if (entries.length === 0) {
    return `${BRAND}\n  還沒開帳呢\n\n隨便記一筆，你的 Wrapped 就會長出來 ✨`;
  }

  const mood = analyzeSpendingMood(meta, byCategory, monthTx);
  const lines = [
    ...formatBrandHeader(REPORT.wrapped, meta, pickMoodHook(mood)),
    "",
    ...formatKpiBlock(meta),
    "",
    REPORT.category,
  ];

  for (const [cat, amount] of entries.slice(0, 6)) {
    lines.push(progressLine(cat, amount, meta.total));
  }

  if (mood.otherPct >= 35) {
    lines.push("");
    lines.push(
      `! 「其他」占了 ${mood.otherPct}%　下次記清楚一點，MoodPay 好幫你吐槽`
    );
    const topItems = topOtherItems(monthTx, 3);
    if (topItems.length) {
      lines.push("  神秘消費前三名：");
      topItems.forEach((t) =>
        lines.push(`    · ${t.item}　${formatMoney(t.amount)} 元`)
      );
    }
  }

  const topCat = entries.find(([c]) => c !== "other") || entries[0];
  if (topCat && topCat[0] !== "other") {
    const { emoji, label } = getCategoryMeta(topCat[0]);
    lines.push("");
    lines.push(`★ 本月吞錢冠軍　${emoji} ${label}`);
    lines.push(`  ${pickCategoryInsight(topCat[0])}`);
  }

  lines.push(
    actionFooter([
      "/category　看圓餅怎麼吃錢",
      "/monthly　看哪天最燒",
    ])
  );

  return lines.join("\n");
}

/**
 * /category — 分類深度
 */
function formatCategoryDeepSummary(monthTx, byCategory, meta) {
  const entries = sortEntries(byCategory);
  if (entries.length === 0) {
    return `${BRAND}\n  ${REPORT.category}\n\n本月還沒什麼可分析的，先記幾筆吧～`;
  }

  const mood = analyzeSpendingMood(meta, byCategory, monthTx);
  const otherAmt = byCategory.other || 0;
  const categorized = meta.total - otherAmt;
  const catPct =
    meta.total > 0 ? Math.round((categorized / meta.total) * 100) : 0;

  const lines = [
    ...formatBrandHeader(REPORT.category, meta, pickMoodHook(mood)),
    "",
    `  有分類的　${formatMoney(categorized)} 元（${catPct}%）`,
    `  其他　${formatMoney(otherAmt)} 元（${100 - catPct}%）`,
    "",
    "已分類明細",
  ];

  const nonOther = entries.filter(([c]) => c !== "other");
  if (nonOther.length === 0) {
    lines.push("  圓餅還長不出來，先讓 MoodPay 多記幾筆有分類的花費吧");
  } else {
    const catTotal = categorized || 1;
    for (const [cat, amount] of nonOther.slice(0, 8)) {
      const { label, emoji } = getCategoryMeta(cat);
      const pct = Math.round((amount / catTotal) * 100);
      lines.push(`  ${emoji} ${label}　${formatMoney(amount)}　${pct}%`);
    }
  }

  const topTags = summarizeTopTags(monthTx, 5);
  if (topTags.length) {
    lines.push("");
    lines.push("話題標籤（你們的消費關鍵字）");
    topTags.forEach(([tag, n]) => lines.push(`    #${tag}（${n} 次）`));
  }

  if (otherAmt > 0) {
    lines.push("");
    lines.push("其他類神秘消費");
    topOtherItems(monthTx, 5).forEach((t, i) => {
      lines.push(`  ${i + 1}. ${t.item}　${formatMoney(t.amount)} 元`);
    });
  }

  const hero = nonOther[0];
  if (hero) {
    const { emoji, label } = getCategoryMeta(hero[0]);
    lines.push("");
    lines.push(`★ 分類榜一　${emoji} ${label}`);
    lines.push(`  ${pickCategoryInsight(hero[0])}`);
  }

  lines.push(actionFooter(["圓餅不含「其他」— 專看有故事的消費"]));

  return lines.join("\n");
}

function formatCategoryProductSummary(byCategory, meta) {
  return formatDashboardSummary([], byCategory, meta);
}

function progressLine(cat, amount, total) {
  const { label, emoji } = getCategoryMeta(cat);
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return `  ${emoji} ${label}　${formatMoney(amount)} 元（${pct}%）`;
}

function sortEntries(byCategory) {
  return Object.entries(byCategory)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
}

function topOtherItems(monthTx, limit) {
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

function formatDebtChartSummary(balances) {
  const body = formatDebtSettlementBody(balances);
  if (!body) {
    return `${BRAND}\n  ${REPORT.debt}\n\n目前沒有欠債修羅場，大家和平相處 🕊️`;
  }

  return [
    ...formatBrandHeader(REPORT.debt, {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
    }),
    "",
    body,
  ].join("\n");
}

function formatMemberChartSummary(byMember, meta) {
  const entries = Object.entries(byMember)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return `${BRAND}\n  ${REPORT.members}\n\n這個月還沒人出手，群組好和平。`;
  }

  const lines = [...formatBrandHeader(REPORT.members, meta), ""];

  entries.forEach(([name, amount], i) => {
    const rank = i === 0 ? "①" : i === 1 ? "②" : i === 2 ? "③" : "·";
    lines.push(`  ${rank} ${name}　燒了 ${formatMoney(amount)} 元`);
  });

  lines.push("");
  lines.push(`★ 本月火力王　${entries[0][0]}`);

  return lines.join("\n");
}

function formatMonthlyChartSummary(daily, meta) {
  if (!daily.values.length) {
    return `${BRAND}\n  ${REPORT.monthly}\n\n這個月還沒畫出曲線，先記幾筆吧。`;
  }

  const max = Math.max(...daily.values);
  const maxIdx = daily.values.indexOf(max);
  const peakDay = daily.labels[maxIdx] || "—";
  const mood = analyzeSpendingMood(meta, {}, []);

  return [
    ...formatBrandHeader(REPORT.monthly, meta, pickMoodHook(mood)),
    "",
    ...formatKpiBlock(meta),
    "",
    "最燒的一天",
    `  ${peakDay}　一口氣 ${formatMoney(max)} 元`,
    pick([
      "  波動大代表生活有在過（或失控）",
      "  高峰日：錢包的最黑暗時刻",
      "  曲線起伏 = 人間真實",
    ]),
  ].join("\n");
}

module.exports = {
  formatDashboardSummary,
  formatCategoryDeepSummary,
  formatCategoryProductSummary,
  formatDebtChartSummary,
  formatMemberChartSummary,
  formatMonthlyChartSummary,
};
