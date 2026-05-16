/**
 * LINE 帳本 ID：群組／聊天室用 groupId／roomId，一對一用 userId
 * @param {object} event - LINE webhook event
 * @returns {string}
 */
function getChatIdFromEvent(event) {
  const src = event?.source || {};
  if (src.groupId) return src.groupId;
  if (src.roomId) return src.roomId;
  if (src.userId) return src.userId;
  return "anonymous";
}

/**
 * 舊資料（無 chatId 欄）歸屬的帳本；未設定則不納入任何 scoped 查詢
 * @returns {string|null}
 */
function getLegacyChatId() {
  const id = (process.env.LEGACY_CHAT_ID || "").trim();
  return id || null;
}

/**
 * 交易是否屬於指定帳本
 * @param {object} tx
 * @param {string} chatId
 */
function transactionBelongsToChat(tx, chatId) {
  const txChat = (tx.chatId || "").trim();
  if (txChat) return txChat === chatId;
  const legacy = getLegacyChatId();
  return legacy ? legacy === chatId : false;
}

/**
 * @param {object[]} transactions
 * @param {string} chatId
 */
function filterTransactionsByChatId(transactions, chatId) {
  if (!chatId) return transactions;
  return transactions.filter((tx) => transactionBelongsToChat(tx, chatId));
}

module.exports = {
  getChatIdFromEvent,
  getLegacyChatId,
  transactionBelongsToChat,
  filterTransactionsByChatId,
};
