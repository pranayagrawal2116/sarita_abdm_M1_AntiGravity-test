const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const config = require("../helpers/config");
const Logger = require("../logging/logger");
const M3TokenManager = require("../tokens/M3TokenManager");

class M3SubscriptionService {
  static getHeaders(token, reqId, ts, authTokenM3) {
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "REQUEST-ID": reqId,
      "TIMESTAMP": ts,
      "X-CM-ID": config.cmId || "sbx",
    };
    if (authTokenM3) {
      headers["X-AUTHTOKEN"] = authTokenM3;
    }
    return headers;
  }

  // 6.3.1 GET /api/hiecm/subscription-requests/v3/requests
  static async getSubscriptionRequests(authTokenM3, limit = 10, offset = 0, filters = "GRANTED") {
    try {
      const token = await M3TokenManager.getGatewayToken();
      const requestId = uuidv4();
      const timestamp = new Date().toISOString();
      const headers = this.getHeaders(token, requestId, timestamp, typeof authTokenM3 !== "undefined" ? authTokenM3 : undefined);

      const url = `${config.gatewayBaseUrl}/api/hiecm/subscription-requests/v3/requests?limit=${limit}&offset=${offset}&status=${filters}`;
      Logger.info("M3SubscriptionService", "Getting subscription requests", { url });

      const response = await axios.get(url, { headers });
      return response.data;
    } catch (error) {
      Logger.error("M3SubscriptionService", "Failed to get subscription requests", { error: error.message });
      throw error;
    }
  }

  // 6.3.2 POST /api/hiecm/subscription-requests/v3/init
  static async initSubscription(payload) {
    try {
      const token = await M3TokenManager.getGatewayToken();
      const requestId = uuidv4();
      const timestamp = new Date().toISOString();
      const headers = this.getHeaders(token, requestId, timestamp, typeof authTokenM3 !== "undefined" ? authTokenM3 : undefined);

      const abdmPayload = {
        subscription: {
          purpose: {
            text: payload.purposeText,
            code: payload.purposeCode,
            refUri: payload.purposeRefUri || "www.example.com"
          },
          patient: {
            id: payload.patientId
          },
          hiu: {
            id: config.hiuId || "HIU_ID"
          },
          hips: payload.hips || [],
          categories: payload.categories || ["LINK", "DATA"],
          period: payload.period || {
            from: new Date().toISOString(),
            to: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          }
        }
      };

      Logger.info("M3SubscriptionService", "Initiating subscription", { abdmPayload });

      await axios.post(
        `${config.gatewayBaseUrl}/api/hiecm/subscription-requests/v3/init`,
        abdmPayload,
        { headers }
      );

    } catch (error) {
      Logger.error("M3SubscriptionService", "Failed to initiate subscription", { error: error.message });
      throw error;
    }
  }

  // 6.3.4 POST /api/hiecm/subscription-requests/v3/{id}/approve
  static async approveSubscription(subscriptionRequestId, payload, authTokenM3) {
    try {
      const token = await M3TokenManager.getGatewayToken();
      const requestId = uuidv4();
      const timestamp = new Date().toISOString();
      const headers = this.getHeaders(token, requestId, timestamp, typeof authTokenM3 !== "undefined" ? authTokenM3 : undefined);

      const abdmPayload = {
        subscriptionEditAndApprovalRequest: {
          isApplicableForAllHIPs: payload.isApplicableForAllHIPs || false,
          includedSources: payload.includedSources || [],
          purpose: payload.purpose,
          hiu: {
             id: config.hiuId || "HIU_ID"
          },
          patient: {
             id: payload.patientId
          },
          categories: payload.categories || ["LINK", "DATA"],
          period: payload.period || {
            from: new Date().toISOString(),
            to: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          },
          excludedSources: payload.excludedSources || []
        }
      };

      Logger.info("M3SubscriptionService", "Approving subscription", { subscriptionRequestId });

      const response = await axios.post(
        `${config.gatewayBaseUrl}/api/hiecm/subscription-requests/v3/${subscriptionRequestId}/approve`,
        abdmPayload,
        { headers }
      );

      return response.data;
    } catch (error) {
      Logger.error("M3SubscriptionService", "Failed to approve subscription", { error: error.message });
      throw error;
    }
  }

  // 6.3.7 POST /api/hiecm/subscriptionrequests/v3/{id}/deny
  static async denySubscription(subscriptionRequestId, reason, authTokenM3) {
    try {
      const token = await M3TokenManager.getGatewayToken();
      const requestId = uuidv4();
      const timestamp = new Date().toISOString();
      const headers = this.getHeaders(token, requestId, timestamp, typeof authTokenM3 !== "undefined" ? authTokenM3 : undefined);

      const abdmPayload = {
        reason: reason || "Not authorized"
      };

      Logger.info("M3SubscriptionService", "Denying subscription", { subscriptionRequestId });

      const response = await axios.post(
        `${config.gatewayBaseUrl}/api/hiecm/subscriptionrequests/v3/${subscriptionRequestId}/deny`,
        abdmPayload,
        { headers }
      );

      return response.data;
    } catch (error) {
      Logger.error("M3SubscriptionService", "Failed to deny subscription", { error: error.message });
      throw error;
    }
  }

  // 6.3.9 PUT /api/hiecm/subscription-requests/v3/patients/{id}
  static async editSubscription(approvedSubscriptionId, payload, authTokenM3) {
    try {
      const token = await M3TokenManager.getGatewayToken();
      const requestId = uuidv4();
      const timestamp = new Date().toISOString();
      const headers = this.getHeaders(token, requestId, timestamp, typeof authTokenM3 !== "undefined" ? authTokenM3 : undefined);

      const abdmPayload = {
        hiuId: config.hiuId || "HIU_ID",
        subscriptionEditAndApprovalRequest: payload.subscriptionEditAndApprovalRequest
      };

      Logger.info("M3SubscriptionService", "Editing subscription", { approvedSubscriptionId });

      const response = await axios.put(
        `${config.gatewayBaseUrl}/api/hiecm/subscription-requests/v3/patients/${approvedSubscriptionId}`,
        abdmPayload,
        { headers }
      );

      return response.data;
    } catch (error) {
      Logger.error("M3SubscriptionService", "Failed to edit subscription", { error: error.message });
      throw error;
    }
  }

  // 6.3.6 POST /api/hiecm/subscription-requests/v3/hiu/on-notify
  static async hiuOnNotify(payload) {
    try {
      const token = await M3TokenManager.getGatewayToken();
      const requestId = uuidv4();
      const timestamp = new Date().toISOString();
      const headers = this.getHeaders(token, requestId, timestamp, typeof authTokenM3 !== "undefined" ? authTokenM3 : undefined);

      const abdmPayload = {
        acknowledgement: payload.acknowledgement,
        response: payload.response
      };

      Logger.info("M3SubscriptionService", "Sending hiu on-notify ACK", { abdmPayload });

      const response = await axios.post(
        `${config.gatewayBaseUrl}/api/hiecm/subscription-requests/v3/hiu/on-notify`,
        abdmPayload,
        { headers }
      );

      return response.data;
    } catch (error) {
      Logger.error("M3SubscriptionService", "Failed to send hiu on-notify", { error: error.message });
      throw error;
    }
  }

  // 6.3.12 POST /api/hiecm/subscription-requests/v3/hiu/care-context/on-notify
  static async careContextOnNotify(payload) {
    try {
      const token = await M3TokenManager.getGatewayToken();
      const requestId = uuidv4();
      const timestamp = new Date().toISOString();
      const headers = this.getHeaders(token, requestId, timestamp, typeof authTokenM3 !== "undefined" ? authTokenM3 : undefined);

      const abdmPayload = {
        acknowledgement: payload.acknowledgement,
        response: payload.response
      };

      Logger.info("M3SubscriptionService", "Sending care-context on-notify ACK", { abdmPayload });

      const response = await axios.post(
        `${config.gatewayBaseUrl}/api/hiecm/subscription-requests/v3/hiu/care-context/on-notify`,
        abdmPayload,
        { headers }
      );

      return response.data;
    } catch (error) {
      Logger.error("M3SubscriptionService", "Failed to send care-context on-notify", { error: error.message });
      throw error;
    }
  }
}

module.exports = M3SubscriptionService;
