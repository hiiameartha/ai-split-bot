/**
 * MoodPay - 匯率轉換服務
 * 使用 ExchangeRate-API 將多種貨幣轉換為 TWD
 */

const axios = require("axios");

/** 支援的貨幣 */
const SUPPORTED_CURRENCIES = ["TWD", "MYR", "USD", "JPY", "KRW"];

const API_BASE = "https://v6.exchangerate-api.com/v6";

/**
 * 取得 API Key
 * @returns {string}
 */
function getApiKey() {
  const key = process.env.EXCHANGE_API_KEY;
  if (!key) {
    throw new Error("缺少環境變數 EXCHANGE_API_KEY");
  }
  return key;
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

  // TWD 直接回傳
  if (normalizedCurrency === "TWD") {
    console.log(`[Exchange] ${numericAmount} TWD → ${numericAmount} TWD（無需轉換）`);
    return Math.round(numericAmount);
  }

  if (!SUPPORTED_CURRENCIES.includes(normalizedCurrency)) {
    throw new Error(`不支援的貨幣: ${normalizedCurrency}`);
  }

  const apiKey = getApiKey();
  const url = `${API_BASE}/${apiKey}/pair/${normalizedCurrency}/TWD/${numericAmount}`;

  console.log(`[Exchange] 查詢匯率: ${normalizedCurrency} → TWD, 金額: ${numericAmount}`);

  try {
    const { data } = await axios.get(url, { timeout: 10000 });

    if (data.result !== "success") {
      console.error("[Exchange] API 回傳失敗:", data);
      throw new Error(data["error-type"] || "匯率 API 查詢失敗");
    }

    const twdAmount = Math.round(data.conversion_result);
    console.log(
      `[Exchange] ${numericAmount} ${normalizedCurrency} = ${twdAmount} TWD（匯率: ${data.conversion_rate}）`
    );
    return twdAmount;
  } catch (err) {
    if (err.response) {
      console.error("[Exchange] HTTP 錯誤:", err.response.status, err.response.data);
    } else {
      console.error("[Exchange] 錯誤:", err.message);
    }
    throw new Error(`匯率轉換失敗: ${err.message}`);
  }
}

module.exports = {
  convertToTWD,
  SUPPORTED_CURRENCIES,
};
