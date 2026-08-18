const fs = require("fs");
const path = require("path");
const Logger = require("../logging/logger");

const storePath = path.join(__dirname, "consents.json");

class M3ConsentStore {
  constructor() {
    this.consents = [];
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(storePath)) {
        const data = fs.readFileSync(storePath, "utf-8");
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          this.consents = parsed;
          this.transactions = {};
        } else {
          this.consents = parsed.consents || [];
          this.transactions = parsed.transactions || {};
        }
      }
    } catch (err) {
      Logger.error("M3ConsentStore", "Failed to load consents", { error: err.message });
      this.consents = [];
      this.transactions = {};
    }
  }

  save() {
    try {
      fs.writeFileSync(storePath, JSON.stringify({
        consents: this.consents,
        transactions: this.transactions || {}
      }, null, 2), "utf-8");
    } catch (err) {
      Logger.error("M3ConsentStore", "Failed to save consents", { error: err.message });
    }
  }

  addConsentRequest(consent) {
    // consent: { requestId, status, patientId, purpose, hiTypes, dateFrom, dateTo, dateEraseAt, timestamp, consentId, error }
    this.consents.push({
      ...consent,
      timestamp: new Date().toISOString()
    });
    this.save();
  }

  addTransaction(transactionId, data) {
    if (!this.transactions) this.transactions = {};
    this.transactions[transactionId] = data;
    this.save();
  }

  getTransaction(transactionId) {
    return this.transactions ? this.transactions[transactionId] : null;
  }

  updateConsentByRequestId(requestId, updates) {
    const consent = this.consents.find(c => c.requestId === requestId);
    if (consent) {
      Object.assign(consent, updates);
      this.save();
      return consent;
    }
    return null;
  }

  updateConsentByConsentRequestId(consentRequestId, updates) {
    const consent = this.consents.find(c => c.consentRequestId === consentRequestId);
    if (consent) {
      Object.assign(consent, updates);
      this.save();
      return consent;
    }
    return null;
  }

  updateConsentByConsentId(consentId, updates) {
    const consent = this.consents.find(c => c.consentId === consentId);
    if (consent) {
      Object.assign(consent, updates);
      this.save();
      return consent;
    }
    return null;
  }

  getConsentByRequestId(requestId) {
    return this.consents.find(c => c.requestId === requestId);
  }

  getAllConsents() {
    // Return sorted by newest first
    return [...this.consents].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }
}

module.exports = new M3ConsentStore();
