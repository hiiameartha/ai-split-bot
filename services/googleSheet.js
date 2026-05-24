/**
 * MoodPay - Google Sheets 儲存服務
 * 讀寫記帳交易紀錄
 */

const crypto = require("crypto");
const path = require("path");
const { google } = require("googleapis");
const {
  serializeTags,
  parseTags,
  normalizeCategory,
  inferCategoryFromItem,
  CATEGORIES,
} = require("./category");
const { formatTransactionDateTime } = require("../utils/date");
const { filterTransactionsByChatId } = require("../utils/chatId");

/** Sheet 欄位標題（第一列） */
const HEADERS = [
  "date",
  "payer",
  "consumer",
  "item",
  "amount",
  "currency",
  "twdAmount",
  "relation",
  "category",
  "tags",
  "rawText",
  "id",
  "chatId",
  "recordedBy",
  "recordedByName",
  "sharedWith",
];

const SHEET_NAME = "Transactions";
const COL_COUNT = HEADERS.length;

let sheetsClient = null;
let ensureReadyPromise = null;
let resolvedSheetTitle = SHEET_NAME;
/** @type {number|null} */
let resolvedSheetId = null;

const SHEET_CACHE_TTL_MS = parseInt(
  process.env.SHEET_CACHE_TTL_MS || "30000",
  10
);
/** @type {{ rows: object[], fetchedAt: number }|null} */
let transactionsCache = null;

function invalidateTransactionsCache() {
  transactionsCache = null;
}

/** 修正 Render / 環境變數常見的 PEM 換行問題 */
function normalizeGoogleCredentials(credentials) {
  const creds = { ...credentials };
  if (typeof creds.private_key === "string") {
    creds.private_key = creds.private_key.replace(/\\n/g, "\n").trim();
  }
  return creds;
}

function loadGoogleCredentials() {
  const fs = require("fs");

  const jsonRaw =
    process.env.GOOGLE_CREDENTIALS_JSON ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (jsonRaw) {
    let parsed;
    try {
      parsed = JSON.parse(jsonRaw);
    } catch (e) {
      throw new Error(`GOOGLE_CREDENTIALS_JSON 不是合法 JSON：${e.message}`);
    }
    return normalizeGoogleCredentials(parsed);
  }

  const candidates = [
    process.env.GOOGLE_CREDENTIALS_PATH,
    path.join(__dirname, "..", "credentials", "credentials.json"),
    path.join(__dirname, "..", "credentials.json"),
  ].filter(Boolean);

  const credentialsPath = candidates.find((p) => fs.existsSync(p));
  if (!credentialsPath) {
    throw new Error(
      "找不到 Google 憑證：設定 GOOGLE_CREDENTIALS_JSON，或放置 credentials/credentials.json"
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  } catch (e) {
    throw new Error(`無法讀取憑證檔 ${credentialsPath}：${e.message}`);
  }
  return normalizeGoogleCredentials(parsed);
}

async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const credentials = loadGoogleCredentials();

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const authClient = await auth.getClient();
  sheetsClient = google.sheets({ version: "v4", auth: authClient });
  return sheetsClient;
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) {
    throw new Error("缺少環境變數 GOOGLE_SHEET_ID");
  }
  return id;
}

function findSheetByName(sheetList, name) {
  const target = name.trim().toLowerCase();
  return sheetList?.find(
    (s) => (s.properties?.title || "").trim().toLowerCase() === target
  );
}

async function ensureSheetReady() {
  if (ensureReadyPromise) {
    return ensureReadyPromise;
  }

  ensureReadyPromise = doEnsureSheetReady().catch((err) => {
    ensureReadyPromise = null;
    throw err;
  });

  return ensureReadyPromise;
}

async function doEnsureSheetReady() {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetList = meta.data.sheets || [];
  let sheet = findSheetByName(sheetList, SHEET_NAME);

  if (!sheet) {
    console.log(`[GoogleSheet] 建立工作表: ${SHEET_NAME}`);
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: SHEET_NAME },
              },
            },
          ],
        },
      });
    } catch (err) {
      const msg = String(err.message || err);
      if (!msg.includes("already exists")) {
        throw err;
      }
    }

    const metaAgain = await sheets.spreadsheets.get({ spreadsheetId });
    sheet = findSheetByName(metaAgain.data.sheets || [], SHEET_NAME);
  }

  resolvedSheetTitle = sheet?.properties?.title || SHEET_NAME;
  resolvedSheetId = sheet?.properties?.sheetId ?? null;

  const headerRange = `${resolvedSheetTitle}!A1:${columnLetter(COL_COUNT)}1`;
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: headerRange,
  });

  const firstRow = headerRes.data.values?.[0] || [];
  await syncHeaders(sheets, spreadsheetId, firstRow);
}

/**
 * 1-based 欄位字母（1=A）
 * @param {number} col
 */
function columnLetter(col) {
  let s = "";
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * 同步標題列（補 tags、id 等欄）
 */
async function syncHeaders(sheets, spreadsheetId, firstRow) {
  if (firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${resolvedSheetTitle}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [HEADERS] },
    });
    return;
  }

  const hasTags = firstRow.includes("tags");
  const hasId = firstRow.includes("id");
  const hasChatId = firstRow.includes("chatId");
  const hasRecordedBy = firstRow.includes("recordedBy");
  const hasSharedWith = firstRow.includes("sharedWith");
  const legacyDateHeader = firstRow[0] === "日期";

  if (
    !hasTags ||
    !hasId ||
    !hasChatId ||
    !hasRecordedBy ||
    !hasSharedWith ||
    legacyDateHeader ||
    firstRow.length < HEADERS.length
  ) {
    console.log("[GoogleSheet] 更新標題列為新版欄位");
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${resolvedSheetTitle}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [HEADERS] },
    });
  }
}

/**
 * @param {string[][]} rows
 * @returns {object[]}
 */
function mapRowsToTransactions(rows) {
  return rows.map((row, i) => mapRowToTransaction(row, i + 2));
}

/**
 * 相容舊版 10/11 欄與新版 12 欄
 * @param {string[]} row
 * @param {number} rowIndex
 */
function serializeSharedWith(sharedWith) {
  return serializeTags(sharedWith);
}

function parseSharedWith(value) {
  return parseTags(value);
}

function mapRowToTransaction(row, rowIndex) {
  const len = row.length;
  let category = "other";
  let tags = [];
  let rawText = "";
  let id = "";
  let chatId = "";
  let recordedBy = "";
  let recordedByName = "";
  let sharedWith = [];

  if (len >= 16) {
    category = row[8] || "other";
    tags = parseTags(row[9]);
    rawText = row[10] || "";
    id = row[11] || "";
    chatId = row[12] || "";
    recordedBy = row[13] || "";
    recordedByName = row[14] || "";
    sharedWith = parseSharedWith(row[15]);
  } else if (len >= 15) {
    category = row[8] || "other";
    tags = parseTags(row[9]);
    rawText = row[10] || "";
    id = row[11] || "";
    chatId = row[12] || "";
    recordedBy = row[13] || "";
    recordedByName = row[14] || "";
  } else if (len >= 13) {
    category = row[8] || "other";
    tags = parseTags(row[9]);
    rawText = row[10] || "";
    id = row[11] || "";
    chatId = row[12] || "";
  } else if (len >= 12) {
    category = row[8] || "other";
    tags = parseTags(row[9]);
    rawText = row[10] || "";
    id = row[11] || "";
  } else if (len === 11) {
    category = row[8] || "other";
    if (row[9] && row[9].includes(",") && !row[10]) {
      tags = parseTags(row[9]);
      rawText = "";
      id = row[10] || "";
    } else {
      rawText = row[9] || "";
      id = row[10] || "";
    }
  } else if (len >= 10) {
    category = row[8] || "other";
    rawText = row[9] || "";
  }

  const item = row[3] || "";
  const normalized = normalizeCategory(category);
  category = normalized || inferCategoryFromItem(item, rawText, tags) || "other";
  if (!CATEGORIES.includes(category)) {
    category = "other";
  }

  return {
    rowIndex,
    id,
    chatId,
    date: row[0] || "",
    payer: row[1] || "",
    consumer: row[2] || "",
    item,
    amount: parseFloat(row[4]) || 0,
    currency: row[5] || "TWD",
    twdAmount: parseFloat(row[6]) || 0,
    relation: row[7] || "self",
    category,
    tags,
    rawText,
    recordedBy,
    recordedByName,
    sharedWith,
  };
}

/**
 * 交易物件 → Sheet 列（供寫入與測試）
 * @param {object} data
 * @param {string} id
 * @param {string} chatId
 */
function transactionToRow(data, id, chatId) {
  return [
    data.date || formatTransactionDateTime(),
    data.payer || "",
    data.consumer || "",
    data.item || "",
    data.amount ?? "",
    data.currency || "",
    data.twdAmount ?? "",
    data.relation || "",
    data.category || "other",
    serializeTags(data.tags),
    data.rawText || "",
    id,
    chatId,
    data.recordedBy || "",
    data.recordedByName || "",
    serializeSharedWith(data.sharedWith),
  ];
}

async function fetchRawRows() {
  await ensureSheetReady();
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${resolvedSheetTitle}!A2:${columnLetter(COL_COUNT)}`,
  });

  return res.data.values || [];
}

/**
 * 讀取所有交易紀錄
 * @returns {Promise<object[]>}
 */
async function getAllTransactions(forceRefresh = false) {
  const now = Date.now();
  if (
    !forceRefresh &&
    transactionsCache &&
    now - transactionsCache.fetchedAt < SHEET_CACHE_TTL_MS
  ) {
    console.log(
      `[GoogleSheet] 使用快取 ${transactionsCache.rows.length} 筆（全表）`
    );
    return transactionsCache.rows;
  }

  const rows = await fetchRawRows();
  const transactions = mapRowsToTransactions(rows);
  transactionsCache = { rows: transactions, fetchedAt: now };
  console.log(`[GoogleSheet] 讀取 ${rows.length} 筆交易（全表）`);
  return transactions;
}

/**
 * 讀取指定 LINE 帳本的交易（依 chatId 過濾）
 * @param {string} chatId
 * @returns {Promise<object[]>}
 */
async function getTransactions(chatId) {
  const all = await getAllTransactions();
  const filtered = filterTransactionsByChatId(all, chatId);
  console.log(
    `[GoogleSheet] chatId=${shortChatId(chatId)} 帳本 ${filtered.length} 筆`
  );
  return filtered;
}

/**
 * @param {string} chatId
 */
function shortChatId(chatId) {
  const s = String(chatId || "");
  if (s.length <= 12) return s;
  return `${s.slice(0, 8)}…`;
}

/**
 * 最近 N 筆（由新到舊，限單一帳本）
 * @param {string} chatId
 * @param {number} [n]
 */
async function getRecentTransactions(chatId, n = 5) {
  const all = await getTransactions(chatId);
  return all.slice(-n).reverse();
}

/**
 * 新增一筆交易紀錄
 * @param {object} data
 * @param {string} chatId - LINE groupId / userId
 * @returns {Promise<object>} 含 id、chatId 的完整資料
 */
async function appendTransaction(data, chatId) {
  const bookId = (chatId || data.chatId || "").trim();
  if (!bookId) {
    throw new Error("缺少 chatId，無法寫入帳本");
  }

  await ensureSheetReady();

  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const id = data.id || crypto.randomUUID();

  const row = transactionToRow(data, id, bookId);

  console.log("[GoogleSheet] 新增交易:", row);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${resolvedSheetTitle}!A:${columnLetter(COL_COUNT)}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });

  console.log("[GoogleSheet] 寫入成功");
  invalidateTransactionsCache();
  return { ...data, id, chatId: bookId };
}

/**
 * 刪除指定列
 * @param {number} rowIndex - 工作表列號（1-based，含標題）
 */
async function deleteRowByIndex(rowIndex) {
  if (resolvedSheetId == null) {
    await ensureSheetReady();
  }
  if (resolvedSheetId == null) {
    throw new Error("無法取得工作表 ID");
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: resolvedSheetId,
              dimension: "ROWS",
              startIndex: rowIndex - 1,
              endIndex: rowIndex,
            },
          },
        },
      ],
    },
  });

  console.log(`[GoogleSheet] 已刪除第 ${rowIndex} 列`);
  invalidateTransactionsCache();
}

/**
 * 刪除指定帳本最後一筆交易
 * @param {string} chatId
 * @returns {Promise<{ status: 'ok'|'empty', transaction?: object }>}
 */
async function deleteLastTransaction(chatId, options = {}) {
  const all = await getTransactions(chatId);
  const scoped = scopeTransactionsForDelete(all, options.actor);
  if (scoped.length === 0) {
    return { status: all.length === 0 ? "empty" : "not_owned" };
  }

  const target = scoped[scoped.length - 1];
  await deleteRowByIndex(target.rowIndex);
  return { status: "ok", transaction: target };
}

/**
 * 依項目關鍵字刪除（預設：多筆時只刪最新一筆匹配，限單一帳本）
 * @param {string} keyword
 * @param {string} chatId
 * @param {{ pickIndex?: number }} [options]
 * @returns {Promise<{ status: string, transaction?: object, matches?: object[] }>}
 */
function scopeTransactionsForDelete(transactions, actor) {
  if (!actor?.userId) return transactions;
  const { filterDeletableTransactions } = require("./ledger");
  return filterDeletableTransactions(transactions, actor);
}

async function deleteByItemKeyword(keyword, chatId, options = {}) {
  const kw = (keyword || "").trim();
  if (!kw) {
    return deleteLastTransaction(chatId, options);
  }

  const all = scopeTransactionsForDelete(
    await getTransactions(chatId),
    options.actor
  );
  const matches = all
    .filter(
      (tx) =>
        (tx.item && tx.item.includes(kw)) ||
        (tx.rawText && tx.rawText.includes(kw))
    )
    .reverse();

  if (matches.length === 0) {
    return { status: "not_found", keyword: kw };
  }

  if (matches.length > 1 && options.pickIndex == null) {
    return {
      status: "multiple",
      keyword: kw,
      matches: matches.slice(0, 5).map((tx, i) => ({
        index: i + 1,
        rowIndex: tx.rowIndex,
        item: tx.item,
        amount: tx.amount,
        currency: tx.currency,
        date: tx.date,
      })),
    };
  }

  const pick =
    options.pickIndex != null
      ? matches[options.pickIndex - 1]
      : matches[0];

  if (!pick) {
    return { status: "not_found", keyword: kw };
  }

  await deleteRowByIndex(pick.rowIndex);
  return { status: "ok", transaction: pick };
}

/**
 * 依暫存序號刪除（多筆匹配後使用者選擇，限單一帳本）
 * @param {object[]} matches
 * @param {number} pickIndex - 1-based
 * @param {string} chatId
 */
async function deleteByPickIndex(matches, pickIndex, chatId) {
  const entry = matches.find((m) => m.index === pickIndex);
  if (!entry) {
    return { status: "invalid_pick" };
  }

  const all = await getTransactions(chatId);
  const tx = all.find((t) => t.rowIndex === entry.rowIndex);
  if (!tx) {
    return { status: "not_found" };
  }

  await deleteRowByIndex(tx.rowIndex);
  return { status: "ok", transaction: tx };
}

module.exports = {
  appendTransaction,
  getAllTransactions,
  getTransactions,
  getRecentTransactions,
  deleteLastTransaction,
  deleteByItemKeyword,
  deleteByPickIndex,
  mapRowToTransaction,
  transactionToRow,
  serializeSharedWith,
  parseSharedWith,
  invalidateTransactionsCache,
  SHEET_CACHE_TTL_MS,
  HEADERS,
};
