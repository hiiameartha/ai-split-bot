/**
 * 執行所有單元測試（不需 LINE / Google Sheet / OpenAI 連線）
 */

const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const TESTS = [
  "scripts/test-pending-key.js",
  "scripts/test-delete-search.js",
  "scripts/test-intent-flow.js",
  "scripts/test-parse-hints.js",
  "scripts/test-category.js",
  "scripts/test-tags.js",
  "scripts/test-ledger.js",
  "scripts/test-google-sheet.js",
  "scripts/test-sheet-cache.js",
  "scripts/test-exchange.js",
  "scripts/test-settlement.js",
  "scripts/test-actor.js",
  "scripts/test-date.js",
  "scripts/test-charts.js",
];

let failed = 0;

console.log("═══════════════════════════════════════");
console.log("  MoodPay 測試套件");
console.log("═══════════════════════════════════════\n");

for (const script of TESTS) {
  const label = path.basename(script, ".js");
  console.log(`── ${label} ──`);

  const result = spawnSync("node", [path.join(ROOT, script)], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    failed += 1;
    console.error(`\n❌ ${label} 失敗\n`);
  } else {
    console.log("");
  }
}

console.log("═══════════════════════════════════════");
if (failed > 0) {
  console.error(`  ${failed}/${TESTS.length} 套件失敗`);
  process.exit(1);
}

console.log(`  全部 ${TESTS.length} 套件通過 ✓`);
process.exit(0);
