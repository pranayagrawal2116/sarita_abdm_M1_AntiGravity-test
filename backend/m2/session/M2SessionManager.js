/**
 * Header: M2SessionManager.js
 * Purpose: Manages Keycloak and Gateway session lifecycles.
 * Responsibility: Gateway `/v3/sessions` creation, renewal, and recovery.
 * Public Methods:
 *   - createSession(authObj)
 *   - validateSession(sessionObj)
 *   - refreshSession(authObj)
 *   - isSessionExpired(sessionObj)
 *   - getSessionStatus(sessionObj)
 */

const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const Logger = require("../logging/logger");
const config = require("../helpers/config");
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

class M2SessionManager {
  /**
   * Performs client credentials auth and returns a new session object.
   * Stateless, does not write or persist anything to disk.
   * @param {Object} authObj - Object containing credentials (clientId, clientSecret)
   * @returns {Promise<Object>} Structured session object
   */
  static async createSession(authObj) {
    Logger.info("M2SessionManager", "Method entered: createSession()", {
      configuration: configurationSnapshot(config),
      authObject: maskStructured({
        success: authObj?.success,
        accessToken: authObj?.accessToken,
        expiresIn: authObj?.expiresIn,
        issuedAt: authObj?.issuedAt,
        source: authObj?.source
      })
    });

    if (authObj?.success && authObj?.accessToken) {
      Logger.info("M2SessionManager", "Session creation reused recovered gateway authentication token.", {
        endpoint: `${config.gatewayBaseUrl}${config.gatewaySessionPath}`,
        authenticationEndpointBeingCalled: "none",
        requestHeaders: {},
        httpStatus: "not-called",
        responseBody: maskStructured({ accessToken: authObj.accessToken }),
        exactReasonForFailure: null,
        reason: "M2AuthenticationManager already recovered the gateway session token through the proven gatewayService implementation."
      });

      return {
        success: true,
        accessToken: authObj.accessToken,
        expiresIn: authObj.expiresIn || 86400,
        createdAt: Date.now(),
        source: "M2AuthenticationManager.recoverAuthentication"
      };
    }

    const maxRetries = 3;
    const retryDelayMs = 1000;
    let attempts = 0;

    const clientId = authObj?.clientId || config.clientId;
    const clientSecret = authObj?.clientSecret || config.clientSecret;

    if (!clientId || !clientSecret) {
      Logger.error("M2SessionManager", "Session creation failed: missing credentials.", {
        configuration: configurationSnapshot(config),
        exactReasonForFailure: "Missing clientId or clientSecret."
      });
      return {
        success: false,
        error: "Non-recoverable authentication failure",
        details: "Missing clientId or clientSecret."
      };
    }

    while (attempts < maxRetries) {
      attempts++;
      const startTime = Date.now();
      const requestId = uuidv4();

      try {
        const endpoint = `${config.gatewayBaseUrl}${config.gatewaySessionPath}`;
        const headers = {
          "Content-Type": "application/json",
          "REQUEST-ID": requestId,
          "TIMESTAMP": new Date().toISOString()
        };
        Logger.info("M2SessionManager", "Attempting Gateway session creation", {
          requestId,
          endpoint,
          attempt: attempts,
          clientId: maskValue(clientId),
          requestHeaders: maskStructured(headers),
          requestBody: maskStructured({
            clientId,
            clientSecret,
            grantType: "client_credentials"
          })
        });

        const response = await axios.post(
          endpoint,
          {
            clientId,
            clientSecret,
            grantType: "client_credentials"
          },
          {
            headers,
            timeout: 10000
          }
        );

        const duration = Date.now() - startTime;
        Logger.info("M2SessionManager", "Gateway session creation successful", {
          requestId,
          endpoint,
          durationMs: duration,
          attempt: attempts,
          httpStatus: response.status,
          responseBody: maskStructured(response.data || {})
        });

        const data = response.data || {};
        if (!data.accessToken) {
          throw new Error("Invalid response format: missing accessToken");
        }

        return {
          success: true,
          accessToken: data.accessToken,
          expiresIn: data.expiresIn || 86400,
          createdAt: Date.now()
        };

      } catch (err) {
        const duration = Date.now() - startTime;
        const isRecoverable = isRecoverableError(err);
        const status = err.response?.status;
        const statusText = err.response?.statusText;
        const errorMessage = err.message || "Unknown error";
        const failureReason = err.response?.data ? JSON.stringify(err.response.data) : errorMessage;

        Logger.error("M2SessionManager", "Gateway session creation failed", {
          requestId,
          endpoint: `${config.gatewayBaseUrl}${config.gatewaySessionPath}`,
          durationMs: duration,
          attempt: attempts,
          status,
          statusText,
          httpStatus: status,
          responseBody: maskStructured(err.response?.data),
          exception: errorTrace(err),
          recoverable: isRecoverable,
          error: errorMessage,
          exactReasonForFailure: status
            ? `Gateway returned HTTP ${status}: ${JSON.stringify(maskStructured(err.response?.data) || {})}`
            : errorMessage
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
   * Validates if a session object is active, structurally valid, and not expired.
   * @param {Object} sessionObj - Session object to validate
   * @returns {boolean} Validity status
   */
  static validateSession(sessionObj) {
    if (!sessionObj || sessionObj.success !== true || !sessionObj.accessToken) {
      return false;
    }
    return !this.isSessionExpired(sessionObj);
  }

  /**
   * Force refreshes the session by requesting a new session.
   * @param {Object} authObj - Object containing credentials
   * @returns {Promise<Object>} Session object
   */
  static async refreshSession(authObj) {
    Logger.info("M2SessionManager", "refreshSession called.");
    return this.createSession(authObj);
  }

  /**
   * Evaluates if the session has expired or is within a 60-second safety buffer of expiry.
   * @param {Object} sessionObj - Session object to evaluate
   * @returns {boolean} True if expired or near expiry
   */
  static isSessionExpired(sessionObj) {
    if (!sessionObj || !sessionObj.createdAt || !sessionObj.expiresIn) {
      return true;
    }
    const safetyBufferMs = 60 * 1000;
    const expiryTimeMs = sessionObj.createdAt + (sessionObj.expiresIn * 1000);
    return (Date.now() + safetyBufferMs) >= expiryTimeMs;
  }

  /**
   * Returns metadata regarding the validity, expiry, and remaining seconds of the session.
   * @param {Object} sessionObj - Session object
   * @returns {Object} Status metadata
   */
  static getSessionStatus(sessionObj) {
    const isExpired = this.isSessionExpired(sessionObj);
    const isValid = this.validateSession(sessionObj);
    const remainingTime = sessionObj && sessionObj.createdAt && sessionObj.expiresIn
      ? Math.max(0, Math.floor((sessionObj.createdAt + (sessionObj.expiresIn * 1000) - Date.now()) / 1000))
      : 0;

    return {
      valid: isValid,
      expired: isExpired,
      timeToExpirySeconds: remainingTime
    };
  }
}

module.exports = M2SessionManager;
