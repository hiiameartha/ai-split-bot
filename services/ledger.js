/**
 * MoodPay - 帳務口徑（單一來源）
 * 支出 / 收入 / 淨額、分類加總、個人帳本篩選
 */

const { getSignedTransactionAmount } = require("./parseHints");
const {
  filterTransactionsForViewer,
  transactionBelongsToViewer,
} = require("./actor");
const { filterCurrentMonth } = require("./settlement");

function getTransactionAmount(tx) {
  return Math.abs(Number(tx.twdAmount ?? tx.amount ?? 0));
}

function isIncomeTransaction(tx) {
  return tx.relation === "income";
}

function isTreatTransaction(tx) {
  return tx.relation === "treat";
}

function isExpenseTransaction(tx) {
  if (isIncomeTransaction(tx) || isTreatTransaction(tx)) return false;
  return getSignedTransactionAmount(tx) > 0;
}

/**
 * @param {object[]} transactions
 */
function summarizeLedger(transactions) {
  let expenseTotal = 0;
  let incomeTotal = 0;
  let expenseCount = 0;
  let incomeCount = 0;
  let treatCount = 0;

  const byCategoryExpense = {};
  const byCategoryIncome = {};
  const byCategoryNet = {};

  for (const tx of transactions || []) {
    const signed = getSignedTransactionAmount(tx);
    const cat = (tx.category || "other").toLowerCase();

    if (isTreatTransaction(tx)) {
      treatCount += 1;
      continue;
    }

    if (isIncomeTransaction(tx) || signed < 0) {
      const amt = Math.abs(signed);
      if (amt > 0) {
        incomeTotal += amt;
        incomeCount += 1;
        byCategoryIncome[cat] = (byCategoryIncome[cat] || 0) + amt;
        byCategoryNet[cat] = (byCategoryNet[cat] || 0) - amt;
      }
      continue;
    }

    if (signed > 0) {
      expenseTotal += signed;
      expenseCount += 1;
      byCategoryExpense[cat] = (byCategoryExpense[cat] || 0) + signed;
      byCategoryNet[cat] = (byCategoryNet[cat] || 0) + signed;
    }
  }

  const netTotal = expenseTotal - incomeTotal;

  return {
    expenseTotal,
    incomeTotal,
    netTotal,
    /** @deprecated 請用 netTotal；保留相容 */
    total: netTotal,
    expenseCount,
    incomeCount,
    treatCount,
    count: expenseCount + incomeCount + treatCount,
    byCategoryExpense,
    byCategoryIncome,
    byCategoryNet,
  };
}

/**
 * 個人本月帳本（僅自己記帳的列）
 * @param {object[]} allTransactions
 * @param {object} actor
 */
function getPersonalMonthLedger(allTransactions, actor) {
  const personal = filterTransactionsForViewer(allTransactions, actor);
  const monthTx = filterCurrentMonth(personal);
  const ledger = summarizeLedger(monthTx);
  const now = new Date();

  return {
    monthTx,
    meta: {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      ...ledger,
      personalScope: true,
      scopeLabel: actor?.displayName
        ? `你的帳本 · ${actor.displayName}`
        : "你的帳本",
    },
  };
}

/**
 * 個人代墊／分帳（僅含自己記下的交易）
 * @param {object[]} allTransactions
 * @param {object} actor
 */
function getPersonalDebtTransactions(allTransactions, actor) {
  return filterTransactionsForViewer(allTransactions, actor).filter((tx) => {
    const rel = tx.relation || "self";
    return rel === "paid_for_me" || rel === "i_paid" || rel === "shared";
  });
}

/**
 * 刪除候選：僅限自己記的列
 * @param {object[]} transactions
 * @param {object} actor
 */
function filterDeletableTransactions(transactions, actor) {
  if (!actor?.userId) return transactions;
  return (transactions || []).filter((tx) =>
    transactionBelongsToViewer(tx, actor)
  );
}

/**
 * 依記帳者彙總本月支出（群組戰力榜：每人只算自己記的帳）
 * @param {object[]} transactions
 */
function summarizeByRecorder(transactions) {
  const totals = {};

  for (const tx of transactions || []) {
    if (!isExpenseTransaction(tx)) continue;
    const amt = getSignedTransactionAmount(tx);
    if (amt <= 0) continue;

    const who = tx.recordedByName || tx.consumer || tx.payer || "我";
    totals[who] = (totals[who] || 0) + amt;
  }

  for (const k of Object.keys(totals)) {
    totals[k] = Math.round(totals[k]);
  }

  return totals;
}

/**
 * 每日支出（圖表用，不含收入）
 * @param {object[]} transactions
 */
function aggregateDailyExpense(transactions) {
  const daily = {};

  for (const tx of transactions || []) {
    if (!isExpenseTransaction(tx)) continue;
    const amount = getSignedTransactionAmount(tx);
    if (amount <= 0) continue;

    const { formatChartDayLabel } = require("../utils/date");
    const label = formatChartDayLabel(tx.date);
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

module.exports = {
  getSignedTransactionAmount,
  getTransactionAmount,
  isIncomeTransaction,
  isTreatTransaction,
  isExpenseTransaction,
  summarizeLedger,
  getPersonalMonthLedger,
  getPersonalDebtTransactions,
  filterDeletableTransactions,
  summarizeByRecorder,
  aggregateDailyExpense,
};
