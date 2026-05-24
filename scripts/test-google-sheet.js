/**
 * Google Sheet 列映射：sharedWith 往返與分帳還原
 */

const {
  mapRowToTransaction,
  transactionToRow,
  serializeSharedWith,
  parseSharedWith,
  HEADERS,
} = require("../services/googleSheet");
const { calculateBalances } = require("../services/settlement");

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

assert(HEADERS.includes("sharedWith"), "HEADERS 含 sharedWith 欄");

const scoped = [
  "阿明#U111",
  "小胖#U111",
  "男友#U111",
  "我#U111",
];
const serialized = serializeSharedWith(scoped);
assert(
  parseSharedWith(serialized).join("|") === scoped.join("|"),
  "sharedWith 序列化往返"
);

const tx = {
  date: "2025-05-24 12:00",
  payer: "阿明#U111",
  consumer: "我#U111",
  item: "火鍋",
  amount: 1200,
  currency: "TWD",
  twdAmount: 1200,
  relation: "shared",
  category: "food",
  tags: ["火鍋", "聚餐"],
  rawText: "四人分火鍋",
  recordedBy: "U111",
  recordedByName: "我",
  sharedWith: scoped,
};

const row = transactionToRow(tx, "tx-uuid-1", "G_chat");
assert(row.length === HEADERS.length, "transactionToRow 欄位數正確");
assert(row[15] === serialized, "sharedWith 寫入最後一欄");

const restored = mapRowToTransaction(row, 2);
assert(
  restored.sharedWith.join("|") === scoped.join("|"),
  "mapRowToTransaction 還原 sharedWith"
);
assert(restored.relation === "shared", "relation 保留");

const oldRow = row.slice(0, 15);
const legacy = mapRowToTransaction(oldRow, 3);
assert(
  Array.isArray(legacy.sharedWith) && legacy.sharedWith.length === 0,
  "舊版 15 欄列 sharedWith 為空陣列"
);

const balances = calculateBalances([restored]);
assert(balances["阿明#U111"] === 900, "四人分攤：代墊人餘額 +900");
assert(balances["我#U111"] === -300, "四人分攤：參與者 -300");
assert(balances["小胖#U111"] === -300, "四人分攤：參與者 -300");
assert(balances["男友#U111"] === -300, "四人分攤：參與者 -300");

const twoPersonFallback = mapRowToTransaction(
  transactionToRow(
    {
      ...tx,
      sharedWith: [],
      payer: "阿明",
      consumer: "我",
    },
    "tx-2",
    "G_chat"
  ).slice(0, 15),
  4
);
const fallbackBalances = calculateBalances([
  { ...twoPersonFallback, relation: "shared", twdAmount: 1200 },
]);
assert(
  fallbackBalances["阿明"] === 600 && fallbackBalances["我"] === -600,
  "無 sharedWith 時仍 fallback 為 payer+consumer 兩人"
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
