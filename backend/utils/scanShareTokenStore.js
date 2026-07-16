const { nowIso } = require("./dateUtils");

let currentTokenNumber = 0;
let latestRecord = null;
let queue = [];

const DEFAULT_EXPIRY_SECONDS = 1800;

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

const nextTokenNumber = () => {
  currentTokenNumber += 1;
  return String(currentTokenNumber);
};

const recordIssuedToken = (payload = {}) => {
  const fingerprint = patientFingerprint(payload);
  if (fingerprint) {
    const existing = queue.find(
      (record) =>
        record.patientFingerprint === fingerprint && isCoolingPeriodActive(record)
    );

    if (existing) {
      latestRecord = existing;
      Object.assign(existing, {
        requestId: payload.requestId || existing.requestId,
        patient: payload.patient || existing.patient,
        lastSeenAt: nowIso(),
        scanCount: Number(existing.scanCount || 1) + 1,
        acknowledgementStatus: payload.acknowledgementStatus || "pending",
        duplicateScan: true,
      });
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
  return clone(latestRecord);
};

const getLatestIssuedToken = () => clone(latestRecord);

const listIssuedTokens = ({ status } = {}) => {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const records = normalizedStatus
    ? queue.filter((record) => record.status === normalizedStatus)
    : queue;
  return clone(records);
};

const updateIssuedTokenStatus = (tokenNumber, status) => {
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
  return clone(record);
};

const updateIssuedToken = (tokenNumber, patch = {}) => {
  const normalizedToken = String(tokenNumber || "").trim();
  const record = queue.find((item) => item.tokenNumber === normalizedToken);
  if (!record) {
    return null;
  }

  Object.assign(record, patch, { updatedAt: nowIso() });
  latestRecord = record;
  return clone(record);
};

module.exports = {
  recordIssuedToken,
  getLatestIssuedToken,
  listIssuedTokens,
  updateIssuedTokenStatus,
  updateIssuedToken,
};
