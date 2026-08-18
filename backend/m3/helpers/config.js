/**
 * Header: config.js
 * Purpose: Centralized configuration parameters and constants.
 * Responsibility: Extract env variables and centralize all endpoint mappings/URLs.
 * TODO: Support dynamic runtime configurations loaded from external databases/API configs.
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const runtimeDataDir = process.env.RUNTIME_DATA_DIR
  ? path.resolve(process.env.RUNTIME_DATA_DIR)
  : path.join(__dirname, "../../data");

module.exports = {
  // Gateway and CM details
  baseHost: process.env.PUBLIC_BASE_URL || process.env.BASE_HOST,
  gatewayBaseUrl: process.env.GATEWAY_BASE || "https://dev.abdm.gov.in",
  clientId: process.env.CLIENT_ID || process.env.ABDM_CLIENT_ID || "",
  clientSecret: process.env.CLIENT_SECRET || process.env.ABDM_CLIENT_SECRET || "",
  xCmId: process.env.X_CM_ID || "sbx",
  
  // Storage paths
  tokenStoreDir: path.join(runtimeDataDir, ".m2_tokens"),
  tokenStoreFile: "session_tokens.json",
  transactionStoreFile: path.join(runtimeDataDir, "m2_transactions.json"),

  // Gateway paths
  gatewaySessionPath: "/api/hiecm/gateway/v3/sessions",
  gatewayConsentOnNotifyPath: "/api/hiecm/consent/v3/request/hip/on-notify",
  gatewayHiOnRequestPath: "/api/hiecm/data-flow/v3/health-information/hip/on-request",
  gatewayHiNotifyPath: "/api/hiecm/data-flow/v3/health-information/notify"
};
