/**
 * Sheet 快取邏輯測試（不連 Google API）
 */

const {
  invalidateTransactionsCache,
  SHEET_CACHE_TTL_MS,
  mapRowToTransaction,
  transactionToRow,
  HEADERS,
} = require("../services/googleSheet");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`✅ ${msg}`);
  } else {
    failed++;
    console.error(`❌ ${msg}`);
  }
}

assert(SHEET_CACHE_TTL_MS > 0, "SHEET_CACHE_TTL_MS 已設定");
invalidateTransactionsCache();
assert(true, "invalidateTransactionsCache 可呼叫");

const row = transactionToRow(
  {
    payer: "我",
    consumer: "我",
    item: "測試",
    amount: 100,
    currency: "TWD",
    twdAmount: 100,
    relation: "self",
    sharedWith: ["我", "男友"],
  },
  "id-1",
  "G_test"
);
const tx = mapRowToTransaction(row, 2);
assert(tx.sharedWith.length === 2, "快取測試用列映射正常");
assert(HEADERS.length === row.length, "HEADERS 與列長度一致");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
