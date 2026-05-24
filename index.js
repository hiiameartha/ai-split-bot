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
  findDeletableMatches,
  deleteByPickIndex,
  deleteLastNTransactions,
  deleteRecentNByRawTextMarker,
} = require("./services/googleSheet");
const { parseDeleteQuery } = require("./services/deleteSearch");
const { DELETE_MARKER_SCREENSHOT } = require("./services/intent");
const { getChatIdFromEvent } = require("./utils/chatId");
const { pendingKey } = require("./utils/pendingKey");
const {
  resolveActorsForStorage,
  relabelTotalsForViewer,
} = require("./services/actor");
const { classifyIntent, isExplicitFreeContext } = require("./services/intent");
const { formatTransactionDateTime } = require("./utils/date");
const { generateFunnyReply, generateDeleteReply } = require("./services/reply");
const { calculateBalances } = require("./services/settlement");
const {
  summarizeLedger,
  getPersonalDebtTransactions,
  summarizeByRecorder,
  aggregateDailyExpense,
} = require("./services/ledger");
const {
  generateDashboardBarChart,
  generateCategoryPieChart,
  generateMonthlyLineChart,
  generateDebtBarChart,
  generateMemberComparisonChart,
  getCurrentMonthContext,
  getPersonalMonthContext,
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
  formatDeleteConfirmPrompt,
  formatDeleteAwaitConfirm,
  formatZeroAmountWarning,
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

/** @type {Map<string, { matches: object[], label: string, stage: 'pick'|'confirm', selectedIndex?: number, at: number }>} */
const pendingDeletes = new Map();
const PENDING_TTL_MS = 5 * 60 * 1000;

const app = express();

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "MoodPay", version: "1.3.0" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "healthy" });
});

app.post("/webhook", line.middleware(lineConfig), (req, res) => {
  console.log("[Webhook] 收到事件");
  res.status(200).json({ success: true });

  const events = req.body.events || [];
  Promise.all(events.map((event) => handleEvent(event))).catch((err) => {
    console.error("[Webhook] 背景處理錯誤:", err);
  });
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
    if (event.message?.type !== "text") {
      if (event.message?.type === "image") {
        await replyMessage(replyToken, {
          text: "MoodPay 目前只支援文字記帳 💬\n直接描述消費就好，例：我買了 80 元便當",
        });
      } else {
        console.log("[Event] 非文字訊息，略過");
      }
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

      if (intent.intent === "delete_confirm") {
        replyPayload = await handleDeleteConfirm(chatId, actor);
      } else if (intent.intent === "delete_cancel") {
        replyPayload = { text: handleDeleteCancel(chatId, actor) };
      } else if (intent.intent === "delete_pick") {
        replyPayload = {
          text: await handleDeletePick(chatId, intent.pickIndex, actor),
        };
      } else if (intent.intent === "delete_bulk") {
        replyPayload = {
          text: await handleDeleteBulk(intent.count, chatId, actor),
        };
      } else if (intent.intent === "delete") {
        replyPayload = await handleDelete(text, intent.target, chatId, actor);
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
async function handleDelete(text, target, chatId, actor) {
  console.log("[Flow] 刪除流程, target:", target);

  if (target === "__last__") {
    const result = await deleteLastTransaction(chatId, { actor });
    if (result.status === "empty") {
      return { text: "帳本空空的，沒東西可刪 🫥" };
    }
    if (result.status === "not_owned") {
      return {
        text: "只能刪你自己記的帳喔 🙏\n上一筆是別人記的，請對方自己刪或用關鍵字找你的那筆",
      };
    }
    pendingDeletes.delete(pendingKey(chatId, actor));
    const reply = await generateDeleteReply(result.transaction);
    return reply;
  }

  const query = parseDeleteQuery(target);
  const { matches, label } = await findDeletableMatches(chatId, {
    actor,
    query,
  });

  if (matches.length === 0) {
    return {
      text: `MoodPay 翻遍了帳本，沒找到 ${label}\n試試 /undo 或「刪除上一筆」`,
    };
  }

  if (matches.length > 1) {
    pendingDeletes.set(pendingKey(chatId, actor), {
      matches,
      label,
      stage: "pick",
      at: Date.now(),
    });
    return { text: formatDeletePickList(matches, label) };
  }

  pendingDeletes.set(pendingKey(chatId, actor), {
    matches,
    label,
    stage: "confirm",
    selectedIndex: 1,
    at: Date.now(),
  });
  return { text: formatDeleteConfirmPrompt(matches[0], label) };
}

/**
 * @param {number} count
 * @param {string} chatId
 * @param {object} actor
 */
async function handleDeleteBulk(count, chatId, actor) {
  console.log("[Flow] 批次刪除", count, "筆");

  const screenshotTry = await deleteRecentNByRawTextMarker(
    DELETE_MARKER_SCREENSHOT,
    chatId,
    count,
    { actor }
  );
  if (screenshotTry.status === "ok") {
    return formatBulkDeleteResult(
      screenshotTry,
      `最近 ${count} 筆截圖匯入（${DELETE_MARKER_SCREENSHOT}）`
    );
  }

  const result = await deleteLastNTransactions(chatId, count, { actor });
  return formatBulkDeleteResult(result, `最近 ${count} 筆`);
}

function formatBulkDeleteResult(result, label) {
  if (result.status === "empty") {
    return "帳本空空的，沒東西可刪 🫥";
  }
  if (result.status === "not_owned") {
    return "只能刪你自己記的帳喔 🙏";
  }
  if (result.status === "not_found") {
    return `沒找到符合 ${label} 的記帳列`;
  }
  return `已刪除 ${result.deletedCount} 筆（${label}）🗑️`;
}

/**
 * @param {string} chatId
 * @param {number} pickIndex
 * @param {object} actor
 */
async function handleDeletePick(chatId, pickIndex, actor) {
  const pending = getPendingDelete(chatId, actor);
  if (!pending) {
    return "還沒有要選的刪除項目\n先輸入「刪除 關鍵字」讓 MoodPay 找";
  }

  const entry = pending.matches.find((m) => m.index === pickIndex);
  if (!entry) {
    return `這個編號不存在喔，請選 1～${pending.matches.length}`;
  }

  pending.stage = "confirm";
  pending.selectedIndex = pickIndex;
  pending.at = Date.now();
  pendingDeletes.set(pendingKey(chatId, actor), pending);

  return formatDeleteAwaitConfirm(entry);
}

/**
 * @param {string} chatId
 * @param {object} actor
 */
async function handleDeleteConfirm(chatId, actor) {
  const pending = getPendingDelete(chatId, actor);
  if (!pending || pending.stage !== "confirm" || !pending.selectedIndex) {
    return {
      text: "目前沒有待確認的刪除\n先說「刪除 5/26的義大利麵」等，選好筆數後再回「確認」",
    };
  }

  const result = await deleteByPickIndex(
    pending.matches,
    pending.selectedIndex,
    chatId
  );
  pendingDeletes.delete(pendingKey(chatId, actor));

  if (result.status === "ok") {
    const reply = await generateDeleteReply(result.transaction);
    return reply;
  }

  return "這筆可能已被刪除或找不到，請重新搜尋";
}

/**
 * @param {string} chatId
 * @param {object} actor
 */
function handleDeleteCancel(chatId, actor) {
  const had = getPendingDelete(chatId, actor);
  pendingDeletes.delete(pendingKey(chatId, actor));
  if (!had) {
    return "沒有進行中的刪除確認";
  }
  return "好，這次不刪了 🫥";
}

function getPendingDelete(chatId, actor) {
  const key = pendingKey(chatId, actor);
  const p = pendingDeletes.get(key);
  if (!p) return null;
  if (Date.now() - p.at > PENDING_TTL_MS) {
    pendingDeletes.delete(key);
    return null;
  }
  return p;
}

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
    const reply = await handleDelete("", "__last__", chatId, actor);
    return reply.text;
  }

  if (command === "/delete") {
    const keyword = parts.slice(1).join(" ").trim();
    if (!keyword) {
      return [
        "刪除上一筆請用 /undo",
        "依項目刪除請用：/delete 火鍋",
        "或自然語言：刪除5/26的義大利麵",
      ].join("\n");
    }
    const reply = await handleDelete(text, keyword, chatId, actor);
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
      const personalDebtTx = getPersonalDebtTransactions(transactions, actor);
      const balances = relabelTotalsForViewer(
        calculateBalances(personalDebtTx),
        actor,
        transactions
      );
      return formatDebtReport(balances);
    }

    case "/summary": {
      const { monthTx, meta } = getPersonalMonthContext(transactions, actor);
      const byCategory = summarizeLedger(monthTx).byCategoryExpense;
      return formatDashboardSummary(monthTx, byCategory, meta);
    }

    case "/month": {
      const { monthTx, meta } = getPersonalMonthContext(transactions, actor);
      return formatMonthlyChartSummary(aggregateDailyExpense(monthTx), meta);
    }

    case "/help":
      return formatHelp();

    default:
      return `❓ 未知指令：${command}\n\n${formatHelp()}`;
  }
}

async function handleDashboardChartCommand(transactions, actor) {
  const { monthTx, meta } = getPersonalMonthContext(transactions, actor);
  const byCategory = summarizeLedger(monthTx).byCategoryExpense;
  let summary = formatDashboardSummary(monthTx, byCategory, meta);
  const imageUrl = await generateDashboardBarChart(monthTx);

  if (!imageUrl) {
    return appendChartSkippedNote(summary);
  }

  return { text: summary, imageUrl };
}

async function handleCategoryOnlyChartCommand(transactions, actor) {
  const { monthTx, meta } = getPersonalMonthContext(transactions, actor);
  const byCategory = summarizeLedger(monthTx).byCategoryExpense;
  let summary = formatCategoryDeepSummary(monthTx, byCategory, meta);
  const imageUrl = await generateCategoryPieChart(monthTx);

  if (!imageUrl) {
    return appendChartSkippedNote(summary);
  }

  return { text: summary, imageUrl };
}

async function handleMonthlyChartCommand(transactions, actor) {
  const { monthTx, meta } = getPersonalMonthContext(transactions, actor);
  const daily = aggregateDailyExpense(monthTx);
  let summary = formatMonthlyChartSummary(daily, meta);
  const imageUrl = await generateMonthlyLineChart(monthTx);

  if (!imageUrl) {
    return appendChartSkippedNote(summary);
  }

  return { text: summary, imageUrl };
}

async function handleDebtChartCommand(transactions, actor) {
  const personalDebtTx = getPersonalDebtTransactions(transactions, actor);
  const balances = relabelTotalsForViewer(
    calculateBalances(personalDebtTx),
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

async function handleMembersChartCommand(transactions, actor) {
  const { monthTx, meta } = getCurrentMonthContext(transactions);
  const byMember = relabelTotalsForViewer(
    summarizeByRecorder(monthTx),
    actor,
    transactions
  );
  let summary = formatMemberChartSummary(byMember, {
    ...meta,
    scopeLabel: "群組 · 每人自己記的支出",
  });
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
  console.log(`  Webhook: POST /webhook（非同步回 200）`);
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
  pendingDeletes,
  pendingKey,
  PENDING_TTL_MS,
  getPendingDelete,
};
