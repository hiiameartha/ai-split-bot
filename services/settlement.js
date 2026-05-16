/**
 * MoodPay - 分帳與欠款計算服務
 * 根據交易紀錄計算各人之間的淨欠款
 */

const { parseTransactionDate, isSameMonthInAppTz } = require("../utils/date");

/**
 * 計算各人淨餘額
 * 正數 = 別人欠你；負數 = 你欠別人
 *
 * @param {object[]} transactions - 交易陣列
 * @returns {Record<string, number>} 例如 { "我": -500, "男友": 500 }
 */
function calculateBalances(transactions) {
  const balances = {};

  /**
   * 調整某人的餘額
   * @param {string} name
   * @param {number} delta
   */
  const adjust = (name, delta) => {
    if (!name || delta === 0) return;
    balances[name] = (balances[name] || 0) + delta;
  };

  for (const tx of transactions) {
    const amount = tx.twdAmount || tx.amount || 0;
    if (amount <= 0) continue;

    const payer = tx.payer || "我";
    const consumer = tx.consumer || "我";
    const relation = tx.relation || "self";

    console.log(
      `[Settlement] 處理: ${payer} → ${consumer}, ${amount} TWD, relation=${relation}`
    );

    switch (relation) {
      case "self":
        // 自己付自己用，不產生欠款
        break;

      case "paid_for_me":
        // 別人幫我付：我欠 payer
        adjust(consumer, -amount);
        adjust(payer, amount);
        break;

      case "i_paid":
        // 我幫別人付：consumer 欠 payer
        adjust(consumer, -amount);
        adjust(payer, amount);
        break;

      case "shared": {
        // 多人分攤：每人負擔均分金額，payer 先代墊全額
        const participants = getSharedParticipants(tx);
        if (participants.length === 0) break;

        const share = amount / participants.length;

        for (const person of participants) {
          adjust(person, -share);
        }
        adjust(payer, amount);
        break;
      }

      default:
        console.warn(`[Settlement] 未知 relation: ${relation}`);
    }
  }

  // 四捨五入避免浮點誤差
  for (const name of Object.keys(balances)) {
    balances[name] = Math.round(balances[name]);
    // 接近 0 的餘額清掉
    if (Math.abs(balances[name]) < 1) {
      delete balances[name];
    }
  }

  console.log("[Settlement] 餘額結果:", balances);
  return balances;
}

/**
 * 將各人淨餘額化簡為最少還款路徑（誰還給誰）
 * @param {Record<string, number>} balances
 * @returns {{ debtor: string, creditor: string, amount: number }[]}
 */
function simplifyDebts(balances) {
  const debtors = [];
  const creditors = [];

  for (const [name, balance] of Object.entries(balances)) {
    const rounded = Math.round(balance);
    if (rounded > 0) creditors.push({ name, remaining: rounded });
    else if (rounded < 0) debtors.push({ name, remaining: -rounded });
  }

  debtors.sort((a, b) => b.remaining - a.remaining);
  creditors.sort((a, b) => b.remaining - a.remaining);

  const edges = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].remaining, creditors[j].remaining);
    if (pay >= 1) {
      edges.push({
        debtor: debtors[i].name,
        creditor: creditors[j].name,
        amount: pay,
      });
    }
    debtors[i].remaining -= pay;
    creditors[j].remaining -= pay;
    if (debtors[i].remaining < 1) i++;
    if (creditors[j].remaining < 1) j++;
  }

  return edges;
}

/**
 * 取得 shared 交易的參與者名單
 * @param {object} tx
 * @returns {string[]}
 */
function getSharedParticipants(tx) {
  if (tx.sharedWith && Array.isArray(tx.sharedWith) && tx.sharedWith.length > 0) {
    return [...new Set(tx.sharedWith.map(String))];
  }

  const participants = new Set([tx.payer, tx.consumer].filter(Boolean).map(String));
  return [...participants];
}

/**
 * 計算總支出（台幣）
 * @param {object[]} transactions
 * @returns {number}
 */
function calculateTotalExpense(transactions) {
  return transactions.reduce((sum, tx) => sum + (tx.twdAmount || tx.amount || 0), 0);
}

/**
 * 篩選本月交易
 * @param {object[]} transactions
 * @returns {object[]}
 */
function filterCurrentMonth(transactions) {
  const now = new Date();
  return transactions.filter((tx) => {
    const d = parseTransactionDate(tx.date);
    if (!d) return false;
    return isSameMonthInAppTz(d, now);
  });
}

/**
 * 依分類統計支出
 * @param {object[]} transactions
 * @returns {Record<string, number>}
 */
function summarizeByCategory(transactions) {
  const summary = {};
  for (const tx of transactions) {
    const cat = (tx.category || "other").toLowerCase();
    summary[cat] = (summary[cat] || 0) + (tx.twdAmount || tx.amount || 0);
  }
  return summary;
}

module.exports = {
  calculateBalances,
  simplifyDebts,
  calculateTotalExpense,
  filterCurrentMonth,
  summarizeByCategory,
};
