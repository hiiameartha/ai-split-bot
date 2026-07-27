/**
 * parseHints 單元測試（算式、關係、收入）
 */
const {
  evaluateAmountFromText,
  applyParseHints,
  inferRelationFromText,
  detectIncomeContext,
  extractNotionalAmount,
  isTreatNotDebt,
  isITreatingOthers,
} = require("../services/parseHints");
const { calculateBalances } = require("../services/settlement");

function assert(cond, msg) {
  if (!cond) {
    console.error("❌", msg);
    process.exit(1);
  }
  console.log("✅", msg);
}

// 算式
assert(
  evaluateAmountFromText("花了3000+5000-80的錢") === 7920,
  "3000+5000-80 = 7920"
);
assert(evaluateAmountFromText("30x10") === 300, "30x10 = 300");
assert(evaluateAmountFromText("我阿嬤塞了30x10進我的錢包") === 300, "30x10 在句中 = 300");

// 被動／代付
const buffet = applyParseHints(
  {
    payer: "我",
    consumer: "女朋友",
    relation: "i_paid",
    amount: 300000,
    item: "buffet",
  },
  "今天被女朋友包養，吃buffet不用付錢，價值30萬"
);
assert(buffet.relation === "treat", "被包養不用付 → treat 請客不算債");
assert(buffet.amount === 0, "請客 → 實付 0 元");
assert(buffet.payer === "女朋友", "請客 → payer 女朋友");
assert(buffet.item.includes("價值30萬"), "請客 → item 含價值備註");
assert(buffet.item.includes("請客"), "請客 → item 含請客備註");

assert(
  extractNotionalAmount("價值30萬") === 300000,
  "價值30萬 → 300000"
);
assert(isTreatNotDebt("女朋友請我吃火鍋"), "請我吃 → 請客語境");
assert(!isTreatNotDebt("男友幫我付 25 馬幣火鍋"), "幫我付 → 代墊非請客");
assert(isITreatingOthers("我請同事吃晚餐"), "我請同事 → 我出錢請人");
assert(!isTreatNotDebt("我請同事吃晚餐"), "我請人吃 → 非被請客 treat");

const myTreat = applyParseHints(
  {
    payer: "我",
    consumer: "同事",
    relation: "treat",
    amount: 1000,
    item: "晚餐",
    tags: ["我", "請", "同事"],
  },
  "我今天分紅請同事吃晚餐$1000"
);
assert(myTreat.relation === "self", "我請同事 → self 我支出");
assert(myTreat.amount === 1000, "我請客保留實付金額");
assert(myTreat.payer === "我" && myTreat.consumer === "同事", "我請客 → 我付、同事受益");
assert(
  inferRelationFromText("我今天分紅請同事吃晚餐$1000")?.relation === "self",
  "infer：我請同事 → self"
);

const advance = applyParseHints(
  {
    payer: "男友",
    consumer: "我",
    relation: "paid_for_me",
    amount: 25,
    item: "火鍋",
    currency: "MYR",
  },
  "男友幫我付 25 馬幣火鍋"
);
assert(advance.relation === "paid_for_me", "代墊仍為 paid_for_me");
assert(advance.amount === 25, "代墊保留金額");

const treatTx = {
  payer: "女朋友",
  consumer: "我",
  relation: "treat",
  amount: 0,
  twdAmount: 0,
};
assert(
  Object.keys(calculateBalances([treatTx])).length === 0,
  "treat 不產生分帳欠款"
);

// 收入
const wallet = applyParseHints(
  {
    payer: "我",
    consumer: "我",
    relation: "self",
    amount: 300,
    item: "現金",
    category: "transfer",
  },
  "我阿嬤塞了30x10進我的錢包"
);
assert(wallet.relation === "income", "塞進錢包 → income");
assert(wallet.payer === "阿嬤", "收入 → payer 阿嬤");
assert(wallet.amount === 300, "收入金額 300");

const spend = applyParseHints(
  { payer: "我", consumer: "我", relation: "self", amount: 4980, item: "花費" },
  "花了3000+5000-80的錢"
);
assert(spend.amount === 7920, "花費句覆寫金額 7920");

assert(
  inferRelationFromText("男友幫我付 25 馬幣火鍋")?.relation === "paid_for_me",
  "男友幫我付"
);
assert(detectIncomeContext("收到老媽紅包") !== null, "收到紅包語境");

console.log("\n全部 parseHints 測試通過");
