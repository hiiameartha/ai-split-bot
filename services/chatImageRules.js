/**
 * 聊天截圖正負號規則（無 OpenAI 依賴）
 */

const {
  formatTransactionDateTime,
  formatDateAtNoonInAppTz,
} = require("../utils/date");

function getImportConfig() {
  return {
    positivePayer: process.env.CHAT_IMPORT_POSITIVE_PAYER || "男友",
    userName: process.env.CHAT_IMPORT_USER || "我",
    currency: (process.env.CHAT_IMPORT_CURRENCY || "MYR").toUpperCase(),
    year: parseInt(process.env.CHAT_IMPORT_YEAR || String(new Date().getFullYear()), 10),
  };
}

/**
 * @param {number} rawAmount
 * @param {ReturnType<typeof getImportConfig>} cfg
 */
function applySignConvention(rawAmount, cfg) {
  const amount = Math.abs(Number(rawAmount) || 0);
  if (amount <= 0) {
    return null;
  }

  if (rawAmount > 0) {
    return {
      amount,
      payer: cfg.positivePayer,
      consumer: cfg.userName,
      relation: "paid_for_me",
    };
  }

  return {
    amount,
    payer: cfg.userName,
    consumer: cfg.positivePayer,
    relation: "i_paid",
  };
}

/**
 * @param {string} dateLabel
 * @param {number} year
 */
function parseDateLabel(dateLabel, year) {
  if (!dateLabel) return formatTransactionDateTime();

  const m = String(dateLabel).match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (!m) return formatTransactionDateTime();

  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return formatTransactionDateTime();
  }
  return formatDateAtNoonInAppTz(year, month, day);
}

module.exports = {
  getImportConfig,
  applySignConvention,
  parseDateLabel,
};
