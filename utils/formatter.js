/**
 * MoodPay - 訊息格式化（產品語氣）
 */

const { BRAND, formatMoney, REPORT } = require("../services/moodVoice");
const { simplifyDebts } = require("../services/settlement");
const { formatDateTimeForDisplay } = require("./date");

function formatDebtEdgeLine(debtor, creditor, amount) {
  const money = formatMoney(amount);
  if (debtor === "我") {
    return `  你要還給 ${creditor}　${money} 元`;
  }
  if (creditor === "我") {
    return `  ${debtor} 要還你　${money} 元`;
  }
  return `  ${debtor} → ${creditor}　${money} 元`;
}

function formatDebtSettlementBody(balances) {
  const edges = simplifyDebts(balances);
  if (edges.length === 0) return null;
  return edges
    .map(({ debtor, creditor, amount }) =>
      formatDebtEdgeLine(debtor, creditor, amount)
    )
    .join("\n");
}

function formatDebtReport(balances) {
  const body = formatDebtSettlementBody(balances);
  if (!body) {
    return "🕊️ 目前沒有欠債修羅場\n大家和平相處，MoodPay 很欣慰";
  }

  return [BRAND, `  ${REPORT.debt}`, "", body].join("\n");
}

function formatSummary(total, byCategory) {
  const lines = [
    BRAND,
    "  快速偷看",
    "",
    `  本月燃燒　${formatMoney(total)} 元`,
  ];

  const cats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  if (cats.length > 0) {
    lines.push("", "  吞錢排行：");
    for (const [cat, amount] of cats) {
      lines.push(`    · ${cat}　${formatMoney(amount)} 元`);
    }
  }

  return lines.join("\n");
}

function formatMonthSummary(total, count) {
  const now = new Date();
  const month = now.getMonth() + 1;
  return [
    BRAND,
    `  ${now.getFullYear()} 年 ${month} 月 · 簡短版`,
    "",
    `  本月燃燒　${formatMoney(total)} 元`,
    `  出手次數　${count} 次`,
  ].join("\n");
}

function formatHelp() {
  return [
    `${BRAND} 使用指南`,
    "",
    "💬 直接打字記帳",
    "  例：我買了 80 元便當",
    "  例：男友幫我付 25 馬幣火鍋（代墊要還）",
    "  例：阿嬤塞 3000 進錢包（收入）",
    "  例：被請吃 buffet 不用付（請客不算債）",
    "",
    "🗑️ 刪除",
    "  刪除上一筆 / 刪除 關鍵字 / 刪除 2",
    "",
    "✨ 偷看財務（僅你自己記的帳）",
    "  /chart     財務偷看報告",
    "  /category  吞錢排行榜（圓餅）",
    "  /monthly   每日燃燒曲線",
    "  /debtchart 你的代墊長條圖",
    "  /members   群組戰力（每人自己記的）",
    "",
    "📌 其他",
    "  /debt      你的代墊結算",
    "  /summary   本月文案速覽",
    "  /month     本月簡短版",
    "  /undo /delete",
    "",
    "🌏 TWD · MYR · USD · JPY · KRW",
  ].join("\n");
}

function formatError(message) {
  return `MoodPay 剛絆了一下 🫠\n${message}\n\n/help 叫我怎麼用`;
}

function formatDeletePickList(matches, keyword) {
  const lines = [
    `「${keyword}」找到 ${matches.length} 筆，選一個送走：`,
    "",
  ];

  for (const m of matches) {
    const dateShort = m.date ? formatDateTimeForDisplay(m.date) : "";
    lines.push(
      `${m.index}) ${m.item} ${m.amount} ${m.currency}${dateShort ? ` · ${dateShort}` : ""}`
    );
  }

  lines.push("", "例：刪除 2");
  return lines.join("\n");
}

function formatZeroAmountWarning() {
  return [
    "這筆金額 MoodPay 讀不出來（或是 0）",
    "試試：測試吐司 80 元",
    "真的是免費的話，請註明「免費」",
  ].join("\n");
}

module.exports = {
  formatDebtReport,
  formatDebtSettlementBody,
  formatSummary,
  formatMonthSummary,
  formatHelp,
  formatError,
  formatDeletePickList,
  formatZeroAmountWarning,
};
