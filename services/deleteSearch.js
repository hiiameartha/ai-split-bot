/**
 * 刪除搜尋：解析「5/26 的義大利麵」等日期＋項目條件
 */

const { parseTransactionDate, getZonedParts } = require("../utils/date");

/**
 * @param {string} target - 刪除指令去掉前綴後的字串
 * @returns {{ item: string, month: number|null, day: number|null }}
 */
function parseDeleteQuery(target) {
  const t = String(target || "").trim();
  if (!t) {
    return { item: "", month: null, day: null };
  }

  let m = t.match(/^(\d{1,2})\/(\d{1,2})[的之\s]*(.+)$/);
  if (m) {
    return {
      month: parseInt(m[1], 10),
      day: parseInt(m[2], 10),
      item: m[3].trim(),
    };
  }

  m = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})[的之\s]*(.+)$/);
  if (m) {
    return {
      month: parseInt(m[2], 10),
      day: parseInt(m[3], 10),
      item: m[4].trim(),
    };
  }

  m = t.match(/^(\d{1,2})月(\d{1,2})日[的之\s]*(.+)$/);
  if (m) {
    return {
      month: parseInt(m[1], 10),
      day: parseInt(m[2], 10),
      item: m[3].trim(),
    };
  }

  m = t.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    return {
      month: parseInt(m[1], 10),
      day: parseInt(m[2], 10),
      item: "",
    };
  }

  return { item: t, month: null, day: null };
}

/**
 * @param {object} tx
 * @param {number|null} month
 * @param {number|null} day
 */
function transactionMatchesDate(tx, month, day) {
  if (month == null || day == null) return true;
  const d = parseTransactionDate(tx.date);
  if (!d) return false;
  const p = getZonedParts(d);
  return p.month === month && p.day === day;
}

/**
 * @param {object} tx
 * @param {string} itemKeyword
 */
function transactionMatchesItem(tx, itemKeyword) {
  const kw = String(itemKeyword || "").trim();
  if (!kw) return true;
  return (
    (tx.item && tx.item.includes(kw)) ||
    (tx.rawText && tx.rawText.includes(kw))
  );
}

/**
 * @param {object[]} transactions
 * @param {{ item: string, month: number|null, day: number|null }} query
 */
function filterTransactionsForDeleteQuery(transactions, query) {
  return (transactions || []).filter(
    (tx) =>
      transactionMatchesDate(tx, query.month, query.day) &&
      transactionMatchesItem(tx, query.item)
  );
}

/**
 * @param {object} tx
 * @param {number} index - 1-based
 */
function toDeleteMatchEntry(tx, index) {
  return {
    index,
    rowIndex: tx.rowIndex,
    item: tx.item,
    amount: tx.amount,
    currency: tx.currency,
    date: tx.date,
    twdAmount: tx.twdAmount,
  };
}

module.exports = {
  parseDeleteQuery,
  transactionMatchesDate,
  transactionMatchesItem,
  filterTransactionsForDeleteQuery,
  toDeleteMatchEntry,
};
