const fs = require("fs");
const path = require("path");
const { nowIso } = require("./dateUtils");
const { dataRoot } = require("../config/environment");

const storeFile = path.join(dataRoot, "scan_share_queue.json");
const DEFAULT_EXPIRY_SECONDS = 1800; // 30 minutes

let currentTokenNumber = 0;
let latestRecord = null;
let queue = [];

const clone = (value) =>
  value == null ? value : JSON.parse(JSON.stringify(value));

const toText = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const normalize = (value) => toText(value).toLowerCase();

const patientFingerprint = ({ hipId, patient = {} } = {}) => {
  const identifier =
    normalize(patient.abhaAddress) ||
    normalize(patient.abhaNumber).replace(/\D/g, "") ||
    normalize(patient.mobile).replace(/\D/g, "");
  if (!identifier) return "";
  return `${normalize(hipId)}:${identifier}`;
};

const isCoolingPeriodActive = (record) => {
  if (!record || record.status !== "queued") return false;
  const issuedAtMs = Date.parse(record.issuedAt || "");
  if (!Number.isFinite(issuedAtMs)) return false;
  const expirySeconds = Number(record.expirySeconds || DEFAULT_EXPIRY_SECONDS);
  return Date.now() < issuedAtMs + expirySeconds * 1000;
};

const loadQueue = () => {
  try {
    if (!fs.existsSync(storeFile)) return;
    const raw = fs.readFileSync(storeFile, "utf8");
    const parsed = JSON.parse(raw || "{}");
    
    if (Array.isArray(parsed.queue)) {
      queue = parsed.queue;
    }
    
    currentTokenNumber = Number(parsed.currentTokenNumber) || 0;
    
    // Determine maximum token number from queue to prevent collisions
    for (const item of queue) {
      const num = parseInt(item.tokenNumber, 10);
      if (Number.isFinite(num) && num > currentTokenNumber) {
        currentTokenNumber = num;
      }
    }

    if (parsed.latestRecord) {
      latestRecord = parsed.latestRecord;
    } else if (queue.length > 0) {
      latestRecord = queue[queue.length - 1];
    }
  } catch (error) {
    console.warn("[SCAN SHARE TOKEN STORE] Unable to read queue file:", error.message);
  }
};

const persistQueue = () => {
  try {
    if (!fs.existsSync(dataRoot)) {
      fs.mkdirSync(dataRoot, { recursive: true });
    }
    const temporaryFile = `${storeFile}.${process.pid}.tmp`;
    const data = {
      currentTokenNumber,
      latestRecord,
      queue,
      updatedAt: nowIso(),
    };
    fs.writeFileSync(temporaryFile, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(temporaryFile, storeFile);
  } catch (error) {
    console.error("[SCAN SHARE TOKEN STORE] Unable to persist queue:", error.message);
  }
};

// Initial load
loadQueue();

const nextTokenNumber = () => {
  currentTokenNumber += 1;
  return String(currentTokenNumber);
};

const recordIssuedToken = (payload = {}) => {
  loadQueue();
  const fingerprint = patientFingerprint(payload);
  
  if (payload.requestId) {
    const existing = queue.find((record) => record.requestId === payload.requestId);
    if (existing) {
      latestRecord = existing;
      Object.assign(existing, {
        patient: payload.patient || existing.patient,
        patientFingerprint: fingerprint || existing.patientFingerprint,
        lastSeenAt: nowIso(),
        scanCount: Number(existing.scanCount || 1) + 1,
        acknowledgementStatus: payload.acknowledgementStatus || "pending",
        duplicateScan: true,
      });
      persistQueue();
      return clone(existing);
    }
  }

  const tokenNumber = nextTokenNumber();
  latestRecord = {
    id: `${Date.now()}-${tokenNumber}`,
    tokenNumber,
    status: "queued",
    expirySeconds: DEFAULT_EXPIRY_SECONDS,
    issuedAt: nowIso(),
    lastSeenAt: nowIso(),
    registeredAt: null,
    scanCount: 1,
    duplicateScan: false,
    patientFingerprint: fingerprint,
    ...payload,
  };
  queue.push(latestRecord);
  persistQueue();
  return clone(latestRecord);
};

const getLatestIssuedToken = () => clone(latestRecord);

const listIssuedTokens = ({ status } = {}) => {
  loadQueue();
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const records = normalizedStatus
    ? queue.filter((record) => record.status === normalizedStatus)
    : queue;
  return clone(records);
};

const updateIssuedTokenStatus = (tokenNumber, status) => {
  loadQueue();
  const normalizedToken = String(tokenNumber || "").trim();
  const record = queue.find((item) => item.tokenNumber === normalizedToken);
  if (!record) {
    return null;
  }

  record.status = status;
  if (status === "registered") {
    record.registeredAt = nowIso();
  }
  latestRecord = record;
  persistQueue();
  return clone(record);
};

const updateIssuedToken = (tokenNumber, patch = {}) => {
  loadQueue();
  const normalizedToken = String(tokenNumber || "").trim();
  const record = queue.find((item) => item.tokenNumber === normalizedToken);
  if (!record) {
    return null;
  }

  Object.assign(record, patch, { updatedAt: nowIso() });
  latestRecord = record;
  persistQueue();
  return clone(record);
};

module.exports = {
  recordIssuedToken,
  getLatestIssuedToken,
  listIssuedTokens,
  updateIssuedTokenStatus,
  updateIssuedToken,
};
