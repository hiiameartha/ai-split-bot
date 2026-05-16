/**
 * QuickChart URL 產生測試（需網路）
 * node scripts/test-charts.js
 */

const {
  generateDashboardBarChart,
  generateCategoryPieChart,
  generateMonthlyLineChart,
  generateDebtBarChart,
  generateMemberComparisonChart,
  LINE_IMAGE_URL_MAX,
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
  {
    date: "20260515",
    payer: "我",
    consumer: "我",
    item: "鍵盤",
    amount: 2000,
    currency: "TWD",
    twdAmount: 2000,
    relation: "self",
    category: "shopping",
  },
];

async function main() {
  let passed = 0;
  const total = 5;

  const bar = await generateDashboardBarChart(sampleTx);
  const barOk = bar && bar.length <= LINE_IMAGE_URL_MAX;
  console.log(barOk ? "✅" : "❌", "dashboard bar URL", bar?.length || 0);
  if (barOk) passed += 1;

  const pie = await generateCategoryPieChart(sampleTx);
  const pieOk = pie && pie.length <= LINE_IMAGE_URL_MAX;
  console.log(pieOk ? "✅" : "❌", "category pie URL", pie?.length || 0);
  if (pieOk) passed += 1;

  const line = await generateMonthlyLineChart(sampleTx);
  const lineOk = line && line.length <= LINE_IMAGE_URL_MAX;
  console.log(lineOk ? "✅" : "❌", "monthly line URL", line?.length || 0);
  if (lineOk) passed += 1;

  const debt = await generateDebtBarChart({ 男友: 500, 我: -500 });
  const debtOk = debt && debt.length <= LINE_IMAGE_URL_MAX;
  console.log(debtOk ? "✅" : "❌", "debt bar URL", debt?.length || 0);
  if (debtOk) passed += 1;

  const members = await generateMemberComparisonChart(sampleTx);
  const membersOk = members && members.length <= LINE_IMAGE_URL_MAX;
  console.log(membersOk ? "✅" : "❌", "members bar URL", members?.length || 0);
  if (membersOk) passed += 1;

  console.log(`\n通過 ${passed}/${total}`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
