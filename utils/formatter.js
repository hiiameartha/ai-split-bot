/**
 * MoodPay - 訊息格式化工具
 */

function formatDebtReport(balances) {
  const entries = Object.entries(balances);
  if (entries.length === 0) {
    return "🎉 目前沒有欠款紀錄，大家和平相處中！";
  }

  const lines = ["💸 欠款統計", "─────────────"];

  for (const [name, balance] of entries) {
    if (balance > 0) {
      lines.push(`✅ ${name}：別人欠你 ${balance} 元`);
    } else if (balance < 0) {
      lines.push(`😅 ${name}：你欠別人 ${Math.abs(balance)} 元`);
    }
  }

  lines.push("─────────────");
  lines.push("（正數=別人欠你，負數=你欠別人）");
  return lines.join("\n");
}

function formatSummary(total, byCategory) {
  const lines = ["📊 總支出摘要", "─────────────", `💰 總計：${total} 元（台幣）`];

  const cats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  if (cats.length > 0) {
    lines.push("", "📂 分類明細：");
    for (const [cat, amount] of cats) {
      lines.push(`  • ${cat}：${amount} 元`);
    }
  }

  return lines.join("\n");
}

function formatMonthSummary(total, count) {
  const now = new Date();
  const month = now.getMonth() + 1;
  return [
    `📅 ${now.getFullYear()} 年 ${month} 月支出`,
    "─────────────",
    `💰 本月總計：${total} 元（台幣）`,
    `📝 交易筆數：${count} 筆`,
  ].join("\n");
}

/**
 * 聊天截圖分析結果
 * @param {object[]} transactions
 * @param {{ positivePayer: string, userName: string, currency?: string }} cfg
 */
function formatChatImageAnalysis(transactions, cfg) {
  const lines = [
    "📷 聊天記帳截圖分析",
    "─────────────",
    `規則：正數＝${cfg.positivePayer}幫${cfg.userName}付`,
    `      負數＝${cfg.userName}請${cfg.positivePayer}`,
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
    const desc = isPositive
      ? `${tx.payer} 幫 ${tx.consumer} 付`
      : `${tx.payer} 幫 ${tx.consumer} 付`;

    lines.push(
      `${i + 1}. ${icon} ${tx.amount} ${tx.currency} ${tx.item}`
    );
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
    lines.push(`…其餘 ${transactions.length - show.length} 筆（匯入後可在 Sheet 查看）`);
  }

  lines.push("─────────────");
  lines.push(
    `📗 ${cfg.positivePayer}幫你付：${countPaidForMe} 筆，共 ${round2(sumPaidForMe)} ${currency}`
  );
  lines.push(
    `📘 你幫${cfg.positivePayer}付：${countIPaid} 筆，共 ${round2(sumIPaid)} ${currency}`
  );

  const net = round2(sumPaidForMe - sumIPaid);
  if (net > 0) {
    lines.push(`💡 粗算你約欠 ${cfg.positivePayer} ${net} ${currency}（未含舊帳）`);
  } else if (net < 0) {
    lines.push(
      `💡 粗算 ${cfg.positivePayer} 約欠你 ${Math.abs(net)} ${currency}（未含舊帳）`
    );
  }

  lines.push("─────────────");
  lines.push(`✅ 共 ${transactions.length} 筆`);
  lines.push("回覆「匯入」寫入 Google Sheet");
  lines.push("（不滿意可重傳截圖，不會自動寫入）");

  return lines.join("\n");
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function formatImportDone(count) {
  return `✅ 已匯入 ${count} 筆到帳本\n輸入 /debt 查看欠款統計`;
}

function formatHelp() {
  return [
    "📖 MoodPay 使用教學",
    "─────────────",
    "📷 聊天記帳截圖：",
    "  直接傳圖片（正數=對方幫你付，負數=你付對方）",
    "  分析後回覆「匯入」寫入 Sheet",
    "",
    "💬 記帳（自然語言）：",
    "  • 我買了80元便當",
    "  • 男友幫我付25馬幣火鍋",
    "",
    "🗑️ 刪除：",
    "  • 刪除上一筆",
    "  • 刪除 測試吐司",
    "  • 刪除 2（多筆時選編號）",
    "",
    "📊 圖表（QuickChart）：",
    "  /chart     → Dashboard 總覽（橫條圖）",
    "  /category  → 已分類圓餅圖（不含待分類）",
    "  /monthly   → 每日支出折線圖",
    "  /debtchart → 欠款長條圖",
    "  /members   → 成員消費比較",
    "",
    "📌 指令：",
    "  /undo      → 刪除最後一筆",
    "  /delete 關鍵字 → 刪除符合項目",
    "  /debt      → 欠款文字統計",
    "  /summary   → 本月分析文案",
    "  /month     → 本月支出摘要",
    "  /help      → 此教學",
    "",
    "🌏 貨幣：TWD、MYR、USD、JPY、KRW",
  ].join("\n");
}

function formatError(message) {
  return `😵 哎呀，出了點問題：\n${message}\n\n輸入 /help 查看使用方式`;
}

/**
 * 多筆匹配時請使用者選擇
 * @param {object[]} matches
 * @param {string} keyword
 */
function formatDeletePickList(matches, keyword) {
  const lines = [
    `🔎 「${keyword}」找到 ${matches.length} 筆，請回覆編號：`,
    "─────────────",
  ];

  for (const m of matches) {
    const dateShort = m.date ? String(m.date).slice(0, 8) : "";
    lines.push(
      `${m.index}) ${m.item} ${m.amount} ${m.currency}${dateShort ? ` (${dateShort})` : ""}`
    );
  }

  lines.push("─────────────");
  lines.push("例：刪除 2");
  return lines.join("\n");
}

function formatZeroAmountWarning() {
  return [
    "⚠️ 金額無法辨識或為 0，未寫入帳本",
    "請用明確金額，例如：測試吐司 80元",
    "若真是免費，請註明「免費」",
  ].join("\n");
}

module.exports = {
  formatDebtReport,
  formatSummary,
  formatMonthSummary,
  formatHelp,
  formatError,
  formatDeletePickList,
  formatZeroAmountWarning,
  formatChatImageAnalysis,
  formatImportDone,
};
