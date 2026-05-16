/**
 * 聊天截圖正負號規則測試
 * node scripts/test-chat-image.js
 */

const {
  applySignConvention,
  parseDateLabel,
} = require("../services/chatImageRules");
const { parseTransactionDate, formatChartDayLabel } = require("../utils/date");

process.env.MOODPAY_TIMEZONE = "Asia/Taipei";

const cfg = { positivePayer: "男友", userName: "我" };

let passed = 0;

const pos = applySignConvention(14, cfg);
if (
  pos.relation === "paid_for_me" &&
  pos.payer === "男友" &&
  pos.consumer === "我" &&
  pos.amount === 14
) {
  console.log("✅ 正數 14 → 男友幫我付");
  passed += 1;
} else {
  console.log("❌ 正數規則", pos);
}

const neg = applySignConvention(-500, cfg);
if (
  neg.relation === "i_paid" &&
  neg.payer === "我" &&
  neg.consumer === "男友" &&
  neg.amount === 500
) {
  console.log("✅ 負數 -500 → 我請男友");
  passed += 1;
} else {
  console.log("❌ 負數規則", neg);
}

const date = parseDateLabel("3/4(週四)", 2025);
if (formatChartDayLabel(date) === "3/4" && parseTransactionDate(date)) {
  console.log("✅ 日期 3/4 →", date);
  passed += 1;
} else {
  console.log("❌ 日期", date);
}

console.log(`\n通過 ${passed}/3`);
process.exit(passed === 3 ? 0 : 1);
