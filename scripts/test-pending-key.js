/**
 * pendingKey 與刪除暫存隔離測試
 */

const { pendingKey } = require("../utils/pendingKey");

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

const chatId = "G_group123";
const actorA = { userId: "Uaaa", displayName: "Alice" };
const actorB = { userId: "Ubbb", displayName: "Bob" };

assert(
  pendingKey(chatId, actorA) !== pendingKey(chatId, actorB),
  "同群組不同 user 產生不同 key"
);
assert(
  pendingKey(chatId, actorA) === "G_group123::Uaaa",
  "key 格式 chatId::userId"
);
assert(
  pendingKey(chatId, { userId: "" }) === "G_group123::anonymous",
  "無 userId 時 fallback anonymous"
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
