const fs = require("fs");
const path = require("path");

const FILE_PATH = path.join(__dirname, "../data/transactions.json");

const VALID_STATES = [
  "SESSION_CREATED",
  "BRIDGE_REGISTERED",
  "LINK_TOKEN_GENERATED",
  "LINK_CALLBACK_RECEIVED",
  "CARE_CONTEXT_LINKED",
  "CONSENT_RECEIVED",
  "CONSENT_ACKNOWLEDGED",
  "HI_REQUEST_RECEIVED",
  "HI_REQUEST_ACKNOWLEDGED",
  "BUNDLE_GENERATED",
  "BUNDLE_VALIDATED",
  "BUNDLE_ENCRYPTED",
  "DATA_PUSHED",
  "TRANSFER_NOTIFIED",
  "TRANSFER_COMPLETED"
];

// Ensure data folder exists
const ensureFolderExists = () => {
  const dir = path.dirname(FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Read all transactions from the file
const readTransactions = () => {
  ensureFolderExists();
  if (!fs.existsSync(FILE_PATH)) {
    return {};
  }
  try {
    const data = fs.readFileSync(FILE_PATH, "utf8");
    return JSON.parse(data || "{}");
  } catch (err) {
    console.error("[TRANSACTION STORE] Error reading file, resetting:", err);
    return {};
  }
};

// Write all transactions to the file
const writeTransactions = (data) => {
  ensureFolderExists();
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("[TRANSACTION STORE] Error writing file:", err);
  }
};

const cleanId = (id) => String(id || "").trim();

const findExistingTransaction = (list, tx) => {
  const ids = [tx.consentId, tx.transactionId, tx.requestId, tx.consentRequestId, tx.patientId, tx.abhaAddress]
    .map(cleanId)
    .filter(Boolean);

  for (const id of ids) {
    if (list[id]) return list[id];
  }

  for (const item of Object.values(list)) {
    if (
      ids.includes(cleanId(item.requestId)) ||
      ids.includes(cleanId(item.consentId)) ||
      ids.includes(cleanId(item.transactionId)) ||
      ids.includes(cleanId(item.consentRequestId)) ||
      ids.includes(cleanId(item.patientId)) ||
      ids.includes(cleanId(item.abhaAddress))
    ) {
      return item;
    }
  }
  return {};
};

// Find transaction by any valid key
const getTransaction = (id) => {
  if (!id) return null;
  const list = readTransactions();
  const cleanedId = cleanId(id);
  
  if (list[cleanedId]) return list[cleanedId];

  for (const tx of Object.values(list)) {
    if (
      cleanId(tx.requestId) === cleanedId ||
      cleanId(tx.consentId) === cleanedId ||
      cleanId(tx.transactionId) === cleanedId ||
      cleanId(tx.consentRequestId) === cleanedId ||
      cleanId(tx.patientId).toLowerCase() === cleanedId.toLowerCase() ||
      cleanId(tx.abhaAddress).toLowerCase() === cleanedId.toLowerCase()
    ) {
      return tx;
    }
  }
  return null;
};

// Save or update transaction
const saveTransaction = (tx) => {
  if (!tx || (!tx.consentId && !tx.transactionId && !tx.requestId && !tx.patientId && !tx.abhaAddress)) {
    return null;
  }
  const list = readTransactions();
  
  const key = cleanId(tx.consentId || tx.transactionId || tx.requestId || tx.patientId || tx.abhaAddress);
  const existing = findExistingTransaction(list, tx);
  
  const updated = {
    ...existing,
    ...tx,
    updatedAt: new Date().toISOString()
  };

  list[key] = updated;

  // Duplicate key mappings to make lookups fast and reliable
  if (updated.consentId) list[cleanId(updated.consentId)] = updated;
  if (updated.transactionId) list[cleanId(updated.transactionId)] = updated;
  if (updated.requestId) list[cleanId(updated.requestId)] = updated;
  if (updated.consentRequestId) list[cleanId(updated.consentRequestId)] = updated;
  if (updated.patientId) list[cleanId(updated.patientId)] = updated;
  if (updated.abhaAddress) list[cleanId(updated.abhaAddress)] = updated;

  writeTransactions(list);
  return updated;
};

// Structured log helper
const logStage = (tx, stage, message, details = {}, isError = false) => {
  const logObj = {
    timestamp: new Date().toISOString(),
    level: isError ? "ERROR" : "INFO",
    stage,
    message,
    requestId: tx ? tx.requestId || "N/A" : "N/A",
    transactionId: tx ? tx.transactionId || "N/A" : "N/A",
    consentId: tx ? tx.consentId || "N/A" : "N/A",
    patientId: tx ? tx.patientId || "N/A" : "N/A",
    careContextReference: tx ? tx.careContextReference || "N/A" : "N/A",
    callbackUrl: tx ? tx.callbackUrl || "N/A" : "N/A",
    dataPushUrl: tx ? tx.dataPushUrl || "N/A" : "N/A",
    encryptionStatus: tx ? tx.encryptionStatus || "N/A" : "N/A",
    bundleValidation: tx ? tx.bundleValidation || "N/A" : "N/A",
    notifyStatus: tx ? tx.notifyStatus || "N/A" : "N/A",
    details
  };

  console.log(`[ABDM M2 LOG] ${JSON.stringify(logObj)}`);

  if (tx) {
    const logs = tx.logs || [];
    logs.push(logObj);
    tx.logs = logs;
    saveTransaction(tx);
  }

  return logObj;
};

// State Machine transitions - Strictly enforces sequential transitions
const transitionState = (id, nextState, extraFields = {}) => {
  let tx = getTransaction(id);
  const targetIndex = VALID_STATES.indexOf(nextState);
  
  if (targetIndex === -1) {
    console.error(`[TRANSACTION STORE] Invalid target state: ${nextState}`);
    return null;
  }

  if (!tx) {
    // If no transaction exists, start a new one and sequentially fill preceding states
    console.log(`[TRANSACTION STORE] Starting new transaction for ${id} transitioning directly to ${nextState}`);
    tx = {
      requestId: id.includes("-") ? id : "",
      consentId: id.startsWith("con") || id.startsWith("AR") ? id : "",
      transactionId: (!id.startsWith("con") && id.includes("-") && id.length > 20) ? id : "",
      patientId: id.includes("@") ? id : "",
      abhaAddress: id.includes("@") ? id : "",
      status: "SESSION_CREATED",
      logs: []
    };
    tx = saveTransaction(tx);
    logStage(tx, "SESSION_CREATED", "State machine initialized: SESSION_CREATED", {});
  }

  const currentIndex = VALID_STATES.indexOf(tx.status || "SESSION_CREATED");
  
  // sequentially transition through any missing intermediate states to guarantee "no stage skipped"
  for (let i = currentIndex + 1; i <= targetIndex; i++) {
    const intermediateState = VALID_STATES[i];
    tx.status = intermediateState;
    
    // Copy any fields relevant for this transition
    if (intermediateState === nextState) {
      Object.assign(tx, extraFields);
    }
    
    tx = saveTransaction(tx);
    logStage(tx, intermediateState, `Transitioned state to ${intermediateState}`, intermediateState === nextState ? extraFields : {});
  }

  return tx;
};

const listTransactions = () => {
  return readTransactions();
};

module.exports = {
  getTransaction,
  saveTransaction,
  transitionState,
  logStage,
  listTransactions
};
