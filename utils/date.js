/**
 * 交易日期格式：YYYYMMDD
 */

/**
 * @param {Date} [d]
 * @returns {string} 例如 20260516
 */
function formatDateYYYYMMDD(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * 解析交易日期（支援 YYYYMMDD 與 ISO）
 * @param {string} value
 * @returns {Date|null}
 */
function parseTransactionDate(value) {
  if (!value) return null;

  const raw = String(value).trim();

  if (/^\d{8}$/.test(raw)) {
    const y = parseInt(raw.slice(0, 4), 10);
    const m = parseInt(raw.slice(4, 6), 10) - 1;
    const d = parseInt(raw.slice(6, 8), 10);
    const date = new Date(y, m, d);
    return isNaN(date.getTime()) ? null : date;
  }

  const iso = new Date(raw);
  return isNaN(iso.getTime()) ? null : iso;
}

module.exports = {
  formatDateYYYYMMDD,
  parseTransactionDate,
};
