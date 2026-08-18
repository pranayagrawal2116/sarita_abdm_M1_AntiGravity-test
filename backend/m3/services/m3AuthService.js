/**
 * Header: m3AuthService.js
 * Purpose: Service for M3 Registration and Auth APIs.
 * Responsibility: Communicate with ABDM gateway for bridge URL, services, and certs.
 */

const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const config = require("../helpers/config");
const Logger = require("../logging/logger");
const M3TokenManager = require("../tokens/M3TokenManager");

class M3AuthService {
  async getHeaders() {
    const token = await M3TokenManager.getGatewayToken();
    return {
      "Authorization": `Bearer ${token}`,
      "X-CM-ID": config.gatewayCmId || "sbx",
      "REQUEST-ID": uuidv4(),
      "TIMESTAMP": new Date().toISOString(),
      "Content-Type": "application/json"
    };
  }

  async updateBridgeUrl(url) {
    const endpoint = `${config.gatewayBaseUrl}/api/hiecm/gateway/v3/bridge/url`;
    const headers = await this.getHeaders();
    const payload = { url };

    Logger.info("M3AuthService", "Updating bridge URL", { url });

    try {
      const response = await axios.patch(endpoint, payload, { headers });
      return { status: response.status, data: response.data };
    } catch (err) {
      Logger.error("M3AuthService", "Failed to update bridge URL", err.response?.data || err.message);
      throw err;
    }
  }

  async registerBridgeServices(facilityId, facilityName, bridgeId, hipName, type, active) {
    // The M3 doc specifies: https://facilitysbx.abdm.gov.in/v1/bridges/MutipleHRPAddUpdateServices
    const baseUrl = process.env.NODE_ENV === "production" 
      ? "https://nhpr.abdm.gov.in" 
      : "https://apihspsbx.abdm.gov.in";
    const endpoint = `${baseUrl}/v4/int/v1/bridges/MutipleHRPAddUpdateServices`;
    
    // Note: This API might require a different token or no token depending on ABDM specs.
    // The doc doesn't specify headers for this specific API, but usually they require Gateway Session Token.
    const headers = await this.getHeaders();
    
    const payload = {
      facilityId,
      facilityName,
      bridgeId,
      hipName,
      type,
      active
    };

    Logger.info("M3AuthService", "Registering bridge services", { facilityId });

    try {
      // Sometimes these APIs are POST, let's assume POST based on standard conventions
      const response = await axios.post(endpoint, [payload], { headers });
      return { status: response.status, data: response.data };
    } catch (err) {
      Logger.error("M3AuthService", "Failed to register bridge services", err.response?.data || err.message);
      throw err;
    }
  }

  async findBridgeByServiceId(serviceId) {
    const endpoint = `${config.gatewayBaseUrl}/api/hiecm/gateway/v3/bridge-service/serviceId/${serviceId}`;
    const headers = await this.getHeaders();

    Logger.info("M3AuthService", "Finding bridge by service ID", { serviceId });

    try {
      const response = await axios.get(endpoint, { headers });
      return { status: response.status, data: response.data };
    } catch (err) {
      Logger.error("M3AuthService", "Failed to find bridge by service ID", err.response?.data || err.message);
      throw err;
    }
  }

  async findServicesByBridgeId() {
    const endpoint = `${config.gatewayBaseUrl}/api/hiecm/gateway/v3/bridge-services`;
    const headers = await this.getHeaders();

    Logger.info("M3AuthService", "Finding services by bridge ID");

    try {
      const response = await axios.get(endpoint, { headers });
      return { status: response.status, data: response.data };
    } catch (err) {
      Logger.error("M3AuthService", "Failed to find services by bridge ID", err.response?.data || err.message);
      throw err;
    }
  }

  async getCertificates() {
    const endpoint = `${config.gatewayBaseUrl}/api/hiecm/gateway/v3/certs`;
    const headers = {
      "X-CM-ID": config.gatewayCmId || "sbx",
      "REQUEST-ID": uuidv4(),
      "TIMESTAMP": new Date().toISOString()
    };

    Logger.info("M3AuthService", "Fetching OAuth certificates");

    try {
      const response = await axios.get(endpoint, { headers });
      return { status: response.status, data: response.data };
    } catch (err) {
      Logger.error("M3AuthService", "Failed to fetch OAuth certificates", err.response?.data || err.message);
      throw err;
    }
  }

  async getOpenIdConfiguration() {
    const endpoint = `${config.gatewayBaseUrl}/api/hiecm/gateway/v3/.well-known/openid-configuration`;
    const headers = {
      "X-CM-ID": config.gatewayCmId || "sbx",
      "REQUEST-ID": uuidv4(),
      "TIMESTAMP": new Date().toISOString()
    };

    Logger.info("M3AuthService", "Fetching OpenID configuration");

    try {
      const response = await axios.get(endpoint, { headers });
      return { status: response.status, data: response.data };
    } catch (err) {
      Logger.error("M3AuthService", "Failed to fetch OpenID configuration", err.response?.data || err.message);
      throw err;
    }
  }
}

module.exports = new M3AuthService();
