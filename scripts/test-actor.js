/**
 * 角色解析單元測試（不需 API）
 */

const {
  resolveActorsForStorage,
  relabelTotalsForViewer,
  formatTransactionRoles,
  filterTransactionsForViewer,
  stripScopeSuffix,
} = require("../services/actor");

const alice = { userId: "U111alice", displayName: "小愛", selfLabel: "我" };
const bob = { userId: "U222bob", displayName: "阿明", selfLabel: "我" };

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

const selfTx = resolveActorsForStorage(
  { payer: "我", consumer: "我", relation: "self", sharedWith: [] },
  alice
);
assert(
  selfTx.payer === "小愛" && selfTx.consumer === "小愛",
  "自己消費：我 → 小愛"
);

const paidForMe = resolveActorsForStorage(
  {
    payer: "男友",
    consumer: "我",
    relation: "paid_for_me",
    sharedWith: [],
  },
  alice
);
assert(
  paidForMe.payer === "男友#U111alice" && paidForMe.consumer === "小愛",
  "男友幫我付：男友 scope 到小愛的 userId"
);

const bobPaid = resolveActorsForStorage(
  {
    payer: "我",
    consumer: "男友",
    relation: "i_paid",
    sharedWith: [],
  },
  bob
);
assert(
  bobPaid.payer === "阿明" && bobPaid.consumer === "男友#U222bob",
  "我請男友：兩人的男友不同 scope"
);

assert(
  stripScopeSuffix("男友#U111alice") === "男友",
  "stripScopeSuffix"
);

const txs = [
  {
    recordedBy: "U111alice",
    recordedByName: "小愛",
    payer: "男友#U111alice",
    consumer: "小愛",
    relation: "paid_for_me",
    twdAmount: 100,
  },
  {
    recordedBy: "U222bob",
    recordedByName: "阿明",
    payer: "阿明",
    consumer: "男友#U222bob",
    relation: "i_paid",
    twdAmount: 50,
  },
];

const aliceOnly = filterTransactionsForViewer(txs, alice);
assert(aliceOnly.length === 1 && aliceOnly[0].recordedBy === "U111alice", "個人篩選：小愛只看自己的列");

const debtMerged = relabelTotalsForViewer(
  { "男友#U111alice": 100, "男友#U222bob": -50, 小愛: -100 },
  alice,
  txs
);
assert(
  debtMerged["男友"] === 100 && debtMerged["男友（阿明）"] === -50,
  "欠款顯示：自己的男友 vs 他人的男友不合併"
);

const roleLine = formatTransactionRoles(
  {
    payer: "男友#U111alice",
    consumer: "小愛",
    relation: "paid_for_me",
  },
  alice
);
assert(roleLine === "男友 幫 我 付", "角色文案：paid_for_me");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
