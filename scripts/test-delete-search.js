/**
 * 刪除搜尋與確認意圖測試
 */

const {
  parseDeleteQuery,
  filterTransactionsForDeleteQuery,
  toDeleteMatchEntry,
} = require("../services/deleteSearch");
const { classifyIntent } = require("../services/intent");

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

const q1 = parseDeleteQuery("5/26的義大利麵");
assert(q1.month === 5 && q1.day === 26 && q1.item === "義大利麵", "解析 5/26的義大利麵");

const txs = [
  {
    rowIndex: 2,
    item: "義大利麵",
    amount: 200,
    currency: "TWD",
    date: "2026-05-26T12:00:00+08:00",
  },
  {
    rowIndex: 3,
    item: "義大利麵",
    amount: 180,
    currency: "TWD",
    date: "2026-05-25T12:00:00+08:00",
  },
  {
    rowIndex: 4,
    item: "拉麵",
    amount: 120,
    currency: "TWD",
    date: "2026-05-26T12:00:00+08:00",
  },
];

const m526 = filterTransactionsForDeleteQuery(txs, q1);
assert(m526.length === 1 && m526[0].item === "義大利麵", "5/26 + 義大利麵 只命中一筆");

async function runIntent() {
  const c1 = await classifyIntent("確認");
  assert(c1.intent === "delete_confirm", "確認 → delete_confirm");

  const c2 = await classifyIntent("取消");
  assert(c2.intent === "delete_cancel", "取消 → delete_cancel");

  const d1 = await classifyIntent("刪除5/26的義大利麵");
  assert(d1.intent === "delete" && d1.target.includes("義大利麵"), "刪除5/26的義大利麵 → delete");

  const d2 = await classifyIntent("移除上一筆資料");
  assert(
    d2.intent === "delete" && d2.target === "__last__",
    "移除上一筆資料 → 刪最後一筆"
  );
}

runIntent()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
