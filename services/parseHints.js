/**
 * MoodPay - 記帳解析後處理（算式金額、關係校正、收入語境）
 */

const RELATIONS = ["self", "paid_for_me", "i_paid", "shared", "income", "treat"];

/** 請客／招待：記帳備註用，分帳不算欠款 */
const TREAT_RE =
  /請客|招待|包養|請我(吃|喝)?|請我吃|不用付|免付|不用錢|沒付|免費吃|請我吃/;

/** 代墊：之後可能要還，維持 paid_for_me */
const ADVANCE_RE = /幫我付|替我付|代墊|先墊|幫墊/;

const ARITH_EXPR_RE =
  /(\d+(?:\.\d+)?(?:\s*[+\-×x*]\s*\d+(?:\.\d+)?)+)/gi;

const INCOME_RE =
  /(?:我\s*)?([^\s，,。、]{1,8}?)\s*(?:塞了?|給了?|包給|塞進|給進)|(?:收到|領到|入帳)|(?:塞|放|匯).{0,10}(?:進)?\s*(?:我\s*)?(?:的\s*)?(?:錢包|帳戶|戶頭)/;

const PASSIVE_TREATED_RE =
  /被\s*([^\s，,。、]{1,12}?)\s*(?:包養|請客|請吃|請|招待|付|買)/;

const PAID_FOR_ME_RE =
  /([^\s，,。、]{1,12}?)\s*(?:幫|替)\s*我\s*(?:付|請|請客|買|吃)/;

const I_PAID_RE = /我\s*(?:幫|替)\s*([^\s，,。、]{1,12}?)\s*(?:付|請|請客|買|吃)/;

const NOT_PAID_BY_ME_RE = /不用付|沒付|免付|不用錢|沒出錢|零元消費/;

const SELF_ALIASES = new Set(["我", "自己", "本人"]);

/**
 * @param {string} expr
 * @returns {number|null}
 */
function evaluateArithmeticExpression(expr) {
  const normalized = String(expr)
    .replace(/[×x]/gi, "*")
    .replace(/\s/g, "");
  if (!normalized || !/^[\d.+\-*/]+$/.test(normalized)) return null;

  let pos = 0;

  function parseNumber() {
    const m = normalized.slice(pos).match(/^\d+(\.\d+)?/);
    if (!m) return null;
    pos += m[0].length;
    return parseFloat(m[0]);
  }

  function parseFactor() {
    if (normalized[pos] === "-") {
      pos += 1;
      const n = parseFactor();
      return n === null ? null : -n;
    }
    if (normalized[pos] === "+") pos += 1;
    return parseNumber();
  }

  function parseTerm() {
    let left = parseFactor();
    if (left === null) return null;
    while (pos < normalized.length && (normalized[pos] === "*" || normalized[pos] === "/")) {
      const op = normalized[pos++];
      const right = parseFactor();
      if (right === null) return null;
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  function parseExprLevel() {
    let left = parseTerm();
    if (left === null) return null;
    while (pos < normalized.length && (normalized[pos] === "+" || normalized[pos] === "-")) {
      const op = normalized[pos++];
      const right = parseTerm();
      if (right === null) return null;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  const result = parseExprLevel();
  if (result === null || pos !== normalized.length || !Number.isFinite(result)) {
    return null;
  }
  return Math.round(result * 100) / 100;
}

/**
 * @param {string} text
 * @returns {number|null}
 */
function evaluateAmountFromText(text) {
  const matches = [...String(text).matchAll(ARITH_EXPR_RE)];
  if (!matches.length) return null;

  let bestExpr = matches[0][1];
  for (const m of matches) {
    if (m[1].length > bestExpr.length) bestExpr = m[1];
  }
  return evaluateArithmeticExpression(bestExpr);
}

/**
 * @param {string} name
 */
function cleanPartyName(name) {
  const n = String(name || "")
    .trim()
    .replace(/^(我|今天|剛剛|剛)/, "")
    .trim();
  if (!n || SELF_ALIASES.has(n)) return null;
  return n;
}

/**
 * @param {string} text
 * @returns {{ giver: string }|null}
 */
function detectIncomeContext(text) {
  const t = String(text);
  if (!INCOME_RE.test(t)) return null;

  const m = t.match(
    /(?:我\s*)?([^\s，,。、]{1,8}?)\s*(?:塞了?|給了?|包給|塞進|給進)/
  );
  const giver = cleanPartyName(m?.[1]);
  if (giver) return { giver };

  if (/(收到|領到|入帳)/.test(t)) {
    const from = t.match(/(?:收到|領到)\s*([^\s，,。、]{1,8}?)/);
    const name = cleanPartyName(from?.[1]);
    if (name) return { giver: name };
  }

  return { giver: null };
}

/**
 * @param {string} text
 * @returns {{ payer: string, consumer: string, relation: string }|null}
 */
function inferRelationFromText(text) {
  const t = String(text);

  const passive = t.match(PASSIVE_TREATED_RE);
  if (passive) {
    const payer = cleanPartyName(passive[1]);
    if (payer) return { payer, consumer: "我", relation: "paid_for_me" };
  }

  const paidForMe = t.match(PAID_FOR_ME_RE);
  if (paidForMe) {
    const payer = cleanPartyName(paidForMe[1]);
    if (payer) return { payer, consumer: "我", relation: "paid_for_me" };
  }

  if (NOT_PAID_BY_ME_RE.test(t) && !/我\s*(幫|替)/.test(t)) {
    const fromPassive = t.match(/被\s*([^\s，,。、]{1,12}?)/);
    const payer = cleanPartyName(fromPassive?.[1]) || "對方";
    return { payer, consumer: "我", relation: "paid_for_me" };
  }

  if (/被/.test(t)) return null;

  const iPaid = t.match(I_PAID_RE);
  if (iPaid) {
    const consumer = cleanPartyName(iPaid[1]);
    if (consumer) return { payer: "我", consumer, relation: "i_paid" };
  }

  return null;
}

/**
 * 是否為「請客不算債」語境（非代墊）
 * @param {string} text
 */
function isTreatNotDebt(text) {
  const t = String(text);
  if (!TREAT_RE.test(t)) return false;
  if (ADVANCE_RE.test(t) && !NOT_PAID_BY_ME_RE.test(t)) return false;
  return true;
}

/**
 * @param {string} text
 * @returns {number|null}
 */
function extractNotionalAmount(text) {
  const t = String(text);

  const labeled = t.match(/價值\s*(\d+(?:\.\d+)?)\s*(萬|千|元)?/);
  if (labeled) {
    let n = parseFloat(labeled[1]);
    const unit = labeled[2] || "";
    if (unit === "萬" || (!unit && /萬/.test(t.slice(labeled.index, labeled.index + 12)))) {
      n *= 10000;
    } else if (unit === "千") n *= 1000;
    return Math.round(n);
  }

  if (/價值|市值|估計|大約值/.test(t)) {
    const wan = t.match(/(\d+(?:\.\d+)?)\s*萬/);
    if (wan) return Math.round(parseFloat(wan[1]) * 10000);
  }

  return null;
}

/**
 * @param {number} n
 */
function formatNotionalLabel(n) {
  const v = Math.round(Number(n) || 0);
  if (v >= 10000 && v % 10000 === 0) return `${v / 10000}萬`;
  return `${v.toLocaleString("zh-TW")}元`;
}

/**
 * 請客：金額記 0，參考價值寫入 item 備註
 * @param {object} parsed
 * @param {string} text
 */
function applyTreatNoDebt(parsed, text) {
  if (!isTreatNotDebt(text)) return parsed;
  if (parsed.relation === "income" || parsed.relation === "shared") {
    return parsed;
  }
  if (parsed.relation === "i_paid") return parsed;

  const payer =
    !isSelfReference(parsed.payer) && parsed.payer ? parsed.payer : "對方";
  const notional =
    extractNotionalAmount(text) ||
    (Number(parsed.amount) > 0 ? Math.round(parsed.amount) : null);

  let item = String(parsed.item || "消費").trim();
  const noteParts = [];
  if (notional) noteParts.push(`價值${formatNotionalLabel(notional)}`);
  noteParts.push(`${payer}請客`);
  const note = noteParts.join("，");
  if (!item.includes("請客") && !item.includes(note)) {
    item = `${item}（${note}）`;
  }

  const tags = dedupeTags([...(parsed.tags || []), "請客", "不算債"]);

  return {
    ...parsed,
    relation: "treat",
    payer,
    consumer: "我",
    amount: 0,
    notionalAmount: notional || undefined,
    item,
    tags,
  };
}

function dedupeTags(tags) {
  const out = [];
  const seen = new Set();
  for (const t of tags) {
    const s = String(t).trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * @param {object} parsed
 * @param {string} rawText
 * @returns {object}
 */
function applyParseHints(parsed, rawText) {
  const text = String(rawText || parsed.rawText || "");
  let next = { ...parsed, rawText: text };

  const exprAmount = evaluateAmountFromText(text);
  if (exprAmount !== null && exprAmount > 0) {
    next.amount = exprAmount;
  }

  const income = detectIncomeContext(text);
  if (income) {
    next.relation = "income";
    next.consumer = "我";
    next.payer = income.giver || parsed.payer || "對方";
    if (isSelfReference(next.payer)) next.payer = "對方";
    next.amount = Math.abs(Number(next.amount) || 0);
    if (!next.category || next.category === "transfer") {
      next.category = "gift";
    }
    return next;
  }

  const inferred = inferRelationFromText(text);
  if (inferred) {
    next.relation = inferred.relation;
    next.payer = inferred.payer;
    next.consumer = inferred.consumer;
  }

  if (next.relation === "paid_for_me" && isSelfReference(next.payer)) {
    next.payer = inferred?.payer || "對方";
  }
  if (next.relation === "i_paid" && isSelfReference(next.consumer)) {
    next.consumer = inferred?.consumer || "對方";
  }

  return applyTreatNoDebt(next, text);
}

function isSelfReference(name) {
  return SELF_ALIASES.has(String(name || "").trim());
}

/**
 * 帳務加總用：支出為正、收入為負
 * @param {object} tx
 */
function getSignedTransactionAmount(tx) {
  const raw = Number(tx.twdAmount ?? tx.amount ?? 0);
  const amt = Math.abs(raw);
  if (amt === 0) return 0;
  if (tx.relation === "income" || raw < 0) return -amt;
  if (tx.relation === "treat") return 0;
  return amt;
}

module.exports = {
  RELATIONS,
  evaluateArithmeticExpression,
  evaluateAmountFromText,
  detectIncomeContext,
  inferRelationFromText,
  isTreatNotDebt,
  extractNotionalAmount,
  applyTreatNoDebt,
  applyParseHints,
  getSignedTransactionAmount,
};
