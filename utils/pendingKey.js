/**
 * 群組內 pending 狀態 key（chatId + userId，避免互相覆蓋）
 * @param {string} chatId
 * @param {{ userId?: string }|undefined} actor
 */
function pendingKey(chatId, actor) {
  const userId = (actor?.userId || "").trim() || "anonymous";
  return `${chatId || "anonymous"}::${userId}`;
}

module.exports = { pendingKey };
