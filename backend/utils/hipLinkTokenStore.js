const fs = require("fs");
const path = require("path");
const { nowIso } = require("./dateUtils");

const toText = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text.length > 0 ? text : "";
};

const clone = (value) => JSON.parse(JSON.stringify(value));

// ABDM sends the link token asynchronously to the public callback URL.  The
// callback can be handled by a different PM2/IIS worker than the request that
// initiated it, and a process restart must not make an accepted request
// disappear.  Keep this small state store on disk so every worker sees the
// same callback state.
const storeFile = path.join(
  process.env.ABDM_DATA_DIR || path.join(__dirname, "..", "data"),
  "hip_link_token_callbacks.json"
);
const callbacks = new Map();

const loadCallbacks = () => {
  try {
    if (!fs.existsSync(storeFile)) return;
    const parsed = JSON.parse(fs.readFileSync(storeFile, "utf8"));
    if (!Array.isArray(parsed)) return;

    callbacks.clear();
    for (const entry of parsed) {
      const requestId = toText(entry?.requestId);
      if (requestId) callbacks.set(requestId, entry);
    }
  } catch (error) {
    // A corrupt cache must never prevent HIP linking. A later successful
    // callback will replace the state with a valid file.
    console.warn("[HIP LINK TOKEN] Unable to read callback state:", error.message);
  }
};

const persistCallbacks = () => {
  try {
    fs.mkdirSync(path.dirname(storeFile), { recursive: true });
    const temporaryFile = `${storeFile}.${process.pid}.tmp`;
    fs.writeFileSync(
      temporaryFile,
      JSON.stringify([...callbacks.values()], null, 2),
      "utf8"
    );
    fs.renameSync(temporaryFile, storeFile);
  } catch (error) {
    console.error("[HIP LINK TOKEN] Unable to persist callback state:", error.message);
  }
};

loadCallbacks();

const requestIdFromPayload = (payload = {}) =>
  toText(payload?.resp?.requestId) ||
  toText(payload?.response?.requestId) ||
  toText(payload?.requestId);

const extractLinkToken = (payload = {}) =>
  toText(payload?.linkToken) ||
  toText(payload?.linkingToken) ||
  toText(payload?.token) ||
  toText(payload?.link?.token) ||
  toText(payload?.link?.linkToken) ||
  toText(payload?.token?.linkToken);

const initializeRequest = (requestId, patient = {}) => {
  if (!requestId) return;
  loadCallbacks();
  const entry = {
    requestId: toText(requestId),
    status: "PENDING",
    abhaAddress: toText(patient.abhaAddress || patient.AbhaAddress || ""),
    abhaNumber: toText(patient.abhaNumber || patient.AbhaNumber || ""),
    initializedAt: nowIso(),
  };
  callbacks.set(toText(requestId), entry);
  persistCallbacks();
};

const getActiveRequest = (patient = {}) => {
  loadCallbacks();
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

  loadCallbacks();
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
  persistCallbacks();
  return clone(entry);
};

const getCallback = (requestId) => {
  loadCallbacks();
  const entry = callbacks.get(toText(requestId));
  return entry ? clone(entry) : null;
};

module.exports = {
  initializeRequest,
  getActiveRequest,
  saveCallback,
  getCallback,
};
