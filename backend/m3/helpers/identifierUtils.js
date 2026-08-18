/**
 * Shared identifier extraction helpers for ABDM M2 flows.
 */

const toText = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text.length > 0 ? text : "";
};

const decodeJwtPayload = (token) => {
  try {
    const parts = toText(token).split(".");
    if (parts.length < 2) return {};
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padding = payload.length % 4 === 0 ? "" : "=".repeat(4 - (payload.length % 4));
    const decoded = Buffer.from(payload + padding, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
};

const firstText = (...values) => {
  for (const value of values) {
    const text = toText(value);
    if (text) return text;
  }
  return "";
};

const extractTransactionIdFromLinkToken = (linkToken) => {
  const payload = decodeJwtPayload(linkToken);
  return firstText(payload.transactionId, payload.txnId, payload.transactionID);
};

module.exports = {
  toText,
  firstText,
  decodeJwtPayload,
  extractTransactionIdFromLinkToken,
};
