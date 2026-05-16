/**
 * 代墊結算文案與 simplifyDebts 測試
 */

const { calculateBalances, simplifyDebts } = require("../services/settlement");
const { formatDebtReport, formatDebtSettlementBody } = require("../utils/formatter");
const { relabelTotalsForViewer } = require("../services/actor");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

const viewer = {
  userId: "U56a5f91896cb02323195d80f9a97156b",
  displayName: "ㄚㄓت",
  selfLabel: "我",
};
const txs = [
  {
    payer: viewer.userId,
    consumer: viewer.userId,
    relation: "self",
    twdAmount: 130,
  },
  {
    payer: "詠詒#U56a5f91896cb02323195d80f9a97156b",
    consumer: "ㄚㄓت",
    relation: "paid_for_me",
    twdAmount: 50,
  },
];

const raw = calculateBalances(txs);
assert(raw["ㄚㄓت"] === -50 && raw["詠詒#U56a5f91896cb02323195d80f9a97156b"] === 50, "餘額：消費者欠墊款人");

const edges = simplifyDebts(raw);
assert(
  edges.length === 1 &&
    edges[0].debtor === "ㄚㄓت" &&
    edges[0].creditor === "詠詒#U56a5f91896cb02323195d80f9a97156b" &&
    edges[0].amount === 50,
  "simplifyDebts 單一路徑"
);

const balances = relabelTotalsForViewer(raw, viewer, txs);
const body = formatDebtSettlementBody(balances);
assert(body.includes("你要還給") && body.includes("50"), "視角文案：你要還給對方");
assert(!body.includes("別人欠"), "不再出現「別人欠 TA」");
assert(!body.includes("欠別人"), "不再出現「欠別人」");

const report = formatDebtReport(balances);
assert(report.includes("代墊結算"), "標題改為代墊結算");
assert((report.match(/你要還給/g) || []).length === 1, "只列一筆還款（不重複鏡像）");

console.log(`\n範例輸出：\n${report}\n`);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
