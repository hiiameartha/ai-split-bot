/**
 * 交易日期時間（含時區）
 * - 新資料：ISO 8601 + offset，例 2026-05-16T14:30:45+08:00
 * - 舊資料：YYYYMMDD 仍相容（以 MOODPAY_TIMEZONE 解讀為該日 12:00）
 */

const DEFAULT_TIMEZONE = "Asia/Taipei";

/**
 * @returns {string} IANA 時區，例 Asia/Taipei
 */
function getAppTimeZone() {
  const tz = (
    process.env.MOODPAY_TIMEZONE ||
    process.env.TZ ||
    DEFAULT_TIMEZONE
  ).trim();
  return tz || DEFAULT_TIMEZONE;
}

/**
 * @param {Date} date
 * @param {string} [timeZone]
 */
function getTimezoneOffsetMs(date, timeZone = getAppTimeZone()) {
  const utc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const zoned = new Date(date.toLocaleString("en-US", { timeZone }));
  return zoned.getTime() - utc.getTime();
}

/**
 * @param {Date} date
 * @param {string} [timeZone]
 */
function getZonedParts(date, timeZone = getAppTimeZone()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const pick = (type) =>
    parseInt(parts.find((p) => p.type === type)?.value || "0", 10);

  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second"),
  };
}

/**
 * @param {number} offsetMs
 */
function formatOffsetFromMs(offsetMs) {
  const sign = offsetMs >= 0 ? "+" : "-";
  const totalMin = Math.round(Math.abs(offsetMs) / 60000);
  const h = String(Math.floor(totalMin / 60)).padStart(2, "0");
  const m = String(totalMin % 60).padStart(2, "0");
  return `${sign}${h}:${m}`;
}

/**
 * 寫入 Sheet 用：含時間與時區偏移
 * @param {Date} [d]
 * @returns {string} 例 2026-05-16T14:30:45+08:00
 */
function formatTransactionDateTime(d = new Date()) {
  const tz = getAppTimeZone();
  const p = getZonedParts(d, tz);
  const offset = formatOffsetFromMs(getTimezoneOffsetMs(d, tz));
  const pad = (n) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${offset}`;
}

/**
 * @param {Date} [d]
 * @returns {string} 例如 20260516
 */
function formatDateYYYYMMDD(d = new Date()) {
  const p = getZonedParts(d);
  const pad = (n) => String(n).padStart(2, "0");
  return `${p.year}${pad(p.month)}${pad(p.day)}`;
}

/**
 * 截圖匯入等只有年月日時：該日 12:00（應用時區）避免 DST 邊界
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} day
 */
function formatDateAtNoonInAppTz(year, month, day) {
  const tz = getAppTimeZone();
  const guessUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const offsetMs = getTimezoneOffsetMs(guessUtc, tz);
  const utcMs = Date.UTC(year, month - 1, day, 12, 0, 0) - offsetMs;
  return formatTransactionDateTime(new Date(utcMs));
}

/**
 * 解析交易日期（YYYYMMDD、ISO 含/不含時區）
 * @param {string} value
 * @returns {Date|null}
 */
function parseTransactionDate(value) {
  if (!value) return null;

  const raw = String(value).trim();

  if (/^\d{8}$/.test(raw)) {
    const y = parseInt(raw.slice(0, 4), 10);
    const m = parseInt(raw.slice(4, 6), 10);
    const d = parseInt(raw.slice(6, 8), 10);
    const iso = formatDateAtNoonInAppTz(y, m, d);
    const parsed = new Date(iso);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  const iso = new Date(raw);
  return isNaN(iso.getTime()) ? null : iso;
}

/**
 * @param {Date} date
 * @param {Date} [ref]
 */
function isSameMonthInAppTz(date, ref = new Date()) {
  const a = getZonedParts(date);
  const b = getZonedParts(ref);
  return a.year === b.year && a.month === b.month;
}

/**
 * 圖表用 M/D（應用時區）
 * @param {string|Date} value
 */
function formatChartDayLabel(value) {
  const d =
    value instanceof Date ? value : parseTransactionDate(String(value || ""));
  if (!d) return "未知";
  const p = getZonedParts(d);
  return `${p.month}/${p.day}`;
}

/**
 * 列表顯示：2026/05/16 14:30 (+08:00)
 * @param {string} value
 */
function formatDateTimeForDisplay(value) {
  const d = parseTransactionDate(value);
  if (!d) return String(value || "").slice(0, 8) || "";

  const raw = String(value).trim();
  const tz = getAppTimeZone();
  const p = getZonedParts(d, tz);
  const pad = (n) => String(n).padStart(2, "0");
  const datePart = `${p.year}/${pad(p.month)}/${pad(p.day)}`;

  if (/^\d{8}$/.test(raw)) {
    return datePart;
  }

  const offset =
    raw.match(/([+-]\d{2}:\d{2}|Z)$/)?.[1] ||
    formatOffsetFromMs(getTimezoneOffsetMs(d, tz));
  const offsetShort = offset === "Z" ? "UTC" : offset;
  return `${datePart} ${pad(p.hour)}:${pad(p.minute)} (${offsetShort})`;
}

module.exports = {
  DEFAULT_TIMEZONE,
  getAppTimeZone,
  formatTransactionDateTime,
  formatDateYYYYMMDD,
  formatDateAtNoonInAppTz,
  parseTransactionDate,
  isSameMonthInAppTz,
  formatChartDayLabel,
  formatDateTimeForDisplay,
  getZonedParts,
};
