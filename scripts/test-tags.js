/**
 * 語意 tags 測試
 * node scripts/test-tags.js
 */

const { enrichSemanticTags } = require("../services/tagEnrich");
const {
  resolveTags,
  resolveCategory,
  resolveCategoryHint,
} = require("../services/category");

const cases = [
  {
    name: "娘惹博物館",
    item: "娘惹博物館",
    rawText: "娘惹博物館 30 馬幣",
    expectCategory: "travel",
    expectIncludes: ["博物館", "文化", "景點", "娘惹"],
  },
  {
    name: "娘惹博物館馬六甲",
    item: "娘惹博物館",
    rawText: "馬六甲娘惹博物館門票",
    expectIncludes: ["博物館", "馬六甲", "娘惹"],
  },
];

let passed = 0;

for (const c of cases) {
  const { tags, categoryHint } = enrichSemanticTags({
    item: c.item,
    rawText: c.rawText,
    aiTags: [],
  });

  const missing = c.expectIncludes.filter((t) => !tags.includes(t));
  const catOk = !c.expectCategory || categoryHint === c.expectCategory;

  if (missing.length === 0 && catOk) {
    console.log("✅", c.name, "→", tags.join(","), categoryHint || "");
    passed += 1;
  } else {
    console.log("❌", c.name, "tags:", tags, "hint:", categoryHint, "缺:", missing);
  }
}

const tagCtx = {
  item: "娘惹博物館",
  rawText: "娘惹博物館 30 馬幣",
  relation: "self",
  currency: "MYR",
};
const hint = resolveCategoryHint(tagCtx, ["娘惹博物館"]);
const tags = resolveTags(["娘惹博物館"], tagCtx);
const category = resolveCategory("other", tagCtx.item, tagCtx.rawText, tags, hint);

const normOk =
  category === "travel" &&
  tags.includes("博物館") &&
  tags.includes("娘惹") &&
  !tags.includes("娘惹博物館");

if (normOk) {
  console.log("✅ resolve 強化", tags, category);
  passed += 1;
} else {
  console.log("❌ resolve", category, tags);
}

console.log(`\n通過 ${passed}/${cases.length + 1}`);
process.exit(passed === cases.length + 1 ? 0 : 1);
