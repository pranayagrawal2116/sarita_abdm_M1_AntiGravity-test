const fs = require('fs');

let file = 'backend/controllers/hipLinkingController.js';
let content = fs.readFileSync(file, 'utf8');

// Replace hipLinkTokenStore imports with M2TransactionStore
content = content.replace(
  /const \{ initializeRequest, getActiveRequest, saveCallback, getCallback \} = require\("\.\.\/utils\/hipLinkTokenStore"\);/g,
  `const M2TransactionStore = require("../m2/transactions/M2TransactionStore");`
);

// We need to rewrite generateToken
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

content = content.replace(generateTokenRegex, newGenerateToken);

// Rewrite onGenerateToken
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
      callbackPayload: payload // Note: token saved for workflow continuity
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

content = content.replace(onGenerateTokenRegex, newOnGenerateToken);

// Fix the getCallback usage inside getTokenCallback route which isn't shown in the snippets but might exist
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
// If getTokenCallback exists, replace it, else just add it before linkCareContext
if (content.includes("exports.getTokenCallback = async (req, res) => {")) {
  content = content.replace(getTokenCallbackRegex, newGetTokenCallback);
} else {
  content = content.replace(/exports\.linkCareContext = async/, newGetTokenCallback + "\nexports.linkCareContext = async");
}

fs.writeFileSync(file, content, 'utf8');
console.log('Patched HIP Linking controller persistence');
