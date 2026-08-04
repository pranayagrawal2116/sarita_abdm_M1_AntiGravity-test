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
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { getGatewayToken } = require("../services/gatewayService");
const { getHeaders } = require("../utils/headers");
const { initializeRequest, getActiveRequest, saveCallback, getCallback } = require("../utils/hipLinkTokenStore");
const hospitalConfig = require("../config/hospitalConfig");
const { toIsoTimestamp, nowIso } = require("../utils/dateUtils");
const transactionStore = require("../utils/transactionStore");

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
  if (!text || /^cc-/i.test(text) || isLinkingAbhaAddress(text)) {
    return uuidv4();
  }
  if (isUuid(text)) {
    return text.toLowerCase();
  }
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
        ? entry.careContexts.flatMap((careContext) => {
            if (!careContext || typeof careContext !== "object") {
              return careContext;
            }
            
            const baseReference = normalizeCareContextReferenceForLinking(careContext.referenceNumber);
            const baseDisplay = careContext.display || "";
            const types = careContext.hiTypes || [guessHiType(careContext.display)];
            
            // Create a separate Care Context for each hiType so they display individually in the app
            return types.map(type => ({
              ...careContext,
              referenceNumber: `${baseReference}-${type}`,
              display: baseDisplay ? `${baseDisplay} - ${type}` : type,
              hiTypes: [type],
              hiType: type,
            }));
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

    // Check for an active pending request
    const activeRequest = getActiveRequest(payload);
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

    // Initialize request state in memory store
    initializeRequest(requestId, payload);

    console.log("=========================================");
    console.log("[HIP LINK TOKEN] Generate Token Request Received");
    console.log("Payload:", JSON.stringify(req.body, null, 2));
    console.log("[HIP LINK TOKEN] Outgoing Request Payload");
    console.log("URL:", `${process.env.GATEWAY_BASE}/api/hiecm/v3/token/generate-token`);
    console.log("Headers:", JSON.stringify(headers, null, 2));
    console.log("Body:", JSON.stringify(payload, null, 2));

    const response = await axios.post(
      `${process.env.GATEWAY_BASE}/api/hiecm/v3/token/generate-token`,
      payload,
      { headers }
    );

    console.log("[HIP LINK TOKEN] ABDM Immediate Response");
    console.log("Status:", response.status);
    console.log("Data:", JSON.stringify(response.data || {}, null, 2));
    console.log("=========================================");

    return res.json({
      requestId,
      callbackPending: true,
      statusCode: response.status,
      message:
        "Link token request accepted. Use the callback check until ABDM sends the token.",
      immediateResponse:
        response.data && typeof response.data === "object"
          ? response.data
          : {},
    });
  } catch (err) {
    const { status, body } = getErrorPayload(err);
    console.log("[HIP LINK TOKEN] ABDM Immediate Error Response");
    console.log("Status:", status);
    console.log("Body:", JSON.stringify(body, null, 2));
    console.log("=========================================");
    return res.status(status).json(body);
  }
};

exports.getTokenCallback = async (req, res) => {
  const requestId = toText(req.params?.requestId);

  if (!requestId) {
    return res.status(400).json({ error: "requestId is required" });
  }

  const callback = getCallback(requestId);

  if (!callback) {
    return res.status(404).json({
      error: "Request ID not found",
      requestId,
    });
  }

  return res.json(callback);
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
          patientReference: stripPatientReferenceForNotify(patientReference),
          careContextReference: finalCareContextRef,
        },
        hip: notification.hip || { id: hipId },
      },
    };

    const headers = await withGatewayHeaders({
      "X-HIP-ID": hipId,
      "X-LINK-TOKEN": linkToken,
    });

    const response = await axios.post(
      `${process.env.GATEWAY_BASE}/api/hiecm/hip/v3/link/context/notify`,
      payload,
      { headers }
    );

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

exports.onGenerateToken = async (req, res) => {
  console.log("=========================================");
  console.log("[HIP LINK TOKEN] Incoming Callback Received");
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));

  const entry = saveCallback(req.body || {});

  console.log("[HIP LINK TOKEN] Callback Validation Result");
  if (entry) {
    console.log("Valid callback processed. Status:", entry.status);
    console.log("Link Token Present:", Boolean(entry.linkToken));
    console.log("[HIP LINK TOKEN] Stored Callback for RequestId:", entry.requestId);
  } else {
    console.log("Invalid callback payload (failed to extract requestId)");
  }
  console.log("=========================================");

  return res.status(202).json({
    ok: true,
    requestId: entry?.requestId || "",
    linkTokenPresent: Boolean(entry?.linkToken),
  });
};

const contextNotifyCallbacks = [];

exports.onContextNotify = async (req, res) => {
  console.log("=========================================");
  console.log("[HIP LINK CONTEXT NOTIFY] Callback Received");
  console.log("Body:", JSON.stringify(req.body || {}, null, 2));
  console.log("=========================================");

  contextNotifyCallbacks.push({
    receivedAt: nowIso(),
    payload: req.body || {},
  });

  return res.status(202).json({ ok: true });
};

exports.listContextNotifyCallbacks = () =>
  contextNotifyCallbacks
    .slice()
    .reverse()
    .map((item) => JSON.parse(JSON.stringify(item)));

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
