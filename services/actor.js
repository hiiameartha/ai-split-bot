/**
 * MoodPay - 記帳角色（payer / consumer）
 * - 寫入時「我」→ LINE 顯示名稱
 * - 第三人稱（男友等）→ 加上記帳者 userId，避免群組內不同人的「男友」混在一起
 * - chatId 區分群組帳本；recordedBy + 名稱 scope 區分同一群組內各人的關係人
 */

const SELF_ALIASES = new Set(["我", "自己", "本人"]);

/** 儲存用：男友#Uxxxx（LINE userId，含在 # 後整段） */
const SCOPE_SUFFIX_RE = /#([^#]+)$/;

/**
 * @param {string} name
 */
function isSelfReference(name) {
  const n = String(name || "").trim();
  return SELF_ALIASES.has(n);
}

/**
 * 去掉任一記帳者的 scope 後綴，取得使用者輸入的暱稱
 * @param {string} name
 */
function stripScopeSuffix(name) {
  return String(name || "").replace(SCOPE_SUFFIX_RE, "").trim();
}

/**
 * @param {string} name
 * @param {string} userId
 */
function isScopedToUser(name, userId) {
  if (!name || !userId) return false;
  return String(name).endsWith(`#${userId}`);
}

/**
 * 寫入 Sheet：解析「我」，並為關係人加上記帳者 scope
 * @param {string|undefined} name
 * @param {{ displayName: string, userId?: string }} actor
 */
function resolveNameForStorage(name, actor) {
  const fallback = actor?.displayName || "我";
  if (!name || isSelfReference(name)) return fallback;

  const bare = stripScopeSuffix(String(name).trim());
  if (!bare || bare === fallback) return fallback;

  if (!actor?.userId) return bare;
  return `${bare}#${actor.userId}`;
}

/**
 * @param {object} parsed - parseExpense 結果
 * @param {{ displayName: string, userId?: string }} actor
 */
function resolveActorsForStorage(parsed, actor) {
  const payer = resolveNameForStorage(parsed.payer, actor);
  const consumer = resolveNameForStorage(parsed.consumer, actor);
  let sharedWith = Array.isArray(parsed.sharedWith)
    ? parsed.sharedWith.map((n) => resolveNameForStorage(n, actor))
    : [];

  if (parsed.relation === "shared" && sharedWith.length === 0) {
    sharedWith = [...new Set([payer, consumer].filter(Boolean))];
  }

  return { payer, consumer, sharedWith };
}

/**
 * 從交易建立 userId → 顯示名稱（用於區分「男友（阿明）」）
 * @param {object[]} transactions
 */
function buildScopeNameDirectory(transactions) {
  const dir = {};
  for (const tx of transactions || []) {
    if (tx.recordedBy && tx.recordedByName) {
      dir[tx.recordedBy] = tx.recordedByName;
    }
  }
  return dir;
}

/**
 * 回覆給查看者時：自己 →「我」；自己的關係人 → 暱稱；他人的關係人 → 暱稱（記帳者）
 * @param {string} name
 * @param {{ displayName?: string, userId?: string, selfLabel?: string }|null} viewer
 * @param {Record<string, string>} [scopeDir]
 */
function labelForViewer(name, viewer, scopeDir) {
  if (!name) return viewer?.selfLabel || "我";
  if (!viewer) return stripScopeSuffix(name);

  const selfLabel = viewer.selfLabel || "我";
  const bare = stripScopeSuffix(name);
  const scopedMatch = String(name).match(SCOPE_SUFFIX_RE);
  const ownerId = scopedMatch?.[1];

  if (viewer.displayName && (name === viewer.displayName || bare === viewer.displayName)) {
    return selfLabel;
  }
  if (viewer.userId && name === viewer.userId) return selfLabel;
  if (viewer.userId && ownerId === viewer.userId) return bare;

  if (ownerId && ownerId !== viewer.userId) {
    const ownerLabel = scopeDir?.[ownerId] || ownerId.slice(0, 6);
    return `${bare}（${ownerLabel}）`;
  }

  return bare;
}

/**
 * @param {Record<string, number>} totals
 * @param {object|null} viewer
 * @param {object[]} [transactions] - 供 scope 目錄
 */
function relabelTotalsForViewer(totals, viewer, transactions) {
  if (!viewer) return totals;
  const scopeDir = buildScopeNameDirectory(transactions);
  const out = {};
  for (const [name, value] of Object.entries(totals)) {
    const key = labelForViewer(name, viewer, scopeDir);
    out[key] = (out[key] || 0) + value;
  }
  return out;
}

/**
 * 個人報表／圖表：只含此使用者記下的交易（同 chatId 帳本內）
 * @param {object[]} transactions
 * @param {{ userId?: string, displayName?: string }} actor
 */
function filterTransactionsForViewer(transactions, actor) {
  if (!actor?.userId && !actor?.displayName) return transactions;

  return transactions.filter((tx) => transactionBelongsToViewer(tx, actor));
}

/**
 * @param {object} tx
 * @param {{ userId?: string, displayName?: string }} actor
 */
function transactionBelongsToViewer(tx, actor) {
  if (actor.userId && tx.recordedBy) {
    return tx.recordedBy === actor.userId;
  }

  const name = actor.displayName;
  if (!name) return false;

  const parties = [tx.payer, tx.consumer, ...(tx.sharedWith || [])].map((n) =>
    stripScopeSuffix(String(n || ""))
  );

  if (parties.some((n) => n === name)) return true;

  if (tx.recordedByName && tx.recordedByName === name) return true;

  return false;
}

/**
 * @param {object} tx
 * @param {object|null} viewer
 */
function formatTransactionRoles(tx, viewer) {
  const payer = labelForViewer(tx.payer || "我", viewer);
  const consumer = labelForViewer(tx.consumer || "我", viewer);
  const relation = tx.relation || "self";

  switch (relation) {
    case "income":
      return consumer === payer
        ? `${payer} 入帳`
        : `${payer} 給 ${consumer}`;
    case "treat":
      return payer === consumer
        ? `${payer} 請客`
        : `${payer} 請 ${consumer}`;
    case "paid_for_me":
      return `${payer} 幫 ${consumer} 付`;
    case "i_paid":
      return `${payer} 幫 ${consumer} 付`;
    case "shared": {
      const parts = (tx.sharedWith?.length
        ? tx.sharedWith
        : [tx.payer, tx.consumer]
      )
        .filter(Boolean)
        .map((n) => labelForViewer(String(n), viewer));
      const unique = [...new Set(parts)];
      return `${payer} 代墊 · 分攤：${unique.join("、")}`;
    }
    case "self":
    default:
      if (payer === consumer) return `${payer} 自己付`;
      return `${payer} → ${consumer}`;
  }
}

module.exports = {
  SELF_ALIASES,
  SCOPE_SUFFIX_RE,
  isSelfReference,
  stripScopeSuffix,
  isScopedToUser,
  resolveNameForStorage,
  resolveActorsForStorage,
  labelForViewer,
  buildScopeNameDirectory,
  relabelTotalsForViewer,
  filterTransactionsForViewer,
  transactionBelongsToViewer,
  formatTransactionRoles,
};
