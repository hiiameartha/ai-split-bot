/**
 * ledger 帳務口徑測試
 */
const {
  summarizeLedger,
  getPersonalMonthLedger,
  getPersonalDebtTransactions,
  filterDeletableTransactions,
} = require("../services/ledger");
const { calculateBalances } = require("../services/settlement");

function assert(cond, msg) {
  if (!cond) {
    console.error("❌", msg);
    process.exit(1);
  }
  console.log("✅", msg);
}

const alice = { userId: "U-alice", displayName: "小愛" };
const bob = { userId: "U-bob", displayName: "阿明" };

const txs = [
  {
    date: "2026/05/10 12:00",
    payer: "我",
    consumer: "我",
    relation: "self",
    amount: 1000,
    twdAmount: 1000,
    category: "food",
    recordedBy: "U-alice",
    recordedByName: "小愛",
  },
  {
    date: "2026/05/11 12:00",
    payer: "我",
    consumer: "我",
    relation: "income",
    amount: 50000,
    twdAmount: 50000,
    category: "transfer",
    item: "薪水",
    recordedBy: "U-alice",
    recordedByName: "小愛",
  },
  {
    date: "2026/05/12 12:00",
    payer: "男友",
    consumer: "我",
    relation: "paid_for_me",
    amount: 200,
    twdAmount: 200,
    category: "food",
    recordedBy: "U-bob",
    recordedByName: "阿明",
  },
];

const aliceTxs = txs.filter((t) => t.recordedBy === "U-alice");
const ledger = summarizeLedger(aliceTxs);
assert(ledger.expenseTotal === 1000, "支出 1000");
assert(ledger.incomeTotal === 50000, "收入 50000 為正");
assert(ledger.netTotal === 1000 - 50000, "淨額 = 支 - 收");
assert(ledger.byCategoryIncome.transfer === 50000, "收入分類");

const personal = getPersonalMonthLedger(txs, alice);
assert(personal.monthTx.length === 2, "小愛個人帳本 2 筆");
assert(personal.meta.incomeTotal === 50000, "個人報表含自己薪水");

const debtTx = getPersonalDebtTransactions(txs, alice);
assert(debtTx.length === 0, "小愛沒有自己記的代墊列");
const bobDebt = getPersonalDebtTransactions(txs, bob);
assert(bobDebt.length === 1, "阿明有自己的代墊列");

const balancesAll = calculateBalances(txs);
const balancesBob = calculateBalances(bobDebt);
assert(
  Object.keys(balancesAll).length > 0,
  "全帳本有欠款"
);
assert(
  JSON.stringify(balancesBob) === JSON.stringify(balancesAll),
  "阿明個人代墊與其記帳列一致"
);

const deletable = filterDeletableTransactions(txs, alice);
assert(deletable.length === 2, "小愛只能刪自己的 2 筆");

console.log("\nledger 測試通過");
