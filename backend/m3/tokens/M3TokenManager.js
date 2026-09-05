/**
 * Header: M3TokenManager.js
 * Purpose: Manages Gateway session tokens for M3.
 * Responsibility: Fetch and cache session tokens for M3 endpoints.
 */

const axios = require("axios");
const https = require("https");
const { v4: uuidv4 } = require("uuid");
const config = require("../helpers/config");
const Logger = require("../logging/logger");

const gatewayHttpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 16,
});

class M3TokenManager {
  constructor() {
    if (M3TokenManager.instance) {
      return M3TokenManager.instance;
    }
    
    this.sessionToken = null;
    this.tokenExpiry = null;
    this.initPromise = null;
    M3TokenManager.instance = this;
  }

  static getInstance() {
    if (!M3TokenManager.instance) {
      M3TokenManager.instance = new M3TokenManager();
    }
    return M3TokenManager.instance;
  }

  async initialize() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        if (this.isValid()) {
          return this.sessionToken;
        }
        await this.fetchToken();
        return this.sessionToken;
      } catch (err) {
        Logger.error("M3TokenManager", "Failed to initialize M3 Token Manager", err);
        throw err;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  isValid() {
    if (!this.sessionToken || !this.tokenExpiry) return false;
    // Buffer of 60 seconds
    return Date.now() < (this.tokenExpiry - 60000);
  }

  async getGatewayToken() {
    if (!this.isValid()) {
      await this.initialize();
    }
    return this.sessionToken;
  }

  async fetchToken() {
    const endpoint = `${config.gatewayBaseUrl}/api/hiecm/gateway/v3/sessions`;
    const requestId = uuidv4();
    const headers = {
      "Content-Type": "application/json",
      "REQUEST-ID": requestId,
      "TIMESTAMP": new Date().toISOString(),
      "X-CM-ID": config.cmId || "sbx"
    };

    const payload = {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      grantType: "client_credentials"
    };

    Logger.info("M3TokenManager", "Fetching new gateway session token for M3", { endpoint, requestId });

    try {
      const response = await axios.post(endpoint, payload, {
        headers,
        httpsAgent: gatewayHttpsAgent,
        timeout: Number(process.env.M3_GATEWAY_TOKEN_TIMEOUT_MS || 8000),
      });
      const data = response.data;
      
      this.sessionToken = data.accessToken;
      this.tokenExpiry = Date.now() + (data.expiresIn * 1000);
      
      Logger.info("M3TokenManager", "Successfully fetched M3 gateway session token");
      return this.sessionToken;
    } catch (e) {
      Logger.error("M3TokenManager", "Token fetch failed", e);
      throw e;
    }
  }
}

module.exports = M3TokenManager.getInstance();
