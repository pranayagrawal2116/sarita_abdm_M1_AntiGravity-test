const { nowIso } = require("./dateUtils");

const toText = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text.length > 0 ? text : "";
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const events = new Map();

const getRequestId = (payload) =>
  toText(payload?.resp?.requestId) ||
  toText(payload?.response?.requestId) ||
  toText(payload?.requestId) ||
  toText(payload?.consentRequestId) ||
  toText(payload?.transactionId) ||
  "";

const pushEvent = (type, payload) => {
  const kind = toText(type).toLowerCase();
  if (!kind) return null;

  const entry = {
    requestId: getRequestId(payload) || "",
    receivedAt: nowIso(),
    payload: payload || {},
  };

  const list = events.get(kind) || [];
  list.push(entry);
  events.set(kind, list);
  return clone(entry);
};

const listEvents = (type, limit = 20) => {
  const kind = toText(type).toLowerCase();
  const max = Number.isFinite(limit)
    ? Math.max(1, Math.min(100, Number(limit)))
    : 20;
  const list = events.get(kind) || [];
  return list.slice(-max).reverse().map((item) => clone(item));
};

module.exports = {
  pushEvent,
  listEvents,
};
