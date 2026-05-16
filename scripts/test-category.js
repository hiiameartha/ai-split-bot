/**
 * 分類測試
 * 執行：npm run test:category
 */

const {
  normalizeCategory,
  resolveCategory,
  resolveTags,
  serializeTags,
  CATEGORIES,
} = require("../services/category");
const { formatDateYYYYMMDD, parseTransactionDate } = require("../utils/date");

const cases = [
  { ai: "food", item: "午餐", expect: "food" },
  { ai: "", item: "海底撈", tags: ["火鍋"], expect: "food" },
  { ai: "餐飲", item: "便當", expect: "food" },
  { ai: "", item: "星巴克拿鐵", expect: "drink" },
  { ai: "", item: "捷運", expect: "transport" },
  { ai: "invalid", item: "神秘消費", expect: "other" },
  { ai: "other", item: "鍵盤", rawText: "鍵盤2000塊", tags: ["電腦配件", "辦公"], expect: "shopping" },
  { ai: "other", item: "滑鼠", expect: "shopping" },
  { ai: "other", item: "螢幕", expect: "shopping" },
  { ai: "", item: "影印紙", expect: "work" },
  { ai: "", item: "文具組", expect: "work" },
  {
    ai: "other",
    item: "椅子推進器",
    rawText: "椅子推進器10",
    tags: ["椅子", "家具", "家居用品"],
    expect: "shopping",
  },
  { ai: "other", item: "衛生紙", expect: "grocery" },
];

let passed = 0;

for (const c of cases) {
  const result = resolveCategory(
    c.ai,
    c.item,
    c.rawText || c.item,
    c.tags || []
  );
  const ok = result === c.expect;
  console.log(ok ? "✅" : "❌", c.item, "→", result, ok ? "" : `(預期 ${c.expect})`);
  if (ok) passed += 1;
}

const tags = resolveTags(["火鍋", "聚餐", "火鍋"], {
  item: "海底撈",
  rawText: "海底撈",
  relation: "paid_for_me",
  currency: "TWD",
});
const tagsDedupOk =
  tags.length === 2 && serializeTags(tags) === "火鍋,聚餐";
console.log(tagsDedupOk ? "✅" : "❌", "tags 去重");
if (tagsDedupOk) passed += 1;

const ramenTags = resolveTags([], {
  item: "拉麵",
  rawText: "我和男友一起吃1200日幣拉麵",
  relation: "shared",
  currency: "JPY",
});
const ramenOk =
  ramenTags.includes("拉麵") &&
  (ramenTags.includes("分攤") || ramenTags.includes("聚餐"));
console.log(ramenOk ? "✅" : "❌", "拉麵推斷 tags:", serializeTags(ramenTags));
if (ramenOk) passed += 1;

const total = cases.length + 3;

const today = formatDateYYYYMMDD();
const dateOk = /^\d{8}$/.test(today) && parseTransactionDate(today);
console.log(dateOk ? "✅" : "❌", "date YYYYMMDD:", today);
if (dateOk) passed += 1;

console.log(`\n分類共 ${CATEGORIES.length} 種`);
console.log(`通過 ${passed}/${total}`);

process.exit(passed === total ? 0 : 1);
