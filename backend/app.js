require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const hospitalConfig = require("./config/hospitalConfig");
const fs = require('fs');
const path = require('path');
const { startWatcher } = require("./m2/fhir/M2FolderWatcher");
const M2AuthenticationManager = require("./m2/authentication/M2AuthenticationManager");

const app = express();

const API_DEBUG_ENABLED = process.env.API_DEBUG !== "false";
const MAX_LOG_LENGTH = 4000;

const maskValue = (value) => {
  const text = String(value ?? "");
  if (text.length <= 8) return "***";
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
};

const sanitizeHeaders = (headers = {}) => {
  const sensitiveHeaders = new Set([
    "authorization",
    "x-auth-token",
    "x-refresh-token",
    "x-token",
    "cookie",
    "set-cookie",
  ]);

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      sensitiveHeaders.has(String(key).toLowerCase()) ? maskValue(value) : value,
    ])
  );
};

const summarizeBinaryPayload = (value) => {
  if (Buffer.isBuffer(value)) {
    return {
      type: "Buffer",
      byteLength: value.length,
      preview: `<binary ${value.length} bytes>`,
    };
  }

  if (
    value &&
    typeof value === "object" &&
    value.type === "Buffer" &&
    Array.isArray(value.data)
  ) {
    return {
      type: "Buffer",
      byteLength: value.data.length,
      preview: `<binary ${value.data.length} bytes>`,
    };
  }

  return null;
};

const summarizeLargePayload = (value) => {
  const binarySummary = summarizeBinaryPayload(value);
  if (binarySummary) {
    return binarySummary;
  }

  if (value == null || value === "") {
    return value;
  }

  if (typeof value === "string") {
    if (value.length > 1200) {
      return `<string ${value.length} chars>`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > 100) {
      return `<array ${value.length} items>`;
    }
    return value.map((item) => summarizeLargePayload(item));
  }

  if (typeof value === "object") {
    const summarized = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (key === "data") {
        const nestedBinarySummary = summarizeBinaryPayload(nestedValue);
        if (nestedBinarySummary) {
          summarized[key] = nestedBinarySummary;
          continue;
        }
        if (typeof nestedValue === "string" && nestedValue.length > 1200) {
          summarized[key] = `<base64 ${nestedValue.length} chars>`;
          continue;
        }
      }

      summarized[key] = summarizeLargePayload(nestedValue);
    }
    return summarized;
  }

  return value;
};

const stringifyForLog = (value) => {
  if (value == null || value === "") return "";
  const summarizedValue = summarizeLargePayload(value);
  if (typeof value === "string") {
    try {
      return JSON.stringify(summarizeLargePayload(JSON.parse(value)), null, 2);
    } catch (_) {
      return String(summarizedValue);
    }
  }

  try {
    return JSON.stringify(summarizedValue, null, 2);
  } catch (_) {
    return String(summarizedValue);
  }
};

const truncateLog = (value) =>
  value.length <= MAX_LOG_LENGTH ? value : `${value.slice(0, MAX_LOG_LENGTH)}\n...[truncated]`;

const logApiDebug = (label, details) => {
  if (!API_DEBUG_ENABLED) return;

  const lines = [label];
  for (const [key, value] of Object.entries(details)) {
    if (value == null || value === "") continue;
    lines.push(`${key}: ${typeof value === "string" ? value : stringifyForLog(value)}`);
  }

  console.log(truncateLog(lines.join("\n")));
};

axios.interceptors.request.use((config) => {
  logApiDebug(`[API OUTBOUND] ${String(config.method || "GET").toUpperCase()} ${config.url || ""}`, {
    headers: sanitizeHeaders(config.headers || {}),
    params: config.params,
    data: config.data,
  });

  return config;
});

axios.interceptors.response.use(
  (response) => {
logApiDebug(
  `[API OUTBOUND RESPONSE] ${String(response.config?.method || "GET").toUpperCase()} ${response.config?.url || ""}`,
  {
    status: response.status,
    headers: sanitizeHeaders(response.headers || {}),
    data: response.data,
  }
);

    return response;
  },
  (error) => {
    logApiDebug(
      `[API OUTBOUND ERROR] ${String(error.config?.method || "GET").toUpperCase()} ${error.config?.url || ""}`,
      {
        status: error.response?.status,
        headers: sanitizeHeaders(error.response?.headers || {}),
        data: error.response?.data || error.message,
      }
    );
    return Promise.reject(error);
  }
);

app.use(cors());
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "10mb" }));

const shouldSkipInboundApiLog = (req) =>
  req.method === "GET" && req.path === "/api/scan-share/queue";

app.use((req, res, next) => {
  const skipInboundApiLog = shouldSkipInboundApiLog(req);
  const pathUrl = req.path || "";
  const isApiOrGateway = pathUrl.startsWith("/api") || pathUrl.startsWith("/v3") || pathUrl.startsWith("/hiecm");

  if (isApiOrGateway && !skipInboundApiLog) {
logApiDebug(`[API INBOUND] ${req.method} ${req.originalUrl}`, {
  headers: sanitizeHeaders(req.headers),
  query: req.query,
  body: req.body,
});

  }

  const oldWrite = res.write;
  const oldEnd = res.end;
  const chunks = [];

  res.write = (...args) => {
    chunks.push(Buffer.from(args[0]));
    return oldWrite.apply(res, args);
  };

  res.end = (...args) => {
    if (args[0]) chunks.push(Buffer.from(args[0]));
    const body = Buffer.concat(chunks).toString("utf8");
    
    if (isApiOrGateway && !skipInboundApiLog) {
      logApiDebug(`[API INBOUND RESPONSE] ${req.method} ${req.originalUrl}`, {
        status: res.statusCode,
        body: body.length > 2000 ? `<body ${body.length} bytes>` : body,
      });
    }
    
    return oldEnd.apply(res, args);
  };

  next();
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

const buildPublicBaseUrl = (req) => {
  const configured = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").trim();
  const proto = forwardedProto || req.protocol || "http";
  const host = String(req.headers.host || `localhost:${process.env.PORT || 3000}`).trim();
  return `${proto}://${host}`;
};

const isPublicHttpUrl = (value) => {
  const text = String(value || "").trim();
  if (!/^https?:\/\//i.test(text)) return false;
  return !/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(text);
};

app.get("/api/config/callbacks", (req, res) => {
  const publicBaseUrl = buildPublicBaseUrl(req);
  const setupDefaults = {
    bridgeId: String(
      process.env.BRIDGE_ID ||
      process.env.ABDM_CLIENT_ID ||
      process.env.CLIENT_ID ||
      ""
    ).trim(),
    facilityId: String(
      process.env.FACILITY_ID || hospitalConfig.scanShareHipId || ""
    ).trim(),
    facilityName: String(
      process.env.SCAN_SHARE_HOSPITAL_NAME ||
      process.env.FACILITY_NAME ||
      hospitalConfig.scanShareHospitalName ||
      hospitalConfig.hospitalName
    ).trim(),
    serviceId: String(
      process.env.SCAN_SHARE_HIP_ID ||
      process.env.HIP_ID ||
      process.env.HIU_ID ||
      process.env.BRIDGE_SERVICE_ID ||
      ""
    ).trim(),
    serviceName: String(
      process.env.SERVICE_NAME ||
      process.env.SCAN_SHARE_HOSPITAL_NAME ||
      process.env.FACILITY_NAME ||
      hospitalConfig.scanShareHospitalName ||
      ""
    ).trim(),
    hipId: String(
      process.env.SCAN_SHARE_HIP_ID || process.env.HIP_ID || hospitalConfig.hipId
    ).trim(),
    hiuId: String(process.env.HIU_ID || hospitalConfig.hiuId).trim(),
    scanShareHipId: String(hospitalConfig.scanShareHipId).trim(),
  };

  res.json({
    publicBaseUrl,
    isPublicReachable: isPublicHttpUrl(publicBaseUrl),
    setupDefaults,
    callbacks: {
      hipOnGenerateToken: `${publicBaseUrl}/api/v3/hip/token/on-generate-token`,
      hipOnCareContext: `${publicBaseUrl}/api/v3/link/on_carecontext`,
      hipConsentNotifyLegacy: `${publicBaseUrl}/api/v3/consent/request/hip/notify`,
      hipConsentNotify: `${publicBaseUrl}/api/v3/consent/request/hip/on-notify`,
      hipPatientShare: `${publicBaseUrl}/api/v3/hip/patient/share`,
      scanSharePatientShare: `${publicBaseUrl}/api/hiecm/patient-share/v3/share`,
      scanShareOpenOrder: `${publicBaseUrl}/api/v3/hip/patient/share/open-order`,
    },
  });
});

// Routes
app.use("/api/Abha", require("./routes/abhaRoutes"));
app.use("/api/facilities", require("./routes/facilityProviderRoutes"));
app.use("/api/scan-share", require("./routes/scanShareRoutes"));
app.use("/api/hip/link", require("./routes/hipLinkingRoutes"));
app.use("/api/hip/setup", require("./routes/hipSetupRoutes"));
app.use("/api/consents", require("./routes/consentRoutes"));
app.use("/api/drafts", require("./routes/draftRoutes"));
app.use("/api/files", require("./routes/fileRoutes"));

// Mount new M2 module routes
app.use("/api/m2/consents", require("./m2/routes/m2ConsentRoutes"));
app.use("/api/m2/hip/transfer", require("./m2/routes/m2DataTransferRoutes"));
app.use("/api/m2/patient-storage", require("./m2/routes/patientStorageRoutes"));
app.use("/api/m2", require("./m2/routes/m2AuthRoutes"));
app.use("/", require("./m2/routes/m2CallbackRoutes"));
app.use("/", require("./m2/user_init/routes"));


// Mount M3 module routes
app.use("/api/m3/gateway", require("./m3/routes/m3AuthRoutes"));
app.use("/api/m3/consent", require("./m3/routes/m3ConsentRoutes"));
app.use("/api/m3/callback", require("./m3/routes/m3CallbackRoutes"));
app.use("/", require("./m3/routes/m3CallbackRoutes"));
app.use("/api/m3/subscription", require("./m3/routes/m3SubscriptionRoutes"));

const scanShareController = require("./controllers/scanShareController");
const hipLinkingController = require("./controllers/hipLinkingController");
// const hipDataTransferController = require("./controllers/hipDataTransferController");

app.post(
  [
    "/api/v3/hip/token/on-generate-token",
    "/v3/hip/token/on-generate-token",
    "/api/v3/link/token/on-generate-token",
    "/v3/link/token/on-generate-token",
    "/api/hiecm/v3/token/on-generate-token",
    "/hiecm/v3/token/on-generate-token",
    "/api/v3/token/on-generate-token",
    "/v3/token/on-generate-token"
  ],
  hipLinkingController.onGenerateToken
);
app.post(
  ["/api/v3/link/on_carecontext", "/v3/link/on_carecontext", "/api/v3/link/on-carecontext", "/v3/link/on-carecontext"],
  hipLinkingController.onCareContext
);
// Commented out legacy M2 consent notify handler (official route now handled in m2CallbackRoutes)
// app.post(
//   ["/api/v3/consent/request/hip/on-notify", "/v3/consent/request/hip/on-notify"],
//   hipLinkingController.onHipConsentNotify
// );
app.post(
  ["/api/v3/links/context/on-notify", "/v3/links/context/on-notify"],
  hipLinkingController.onContextNotify
);
// Legacy M2 consent-manager callbacks are disconnected from app.js.
// The same ABDM callback URLs are handled by backend/m2/routes/m2CallbackRoutes.js
// through M2CallbackController -> M2CallbackManager.
// Commented out legacy M2 data transfer routes (official route now handled in m2 routes)
// app.post(
//   ["/api/v3/health-information/hip/on-request", "/v3/health-information/hip/on-request"],
//   hipDataTransferController.handleHipRequest
// );
// app.post(
//   "/api/hip/transfer/push",
//   hipDataTransferController.transferHealthInformation
// );
// app.get(
//   "/api/hip/transfer/status/:id",
//   hipDataTransferController.getTransactionStatus
// );
app.post(
  ["/api/v3/hip/patient/share", "/v3/hip/patient/share"],
  scanShareController.onPatientShare
);
app.post(
  ["/api/hiecm/patient-share/v3/share", "/hiecm/patient-share/v3/share"],
  scanShareController.onPatientShare
);
app.post(
  ["/api/v3/hip/patient/share/open-order", "/v3/hip/patient/share/open-order"],
  scanShareController.onOpenOrderShare
);
app.post(
  ["/api/hiecm/scan-gateway/v3/patient/share/open-order", "/hiecm/scan-gateway/v3/patient/share/open-order"],
  scanShareController.onOpenOrderShare
);
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function warmUpService(name, initialize) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await initialize();
      console.log(`✅ ${name} initialized before accepting requests.`);
      return;
    } catch (error) {
      lastError = error;
      console.error(`⚠️ ${name} startup attempt ${attempt}/3 failed:`, error.message);
      if (attempt < 3) await delay(1000 * attempt);
    }
  }
  throw lastError;
}

async function startServer() {
  // Do not accept IIS/PM2 traffic until outbound ABDM authentication is ready.
  // This removes the cold-start race where the first user action failed while
  // token initialization was still running in the background.
  const M2TokenManager = require("./m2/tokens/M2TokenManager");
  const M3TokenManager = require("./m3/tokens/M3TokenManager");
  await Promise.all([
    warmUpService("ABDM M2 gateway/session tokens", () => M2TokenManager.initialize()),
    warmUpService("ABDM M3 gateway token", () => M3TokenManager.initialize())
  ]);

  app.listen(PORT, HOST, () => {
  const localBaseUrl = `http://localhost:${PORT}`;
  const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || "").trim();
  console.log(`✅ Server running on ${localBaseUrl}`);
  startWatcher();
  if (publicBaseUrl) {
    const trimmed = publicBaseUrl.replace(/\/$/, "");
    console.log("🔗 Public callback base:", trimmed);
    console.log("🔁 ABDM hip on-generate-token:", `${trimmed}/api/v3/hip/token/on-generate-token`);
    console.log("🔁 ABDM hip on-carecontext:", `${trimmed}/api/v3/link/on_carecontext`);
    console.log("🔁 ABDM hip consent notify legacy:", `${trimmed}/api/v3/consent/request/hip/notify`);
    console.log("🔁 ABDM hip consent on-notify:", `${trimmed}/api/v3/consent/request/hip/on-notify`);
    console.log("🔁 ABDM hip patient share:", `${trimmed}/api/v3/hip/patient/share`);
    console.log("🔁 ABDM scan-share patient-share:", `${trimmed}/api/hiecm/patient-share/v3/share`);
    console.log("🔁 ABDM scan-share open order:", `${trimmed}/api/v3/hip/patient/share/open-order`);
  } else {
    console.log("⚠️ PUBLIC_BASE_URL is not set. ABDM callbacks will not reach this server unless you expose it publicly.");
  }
  console.log("🛠 Callback config:", `${localBaseUrl}/api/config/callbacks`);

  });
}

startServer().catch((error) => {
  console.error("❌ Server startup aborted because ABDM authentication could not be initialized:", error.message);
  process.exitCode = 1;
});



