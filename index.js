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
  getTransactions,
  deleteLastTransaction,
  deleteByItemKeyword,
  deleteByPickIndex,
} = require("./services/googleSheet");
const { getChatIdFromEvent } = require("./utils/chatId");
const {
  resolveActorsForStorage,
  relabelTotalsForViewer,
} = require("./services/actor");
const { classifyIntent, isExplicitFreeContext } = require("./services/intent");
const { formatTransactionDateTime } = require("./utils/date");
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
  getPersonalMonthContext,
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

async function handleEvent(event) {
  console.log("[Event] type:", event.type);

  if (event.type !== "message") {
    return;
  }

  const replyToken = event.replyToken;
  const chatId = getChatIdFromEvent(event);
  const actor = await getLineActor(event);

  try {
    if (event.message?.type === "image") {
      await replyMessage(replyToken, {
        text: await handleChatImage(event.message.id, chatId, actor),
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
      const cmdResult = await handleCommand(text, chatId, actor);
      replyPayload =
        typeof cmdResult === "string" ? { text: cmdResult } : cmdResult;
    } else {
      const intent = await classifyIntent(text);
      console.log("[Intent]", intent);

      if (intent.intent === "import_confirm") {
        replyPayload = { text: await handleImportConfirm(chatId, actor) };
      } else if (intent.intent === "delete_pick") {
        replyPayload = {
          text: await handleDeletePick(chatId, intent.pickIndex),
        };
      } else if (intent.intent === "delete") {
        replyPayload = await handleDelete(text, intent.target, chatId);
      } else {
        replyPayload = await handleExpense(text, chatId, actor);
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
 * @param {string} chatId
 */
async function handleChatImage(messageId, chatId, actor) {
  console.log("[Flow] 聊天截圖分析");
  const { transactions, cfg } = await analyzeChatImage(blobClient, messageId);

  pendingImports.set(chatId, {
    transactions,
    cfg,
    actor,
    at: Date.now(),
  });

  return formatChatImageAnalysis(transactions, cfg, actor);
}

/**
 * @param {string} chatId
 */
async function handleImportConfirm(chatId, actor) {
  const pending = getPendingImport(chatId);
  if (!pending) {
    return "還沒有截圖分析可以匯入 📷\n先傳聊天記帳截圖，MoodPay 讀完你再回「匯入」";
  }

  console.log("[Flow] 匯入", pending.transactions.length, "筆");
  const importActor = pending.actor || actor;

  for (const tx of pending.transactions) {
    const roles = resolveActorsForStorage(tx, importActor);
    await appendTransaction(
      {
        ...tx,
        payer: roles.payer,
        consumer: roles.consumer,
        sharedWith: roles.sharedWith,
        recordedBy: importActor.userId,
        recordedByName: importActor.displayName,
      },
      chatId
    );
  }

  pendingImports.delete(chatId);
  return formatImportDone(pending.transactions.length);
}

function getPendingImport(chatId) {
  const p = pendingImports.get(chatId);
  if (!p) return null;
  if (Date.now() - p.at > PENDING_TTL_MS) {
    pendingImports.delete(chatId);
    return null;
  }
  return p;
}

/**
 * @param {string} text
 * @param {string} chatId
 * @returns {Promise<{ text: string, imageUrl?: string }>}
 */
async function handleExpense(text, chatId, actor) {
  console.log("[Flow] 開始記帳流程");

  const parsed = await parseExpense(text);

  if (
    parsed.amount <= 0 &&
    parsed.relation !== "income" &&
    parsed.relation !== "treat" &&
    !isExplicitFreeContext(text, parsed)
  ) {
    console.log("[Flow] 金額<=0，拒絕寫入");
    return { text: formatZeroAmountWarning() };
  }

  const twdAmount = await convertToTWD(parsed.amount, parsed.currency);
  const roles = resolveActorsForStorage(parsed, actor);

  const transaction = {
    date: formatTransactionDateTime(),
    payer: roles.payer,
    consumer: roles.consumer,
    item: parsed.item,
    amount: parsed.amount,
    currency: parsed.currency,
    twdAmount,
    relation: parsed.relation,
    category: parsed.category,
    tags: parsed.tags || [],
    rawText: parsed.rawText || text,
    sharedWith: roles.sharedWith,
    recordedBy: actor.userId,
    recordedByName: actor.displayName,
  };

  const saved = await appendTransaction(transaction, chatId);
  const reply = await generateFunnyReply(saved, actor);

  console.log("[Flow] 記帳流程完成");
  return reply;
}

/**
 * @param {string} text
 * @param {string|undefined} target
 * @param {string} chatId
 */
async function handleDelete(text, target, chatId) {
  console.log("[Flow] 刪除流程, target:", target);

  let result;

  if (target === "__last__") {
    result = await deleteLastTransaction(chatId);
  } else {
    result = await deleteByItemKeyword(target, chatId);
  }

  if (result.status === "empty") {
    return { text: "帳本空空的，沒東西可刪 🫥" };
  }

  if (result.status === "not_found") {
    return {
      text: `MoodPay 翻遍了帳本，沒找到「${result.keyword}」\n試試 /undo 或「刪除上一筆」`,
    };
  }

  if (result.status === "multiple") {
    pendingDeletes.set(chatId, {
      matches: result.matches,
      at: Date.now(),
    });
    return { text: formatDeletePickList(result.matches, result.keyword) };
  }

  pendingDeletes.delete(chatId);
  const reply = await generateDeleteReply(result.transaction);
  return reply;
}

/**
 * @param {string} chatId
 * @param {number} pickIndex
 */
async function handleDeletePick(chatId, pickIndex) {
  const pending = getPendingDelete(chatId);
  if (!pending) {
    return "還沒有要選的刪除項目\n先輸入「刪除 關鍵字」讓 MoodPay 找";
  }

  const result = await deleteByPickIndex(pending.matches, pickIndex, chatId);
  pendingDeletes.delete(chatId);

  if (result.status === "ok") {
    const reply = await generateDeleteReply(result.transaction);
    return reply.text;
  }

  return `這個編號不存在喔，請選 1～${pending.matches.length}`;
}

function getPendingDelete(chatId) {
  const p = pendingDeletes.get(chatId);
  if (!p) return null;
  if (Date.now() - p.at > PENDING_TTL_MS) {
    pendingDeletes.delete(chatId);
    return null;
  }
  return p;
}

/**
 * @param {string} text
 * @param {string} chatId
 * @returns {Promise<string|{ text: string, imageUrl?: string }>}
 */
/**
 * @param {object} event
 * @returns {Promise<{ userId: string, displayName: string, selfLabel: string }>}
 */
async function getLineActor(event) {
  const userId = event.source?.userId || "";
  if (!userId) {
    return { userId: "", displayName: "我", selfLabel: "我" };
  }

  try {
    const profile = await client.getProfile(userId);
    const displayName = (profile.displayName || "").trim() || userId.slice(0, 8);
    console.log("[Actor]", displayName, userId.slice(0, 8));
    return { userId, displayName, selfLabel: "我" };
  } catch (err) {
    console.warn("[Actor] 無法取得 LINE 暱稱:", err.message);
    return { userId, displayName: userId.slice(0, 8), selfLabel: "我" };
  }
}

async function handleCommand(text, chatId, actor) {
  const parts = text.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  console.log("[Command]", command);

  if (command === "/undo") {
    const reply = await handleDelete("", "__last__", chatId);
    return reply.text;
  }

  if (command === "/delete") {
    const keyword = parts.slice(1).join(" ").trim();
    const reply = await handleDelete(
      text,
      keyword ? keyword : "__last__",
      chatId
    );
    return reply.text;
  }

  const transactions = await getTransactions(chatId);

  switch (command) {
    case "/chart":
      return await handleDashboardChartCommand(transactions, actor);

    case "/category":
      return await handleCategoryOnlyChartCommand(transactions, actor);

    case "/monthly":
      return await handleMonthlyChartCommand(transactions, actor);

    case "/debtchart":
      return await handleDebtChartCommand(transactions, actor);

    case "/members":
      return await handleMembersChartCommand(transactions, actor);

    case "/debt": {
      const balances = relabelTotalsForViewer(
        calculateBalances(transactions),
        actor,
        transactions
      );
      return formatDebtReport(balances);
    }

    case "/summary": {
      const { monthTx, meta } = getPersonalMonthContext(transactions, actor);
      const byCategory = summarizeByCategory(monthTx);
      return formatDashboardSummary(monthTx, byCategory, meta);
    }

    case "/month": {
      const { monthTx, meta } = getPersonalMonthContext(transactions, actor);
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
async function handleDashboardChartCommand(transactions, actor) {
  const { monthTx, meta } = getPersonalMonthContext(transactions, actor);
  const byCategory = summarizeByCategory(monthTx);
  let summary = formatDashboardSummary(monthTx, byCategory, meta);
  const imageUrl = await generateDashboardBarChart(monthTx);

  if (!imageUrl) {
    return appendChartSkippedNote(summary);
  }

  return { text: summary, imageUrl };
}

/**
 * /category — 已分類圓餅圖 + 深度分析
 * @param {object[]} transactions
 */
async function handleCategoryOnlyChartCommand(transactions, actor) {
  const { monthTx, meta } = getPersonalMonthContext(transactions, actor);
  const byCategory = summarizeByCategory(monthTx);
  let summary = formatCategoryDeepSummary(monthTx, byCategory, meta);
  const imageUrl = await generateCategoryPieChart(monthTx);

  if (!imageUrl) {
    return appendChartSkippedNote(summary);
  }

  return { text: summary, imageUrl };
}

/**
 * /monthly — 每日支出折線圖
 * @param {object[]} transactions
 */
async function handleMonthlyChartCommand(transactions, actor) {
  const { monthTx, meta } = getPersonalMonthContext(transactions, actor);
  const daily = aggregateDailySpending(monthTx);
  let summary = formatMonthlyChartSummary(daily, meta);
  const imageUrl = await generateMonthlyLineChart(monthTx);

  if (!imageUrl) {
    return appendChartSkippedNote(summary);
  }

  return { text: summary, imageUrl };
}

/**
 * /debtchart — 欠款長條圖
 * @param {object[]} transactions
 */
async function handleDebtChartCommand(transactions, actor) {
  const balances = relabelTotalsForViewer(
    calculateBalances(transactions),
    actor,
    transactions
  );
  let summary = formatDebtChartSummary(balances);
  const imageUrl = await generateDebtBarChart(balances);

  if (!imageUrl) {
    return appendChartSkippedNote(summary);
  }

  return { text: summary, imageUrl };
}

/**
 * /members — 成員消費比較
 * @param {object[]} transactions
 */
async function handleMembersChartCommand(transactions, actor) {
  const { monthTx, meta } = getCurrentMonthContext(transactions);
  const byMember = relabelTotalsForViewer(
    summarizeByMember(monthTx),
    actor,
    transactions
  );
  let summary = formatMemberChartSummary(byMember, meta);
  const imageUrl = await generateMemberComparisonChart(monthTx, actor);

  if (!imageUrl) {
    return appendChartSkippedNote(summary);
  }

  return { text: summary, imageUrl };
}

function appendChartSkippedNote(summary) {
  return `${summary}\n\n（圖表這次沒附上，先看文字版 📊）`;
}

/**
 * @param {string} replyToken
 * @param {{ text: string, imageUrl?: string }} payload
 */
async function replyMessage(replyToken, payload) {
  const { LINE_IMAGE_URL_MAX } = require("./services/charts");
  let text = payload.text || payload;
  let imageUrl = typeof payload === "object" ? payload.imageUrl : undefined;

  if (imageUrl && imageUrl.length > LINE_IMAGE_URL_MAX) {
    console.warn("[Reply] 圖片 URL 過長，略過", imageUrl.length);
    imageUrl = undefined;
    text = appendChartSkippedNote(String(text));
  }

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
    console.log("[Reply] 附加圖片", imageUrl.slice(0, 60) + "…");
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
