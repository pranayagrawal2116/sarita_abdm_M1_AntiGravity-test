const { nowIso } = require("./dateUtils");

const toText = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text.length > 0 ? text : "";
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const callbacks = new Map();

const requestIdFromPayload = (payload = {}) =>
  toText(payload?.response?.requestId) || toText(payload?.requestId);

const extractLinkToken = (payload = {}) =>
  toText(payload?.linkToken) ||
  toText(payload?.linkingToken) ||
  toText(payload?.token) ||
  toText(payload?.link?.token) ||
  toText(payload?.link?.linkToken) ||
  toText(payload?.token?.linkToken);

const initializeRequest = (requestId, patient = {}) => {
  if (!requestId) return;
  const entry = {
    requestId: toText(requestId),
    status: "PENDING",
    abhaAddress: toText(patient.abhaAddress || patient.AbhaAddress || ""),
    abhaNumber: toText(patient.abhaNumber || patient.AbhaNumber || ""),
    initializedAt: nowIso(),
  };
  callbacks.set(toText(requestId), entry);
};

const getActiveRequest = (patient = {}) => {
  const abhaAddress = toText(patient.abhaAddress || patient.AbhaAddress || "").toLowerCase();
  const abhaNumber = toText(patient.abhaNumber || patient.AbhaNumber || "").replace(/\D/g, "");

  for (const entry of callbacks.values()) {
    if (entry.status === "PENDING") {
      const ageMs = Date.now() - new Date(entry.initializedAt).getTime();
      // If the pending request is less than 5 minutes old
      if (ageMs < 5 * 60 * 1000) {
        const entryAddress = toText(entry.abhaAddress).toLowerCase();
        const entryNumber = toText(entry.abhaNumber).replace(/\D/g, "");
        if ((abhaAddress && entryAddress === abhaAddress) || (abhaNumber && entryNumber === abhaNumber)) {
          return entry;
        }
      }
    }
  }
  return null;
};

const saveCallback = (payload = {}) => {
  const requestId = requestIdFromPayload(payload);
  if (!requestId) return null;

  const existing = callbacks.get(requestId) || {};
  let status = "SUCCESS";
  let error = null;

  if (payload?.error) {
    status = "FAILED";
    error = payload.error;
  }

  const entry = {
    ...existing,
    requestId,
    status,
    linkToken: extractLinkToken(payload),
    error,
    receivedAt: nowIso(),
    payload,
  };

  callbacks.set(requestId, entry);
  return clone(entry);
};

const getCallback = (requestId) => {
  const entry = callbacks.get(toText(requestId));
  return entry ? clone(entry) : null;
};

module.exports = {
  initializeRequest,
  getActiveRequest,
  saveCallback,
  getCallback,
};
