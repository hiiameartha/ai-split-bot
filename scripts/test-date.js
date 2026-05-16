/**
 * 日期時間 + 時區單元測試
 */

const {
  getAppTimeZone,
  formatTransactionDateTime,
  formatDateYYYYMMDD,
  formatDateAtNoonInAppTz,
  parseTransactionDate,
  isSameMonthInAppTz,
  formatChartDayLabel,
  formatDateTimeForDisplay,
} = require("../utils/date");

process.env.MOODPAY_TIMEZONE = "Asia/Taipei";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log("✅", msg);
    passed += 1;
  } else {
    console.log("❌", msg);
    failed += 1;
  }
}

assert(getAppTimeZone() === "Asia/Taipei", "時區讀取");

const iso = formatTransactionDateTime(new Date("2026-05-16T06:30:00.000Z"));
assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(iso), `ISO+offset: ${iso}`);

const legacy = parseTransactionDate("20260510");
assert(legacy && isSameMonthInAppTz(legacy, new Date("2026-05-16")), "舊 YYYYMMDD 可解析且算本月");

const roundTrip = parseTransactionDate(iso);
assert(roundTrip && !isNaN(roundTrip.getTime()), "ISO 往返解析");

const noon = formatDateAtNoonInAppTz(2025, 3, 4);
const noonParsed = parseTransactionDate(noon);
assert(formatChartDayLabel(noon) === "3/4", `截圖日 3/4 → ${formatChartDayLabel(noon)}`);

const display = formatDateTimeForDisplay(iso);
assert(display.includes("/") && display.includes(":"), `顯示格式: ${display}`);

const ymd = formatDateYYYYMMDD(new Date("2026-05-16T06:30:00.000Z"));
assert(ymd === "20260516", `YYYYMMDD 台灣日: ${ymd}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
