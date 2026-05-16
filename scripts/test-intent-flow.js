/**
 * 意圖分流與梗句單元測試（不需 Google Sheet / LINE）
 * 執行：node scripts/test-intent-flow.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { classifyIntent, isExplicitFreeContext } = require("../services/intent");
const { pickRuleMeme } = require("../services/meme");

const cases = [
  { text: "刪除測試吐司", expect: "delete" },
  { text: "刪除測試吐司的價錢", expect: "delete" },
  { text: "刪除上一筆", expect: "delete" },
  { text: "我買了80元便當", expect: "record" },
  { text: "刪除 2", expect: "delete_pick" },
  { text: "undo", expect: "delete" },
];

async function run() {
  let passed = 0;

  for (const c of cases) {
    const result = await classifyIntent(c.text);
    const ok =
      c.expect === "delete_pick"
        ? result.intent === "delete_pick"
        : result.intent === c.expect;

    console.log(
      ok ? "✅" : "❌",
      c.text,
      "→",
      JSON.stringify(result),
      ok ? "" : `(預期 ${c.expect})`
    );
    if (ok) passed += 1;
  }

  const meme = pickRuleMeme({ item: "豆花", amount: 25, currency: "TWD" });
  console.log(meme ? "✅ 豆花梗：" + meme : "❌ 豆花梗未命中");

  const free = isExplicitFreeContext("免費試吃", { item: "樣品" });
  console.log(free ? "✅ 免費語境辨識" : "❌ 免費語境");

  const notFree = isExplicitFreeContext("刪除測試吐司", { item: "刪除測試吐司", amount: 0 });
  console.log(!notFree ? "✅ 刪除句不當免費" : "❌ 刪除句誤判免費");

  console.log(`\n通過 ${passed}/${cases.length} 意圖測試`);
  process.exit(passed === cases.length ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
