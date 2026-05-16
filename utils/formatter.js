/**
 * MoodPay - 訊息格式化（產品語氣）
 */

const { BRAND, pick, formatMoney, REPORT } = require("../services/moodVoice");
const { labelForViewer } = require("../services/actor");
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

function formatChatImageAnalysis(transactions, cfg, viewer) {
  const me = viewer?.selfLabel || cfg.userName || "我";
  const lines = [
    BRAND,
    "  截圖讀心術完成 📷",
    "",
    `  正數＝${cfg.positivePayer} 幫 ${me} 付`,
    `  負數＝${me} 請 ${cfg.positivePayer}`,
    "",
  ];

  let sumPaidForMe = 0;
  let sumIPaid = 0;
  let countPaidForMe = 0;
  let countIPaid = 0;
  const currency = transactions[0]?.currency || "MYR";

  const show = transactions.slice(0, 18);
  for (let i = 0; i < show.length; i++) {
    const tx = show[i];
    const isPositive = tx.relation === "paid_for_me";
    const icon = isPositive ? "➕" : "➖";
    const payer = labelForViewer(tx.payer, viewer);
    const consumer = labelForViewer(tx.consumer, viewer);
    const desc = `${payer} 幫 ${consumer} 付`;

    lines.push(`${i + 1}. ${icon} ${tx.amount} ${tx.currency} ${tx.item}`);
    lines.push(`   → ${desc}`);

    if (isPositive) {
      countPaidForMe += 1;
      sumPaidForMe += tx.amount;
    } else {
      countIPaid += 1;
      sumIPaid += tx.amount;
    }
  }

  if (transactions.length > show.length) {
    lines.push(`…還有 ${transactions.length - show.length} 筆，匯入後一起看`);
  }

  lines.push("");
  lines.push(
    `📗 ${cfg.positivePayer} 幫你付：${countPaidForMe} 筆，共 ${round2(sumPaidForMe)} ${currency}`
  );
  lines.push(
    `📘 你幫 ${cfg.positivePayer} 付：${countIPaid} 筆，共 ${round2(sumIPaid)} ${currency}`
  );

  const net = round2(sumPaidForMe - sumIPaid);
  if (net > 0) {
    lines.push(`💡 粗算你約欠 ${cfg.positivePayer} ${net} ${currency}（未含舊帳）`);
  } else if (net < 0) {
    lines.push(
      `💡 粗算 ${cfg.positivePayer} 約欠你 ${Math.abs(net)} ${currency}（未含舊帳）`
    );
  }

  lines.push("");
  lines.push(`共抓到 ${transactions.length} 筆`);
  lines.push("滿意就回「匯入」，MoodPay 幫你寫進帳本");
  lines.push("不滿意就重傳，不會亂記");

  return lines.join("\n");
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function formatImportDone(count) {
  return pick([
    `好了，${count} 筆都進帳本了 ✨\n/debt 看代墊結算`,
    `匯入完成：${count} 筆\nMoodPay 已幫你記好，/debt 查欠債`,
    `${count} 筆寫進去了～\n想算帳就 /debt`,
  ]);
}

function formatHelp() {
  return [
    `${BRAND} 使用指南`,
    "",
    "📷 傳聊天截圖",
    "  MoodPay 會讀圖，回「匯入」才寫帳",
    "",
    "💬 直接打字記帳",
    "  例：我買了 80 元便當",
    "  例：男友幫我付 25 馬幣火鍋",
    "",
    "🗑️ 刪除",
    "  刪除上一筆 / 刪除 關鍵字 / 刪除 2",
    "",
    "✨ 偷看財務（像 Wrapped）",
    "  /chart     財務偷看報告",
    "  /category  吞錢排行榜（圓餅）",
    "  /monthly   每日燃燒曲線",
    "  /debtchart 欠債長條圖",
    "  /members   花錢戰力榜",
    "",
    "📌 其他",
    "  /debt      代墊結算",
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
  formatChatImageAnalysis,
  formatImportDone,
};
