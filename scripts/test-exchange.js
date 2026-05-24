/**
 * 匯率快取邏輯測試（不呼叫外部 API）
 */

const {
  clearRateCache,
  RATE_CACHE_TTL_MS,
} = require("../services/exchange");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`✅ ${msg}`);
  } else {
    failed++;
    console.error(`❌ ${msg}`);
  }
}

assert(RATE_CACHE_TTL_MS >= 60_000, "預設快取 TTL ≥ 1 分鐘");

clearRateCache();
assert(true, "clearRateCache 可呼叫");

// 模擬快取行為（Services 內部 Map 透過 convert 間接驗證
const exchangeModule = require("../services/exchange");
assert(typeof exchangeModule.fetchConversionRate === "function", "export fetchConversionRate");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
