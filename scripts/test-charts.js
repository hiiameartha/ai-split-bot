/**
 * QuickChart URL 產生測試（不需網路）
 * node scripts/test-charts.js
 */

const {
  generateDashboardBarChart,
  generateCategoryPieChart,
  generateMonthlyLineChart,
  generateDebtBarChart,
  generateMemberComparisonChart,
} = require("../services/charts");

const sampleTx = [
  {
    date: "20260510",
    payer: "我",
    consumer: "我",
    item: "拉麵",
    amount: 1200,
    currency: "JPY",
    twdAmount: 239,
    relation: "shared",
    category: "food",
    sharedWith: ["我", "男友"],
  },
  {
    date: "20260512",
    payer: "男友",
    consumer: "我",
    item: "海底撈",
    amount: 1200,
    currency: "TWD",
    twdAmount: 1200,
    relation: "paid_for_me",
    category: "food",
  },
  {
    date: "20260514",
    payer: "我",
    consumer: "我",
    item: "星巴克",
    amount: 150,
    currency: "TWD",
    twdAmount: 150,
    relation: "self",
    category: "drink",
  },
];

let ok = 0;

const bar = generateDashboardBarChart(sampleTx);
if (bar && bar.startsWith("https://quickchart.io/chart")) {
  console.log("✅ dashboard bar URL");
  ok += 1;
} else console.log("❌ dashboard bar");

const pie = generateCategoryPieChart(sampleTx);
if (pie && pie.startsWith("https://quickchart.io/chart")) {
  console.log("✅ category pie URL (excl. other)");
  ok += 1;
} else console.log("❌ category pie");

const line = generateMonthlyLineChart(sampleTx);
if (line && line.includes("quickchart.io")) {
  console.log("✅ monthly line URL");
  ok += 1;
} else console.log("❌ monthly line");

const debt = generateDebtBarChart({ 男友: 500, 我: -500 });
if (debt && debt.includes("quickchart.io")) {
  console.log("✅ debt bar URL");
  ok += 1;
} else console.log("❌ debt bar");

const members = generateMemberComparisonChart(sampleTx);
if (members && members.includes("quickchart.io")) {
  console.log("✅ members bar URL");
  ok += 1;
} else console.log("❌ members bar");

console.log(`\n通過 ${ok}/5`);
process.exit(ok === 5 ? 0 : 1);
