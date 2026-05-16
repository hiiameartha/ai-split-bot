/**
 * MoodPay - LINE AI 多人記帳與分帳系統
 * 主程式：Express + LINE Webhook
 */

require("dotenv").config();

const express = require("express");
const line = require("@line/bot-sdk");

const { parseExpense } = require("./services/ai");
const { convertToTWD } = require("./services/exchange");
const {
  appendTransaction,
  getAllTransactions,
  deleteLastTransaction,
  deleteByItemKeyword,
  deleteByPickIndex,
} = require("./services/googleSheet");
const { classifyIntent, isExplicitFreeContext } = require("./services/intent");
const { formatDateYYYYMMDD } = require("./utils/date");
const { generateFunnyReply, generateDeleteReply } = require("./services/reply");
const {
  calculateBalances,
  summarizeByCategory,
} = require("./services/settlement");
const {
  generateDashboardBarChart,
  generateCategoryPieChart,
  generateMonthlyLineChart,
  generateDebtBarChart,
  generateMemberComparisonChart,
  aggregateDailySpending,
  getCurrentMonthContext,
  summarizeByMember,
} = require("./services/charts");
const {
  formatDashboardSummary,
  formatCategoryDeepSummary,
  formatDebtChartSummary,
  formatMemberChartSummary,
  formatMonthlyChartSummary,
} = require("./services/chartSummary");
const {
  formatDebtReport,
  formatHelp,
  formatError,
  formatDeletePickList,
  formatZeroAmountWarning,
  formatChatImageAnalysis,
  formatImportDone,
} = require("./utils/formatter");

const requiredEnv = [
  "LINE_CHANNEL_ACCESS_TOKEN",
  "LINE_CHANNEL_SECRET",
  "OPENAI_API_KEY",
  "GOOGLE_SHEET_ID",
  "EXCHANGE_API_KEY",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.warn(`[WARN] 缺少環境變數: ${key}`);
  }
}

const PORT = process.env.PORT || 3000;

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken,
});

const blobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: lineConfig.channelAccessToken,
});

const { analyzeChatImage, getImportConfig } = require("./services/chatImage");

/** @type {Map<string, { matches: object[], at: number }>} */
const pendingDeletes = new Map();
/** @type {Map<string, { transactions: object[], at: number }>} */
const pendingImports = new Map();
const PENDING_TTL_MS = 5 * 60 * 1000;

const app = express();

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "MoodPay", version: "1.2.0" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "healthy" });
});

app.post("/webhook", line.middleware(lineConfig), async (req, res) => {
  console.log("[Webhook] 收到事件");

  try {
    const events = req.body.events || [];
    await Promise.all(events.map((event) => handleEvent(event)));
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("[Webhook] 處理錯誤:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @param {object} event
 */
function getUserId(event) {
  return event.source?.userId || event.source?.groupId || "anonymous";
}

async function handleEvent(event) {
  console.log("[Event] type:", event.type);

  if (event.type !== "message") {
    return;
  }

  const replyToken = event.replyToken;
  const userId = getUserId(event);

  try {
    if (event.message?.type === "image") {
      await replyMessage(replyToken, {
        text: await handleChatImage(event.message.id, userId),
      });
      return;
    }

    if (event.message?.type !== "text") {
      console.log("[Event] 非文字/圖片訊息，略過");
      return;
    }

    const text = event.message.text.trim();
    console.log("[Event] 使用者訊息:", text);

    let replyPayload;

    if (text.startsWith("/")) {
      const cmdResult = await handleCommand(text, userId);
      replyPayload =
        typeof cmdResult === "string" ? { text: cmdResult } : cmdResult;
    } else {
      const intent = await classifyIntent(text);
      console.log("[Intent]", intent);

      if (intent.intent === "import_confirm") {
        replyPayload = { text: await handleImportConfirm(userId) };
      } else if (intent.intent === "delete_pick") {
        replyPayload = { text: await handleDeletePick(userId, intent.pickIndex) };
      } else if (intent.intent === "delete") {
        replyPayload = await handleDelete(text, intent.target, userId);
      } else {
        replyPayload = await handleExpense(text);
      }
    }

    await replyMessage(replyToken, replyPayload);
  } catch (err) {
    console.error("[Event] 處理失敗:", err);
    await replyMessage(replyToken, { text: formatError(err.message) });
  }
}

/**
 * 分析聊天記帳截圖
 * @param {string} messageId
 * @param {string} userId
 */
async function handleChatImage(messageId, userId) {
  console.log("[Flow] 聊天截圖分析");
  const { transactions, cfg } = await analyzeChatImage(blobClient, messageId);

  pendingImports.set(userId, {
    transactions,
    at: Date.now(),
  });

  return formatChatImageAnalysis(transactions, cfg);
}

/**
 * @param {string} userId
 */
async function handleImportConfirm(userId) {
  const pending = getPendingImport(userId);
  if (!pending) {
    return "⚠️ 沒有待匯入的截圖分析\n請先傳送聊天記帳截圖";
  }

  console.log("[Flow] 匯入", pending.transactions.length, "筆");

  for (const tx of pending.transactions) {
    await appendTransaction(tx);
  }

  pendingImports.delete(userId);
  return formatImportDone(pending.transactions.length);
}

function getPendingImport(userId) {
  const p = pendingImports.get(userId);
  if (!p) return null;
  if (Date.now() - p.at > PENDING_TTL_MS) {
    pendingImports.delete(userId);
    return null;
  }
  return p;
}

/**
 * @param {string} text
 * @returns {Promise<{ text: string, imageUrl?: string }>}
 */
async function handleExpense(text) {
  console.log("[Flow] 開始記帳流程");

  const parsed = await parseExpense(text);

  if (parsed.amount <= 0 && !isExplicitFreeContext(text, parsed)) {
    console.log("[Flow] 金額<=0，拒絕寫入");
    return { text: formatZeroAmountWarning() };
  }

  const twdAmount = await convertToTWD(parsed.amount, parsed.currency);

  const transaction = {
    date: formatDateYYYYMMDD(),
    payer: parsed.payer,
    consumer: parsed.consumer,
    item: parsed.item,
    amount: parsed.amount,
    currency: parsed.currency,
    twdAmount,
    relation: parsed.relation,
    category: parsed.category,
    tags: parsed.tags || [],
    rawText: parsed.rawText || text,
    sharedWith: parsed.sharedWith,
  };

  const saved = await appendTransaction(transaction);
  const reply = await generateFunnyReply(saved);

  console.log("[Flow] 記帳流程完成");
  return reply;
}

/**
 * @param {string} text
 * @param {string|undefined} target
 * @param {string} userId
 */
async function handleDelete(text, target, userId) {
  console.log("[Flow] 刪除流程, target:", target);

  let result;

  if (target === "__last__") {
    result = await deleteLastTransaction();
  } else {
    result = await deleteByItemKeyword(target);
  }

  if (result.status === "empty") {
    return { text: "📭 沒有任何帳目可刪除喔" };
  }

  if (result.status === "not_found") {
    return {
      text: `🔍 找不到「${result.keyword}」相關帳目\n試試 /undo 或「刪除上一筆」`,
    };
  }

  if (result.status === "multiple") {
    pendingDeletes.set(userId, {
      matches: result.matches,
      at: Date.now(),
    });
    return { text: formatDeletePickList(result.matches, result.keyword) };
  }

  pendingDeletes.delete(userId);
  const reply = await generateDeleteReply(result.transaction);
  return reply;
}

/**
 * @param {string} userId
 * @param {number} pickIndex
 */
async function handleDeletePick(userId, pickIndex) {
  const pending = getPendingDelete(userId);
  if (!pending) {
    return "⚠️ 沒有待刪除的選項，請先輸入「刪除 關鍵字」";
  }

  const result = await deleteByPickIndex(pending.matches, pickIndex);
  pendingDeletes.delete(userId);

  if (result.status === "ok") {
    const reply = await generateDeleteReply(result.transaction);
    return reply.text;
  }

  return `❌ 無效的編號，請輸入 1～${pending.matches.length}`;
}

function getPendingDelete(userId) {
  const p = pendingDeletes.get(userId);
  if (!p) return null;
  if (Date.now() - p.at > PENDING_TTL_MS) {
    pendingDeletes.delete(userId);
    return null;
  }
  return p;
}

/**
 * @param {string} text
 * @param {string} userId
 * @returns {Promise<string|{ text: string, imageUrl?: string }>}
 */
async function handleCommand(text, userId) {
  const parts = text.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  console.log("[Command]", command);

  if (command === "/undo") {
    const reply = await handleDelete("", "__last__", userId);
    return reply.text;
  }

  if (command === "/delete") {
    const keyword = parts.slice(1).join(" ").trim();
    const reply = await handleDelete(
      text,
      keyword ? keyword : "__last__",
      userId
    );
    return reply.text;
  }

  const transactions = await getAllTransactions();

  switch (command) {
    case "/chart":
      return handleDashboardChartCommand(transactions);

    case "/category":
      return handleCategoryOnlyChartCommand(transactions);

    case "/monthly":
      return handleMonthlyChartCommand(transactions);

    case "/debtchart":
      return handleDebtChartCommand(transactions);

    case "/members":
      return handleMembersChartCommand(transactions);

    case "/debt": {
      const balances = calculateBalances(transactions);
      return formatDebtReport(balances);
    }

    case "/summary": {
      const { monthTx, meta } = getCurrentMonthContext(transactions);
      const byCategory = summarizeByCategory(monthTx);
      return formatDashboardSummary(monthTx, byCategory, meta);
    }

    case "/month": {
      const { monthTx, meta } = getCurrentMonthContext(transactions);
      return formatMonthlyChartSummary(
        aggregateDailySpending(monthTx),
        meta
      );
    }

    case "/help":
      return formatHelp();

    default:
      return `❓ 未知指令：${command}\n\n${formatHelp()}`;
  }
}

/**
 * /chart — Dashboard 總覽（橫條圖 + KPI）
 * @param {object[]} transactions
 */
function handleDashboardChartCommand(transactions) {
  const { monthTx, meta } = getCurrentMonthContext(transactions);
  const byCategory = summarizeByCategory(monthTx);
  const summary = formatDashboardSummary(monthTx, byCategory, meta);
  const imageUrl = generateDashboardBarChart(monthTx);

  if (!imageUrl) {
    return summary;
  }

  return { text: summary, imageUrl };
}

/**
 * /category — 已分類圓餅圖 + 深度分析
 * @param {object[]} transactions
 */
function handleCategoryOnlyChartCommand(transactions) {
  const { monthTx, meta } = getCurrentMonthContext(transactions);
  const byCategory = summarizeByCategory(monthTx);
  const summary = formatCategoryDeepSummary(monthTx, byCategory, meta);
  const imageUrl = generateCategoryPieChart(monthTx);

  if (!imageUrl) {
    return summary;
  }

  return { text: summary, imageUrl };
}

/**
 * /monthly — 每日支出折線圖
 * @param {object[]} transactions
 */
function handleMonthlyChartCommand(transactions) {
  const { monthTx, meta } = getCurrentMonthContext(transactions);
  const daily = aggregateDailySpending(monthTx);
  const summary = formatMonthlyChartSummary(daily, meta);
  const imageUrl = generateMonthlyLineChart(monthTx);

  if (!imageUrl) {
    return summary;
  }

  return { text: summary, imageUrl };
}

/**
 * /debtchart — 欠款長條圖
 * @param {object[]} transactions
 */
function handleDebtChartCommand(transactions) {
  const balances = calculateBalances(transactions);
  const summary = formatDebtChartSummary(balances);
  const imageUrl = generateDebtBarChart(balances);

  if (!imageUrl) {
    return summary;
  }

  return { text: summary, imageUrl };
}

/**
 * /members — 成員消費比較
 * @param {object[]} transactions
 */
function handleMembersChartCommand(transactions) {
  const { monthTx, meta } = getCurrentMonthContext(transactions);
  const byMember = summarizeByMember(monthTx);
  const summary = formatMemberChartSummary(byMember, meta);
  const imageUrl = generateMemberComparisonChart(monthTx);

  if (!imageUrl) {
    return summary;
  }

  return { text: summary, imageUrl };
}

/**
 * @param {string} replyToken
 * @param {{ text: string, imageUrl?: string }} payload
 */
async function replyMessage(replyToken, payload) {
  const text = payload.text || payload;
  const imageUrl = typeof payload === "object" ? payload.imageUrl : undefined;

  console.log(
    "[Reply] 送出訊息:",
    String(text).slice(0, 80) + (String(text).length > 80 ? "..." : "")
  );

  /** @type {object[]} */
  const messages = [{ type: "text", text: String(text) }];

  if (imageUrl) {
    messages.push({
      type: "image",
      originalContentUrl: imageUrl,
      previewImageUrl: imageUrl,
    });
    console.log("[Reply] 附加 Giphy 圖片");
  }

  await client.replyMessage({
    replyToken,
    messages,
  });
}

app.listen(PORT, () => {
  console.log("═══════════════════════════════════════");
  console.log(`  MoodPay Bot 已啟動`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Webhook: POST /webhook`);
  if (process.env.GIPHY_API_KEY?.trim()) {
    console.log("  Giphy: 已啟用（記帳/刪除會附梗圖）");
  } else {
    console.log("  Giphy: 未設定 GIPHY_API_KEY（僅文字梗）");
  }
  console.log("═══════════════════════════════════════");
});

process.on("unhandledRejection", (reason) => {
  console.error("[UnhandledRejection]", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[UncaughtException]", err);
});

module.exports = {
  handleExpense,
  handleDelete,
  classifyIntent,
};
