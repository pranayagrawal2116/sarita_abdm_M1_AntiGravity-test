const fs = require('fs');

let file = 'backend/controllers/hipLinkingController.js';
let content = fs.readFileSync(file, 'utf8');

// The file contains a massive commented out section at the top. Let's find the uncommented part.
// The uncommented part starts at `const fs = require("fs");` around line 267.
const splitIndex = content.indexOf('const fs = require("fs");', 200);
if (splitIndex === -1) {
    console.error("Could not find start of uncommented code");
    process.exit(1);
}

let topCommented = content.substring(0, splitIndex);
let actualCode = content.substring(splitIndex);

// 1. In actualCode, replace hipLinkTokenStore imports with M2TransactionStore
actualCode = actualCode.replace(
  /const \{ initializeRequest, getActiveRequest, saveCallback, getCallback \} = require\("\.\.\/utils\/hipLinkTokenStore"\);/g,
  `const M2TransactionStore = require("../m2/transactions/M2TransactionStore");`
);

// 2. Replace normalizeCareContextReferenceForLinking
const normCareCtxReg = /const normalizeCareContextReferenceForLinking = \([^)]+\) => \{[^}]+\};/g;
const newNormCareCtx = `const normalizeCareContextReferenceForLinking = (value) => {
  const text = toText(value);
  if (!text) return require("uuid").v4(); // Only if completely empty
  return text;
};`;
actualCode = actualCode.replace(normCareCtxReg, newNormCareCtx);

// 3. Replace normalizePatientEntriesForLinking
const normPatEntReg = /const normalizePatientEntriesForLinking = \([^)]*\) =>[\s\S]*?(?=\nconst buildLinkCareContextPayload)/;

const newNormPatEnt = `const normalizePatientEntriesForLinking = (patient = [], abhaAddress = "") =>
  patient.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }

    const fallbackName =
      toText(entry.display) ||
      toText(entry.name) ||
      abhaAddress;

    return {
      ...entry,
      referenceNumber: normalizePatientReferenceForLinking(
        entry.referenceNumber,
        fallbackName
      ),
      careContexts: Array.isArray(entry.careContexts)
        ? entry.careContexts.map((careContext) => {
            if (!careContext || typeof careContext !== "object") {
              return careContext;
            }
            // PROMPT #9: Do not invent UUIDs or append HI types. Preserve the exact reference.
            const baseReference = normalizeCareContextReferenceForLinking(careContext.referenceNumber);
            return {
              ...careContext,
              referenceNumber: baseReference
            };
          })
        : entry.careContexts,
    };
  });
`;
actualCode = actualCode.replace(normPatEntReg, newNormPatEnt);

// 4. We need to rewrite generateToken
const generateTokenRegex = /exports\.generateToken = async \(req, res\) => \{[\s\S]*?(?=exports\.linkCareContext = async)/;

const newGenerateToken = `exports.generateToken = async (req, res) => {
  try {
    const hipId =
      toText(req.body?.hipId) ||
      toText(req.header("X-HIP-ID")) ||
      toText(process.env.HIP_ID) ||
      hospitalConfig.hipId;

    const payload = buildPatientPayload(req.body);

    const missing = requiredMissing(payload, [
      "AbhaNumber",
      "AbhaAddress",
      "name",
      "gender",
      "yearOfBirth",
    ]);

    if (!hipId) {
      return res.status(400).json({ error: "HIP ID is required" });
    }

    if (missing.length > 0) {
      return res.status(400).json({
        error: \`Missing generate-token value(s): \${missing.join(", ")}\`,
      });
    }

    const headers = await withGatewayHeaders({
      "X-HIP-ID": hipId,
    });
    const requestId = headers["REQUEST-ID"];

    // Check for an active pending request (within last 5 mins)
    const allTxs = M2TransactionStore.listTransactions();
    const abhaAddress = toText(payload.AbhaAddress).toLowerCase();
    
    // ABDM expects a unique requestId per API call, but we can prevent spam by returning 429
    // if a link is already actively pending for this patient.
    const activeRequest = allTxs.find(tx => 
      tx.currentState === "Created" && 
      toText(tx.abhaAddress).toLowerCase() === abhaAddress &&
      tx.transactionType === "HIP_LINK_TOKEN" &&
      (Date.now() - (tx.createdTimestamp || 0)) < 5 * 60 * 1000
    );

    if (activeRequest) {
      console.log("=========================================");
      console.log(\`[HIP LINK TOKEN] Reusing active pending request \${activeRequest.requestId} for patient.\`);
      console.log("=========================================");
      return res.json({
        requestId: activeRequest.requestId,
        callbackPending: true,
        statusCode: 202,
        message: "Link token request is already active and pending.",
        immediateResponse: {},
      });
    }

    // Initialize request state safely with M2TransactionStore
    await M2TransactionStore.createTransaction({
      requestId,
      abhaAddress,
      patientId: abhaAddress,
      transactionType: "HIP_LINK_TOKEN",
      currentState: "Created"
    });

    console.log("=========================================");
    console.log("[HIP LINK TOKEN] Generate Token Request Received");
    console.log("[HIP LINK TOKEN] Outgoing Request Payload");
    console.log("=========================================");

    const response = await axios.post(
      \`\${process.env.GATEWAY_BASE || "https://dev.abdm.gov.in"}/api/hiecm/v3/token/generate-token\`,
      payload,
      { headers }
    );

    return res.json({
      requestId,
      callbackPending: true,
      statusCode: response.status,
      message: "Link token request accepted. Use the callback check until ABDM sends the token.",
      immediateResponse: response.data && typeof response.data === "object" ? response.data : {},
    });
  } catch (err) {
    const { status, body } = getErrorPayload(err);
    return res.status(status).json(body);
  }
};
`;
actualCode = actualCode.replace(generateTokenRegex, newGenerateToken);

// 5. Rewrite onGenerateToken
const onGenerateTokenRegex = /exports\.onGenerateToken = async \(req, res\) => \{[\s\S]*?(?=const contextNotifyStoreFile)/;

const newOnGenerateToken = `exports.onGenerateToken = async (req, res) => {
  console.log("=========================================");
  console.log("[HIP LINK TOKEN] Incoming Callback Received");
  console.log("=========================================");

  const payload = req.body || {};
  const requestId = 
    toText(payload?.resp?.requestId) ||
    toText(payload?.response?.requestId) ||
    toText(payload?.requestId);

  if (!requestId) {
    console.log("Invalid callback payload (failed to extract requestId)");
    return res.status(400).json({ error: "Missing requestId in callback" });
  }

  try {
    const tx = M2TransactionStore.getTransaction(requestId);
    if (!tx || tx.transactionType !== "HIP_LINK_TOKEN") {
      console.log("Callback does not match any pending HIP_LINK_TOKEN request");
      return res.status(404).json({ error: "No matching request found" });
    }

    const linkToken = 
      toText(payload?.linkToken) ||
      toText(payload?.linkingToken) ||
      toText(payload?.token) ||
      toText(payload?.link?.token) ||
      toText(payload?.link?.linkToken) ||
      toText(payload?.token?.linkToken);

    const error = payload?.error;

    // Idempotency: Ignore duplicate callbacks
    if (tx.currentState === "Completed" || tx.currentState === "Failed") {
      console.log("Duplicate callback received for already completed request");
      return res.status(202).json({ ok: true, requestId, linkTokenPresent: Boolean(tx.linkToken) });
    }

    await M2TransactionStore.updateTransaction(requestId, {
      linkToken: linkToken,
      errorDetails: error ? JSON.stringify(error) : undefined,
      callbackPayload: payload
    });

    await M2TransactionStore.transitionState(requestId, error ? "Failed" : "Completed");

    console.log(\`Valid callback processed. Link Token Present: \${Boolean(linkToken)}\`);
    
    return res.status(202).json({
      ok: true,
      requestId,
      linkTokenPresent: Boolean(linkToken),
    });
  } catch (err) {
    console.error("Error processing callback:", err);
    return res.status(500).json({ error: "Internal server error processing callback" });
  }
};
`;
actualCode = actualCode.replace(onGenerateTokenRegex, newOnGenerateToken);

// Fix the getCallback usage inside getTokenCallback route
const getTokenCallbackRegex = /exports\.getTokenCallback = async \(req, res\) => \{[\s\S]*?(?=exports\.linkCareContext = async)/;
const newGetTokenCallback = `exports.getTokenCallback = async (req, res) => {
  const requestId = toText(req.params?.requestId);
  if (!requestId) {
    return res.status(400).json({ error: "requestId is required" });
  }

  const tx = M2TransactionStore.getTransaction(requestId);
  if (!tx || tx.transactionType !== "HIP_LINK_TOKEN") {
    return res.status(404).json({
      error: "Link token callback has not been received yet",
      requestId,
    });
  }

  return res.json({
    requestId: tx.requestId,
    status: tx.currentState === "Completed" ? "SUCCESS" : tx.currentState === "Failed" ? "FAILED" : "PENDING",
    linkToken: tx.linkToken,
    error: tx.errorDetails ? JSON.parse(tx.errorDetails) : null
  });
};
`;

if (actualCode.includes("exports.getTokenCallback = async (req, res) => {")) {
  actualCode = actualCode.replace(getTokenCallbackRegex, newGetTokenCallback);
} else {
  actualCode = actualCode.replace(/exports\.linkCareContext = async/, newGetTokenCallback + "\nexports.linkCareContext = async");
}

fs.writeFileSync(file, topCommented + actualCode, 'utf8');
console.log('Successfully repatched uncommented actual code!');
