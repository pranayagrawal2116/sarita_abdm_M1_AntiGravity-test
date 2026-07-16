// instrumentation.js
// This script monkey‑patches M2CallbackManager.processCallback and M2TransactionStore.getTransaction
// to emit the detailed runtime logs required by the user request.

const path = require('path');


// Helper to safely stringify large objects
function safeStringify(obj) { 
  try { return JSON.stringify(obj, null, 2); } catch (_) { return String(obj); } 
}

// Capture stack trace for transaction creation
function captureStack() {
  const err = new Error();
  const stack = err.stack.split('\n').slice(2).join('\n');
  return stack;
}

// Wrap M2TransactionStore.getTransaction
const M2TransactionStore = require('./backend/m2/transactions/M2TransactionStore');
const originalGet = M2TransactionStore.getTransaction;
M2TransactionStore.getTransaction = function(lookupId) {
  const result = originalGet.apply(this, arguments);
  // Store the lookupId for later comparison (will be read by processCallback instrumentation)
  M2TransactionStore.__lastLookupId = lookupId;
  M2TransactionStore.__lastLookupResult = result;
  return result;
};

// Wrap M2CallbackManager.processCallback
const M2CallbackManager = require('./backend/m2/callbacks/M2CallbackManager');
// M2CallbackManager is an instance; patch its method directly
const originalProcess = M2CallbackManager.processCallback.bind(M2CallbackManager);
M2CallbackManager.processCallback = async function(type, payload) {
  // ---------------------------------
  // Callback Type
  // ---------------------------------
  console.log('\n---------------------------------');
  console.log('Callback Type');
  console.log('---------------------------------');
  console.log(type);

  // ---------------------------------
  // Entire callback payload
  // ---------------------------------
  console.log('\n---------------------------------');
  console.log('Entire callback payload');
  console.log('---------------------------------');
  console.log(safeStringify(payload));

  // Extract identifiers manually (mirroring internal helpers)
  const extracted = {
    requestId: this.extractRequestId(payload),
    responseRequestId: payload?.response?.requestId || '',
    respRequestId: payload?.resp?.requestId || '',
    transactionId: payload?.transactionId || '',
    hiRequestTransactionId: payload?.hiRequest?.transactionId || '',
    consentId: payload?.consentId || payload?.notification?.consentId || payload?.notification?.consentDetail?.consentId || '',
    hiRequestConsentId: payload?.hiRequest?.consent?.id || '',
    gatewayRequestId: payload?.gatewayRequestId || '',
    healthInformationRequestId: payload?.healthInformationRequestId || (type === 'Health Information Request' ? payload?.hiRequest?.requestId || '' : '')
  };

  console.log('\n---------------------------------');
  console.log('Extracted identifiers');
  console.log('---------------------------------');
  console.log(safeStringify(extracted, null, 2));

  // Identifier chosen by internal _extractIdentifier
  const chosen = this._extractIdentifier(type, payload);
  console.log('\n---------------------------------');
  console.log('Identifier chosen');
  console.log('---------------------------------');
  console.log(chosen);

  // Perform store lookup (original method will have stored last lookup info)
  // We invoke the original process later to preserve behaviour.
  const lookupId = chosen;
  const storedTx = M2TransactionStore.getTransaction(lookupId);

  console.log('\n---------------------------------');
  console.log('Store lookup');
  console.log('---------------------------------');
  if (storedTx) {
    const storedFields = {
      transactionId: storedTx.transactionId,
      requestId: storedTx.requestId,
      hiRequestId: storedTx.hiRequestId,
      consentId: storedTx.consentId,
      gatewayRequestId: storedTx.gatewayRequestId,
      healthInformationRequestId: storedTx.healthInformationRequestId
    };
    console.log(safeStringify(storedFields, null, 2));
  } else {
    console.log('No transaction found in store for lookupId:', lookupId);
  }

  const matched = !!storedTx;
  console.log('\n---------------------------------');
  console.log('Lookup Result');
  console.log('---------------------------------');
  console.log(matched ? 'MATCHED' : 'NOT MATCHED');

  if (!matched) {
    // Determine which identifier differs
    const diffs = [];
    const fields = ['requestId','responseRequestId','respRequestId','transactionId','hiRequestTransactionId','consentId','hiRequestConsentId','gatewayRequestId','healthInformationRequestId'];
    fields.forEach(f => {
      const cbVal = extracted[f] || '';
      const storeVal = storedTx ? storedTx[f] : undefined;
      if (storeVal && cbVal !== storeVal) {
        diffs.push(`${f}: callback='${cbVal}' vs stored='${storeVal}'`);
      }
    });
    if (diffs.length === 0) diffs.push('Identifier value not present in any stored field.');
    console.log('\nReason for mismatch:');
    diffs.forEach(d => console.log(d));
    // Abort further processing as per user request
    throw new Error('First mismatch detected – aborting as per user request');
  }

  // If matched, proceed with original processing
  return originalProcess.apply(this, arguments);
};

// Wrap createTransaction to log creation details if it ever runs (should only happen on mismatch)
if (typeof M2TransactionStore.createTransaction === 'function') {
  const originalCreate = M2TransactionStore.createTransaction;
  M2TransactionStore.createTransaction = async function(data) {
    console.log('\n---------------------------------');
    console.log('Transaction creation');
    console.log('---------------------------------');
    console.log('Stack trace:\n', captureStack());
    console.log('Caller:', (new Error()).stack.split('\n')[2].trim());
    console.log('Reason: fallback path in processCallback');
    console.log('Payload:', safeStringify(data));
    return originalCreate.apply(this, arguments);
  };
}

console.log('--- Instrumentation loaded ---');
