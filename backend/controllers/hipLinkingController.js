// const axios = require("axios");
// const { getGatewayToken } = require("../services/gatewayService");
// const { getHeaders } = require("../utils/headers");
// const { saveCallback, getCallback } = require("../utils/hipLinkTokenStore");
// const hospitalConfig = require("../config/hospitalConfig");

// const toText = (value) => {
//   if (value === null || value === undefined) return "";
//   const text = String(value).trim();
//   return text.length > 0 ? text : "";
// };

// const toObject = (value) =>
//   value && typeof value === "object" && !Array.isArray(value) ? value : {};

// const getErrorPayload = (err) => {
//   const status = err.response?.status || 500;
//   const data = err.response?.data;
//   const requestId =
//     err.config?.headers?.["REQUEST-ID"] || err.config?.headers?.["request-id"];

//   if (typeof data === "string") {
//     return { status, body: { error: data, requestId } };
//   }
//   if (data && typeof data === "object") {
//     return { status, body: requestId ? { ...data, requestId } : data };
//   }

//   return {
//     status,
//     body: { error: err.message || "ABDM HIP linking API failed", requestId },
//   };
// };

// const withGatewayHeaders = async (extraHeaders = {}) => {
//   const gatewayToken = await getGatewayToken();
//   return {
//     ...getHeaders(gatewayToken),
//     ...extraHeaders,
//   };
// };

// const normalizeYearOfBirth = (value) => {
//   const text = toText(value);
//   if (!text) return "";
//   const number = Number(text);
//   return Number.isFinite(number) ? number : text;
// };

// const normalizeAbhaNumberForToken = (value) => {
//   const text = toText(value);
//   if (!text) return "";
//   const digits = text.replace(/\D/g, "");
//   return digits || text;
// };

// const getRawAbhaNumber = (raw = {}) =>
//   toText(raw.abhaNumber) ||
//   toText(raw.AbhaNumber) ||
//   toText(raw.ABHANumber) ||
//   toText(raw.abhaNo);

// const getRawAbhaAddress = (raw = {}) =>
//   toText(raw.abhaAddress) ||
//   toText(raw.AbhaAddress) ||
//   toText(raw.ABHAAddress) ||
//   toText(raw.healthId);

// const buildPatientPayload = (raw = {}) => {
//   const abhaNumber = normalizeAbhaNumberForToken(getRawAbhaNumber(raw));
//   const abhaAddress = getRawAbhaAddress(raw);

//   return {
//     // ABDM sandbox builds have used different casing across examples. Send the
//     // documented keys plus common aliases so validation does not read them null.
//     AbhaNumber: abhaNumber,
//     ABHANumber: abhaNumber,
//     abhaNumber: abhaNumber,
//     AbhaAddress: abhaAddress,
//     ABHAAddress: abhaAddress,
//     abhaAddress: abhaAddress,
//     name: toText(raw.name),
//     gender: toText(raw.gender),
//     yearOfBirth: normalizeYearOfBirth(raw.yearOfBirth),
//   };
// };

// const requiredMissing = (payload, keys) =>
//   keys.filter((key) => !toText(payload[key]));

// exports.generateToken = async (req, res) => {
//   try {
//     const hipId =
//       toText(req.body?.hipId) ||
//       toText(req.header("X-HIP-ID")) ||
//       toText(process.env.HIP_ID) ||
//       hospitalConfig.hipId;
//     const payload = buildPatientPayload(req.body);
//     const missing = requiredMissing(payload, [
//       "AbhaNumber",
//       "AbhaAddress",
//       "name",
//       "gender",
//       "yearOfBirth",
//     ]);

//     if (!hipId) {
//       return res.status(400).json({ error: "HIP ID is required" });
//     }
//     if (missing.length > 0) {
//       return res.status(400).json({
//         error: `Missing generate-token value(s): ${missing.join(", ")}`,
//       });
//     }

//     const headers = await withGatewayHeaders({ "X-HIP-ID": hipId });
//     const requestId = headers["REQUEST-ID"];
//     const response = await axios.post(
//       `${process.env.GATEWAY_BASE}/api/hiecm/v3/token/generate-token`,
//       payload,
//       { headers }
//     );

//     return res.json({
//       requestId,
//       callbackPending: true,
//       statusCode: response.status,
//       message:
//         "Link token request accepted. Use the callback check until ABDM sends the token.",
//       immediateResponse:
//         response.data && typeof response.data === "object" ? response.data : {},
//     });
//   } catch (err) {
//     const { status, body } = getErrorPayload(err);
//     return res.status(status).json(body);
//   }
// };

// exports.getTokenCallback = async (req, res) => {
//   const requestId = toText(req.params?.requestId);
//   if (!requestId) {
//     return res.status(400).json({ error: "requestId is required" });
//   }

//   const callback = getCallback(requestId);
//   if (!callback) {
//     return res.status(404).json({
//       error: "Link token callback has not been received yet",
//       requestId,
//     });
//   }

//   return res.json(callback);
// };

// exports.linkCareContext = async (req, res) => {
//   try {
//     const raw = toObject(req.body);
//     const hipId =
//       toText(raw.hipId) ||
//       toText(req.header("X-HIP-ID")) ||
//       toText(process.env.HIP_ID) ||
//       hospitalConfig.hipId;
//     const linkToken =
//       toText(raw.linkToken) || toText(raw.linkingToken) || toText(req.header("X-LINK-TOKEN"));
//     const abhaNumber = normalizeAbhaNumberForToken(getRawAbhaNumber(raw));
//     const abhaAddress = getRawAbhaAddress(raw);
//     const payload = {
//       AbhaNumber: abhaNumber,
//       AbhaAddress: abhaAddress,
//       patient: Array.isArray(raw.patient) ? raw.patient : [],
//     };

//     if (!hipId) {
//       return res.status(400).json({ error: "HIP ID is required" });
//     }
//     if (!linkToken) {
//       return res.status(400).json({ error: "Link token is required" });
//     }
//     if (!payload.AbhaNumber || !payload.AbhaAddress || payload.patient.length === 0) {
//       return res.status(400).json({
//         error: "AbhaNumber, AbhaAddress, and patient care context are required",
//       });
//     }

//     const headers = await withGatewayHeaders({
//       "X-HIP-ID": hipId,
//       "X-LINK-TOKEN": linkToken,
//     });
//     const response = await axios.post(
//       `${process.env.GATEWAY_BASE}/api/hiecm/hip/v3/link/carecontext`,
//       payload,
//       { headers }
//     );

//     return res.json({
//       requestId: headers["REQUEST-ID"],
//       statusCode: response.status,
//       response: response.data || {},
//     });
//   } catch (err) {
//     const { status, body } = getErrorPayload(err);
//     return res.status(status).json(body);
//   }
// };

// exports.notifyContext = async (req, res) => {
//   try {
//     const raw = toObject(req.body);
//     const hipId =
//       toText(raw.hipId) ||
//       toText(raw.notification?.hip?.id) ||
//       toText(req.header("X-HIP-ID")) ||
//       toText(process.env.HIP_ID) ||
//       hospitalConfig.hipId;
//     const linkToken =
//       toText(raw.linkToken) || toText(raw.linkingToken) || toText(req.header("X-LINK-TOKEN"));
//     const notification = toObject(raw.notification);

//     if (!hipId) {
//       return res.status(400).json({ error: "HIP ID is required" });
//     }
//     if (!linkToken) {
//       return res.status(400).json({ error: "Link token is required" });
//     }
//     if (!notification.patient || !notification.careContext) {
//       return res.status(400).json({
//         error: "notification.patient and notification.careContext are required",
//       });
//     }

//     const payload = {
//       notification: {
//         ...notification,
//         hip: notification.hip || { id: hipId },
//       },
//     };
//     const headers = await withGatewayHeaders({
//       "X-HIP-ID": hipId,
//       "X-LINK-TOKEN": linkToken,
//     });
//     const response = await axios.post(
//       `${process.env.GATEWAY_BASE}/api/hiecm/hip/v3/link/context/notify`,
//       payload,
//       { headers }
//     );

//     return res.json({
//       requestId: headers["REQUEST-ID"],
//       statusCode: response.status,
//       response: response.data || {},
//     });
//   } catch (err) {
//     const { status, body } = getErrorPayload(err);
//     return res.status(status).json(body);
//   }
// };

// exports.onGenerateToken = async (req, res) => {
//   const entry = saveCallback(req.body || {});
//   return res.status(202).json({
//     ok: true,
//     requestId: entry.requestId,
//     linkTokenPresent: Boolean(entry.linkToken),
//   });
// };
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { getGatewayToken } = require("../services/gatewayService");
const { getHeaders } = require("../utils/headers");
const M2TransactionStore = require("../m2/transactions/M2TransactionStore");
const hospitalConfig = require("../config/hospitalConfig");
const { toIsoTimestamp, nowIso } = require("../utils/dateUtils");
const transactionStore = require("../utils/transactionStore");
const { dataRoot } = require("../config/environment");

const careContextCallbacks = [];
const hipConsentNotifications = [];

const toText = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text.length > 0 ? text : "";
};

const toObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const getErrorPayload = (err) => {
  const status = err.response?.status || 500;
  const data = err.response?.data;

  if (typeof data === "string") {
    return { status, body: { error: data } };
  }

  if (data && typeof data === "object") {
    return { status, body: data };
  }

  return {
    status,
    body: { error: err.message || "ABDM HIP linking API failed" },
  };
};

const withGatewayHeaders = async (extraHeaders = {}) => {
  const gatewayToken = await getGatewayToken();
  return {
    ...getHeaders(gatewayToken),
    ...extraHeaders,
  };
};

const normalizeYearOfBirth = (value) => {
  const text = toText(value);
  if (!text) return "";
  const number = Number(text);
  return Number.isFinite(number) ? number : text;
};

const normalizeAbhaNumberForToken = (value) => {
  const text = toText(value);
  if (!text) return "";
  const digits = text.replace(/\D/g, "");
  return digits || text;
};

const decodeJwtPayload = (token) => {
  try {
    const parts = toText(token).split(".");
    if (parts.length < 2) return {};
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padding = payload.length % 4 === 0 ? "" : "=".repeat(4 - (payload.length % 4));
    const decoded = Buffer.from(payload + padding, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
};

const normalizeAbhaAddressForLinking = (value) => {
  const text = toText(value).toLowerCase();
  if (!text) return "";
  if (!text.includes("@")) return text;
  const [localPart, domain = ""] = text.split("@");
  if (!localPart || (domain !== "sbx" && domain !== "abdm")) {
    return text;
  }
  return `${localPart}@${domain}`;
};

const getAbhaAddressFromToken = (tokenPayload = {}) =>
  normalizeAbhaAddressForLinking(tokenPayload.abhaAddress) ||
  normalizeAbhaAddressForLinking(tokenPayload.AbhaAddress) ||
  normalizeAbhaAddressForLinking(tokenPayload.sub);

const getAbhaNumberFromToken = (tokenPayload = {}) =>
  normalizeAbhaNumberForToken(tokenPayload.abhaNumber) ||
  normalizeAbhaNumberForToken(tokenPayload.AbhaNumber) ||
  normalizeAbhaNumberForToken(tokenPayload.ABHANumber);

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    toText(value)
  );

const isLinkingAbhaAddress = (value) =>
  /^[a-z0-9](?:[a-z0-9._]*[a-z0-9])?@(sbx|abdm)$/i.test(toText(value));

// ABDM validates some reference fields with ABHA-address rules. Values like
// "91172204000829@sbx" or "CC-178152..." fail even when AbhaAddress is valid.
const normalizePatientReferenceForLinking = (value, fallbackName = "") => {
  const text = toText(value);
  const fallback = toText(fallbackName);
  if (!text) {
    return fallback || text;
  }

  const lower = text.toLowerCase();
  if (lower.includes(" ")) {
    return text;
  }

  if (isLinkingAbhaAddress(lower)) {
    const localPart = lower.split("@")[0];
    if (/^\d+$/.test(localPart)) {
      return fallback || `MR-${localPart}`;
    }
    return lower;
  }

  if (/^\d+$/.test(lower) || /^cc-/i.test(text)) {
    return fallback || `MR-${lower.replace(/^cc-/i, "")}`;
  }

  return text;
};

const normalizeCareContextReferenceForLinking = (value) => {
  const text = toText(value);
  if (!text) return require("uuid").v4(); // Only if completely empty
  return text;
};

const stripPatientReferenceForNotify = (value) => {
  const text = toText(value);
  return text.replace(/@(sbx|abdm)$/i, "");
};

const guessHiType = (fileName) => {
  const normalized = toText(fileName).toLowerCase().replace(/[^a-z]/g, "");
  if (normalized.includes("diagnosticreport")) return "DiagnosticReport";
  if (normalized.includes("prescription")) return "Prescription";
  if (normalized.includes("opconsultation")) return "OPConsultation";
  if (normalized.includes("dischargesummary")) return "DischargeSummary";
  if (normalized.includes("immunizationrecord")) return "ImmunizationRecord";
  if (normalized.includes("healthdocumentrecord")) return "HealthDocumentRecord";
  if (normalized.includes("wellnessrecord")) return "WellnessRecord";
  if (normalized.includes("invoice")) return "Invoice";
  return "DocumentReference";
};

const normalizePatientEntriesForLinking = (patient = [], abhaAddress = "") =>
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

const buildLinkCareContextPayload = (raw = {}, linkToken = "") => {
  const tokenPayload = decodeJwtPayload(linkToken);
  const abhaNumber =
    getAbhaNumberFromToken(tokenPayload) ||
    normalizeAbhaNumberForToken(getRawAbhaNumber(raw));
  const abhaAddress =
    getAbhaAddressFromToken(tokenPayload) ||
    normalizeAbhaAddressForLinking(getRawAbhaAddress(raw));
  const patient = normalizePatientEntriesForLinking(
    Array.isArray(raw.patient) ? raw.patient : [],
    abhaAddress
  );

  return {
    abhaNumber: abhaNumber,
    abhaAddress: abhaAddress,
    patient,
  };
};

const getRawAbhaNumber = (raw = {}) =>
  toText(raw.abhaNumber) ||
  toText(raw.AbhaNumber) ||
  toText(raw.ABHANumber) ||
  toText(raw.abhaNo);

const getRawAbhaAddress = (raw = {}) =>
  toText(raw.abhaAddress) ||
  toText(raw.AbhaAddress) ||
  toText(raw.ABHAAddress) ||
  toText(raw.healthId);

const buildPatientPayload = (raw = {}) => {
  const abhaNumber = normalizeAbhaNumberForToken(getRawAbhaNumber(raw));
  const abhaAddress = normalizeAbhaAddressForLinking(getRawAbhaAddress(raw));

  return {
    AbhaNumber: abhaNumber,
    ABHANumber: abhaNumber,
    abhaNumber: abhaNumber,

    AbhaAddress: abhaAddress,
    ABHAAddress: abhaAddress,
    abhaAddress: abhaAddress,

    name: toText(raw.name),
    gender: toText(raw.gender),
    yearOfBirth: normalizeYearOfBirth(raw.yearOfBirth),
  };
};

const requiredMissing = (payload, keys) =>
  keys.filter((key) => !toText(payload[key]));

exports.generateToken = async (req, res) => {
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
        error: `Missing generate-token value(s): ${missing.join(", ")}`,
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
      console.log(`[HIP LINK TOKEN] Reusing active pending request ${activeRequest.requestId} for patient.`);
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
      `${process.env.GATEWAY_BASE || "https://dev.abdm.gov.in"}/api/hiecm/v3/token/generate-token`,
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
exports.getTokenCallback = async (req, res) => {
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

exports.linkCareContext = async (req, res) => {
  try {
    const raw = toObject(req.body);

    const hipId =
      toText(raw.hipId) ||
      toText(req.header("X-HIP-ID")) ||
      toText(process.env.HIP_ID) ||
      hospitalConfig.hipId;

    const linkToken =
      toText(raw.linkToken) ||
      toText(raw.linkingToken) ||
      toText(req.header("X-LINK-TOKEN"));

    const payload = buildLinkCareContextPayload(raw, linkToken);

    if (!hipId) {
      return res.status(400).json({ error: "HIP ID is required" });
    }

    if (!linkToken) {
      return res.status(400).json({ error: "Link token is required" });
    }

    if (!payload.abhaAddress || payload.patient.length === 0) {
      return res.status(400).json({
        error: "abhaAddress and patient care context are required",
      });
    }

    const headers = await withGatewayHeaders({
      "X-HIP-ID": hipId,
      "X-LINK-TOKEN": linkToken,
    });

    const response = await axios.post(
      `${process.env.GATEWAY_BASE}/api/hiecm/hip/v3/link/carecontext`,
      payload,
      { headers }
    );

    // Automatically register the linked care context in M2 transaction store
    try {
      const M2ConsentManager = require("../m2/consent/M2ConsentManager");
      await M2ConsentManager.registerHipLinkContext({
        requestId: headers["REQUEST-ID"],
        hipId: hipId,
        linkToken: linkToken,
        abhaAddress: payload.abhaAddress || (payload.patient && payload.patient[0] ? payload.patient[0].id : "") || "",
        patient: payload.patient,
        createdTime: new Date().toISOString(),
        linkPayload: payload,
        linkResponse: response.data || {}
      });
    } catch (m2Err) {
      console.error("[HIP LINK TOKEN] Failed to auto-register M2 context:", m2Err);
    }

    return res.json({
      requestId: headers["REQUEST-ID"],
      statusCode: response.status,
      response: response.data || {},
    });
  } catch (err) {
    const { status, body } = getErrorPayload(err);
    return res.status(status).json(body);
  }
};

const findPatientMobileOnDisk = (patientId) => {
  if (!patientId) return "";
  const normalizedId = toText(patientId).toLowerCase();
  const searchRoots = [
    path.join(dataRoot, "ABHA_Verified"),
    path.join(dataRoot, "Non_ABHA_Verified"),
    dataRoot,
  ];

  for (const root of searchRoots) {
    if (!fs.existsSync(root)) continue;
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dirName = entry.name.toLowerCase();
        if (dirName.includes(normalizedId) || dirName.split("@")[0] === normalizedId.split("@")[0]) {
          const folderPath = path.join(root, entry.name);
          const files = fs.readdirSync(folderPath);
          for (const file of files) {
            if (file.endsWith(".txt") && file !== "local_data.txt" && file !== "hip_link_token.txt") {
              const content = fs.readFileSync(path.join(folderPath, file), "utf8");
              const match = content.match(/Mobile:\s*(\d{10})/i);
              if (match && match[1]) {
                return match[1];
              }
            }
          }
        }
      }
    } catch (_) {}
  }
  return "";
};

const dispatchSmsNotify = async ({ phoneNo, hipId, hipName }) => {
  const cleanPhone = toText(phoneNo).replace(/\D/g, "").slice(-10);
  if (!cleanPhone) throw new Error("Invalid phone number for SMS notification");

  const requestId = uuidv4();
  const timestamp = nowIso();
  const resolvedHipId = hipId || process.env.HIP_ID || hospitalConfig.hipId;
  const resolvedHipName = hipName || hospitalConfig.hipName || "Sarita Health Care";

  const payload = {
    requestId,
    timestamp,
    notification: {
      phoneNo: cleanPhone,
      hip: {
        name: resolvedHipName,
        id: resolvedHipId,
      },
    },
  };

  const gatewayToken = await getGatewayToken();
  const headers = {
    "Content-Type": "application/json",
    "REQUEST-ID": requestId,
    "TIMESTAMP": timestamp,
    "X-CM-ID": process.env.X_CM_ID || "sbx",
    Authorization: `Bearer ${gatewayToken}`,
  };

  console.log("=========================================");
  console.log("[HIP SMS NOTIFY] Sending SMS Notification to ABDM Gateway");
  console.log("URL:", `${process.env.GATEWAY_BASE}/api/hiecm/hip/v3/link/patient/links/sms/notify2`);
  console.log("Phone:", "<omitted for security>");
  console.log("Payload:", "<omitted for security>");

  const response = await axios.post(
    `${process.env.GATEWAY_BASE}/api/hiecm/hip/v3/link/patient/links/sms/notify2`,
    payload,
    { headers }
  );

  console.log("[HIP SMS NOTIFY] ABDM Gateway Response Status:", response.status);
  console.log("=========================================");

  try {
    const responsesLogPath = path.join(dataRoot, "api_responses.txt");
    const logEntry = `[OUTBOUND REQUEST] POST ${process.env.GATEWAY_BASE}/api/hiecm/hip/v3/link/patient/links/sms/notify2\n${JSON.stringify({ headers, data: payload }, null, 2)}\n[RESPONSE] Status: ${response.status}\n\n`;
    fs.appendFileSync(responsesLogPath, logEntry);
  } catch (_) {}

  return {
    ok: true,
    requestId,
    statusCode: response.status,
    response: response.data || {},
  };
};

exports.dispatchSmsNotify = dispatchSmsNotify;
exports.findPatientMobileOnDisk = findPatientMobileOnDisk;

exports.notifyContext = async (req, res) => {
  try {
    const raw = toObject(req.body);

    const hipId =
      toText(raw.hipId) ||
      toText(raw.notification?.hip?.id) ||
      toText(req.header("X-HIP-ID")) ||
      toText(process.env.HIP_ID) ||
      hospitalConfig.hipId;

    const linkToken =
      toText(raw.linkToken) ||
      toText(raw.linkingToken) ||
      toText(req.header("X-LINK-TOKEN"));

    const notification = toObject(raw.notification);
    const tokenPayload = decodeJwtPayload(linkToken);
    const tokenAbhaAddress = getAbhaAddressFromToken(tokenPayload);

    if (!hipId) {
      return res.status(400).json({ error: "HIP ID is required" });
    }

    if (!linkToken) {
      return res.status(400).json({ error: "Link token is required" });
    }

    if (!notification.patient || !notification.careContext) {
      return res.status(400).json({
        error:
          "notification.patient and notification.careContext are required",
      });
    }

    const patientId =
      normalizeAbhaAddressForLinking(toText(notification.patient?.id)) ||
      tokenAbhaAddress ||
      normalizeAbhaAddressForLinking(getRawAbhaAddress(raw));
    const patientReference = toText(notification.careContext?.patientReference);

    if (!patientId) {
      return res.status(400).json({
        error: "notification.patient.id (ABHA address) is required",
      });
    }

    if (!patientReference) {
      return res.status(400).json({
        error:
          "notification.careContext.patientReference (patient reference from care context linking) is required",
      });
    }

    const baseCareContextRef = toText(notification.careContext?.careContextReference);
    let finalCareContextRef = baseCareContextRef;
    if (Array.isArray(notification.hiTypes) && notification.hiTypes.length > 0) {
      const type = notification.hiTypes[0];
      if (!baseCareContextRef.endsWith(`-${type}`)) {
        finalCareContextRef = `${baseCareContextRef}-${type}`;
      }
    }

    // Match the exact patientReference that was registered during linkCareContext
    const matchedPatientRef =
      normalizePatientReferenceForLinking(patientReference) ||
      patientReference;

    const payload = {
      notification: {
        ...notification,
        date: toIsoTimestamp(notification.date),
        patient: {
          ...toObject(notification.patient),
          id: patientId,
        },
        careContext: {
          ...toObject(notification.careContext),
          patientReference: matchedPatientRef,
          careContextReference: finalCareContextRef,
        },
        hip: notification.hip || { id: hipId },
      },
    };

    const headers = await withGatewayHeaders({
      "X-HIP-ID": hipId,
      "X-LINK-TOKEN": linkToken,
    });

    console.log("=========================================");
    console.log("[HIP NOTIFY CONTEXT] Sending Care Context Notification to ABDM Gateway");
    console.log("URL:", `${process.env.GATEWAY_BASE}/api/hiecm/hip/v3/link/context/notify`);
    console.log("REQUEST-ID:", headers["REQUEST-ID"]);
    console.log("Patient ID (ABHA):", patientId);
    console.log("Patient Reference:", "<omitted for security>");
    console.log("Care Context Reference:", finalCareContextRef);
    console.log("Headers:", "<omitted for security>");
    console.log("Payload:", "<omitted for security>");

    const response = await axios.post(
      `${process.env.GATEWAY_BASE}/api/hiecm/hip/v3/link/context/notify`,
      payload,
      { headers }
    );

    console.log("[HIP NOTIFY CONTEXT] ABDM Gateway Immediate Response Status:", response.status);
    console.log("Data:", "<omitted for security>");
    console.log("ℹ️ NOTE: HTTP 202 means ABDM accepted the notification for async processing. ABDM will call back on /v3/links/context/on-notify with delivery status.");
    console.log("=========================================");

    try {
      const responsesLogPath = path.join(dataRoot, "api_responses.txt");
      const logEntry = `[OUTBOUND REQUEST] POST ${process.env.GATEWAY_BASE}/api/hiecm/hip/v3/link/context/notify\n${JSON.stringify({ headers, data: payload }, null, 2)}\n[RESPONSE] Status: ${response.status}\n\n`;
      fs.appendFileSync(responsesLogPath, logEntry);
    } catch (_) {}

    // Automatic Companion SMS Notification: Deep link to patient mobile
    let smsResult = null;
    let patientMobile =
      toText(raw.phoneNo) ||
      toText(raw.mobile) ||
      toText(notification.phoneNo) ||
      toText(notification.patient?.phoneNo) ||
      toText(notification.patient?.mobile);

    if (!patientMobile) {
      patientMobile = findPatientMobileOnDisk(patientId);
    }

    if (patientMobile) {
      try {
        console.log(`[HIP NOTIFY CONTEXT] Automatically dispatching companion SMS notification to ${patientMobile}...`);
        smsResult = await dispatchSmsNotify({
          phoneNo: patientMobile,
          hipId,
          hipName: toText(raw.hipName) || hospitalConfig.hipName || "Sarita Health Care",
        });
        console.log(`[HIP NOTIFY CONTEXT] Automatic companion SMS Notification status:`, smsResult?.statusCode || 202);
      } catch (smsErr) {
        console.warn(`[HIP NOTIFY CONTEXT] Automatic SMS Notification warning:`, smsErr.message);
        smsResult = { ok: false, error: smsErr.message };
      }
    }

    return res.json({
      requestId: headers["REQUEST-ID"],
      statusCode: response.status,
      response: response.data || {},
      smsNotification: smsResult,
    });
  } catch (err) {
    const { status, body } = getErrorPayload(err);
    console.error("❌ [HIP NOTIFY CONTEXT ERROR] Failed to send notification to ABDM. Status:", status, "Body:", "<omitted>");
    return res.status(status).json(body);
  }
};

exports.onGenerateToken = async (req, res) => {
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

    console.log(`Valid callback processed. Link Token Present: ${Boolean(linkToken)}`);
    
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
const contextNotifyStoreFile = path.join(dataRoot, "hip_context_notify_callbacks.json");
const contextNotifyCallbacks = [];

const loadContextNotifyCallbacks = () => {
  try {
    if (fs.existsSync(contextNotifyStoreFile)) {
      const data = JSON.parse(fs.readFileSync(contextNotifyStoreFile, "utf8"));
      if (Array.isArray(data)) {
        contextNotifyCallbacks.length = 0;
        contextNotifyCallbacks.push(...data);
      }
    }
  } catch (e) {
    console.warn("[HIP NOTIFY] Failed to load persisted callbacks:", e.message);
  }
};

const persistContextNotifyCallbacks = () => {
  try {
    fs.mkdirSync(path.dirname(contextNotifyStoreFile), { recursive: true });
    fs.writeFileSync(contextNotifyStoreFile, JSON.stringify(contextNotifyCallbacks, null, 2), "utf8");
  } catch (e) {
    console.error("[HIP NOTIFY] Failed to persist callbacks:", e.message);
  }
};

loadContextNotifyCallbacks();

exports.onContextNotify = async (req, res) => {
  const body = req.body || {};
  console.log("=========================================");
  console.log("[HIP LINK CONTEXT NOTIFY] Webhook Callback Received from ABDM");
  console.log("Path:", req.originalUrl || req.url);
  console.log("Headers:", "<omitted for security>");
  console.log("Body:", "<omitted for security>");

  if (body.error) {
    console.error("❌ [HIP LINK CONTEXT NOTIFY] ABDM reported an ERROR:", JSON.stringify(body.error, null, 2));
  } else if (body.acknowledgement?.status === "SUCCESS") {
    console.log("✅ [HIP LINK CONTEXT NOTIFY] ABDM confirmed SUCCESS for requestId:", body.resp?.requestId);
  }
  console.log("=========================================");

  const entry = {
    receivedAt: nowIso(),
    path: req.originalUrl || req.url,
    requestId: body.response?.requestId || body.resp?.requestId || body.requestId || "",
    status: body.acknowledgement?.status || (body.error ? "FAILED" : "RECEIVED"),
    error: body.error || null,
    payload: body,
  };

  contextNotifyCallbacks.push(entry);
  persistContextNotifyCallbacks();

  return res.status(202).json({ ok: true });
};

exports.getContextNotifyCallback = async (req, res) => {
  const requestId = toText(req.params?.requestId);
  if (!requestId) {
    return res.status(400).json({ error: "requestId is required" });
  }
  loadContextNotifyCallbacks();
  const entry = contextNotifyCallbacks.find(
    (c) => c.requestId === requestId || c.payload?.response?.requestId === requestId || c.payload?.resp?.requestId === requestId
  );
  if (!entry) {
    return res.status(404).json({ error: "Context notify callback not found for requestId", requestId });
  }
  return res.json(entry);
};

exports.notifyMobile = async (req, res) => {
  try {
    const raw = toObject(req.body);
    const hipId =
      toText(raw.hipId) ||
      toText(raw.notification?.hip?.id) ||
      toText(req.header("X-HIP-ID")) ||
      toText(process.env.HIP_ID) ||
      hospitalConfig.hipId;

    const phoneNo =
      toText(raw.phoneNo) ||
      toText(raw.notification?.phoneNo) ||
      toText(raw.mobile);

    if (!phoneNo) {
      return res.status(400).json({ error: "phoneNo (mobile number) is required for SMS notification" });
    }

    const hipName =
      toText(raw.hipName) ||
      toText(raw.notification?.hip?.name) ||
      hospitalConfig.hipName ||
      "Sarita Health Care";

    const result = await dispatchSmsNotify({ phoneNo, hipId, hipName });
    return res.json(result);
  } catch (err) {
    const { status, body } = getErrorPayload(err);
    console.error("❌ [HIP SMS NOTIFY ERROR] Status:", status, "Body:", "<omitted>");
    return res.status(status).json(body);
  }
};

exports.listContextNotifyCallbacks = () => {
  loadContextNotifyCallbacks();
  return contextNotifyCallbacks
    .slice()
    .reverse()
    .map((item) => JSON.parse(JSON.stringify(item)));
};

exports.onCareContext = async (req, res) => {
  careContextCallbacks.push({
    receivedAt: nowIso(),
    payload: req.body || {},
  });
  return res.status(202).json({ ok: true });
};

exports.onHipConsentNotify = async (req, res) => {
  const payload = req.body || {};
  
  // Extract identifiers
  const requestId = toText(payload.requestId);
  const consentId = toText(payload.notification?.consentId) || 
                    toText(payload.notification?.consentDetail?.consentId);

  if (!requestId || !consentId) {
    console.warn("[HIP NOTIFY] Callback failed validation. Missing requestId or consentId.");
    return res.status(400).json({ error: "Missing requestId or consentId in request body." });
  }

  // Register notification
  hipConsentNotifications.push({
    receivedAt: nowIso(),
    payload,
  });

  const notification = payload.notification || {};
  const consentDetail = notification.consentDetail || {};
  const patientId = toText(consentDetail.patient?.id || consentDetail.patient?.abhaAddress);
  const careContexts = consentDetail.careContexts || [];
  const hiTypes = consentDetail.hiTypes || [];

  // Initialize and persist state: CONSENT_RECEIVED
  let tx = transactionStore.saveTransaction({
    requestId,
    consentId,
    patientId,
    careContexts,
    hiTypes,
    status: "CONSENT_RECEIVED",
    callbackUrl: req.originalUrl || "/api/v3/consent/request/hip/notify"
  });

  transactionStore.logStage(tx, "CONSENT_RECEIVED", "Received /hip/notify callback from Gateway", payload);

  // Return HTTP 202 Accepted immediately
  res.status(202).json({});

  // Asynchronously acknowledge notify
  setTimeout(async () => {
    try {
      const headers = await withGatewayHeaders({
        "X-CM-ID": toText(process.env.X_CM_ID) || "sbx"
      });
      
      const onNotifyPayload = {
        acknowledgement: {
          status: "OK",
          consentId: consentId
        },
        response: {
          requestId: requestId
        }
      };

      transactionStore.logStage(tx, "CONSENT_RECEIVED", "Sending POST /api/hiecm/consent/v3/request/hip/on-notify to Gateway", onNotifyPayload);

      const response = await axios.post(
        `${process.env.GATEWAY_BASE}/api/hiecm/consent/v3/request/hip/on-notify`,
        onNotifyPayload,
        { headers }
      );

      // Transition to CONSENT_ACKNOWLEDGED
      transactionStore.transitionState(consentId, "CONSENT_ACKNOWLEDGED", {
        notifyStatus: "ACKNOWLEDGED"
      });

    } catch (err) {
      const status = err.response?.status || 500;
      const data = err.response?.data || err.message;
      
      transactionStore.transitionState(consentId, "FAILED", {
        notifyStatus: "FAILED",
        error: `on-notify callback failed: ${JSON.stringify(data)}`
      });

      console.error(`❌ [HIP NOTIFY] Error sending on-notify callback to Gateway. Status: ${status}, Data:`, data);
    }
  }, 100);
};

exports.listHipConsentNotifications = () =>
  hipConsentNotifications
    .slice()
    .reverse()
    .map((item) => JSON.parse(JSON.stringify(item)));
