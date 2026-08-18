const M3ConsentService = require("../services/m3ConsentService");
const M3ConsentStore = require("../store/M3ConsentStore");
const Logger = require("../logging/logger");
const fs = require('fs');
const path = require('path');

class M3ConsentController {
  static async initConsentRequest(req, res) {
    try {
      const payload = req.body;
      const result = await M3ConsentService.initConsentRequest(payload);
      res.status(202).json({
        success: true,
        message: "Consent request initiated successfully",
        requestId: result.requestId
      });
    } catch (error) {
      Logger.error("M3ConsentController", "initConsentRequest failed", { error: error.message });
      res.status(500).json({ success: false, error: "Failed to initiate consent request", details: error.message });
    }
  }

  static async getConsentRequests(req, res) {
    try {
      const requests = M3ConsentStore.getAllConsents();
      res.status(200).json({
        success: true,
        data: requests
      });
    } catch (error) {
      Logger.error("M3ConsentController", "getConsentRequests failed", { error: error.message });
      res.status(500).json({ success: false, error: "Failed to fetch consent requests" });
    }
  }

  static async fetchConsentArtefact(req, res) {
    try {
      const { consentId } = req.body;
      if (!consentId) return res.status(400).json({ error: "consentId is required" });
      const result = await M3ConsentService.fetchConsentArtefact(consentId);
      res.status(202).json({
        success: true,
        message: "Fetch request initiated"
      });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch consent artefact" });
    }
  }

  static async requestHealthData(req, res) {
    try {
      const { consentId, patientId, dateFrom, dateTo } = req.body;
      const result = await M3ConsentService.requestHealthInformation(consentId, patientId, dateFrom, dateTo);
      res.status(202).json({
        success: true,
        transactionId: result.transactionId
      });
    } catch (error) {
      Logger.error("M3ConsentController", "requestHealthData failed", { error: error.message });
      let details = error.message;
      if (error.response && error.response.data) {
        details = JSON.stringify(error.response.data);
      }
      res.status(500).json({ success: false, error: "Failed to request health data", details: details });
    }
  }

  static async checkConsentStatus(req, res) {
    try {
      const { consentRequestId } = req.body;
      if (!consentRequestId) return res.status(400).json({ error: "consentRequestId is required" });
      const result = await M3ConsentService.checkConsentStatus(consentRequestId);
      res.status(202).json({
        success: true,
        message: "Status request initiated"
      });
    } catch (error) {
      Logger.error("M3ConsentController", "checkConsentStatus failed", { error: error.message });
      res.status(500).json({ success: false, error: "Failed to check consent status" });
    }
  }

  static async dataFlowNotify(req, res) {
    try {
      // Expects payload: { consentId, transactionId, sessionStatus, hipId, statusResponses }
      const payload = req.body;
      const result = await M3ConsentService.notifyHealthInformationStatus(payload);
      res.status(200).json({
        success: true,
        message: "Data flow notify submitted"
      });
    } catch (error) {
      Logger.error("M3ConsentController", "dataFlowNotify failed", { error: error.message });
      res.status(500).json({ success: false, error: "Failed to submit data flow notify" });
    }
  }
  static async getHealthDocuments(req, res) {
    try {
      const { hipId } = req.query;
      const rootDir = path.resolve(__dirname, "../../../");
      if (!fs.existsSync(rootDir)) return res.json({ success: true, data: [] });
      
      const dirs = fs.readdirSync(rootDir);
      let targetUserDir = dirs.find(d => d.includes("@sbx"));
      const docIdVar = typeof docId !== 'undefined' ? docId : null;
      const consentReq = typeof hipId !== 'undefined' ? M3ConsentStore.consents.find(c => c.artefactDetails && c.artefactDetails[hipId]) : null;
      if (consentReq && consentReq.patientId) {
        const found = dirs.find(d => d.startsWith(consentReq.patientId));
        if (found) targetUserDir = found;
      }
      if (!targetUserDir) return res.json({ success: true, data: [] });
      
      const hospitalDir = path.join(rootDir, targetUserDir, "Other_hospital_data", "HIP_Data");
      let files = fs.existsSync(hospitalDir) 
          ? fs.readdirSync(hospitalDir).filter(f => f.startsWith("HealthData_") && f.endsWith(".json")).map(f => path.join(hospitalDir, f))
          : [];
      
      if (files.length === 0) {
          const userFiles = fs.readdirSync(path.join(rootDir, targetUserDir))
            .filter(f => f.endsWith("_bundle.json"))
            .map(f => path.join(rootDir, targetUserDir, f));
          files = userFiles;
      }
      
      let documents = [];

      for (const filePath of files) {
        const file = path.basename(filePath);
        const parts = file.split('_');
        let transactionId = parts.length >= 2 ? parts[1] : "fallback";
        
        if (file.startsWith("HealthData_") && parts.length >= 2) {
          const transaction = M3ConsentStore.getTransaction(transactionId);
          if (hipId && transaction && transaction.hipId !== hipId && transaction.consentId !== hipId) continue;
        }

        try {
          const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
          let bundlesToProcess = [];
          
          if (data.entries && Array.isArray(data.entries)) {
            data.entries.forEach(entry => {
              if (entry.content) {
                 let contentStr = entry.content;
                 if (typeof contentStr === 'string' && !contentStr.trim().startsWith('{')) {
                   const tId = file.split('_')[1];
                   const transaction = M3ConsentStore.getTransaction(tId);
                   if (transaction && transaction.privateKeyBase64) {
                     try {
                       const fhirEncryptionService = require('../../../services/fhirEncryptionService');
                       contentStr = fhirEncryptionService.decrypt(
                         contentStr,
                         transaction.privateKeyBase64,
                         data.keyMaterial.dhPublicKey.keyValue,
                         data.keyMaterial.nonce,
                         transaction.nonceBase64
                       );
                     } catch (err) {
                       Logger.warn("M3ConsentController", "Failed to decrypt entry", { error: err.message });
                     }
                   }
                 }
                 let bundle = typeof contentStr === 'string' ? JSON.parse(contentStr) : contentStr;
                 bundlesToProcess.push(bundle);
              }
            });
          } else if (data.resourceType === "Bundle") {
            bundlesToProcess.push(data);
          }
          bundlesToProcess.forEach((bundle, bIdx) => {
            if (bundle.entry && Array.isArray(bundle.entry)) {
              bundle.entry.forEach((bEntry, index) => {
                const resource = bEntry.resource;
                if (resource && (resource.resourceType === 'DocumentReference' || resource.resourceType === 'DiagnosticReport')) {
                  let title = resource.resourceType;
                  let docType = resource.resourceType;
                  let dateStr = new Date().toISOString();
                  let doctor = "Unknown";
                  let hasPdf = false;

                  if (resource.resourceType === 'DocumentReference') {
                    if (resource.type && resource.type.text) title = resource.type.text;
                    if (resource.date) dateStr = resource.date;
                    if (resource.author && resource.author[0] && resource.author[0].display) doctor = resource.author[0].display;
                    
                    const attachment = resource.content && resource.content[0] && resource.content[0].attachment;
                    if (attachment && attachment.data) hasPdf = true;
                  } else if (resource.resourceType === 'DiagnosticReport') {
                    if (resource.code && resource.code.text) title = resource.code.text;
                    if (resource.effectiveDateTime) dateStr = resource.effectiveDateTime;
                    if (resource.performer && resource.performer[0] && resource.performer[0].display) doctor = resource.performer[0].display;
                    if (resource.presentedForm && resource.presentedForm[0] && resource.presentedForm[0].data) hasPdf = true;
                  }

                  documents.push({
                    id: `${transactionId}_${file}_${index}`,
                    type: docType.toUpperCase(),
                    title: title,
                    date: new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
                    doctor: doctor,
                    hasPdf: hasPdf
                  });
                }
              });
            }
          });
        } catch(e) {
          Logger.warn("M3ConsentController", "Failed to parse " + file, { error: e.message });
        }
      }
      res.status(200).json({ success: true, data: documents });
    } catch (error) {
      Logger.error("M3ConsentController", "getHealthDocuments failed", { error: error.message });
      res.status(500).json({ success: false, error: "Failed to fetch health documents" });
    }
  }

  static async getHealthDocumentPdf(req, res) {
    try {
      const { docId } = req.params;
      const lastUnderscore = docId.lastIndexOf('_');
      const indexStr = docId.substring(lastUnderscore + 1);
      const index = parseInt(indexStr, 10);
      
      const firstUnderscore = docId.indexOf('_');
      const transactionId = docId.substring(0, firstUnderscore);
      const file = docId.substring(firstUnderscore + 1, lastUnderscore);

      const fs = require('fs');
      const path = require('path');
      const rootDir = path.resolve(__dirname, "../../../");
      const dirs = fs.readdirSync(rootDir);
      let targetUserDir = dirs.find(d => d.includes("@sbx"));
      const docIdVar = typeof docId !== 'undefined' ? docId : null;
      const consentReq = typeof hipId !== 'undefined' ? M3ConsentStore.consents.find(c => c.artefactDetails && c.artefactDetails[hipId]) : null;
      if (consentReq && consentReq.patientId) {
        const found = dirs.find(d => d.startsWith(consentReq.patientId));
        if (found) targetUserDir = found;
      }
      if (!targetUserDir) return res.status(404).send("Not found");
      
      const hospitalDir = path.join(rootDir, targetUserDir, "Other_hospital_data", "HIP_Data");
      let filePath = path.join(hospitalDir, file);
      
      // Fallback for M1/M2 bundles
      if (!fs.existsSync(filePath)) {
         filePath = path.join(rootDir, targetUserDir, file);
      }
      
      if (!fs.existsSync(filePath)) return res.status(404).send("File not found");

      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      let base64Pdf = null;
      let globalIndex = 0;
      
      const transaction = M3ConsentStore.getTransaction(transactionId);
      
      let bundlesToProcess = [];
      if (data.entries && Array.isArray(data.entries)) {
        for (const entry of data.entries) {
          if (entry.content) {
            let contentStr = entry.content;
            if (typeof contentStr === 'string' && !contentStr.trim().startsWith('{')) {
              // It is encrypted
              if (transaction && transaction.privateKeyBase64) {
                try {
                  const fhirEncryptionService = require('../../../services/fhirEncryptionService');
                  contentStr = fhirEncryptionService.decrypt(
                    contentStr,
                    transaction.privateKeyBase64,
                    data.keyMaterial.dhPublicKey.keyValue,
                    data.keyMaterial.nonce,
                    transaction.nonceBase64
                  );
                } catch (err) {
                  Logger.warn("M3ConsentController", "Failed to decrypt pdf entry", { error: err.message });
                }
              }
            }
            let bundle = typeof contentStr === 'string' ? JSON.parse(contentStr) : contentStr;
            bundlesToProcess.push(bundle);
          }
        }
      } else if (data.resourceType === "Bundle") {
        bundlesToProcess.push(data);
      }

      for (const bundle of bundlesToProcess) {
        if (bundle.entry && Array.isArray(bundle.entry)) {
          for (let bIdx = 0; bIdx < bundle.entry.length; bIdx++) {
            const bEntry = bundle.entry[bIdx];
            const resource = bEntry.resource;
            if (resource && (resource.resourceType === 'DocumentReference' || resource.resourceType === 'DiagnosticReport')) {
              if (bIdx === index) {
                if (resource.resourceType === 'DocumentReference') {
                  const attachment = resource.content && resource.content[0] && resource.content[0].attachment;
                  if (attachment && attachment.data) base64Pdf = attachment.data;
                } else if (resource.resourceType === 'DiagnosticReport') {
                  if (resource.presentedForm && resource.presentedForm[0] && resource.presentedForm[0].data) base64Pdf = resource.presentedForm[0].data;
                }
              }
            }
          }
        }
      }

      if (base64Pdf) {
        const pdfBuffer = Buffer.from(base64Pdf, 'base64');
        res.setHeader('Content-Type', 'application/pdf');
        res.send(pdfBuffer);
      } else {
        res.status(404).send("PDF data not found in document");
      }
    } catch (error) {
      const Logger = require("../logging/logger");
      Logger.error("M3ConsentController", "getHealthDocumentPdf failed", { error: error.message });
      res.status(500).send("Server Error");
    }
  }
}

module.exports = M3ConsentController;
