const toText = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text.length > 0 ? text : "";
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const tokenCallbacksByRequestId = new Map();
const tokenCallbackOrder = [];

const extractRequestId = (payload) =>
  toText(payload?.response?.requestId) ||
  toText(payload?.requestId);

const saveTokenCallback = (payload) => {
  const requestId = extractRequestId(payload || {});
  if (!requestId) return null;

  const entry = {
    requestId,
    receivedAt: new Date().toISOString(),
    payload: payload || {},
  };

  tokenCallbacksByRequestId.set(requestId, entry);
  tokenCallbackOrder.push(requestId);
  return clone(entry);
};

const getTokenCallback = (requestId) => {
  const entry = tokenCallbacksByRequestId.get(toText(requestId));
  return entry ? clone(entry) : null;
};

const listTokenCallbacks = (limit = 20) => {
  const max = Number.isFinite(limit) ? Math.max(1, Math.min(100, Number(limit))) : 20;
  const unique = Array.from(new Set(tokenCallbackOrder.slice().reverse()));
  return unique
    .slice(0, max)
    .map((requestId) => tokenCallbacksByRequestId.get(requestId))
    .filter(Boolean)
    .map((item) => clone(item));
};

module.exports = {
  saveTokenCallback,
  getTokenCallback,
  listTokenCallbacks,
};
