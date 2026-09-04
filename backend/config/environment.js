/**
 * backend/config/environment.js
 * Centralized backend environment configuration module.
 * Provides a single source of truth for:
 * - Network listener (host, port)
 * - Canonical data root (portable across OS and working directories)
 * - Public callback URL with strict validation and trailing-slash normalization
 * - Clean ngrok domain extraction
 */

const path = require("path");

// Canonical backend root is one level up from backend/config
const BACKEND_ROOT = path.resolve(__dirname, "..");

// Ensure backend/.env is loaded even if this module is required before app.js
require("dotenv").config({ path: path.join(BACKEND_ROOT, ".env") });

// Canonical data directory: always backend/data unless explicitly overridden by RUNTIME_DATA_DIR / DATA_ROOT
const DATA_ROOT = process.env.RUNTIME_DATA_DIR
  ? path.resolve(process.env.RUNTIME_DATA_DIR)
  : process.env.DATA_ROOT
    ? path.resolve(process.env.DATA_ROOT)
    : path.join(BACKEND_ROOT, "data");

function normalizeUrl(url) {
  if (!url || typeof url !== "string") return "";
  return url.trim().replace(/\/+$/, "");
}

function cleanDomain(domain) {
  if (!domain || typeof domain !== "string") return "";
  return domain.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function getPublicBaseUrl(options = { required: true }) {
  const configured = normalizeUrl(process.env.PUBLIC_BASE_URL);
  if (configured) {
    if (!/^https?:\/\/[a-zA-Z0-9.\-_~:]+/i.test(configured)) {
      throw new Error(`[CONFIG ERROR] Invalid PUBLIC_BASE_URL format: "${configured}". Must be a valid HTTP or HTTPS URL.`);
    }
    return configured;
  }

  if (options.required) {
    throw new Error(
      "[CONFIG ERROR] PUBLIC_BASE_URL is not set in environment.\n" +
      "External ABDM operations (webhooks, dataPushUrl, token callbacks) require a reachable public HTTPS URL.\n" +
      "Please set PUBLIC_BASE_URL in backend/.env (e.g., https://isolation-pouncing-ecard.ngrok-free.dev or https://abdmapi.saritainfotech.com)."
    );
  }

  return "";
}

module.exports = {
  backendRoot: BACKEND_ROOT,
  dataRoot: DATA_ROOT,
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "0.0.0.0",
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || "50mb",
  
  // URL helpers
  getPublicBaseUrl,
  publicBaseUrl: normalizeUrl(process.env.PUBLIC_BASE_URL),
  ngrokDomain: cleanDomain(process.env.NGROK_DOMAIN),
  
  // ABDM Gateway URLs (External)
  gatewayBase: normalizeUrl(process.env.GATEWAY_BASE || "https://dev.abdm.gov.in"),
  abhaBase: normalizeUrl(process.env.Abha_BASE || process.env.ABHA_BASE || "https://Abhasbx.abdm.gov.in"),
  xCmId: process.env.X_CM_ID || "sbx",
};
