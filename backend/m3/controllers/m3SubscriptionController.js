const M3SubscriptionService = require("../services/m3SubscriptionService");
const Logger = require("../logging/logger");

class M3SubscriptionController {
  static async getSubscriptionRequests(req, res) {
    try {
      const { limit, offset, filters } = req.query;
      const authTokenM3 = req.headers["x-authtoken"];
      const data = await M3SubscriptionService.getSubscriptionRequests(authTokenM3, limit, offset, filters);
      res.status(200).json({ success: true, data });
    } catch (error) {
      Logger.error("M3SubscriptionController", "getSubscriptionRequests failed", { error: error.message });
      res.status(500).json({ success: false, error: "Failed to get subscription requests" });
    }
  }

  static async initSubscription(req, res) {
    try {
      const payload = req.body;
      const result = await M3SubscriptionService.initSubscription(payload);
      res.status(202).json({ success: true, ...result });
    } catch (error) {
      Logger.error("M3SubscriptionController", "initSubscription failed", { error: error.message });
      res.status(500).json({ success: false, error: "Failed to init subscription" });
    }
  }

  static async approveSubscription(req, res) {
    try {
      const { id } = req.params;
      const payload = req.body;
      const authTokenM3 = req.headers["x-authtoken"];
      const data = await M3SubscriptionService.approveSubscription(id, payload, authTokenM3);
      res.status(202).json({ success: true, data });
    } catch (error) {
      Logger.error("M3SubscriptionController", "approveSubscription failed", { error: error.message });
      res.status(500).json({ success: false, error: "Failed to approve subscription" });
    }
  }

  static async denySubscription(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const authTokenM3 = req.headers["x-authtoken"];
      const data = await M3SubscriptionService.denySubscription(id, reason, authTokenM3);
      res.status(202).json({ success: true, data });
    } catch (error) {
      Logger.error("M3SubscriptionController", "denySubscription failed", { error: error.message });
      res.status(500).json({ success: false, error: "Failed to deny subscription" });
    }
  }

  static async editSubscription(req, res) {
    try {
      const { id } = req.params;
      const payload = req.body;
      const authTokenM3 = req.headers["x-authtoken"];
      const data = await M3SubscriptionService.editSubscription(id, payload, authTokenM3);
      res.status(200).json({ success: true, data });
    } catch (error) {
      Logger.error("M3SubscriptionController", "editSubscription failed", { error: error.message });
      res.status(500).json({ success: false, error: "Failed to edit subscription" });
    }
  }
}

module.exports = M3SubscriptionController;
