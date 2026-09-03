/**
 * Header: M2AuthenticationManager.js
 * Purpose: Centrally handles system authentications and calls against gateway endpoints.
 * Responsibility: Gateway access token retrieval and authorized Gateway requests.
 * Public Methods:
 *   - authenticate()
 *   - refreshAuthentication()
 *   - validateAuthentication(authObj)
 *   - isAuthenticationExpired(authObj)
 *   - getAuthenticationStatus(authObj)
 *   - getGatewayToken()
 *   - callGatewayApi(requestConfig)
 */

const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const Logger = require("../logging/logger");
const config = require("../helpers/config");
const { getGatewayToken, clearCache: clearGatewayTokenCache } = require("../../services/gatewayService");
const { getHeaders } = require("../../utils/headers");
const {
  maskValue,
  maskStructured,
  configurationSnapshot,
  errorTrace
} = require("../logging/traceUtils");

const isRecoverableError = (err) => {
  if (!err.response) {
    return true; // Timeout, Network issue
  }
  const status = err.response.status;
  if (status >= 500 && status <= 599) {
    return true; // Server errors (502, 503, 504, etc.)
  }
  return false; // Client errors (400, 401, 403, 404, etc.)
};

class M2AuthenticationManager {
  /**
   * Performs client credentials flow to authenticate with the Gateway.
   * Stateless, does not persist tokens to disk.
   * @returns {Promise<Object>} Structured authentication object
   */
  static async authenticate() {
    Logger.info("M2AuthenticationManager", "Method entered: authenticate()", {
      configuration: configurationSnapshot(config),
      rootCauseCheck: "Delegating authentication recovery to recoverAuthentication()."
    });
    return this.recoverAuthentication();
  }

  /**
   * Reuses the proven gateway authentication implementation used by existing backend flows.
   * @returns {Promise<Object>} Structured authentication object
   */
  static async recoverAuthentication() {
    Logger.info("M2AuthenticationManager", "Method entered: recoverAuthentication()", {
      configuration: configurationSnapshot(config)
    });

    const missingConfig = [];
    if (!config.gatewayBaseUrl) missingConfig.push("GATEWAY_BASE");
    if (!config.clientId) missingConfig.push("CLIENT_ID or ABDM_CLIENT_ID");
    if (!config.clientSecret) missingConfig.push("CLIENT_SECRET or ABDM_CLIENT_SECRET");
    if (!config.xCmId) missingConfig.push("X_CM_ID");

    if (missingConfig.length > 0) {
      Logger.error("M2AuthenticationManager", "Configuration validation failed before gateway authentication.", {
        missingConfig,
        exactReasonForFailure: `Missing required configuration: ${missingConfig.join(", ")}`
      });
      return {
        success: false,
        error: "Non-recoverable authentication failure",
        details: `Missing required configuration: ${missingConfig.join(", ")}`,
        missingConfig
      };
    }

    const endpoint = `${config.gatewayBaseUrl}${config.gatewaySessionPath}`;
    let actualRequestHeaders = getHeaders();
    let actualResponseBody = null;
    let actualHttpStatus = null;
    Logger.info("M2AuthenticationManager", "Authentication endpoint prepared.", {
      endpoint,
      requestHeaders: maskStructured(actualRequestHeaders),
      requestBody: maskStructured({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        grantType: "client_credentials"
      }),
      implementation: "backend/services/gatewayService.getGatewayToken"
    });

    const startTime = Date.now();
    try {
      const accessToken = await getGatewayToken({
        onTrace: (trace) => {
          if (trace.event === "request") {
            actualRequestHeaders = trace.headers;
            Logger.info("M2AuthenticationManager", "Gateway authentication request dispatched.", {
              endpoint: trace.url,
              requestHeaders: maskStructured(trace.headers),
              requestBody: maskStructured(trace.body)
            });
          }

          if (trace.event === "response") {
            actualHttpStatus = trace.status;
            actualResponseBody = trace.body;
            Logger.info("M2AuthenticationManager", "Gateway authentication response received.", {
              endpoint,
              httpStatus: trace.status,
              responseHeaders: maskStructured(trace.headers),
              responseBody: maskStructured(trace.body)
            });
          }

          if (trace.event === "cache-hit") {
            actualHttpStatus = "cache-hit";
            actualResponseBody = { accessToken: trace.accessToken, expiryMs: trace.expiryMs };
            Logger.info("M2AuthenticationManager", "Gateway authentication token returned from proven helper cache.", {
              httpStatus: "cache-hit",
              responseBody: maskStructured(actualResponseBody)
            });
          }
        }
      });
      Logger.info("M2AuthenticationManager", "Gateway authentication recovered successfully.", {
        endpoint,
        requestHeaders: maskStructured(actualRequestHeaders),
        httpStatus: actualHttpStatus || 200,
        durationMs: Date.now() - startTime,
        responseBody: maskStructured(actualResponseBody || { accessToken }),
        exactReasonForFailure: null
      });

      return {
        success: true,
        accessToken,
        expiresIn: this.getExpiresInSeconds(accessToken) || 1200,
        issuedAt: Date.now(),
        source: "gatewayService.getGatewayToken"
      };
    } catch (err) {
      const trace = errorTrace(err);
      const status = trace.status;
      const isRecoverable = isRecoverableError(err);

      Logger.error("M2AuthenticationManager", "Gateway authentication recovery failed.", {
        endpoint,
        requestHeaders: maskStructured(actualRequestHeaders),
        httpStatus: status,
        responseBody: trace.responseBody,
        exception: trace,
        recoverable: isRecoverable,
        exactReasonForFailure: status
          ? `Gateway returned HTTP ${status}: ${JSON.stringify(trace.responseBody || {})}`
          : trace.message
      });

      return {
        success: false,
        error: isRecoverable ? "Recoverable authentication failure" : "Non-recoverable authentication failure",
        details: status
          ? `Gateway returned HTTP ${status}: ${JSON.stringify(trace.responseBody || {})}`
          : trace.message,
        status,
        recoverable: isRecoverable
      };
    }
  }

  /**
   * Legacy standalone implementation retained for rollback trace comparison only.
   * M2 runtime authentication uses recoverAuthentication().
   */
  static async authenticateWithDuplicatedGatewayRequest() {
    const maxRetries = 3;
    const retryDelayMs = 1000;
    let attempts = 0;

    while (attempts < maxRetries) {
      attempts++;
      const startTime = Date.now();
      const requestId = uuidv4();

      try {
        Logger.info("M2AuthenticationManager", "Attempting Gateway authentication", {
          requestId,
          endpoint: config.gatewaySessionPath,
          attempt: attempts,
          clientId: maskValue(config.clientId)
        });

        const response = await axios.post(
          `${config.gatewayBaseUrl}${config.gatewaySessionPath}`,
          {
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            grantType: "client_credentials"
          },
          {
            headers: {
              "Content-Type": "application/json",
              "REQUEST-ID": requestId,
              "TIMESTAMP": new Date().toISOString()
            },
            timeout: 10000
          }
        );

        const duration = Date.now() - startTime;
        Logger.info("M2AuthenticationManager", "Gateway authentication successful", {
          requestId,
          endpoint: config.gatewaySessionPath,
          durationMs: duration,
          attempt: attempts
        });

        const data = response.data || {};
        if (!data.accessToken) {
          throw new Error("Invalid response format: missing accessToken");
        }

        return {
          success: true,
          accessToken: data.accessToken,
          expiresIn: data.expiresIn || 86400,
          issuedAt: Date.now()
        };

      } catch (err) {
        const duration = Date.now() - startTime;
        const isRecoverable = isRecoverableError(err);
        const status = err.response?.status;
        const statusText = err.response?.statusText;
        const errorMessage = err.message || "Unknown error";
        const failureReason = err.response?.data ? JSON.stringify(err.response.data) : errorMessage;

        Logger.error("M2AuthenticationManager", "Gateway authentication failed", {
          requestId,
          endpoint: config.gatewaySessionPath,
          durationMs: duration,
          attempt: attempts,
          status,
          statusText,
          recoverable: isRecoverable,
          error: errorMessage
        });

        if (!isRecoverable || attempts >= maxRetries) {
          return {
            success: false,
            error: isRecoverable ? "Max retries reached" : "Non-recoverable authentication failure",
            details: failureReason,
            status
          };
        }

        // Exponential backoff delay
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempts));
      }
    }
  }

  /**
   * Re-authenticates to retrieve a fresh token.
   * @returns {Promise<Object>} Structured authentication object
   */
  static async refreshAuthentication() {
    Logger.info("M2AuthenticationManager", "refreshAuthentication called.");
    return this.authenticate();
  }

  static getExpiresInSeconds(token) {
    try {
      const parts = String(token || "").split(".");
      if (parts.length < 2) return 0;
      const normalizedPayload = parts[1]
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
      const payload = JSON.parse(Buffer.from(normalizedPayload, "base64").toString("utf8"));
      const exp = Number(payload?.exp || 0);
      if (!Number.isFinite(exp) || exp <= 0) return 0;
      return Math.max(0, Math.floor(exp - Date.now() / 1000));
    } catch (_) {
      return 0;
    }
  }

  /**
   * Checks if the authentication object is structurally valid and non-expired.
   * @param {Object} authObj - Structured authentication object
   * @returns {boolean} Validity status
   */
  static validateAuthentication(authObj) {
    if (!authObj || authObj.success !== true || !authObj.accessToken) {
      return false;
    }
    return !this.isAuthenticationExpired(authObj);
  }

  /**
   * Checks if the token is within a 60-second safety expiry buffer.
   * @param {Object} authObj - Structured authentication object
   * @returns {boolean} True if expired or near expiry
   */
  static isAuthenticationExpired(authObj) {
    if (!authObj || !authObj.issuedAt || !authObj.expiresIn) {
      return true;
    }
    const safetyBufferMs = 60 * 1000;
    const expiryTimeMs = authObj.issuedAt + (authObj.expiresIn * 1000);
    return (Date.now() + safetyBufferMs) >= expiryTimeMs;
  }

  /**
   * Returns metadata regarding the validity and expiration status of the token.
   * @param {Object} authObj - Structured authentication object
   * @returns {Object} Metadata status
   */
  static getAuthenticationStatus(authObj) {
    const isExpired = this.isAuthenticationExpired(authObj);
    const isValid = this.validateAuthentication(authObj);
    const remainingTime = authObj && authObj.issuedAt && authObj.expiresIn
      ? Math.max(0, Math.floor((authObj.issuedAt + (authObj.expiresIn * 1000) - Date.now()) / 1000))
      : 0;

    return {
      valid: isValid,
      expired: isExpired,
      timeToExpirySeconds: remainingTime
    };
  }

  /**
   * Fetches a valid Gateway B2B token directly (stateless wrapper).
   * @returns {Promise<string|null>} Access token or null
   */
  static async getGatewayToken() {
    Logger.info("M2AuthenticationManager", "getGatewayToken wrapper triggered.");
    const result = await this.authenticate();
    return result.success ? result.accessToken : null;
  }

  /**
   * Dispatches an authorized HTTP request to the Gateway.
   * @param {Object} requestConfig - Axios configuration parameters.
   * @returns {Promise<Object>} Outbound request response
   */
  static async callGatewayApi(requestConfig) {
    Logger.info("M2AuthenticationManager", "callGatewayApi wrapper triggered.", {
      url: requestConfig?.url,
      method: requestConfig?.method
    });

    const send = async () => {
      const token = await this.getGatewayToken();
      if (!token) {
        throw new Error("Unable to obtain Gateway B2B authentication token");
      }

      return axios({
        ...requestConfig,
        headers: {
          ...requestConfig.headers,
          "Authorization": `Bearer ${token}`
        }
      });
    };

    try {
      return await send();
    } catch (error) {
      // A gateway token can expire while the server is idle.  Clear the
      // helper's in-memory token as well as the caller's cache, then retry
      // the same callback once with newly issued credentials.
      if (error?.response?.status !== 401 && error?.response?.status !== 403) {
        throw error;
      }

      Logger.warn("M2AuthenticationManager", "Gateway rejected callback credentials; refreshing once.", {
        url: requestConfig?.url,
        status: error.response.status
      });
      clearGatewayTokenCache();
      return send();
    }
  }
}

module.exports = M2AuthenticationManager;
