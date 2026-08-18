/**
 * Header: m3AuthController.js
 * Purpose: Controller for M3 Registration and Auth APIs.
 * Responsibility: Handle HTTP requests and map them to M3AuthService.
 */

const M3AuthService = require("../services/m3AuthService");
const M3TokenManager = require("../tokens/M3TokenManager");
const Logger = require("../logging/logger");

class M3AuthController {
  static async generateSession(req, res) {
    Logger.info("M3AuthController", "generateSession triggered");
    try {
      const token = await M3TokenManager.getGatewayToken();
      return res.status(200).json({ success: true, accessToken: token });
    } catch (err) {
      Logger.error("M3AuthController", "Error generating session", err);
      return res.status(500).json({ error: "Failed to generate session token", details: err.message });
    }
  }

  static async updateBridgeUrl(req, res) {
    Logger.info("M3AuthController", "updateBridgeUrl triggered");
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "Bridge 'url' is required in request body" });
    }
    
    try {
      const result = await M3AuthService.updateBridgeUrl(url);
      return res.status(result.status).json(result.data || { success: true });
    } catch (err) {
      return res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
    }
  }

  static async registerBridgeServices(req, res) {
    Logger.info("M3AuthController", "registerBridgeServices triggered");
    const { facilityId, facilityName, bridgeId, hipName, type, active } = req.body;
    
    if (!facilityId || !facilityName || !bridgeId || !hipName || !type || active === undefined) {
      return res.status(400).json({ error: "Missing required parameters for bridge service registration" });
    }

    try {
      const result = await M3AuthService.registerBridgeServices(facilityId, facilityName, bridgeId, hipName, type, active);
      return res.status(result.status).json(result.data || { success: true });
    } catch (err) {
      return res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
    }
  }

  static async findBridgeByServiceId(req, res) {
    Logger.info("M3AuthController", "findBridgeByServiceId triggered");
    const { serviceId } = req.params;
    
    try {
      const result = await M3AuthService.findBridgeByServiceId(serviceId);
      return res.status(result.status).json(result.data || {});
    } catch (err) {
      return res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
    }
  }

  static async findServicesByBridgeId(req, res) {
    Logger.info("M3AuthController", "findServicesByBridgeId triggered");
    try {
      const result = await M3AuthService.findServicesByBridgeId();
      return res.status(result.status).json(result.data || {});
    } catch (err) {
      return res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
    }
  }

  static async getCertificates(req, res) {
    Logger.info("M3AuthController", "getCertificates triggered");
    try {
      const result = await M3AuthService.getCertificates();
      return res.status(result.status).json(result.data || {});
    } catch (err) {
      return res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
    }
  }

  static async getOpenIdConfiguration(req, res) {
    Logger.info("M3AuthController", "getOpenIdConfiguration triggered");
    try {
      const result = await M3AuthService.getOpenIdConfiguration();
      return res.status(result.status).json(result.data || {});
    } catch (err) {
      return res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
    }
  }
}

module.exports = M3AuthController;
