/**
 * MoodPay - 匯率轉換服務
 * 使用 ExchangeRate-API 將多種貨幣轉換為 TWD
 */

const axios = require("axios");

/** 支援的貨幣 */
const SUPPORTED_CURRENCIES = ["TWD", "MYR", "USD", "JPY", "KRW"];

const API_BASE = "https://v6.exchangerate-api.com/v6";
const RATE_CACHE_TTL_MS = parseInt(
  process.env.EXCHANGE_CACHE_TTL_MS || String(60 * 60 * 1000),
  10
);

/** @type {Map<string, { rate: number, at: number }>} */
const rateCache = new Map();

function getApiKey() {
  const key = process.env.EXCHANGE_API_KEY;
  if (!key) {
    throw new Error("缺少環境變數 EXCHANGE_API_KEY");
  }
  return key;
}

function clearRateCache() {
  rateCache.clear();
}

/**
 * 取得 1 單位原幣 → TWD 匯率（含快取）
 * @param {string} currency
 * @returns {Promise<number>}
 */
async function fetchConversionRate(currency) {
  const normalizedCurrency = String(currency || "TWD").toUpperCase();

  if (normalizedCurrency === "TWD") {
    return 1;
  }

  if (!SUPPORTED_CURRENCIES.includes(normalizedCurrency)) {
    throw new Error(`不支援的貨幣: ${normalizedCurrency}`);
  }

  const cached = rateCache.get(normalizedCurrency);
  if (cached && Date.now() - cached.at < RATE_CACHE_TTL_MS) {
    console.log(`[Exchange] 使用快取匯率 ${normalizedCurrency}→TWD: ${cached.rate}`);
    return cached.rate;
  }

  const apiKey = getApiKey();
  const url = `${API_BASE}/${apiKey}/pair/${normalizedCurrency}/TWD/1`;

  console.log(`[Exchange] 查詢匯率: ${normalizedCurrency} → TWD`);

  try {
    const { data } = await axios.get(url, { timeout: 10000 });

    if (data.result !== "success") {
      console.error("[Exchange] API 回傳失敗:", data);
      throw new Error(data["error-type"] || "匯率 API 查詢失敗");
    }

    const rate = Number(data.conversion_rate);
    if (!rate || rate <= 0) {
      throw new Error("匯率 API 回傳無效匯率");
    }

    rateCache.set(normalizedCurrency, { rate, at: Date.now() });
    console.log(`[Exchange] ${normalizedCurrency}→TWD 匯率: ${rate}`);
    return rate;
  } catch (err) {
    if (err.response) {
      console.error("[Exchange] HTTP 錯誤:", err.response.status, err.response.data);
    } else {
      console.error("[Exchange] 錯誤:", err.message);
    }
    throw new Error(`匯率轉換失敗: ${err.message}`);
  }
}

/**
 * 將指定金額轉換為台幣 (TWD)
 * @param {number} amount - 原始金額
 * @param {string} currency - 原始貨幣代碼
 * @returns {Promise<number>} 台幣金額（四捨五入至整數）
 */
async function convertToTWD(amount, currency) {
  const normalizedCurrency = String(currency || "TWD").toUpperCase();
  const numericAmount = Number(amount);

  if (!numericAmount || numericAmount <= 0) {
    return 0;
  }

  if (normalizedCurrency === "TWD") {
    console.log(`[Exchange] ${numericAmount} TWD → ${numericAmount} TWD（無需轉換）`);
    return Math.round(numericAmount);
  }

  const rate = await fetchConversionRate(normalizedCurrency);
  const twdAmount = Math.round(numericAmount * rate);
  console.log(
    `[Exchange] ${numericAmount} ${normalizedCurrency} = ${twdAmount} TWD（匯率: ${rate}）`
  );
  return twdAmount;
}

module.exports = {
  convertToTWD,
  fetchConversionRate,
  clearRateCache,
  SUPPORTED_CURRENCIES,
  RATE_CACHE_TTL_MS,
};
