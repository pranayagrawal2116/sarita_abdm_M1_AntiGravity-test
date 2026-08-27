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
      
      // Dynamic computation of hasData for backward compatibility
      const M3PatientStorageService = require("../services/m3PatientStorageService");
      const patientConsentHasData = {}; // patientId -> Set of consentIds
      
      for (const reqObj of requests) {
         if (reqObj.patientId && reqObj.artefactDetails) {
            // Skip if all artefacts already have hasData=true
            const needsCheck = Object.values(reqObj.artefactDetails).some(art => art && art.hasData !== true);
            if (!needsCheck) continue;
            
            if (!patientConsentHasData[reqObj.patientId]) {
               patientConsentHasData[reqObj.patientId] = new Set();
               try {
                  const files = M3PatientStorageService.getAllHealthDataFiles(reqObj.patientId);
                  for (const filePath of files) {
                     const file = path.basename(filePath);
                     if (file.startsWith("HealthData_")) {
                        const parts = file.split('_');
                        if (parts.length >= 2) {
                           const transactionId = parts[1];
                           // Access transactions directly to avoid accidental this.load() trigger
                           const transaction = M3ConsentStore.transactions && M3ConsentStore.transactions[transactionId];
                           if (transaction && transaction.consentId) {
                              patientConsentHasData[reqObj.patientId].add(transaction.consentId);
                           }
                        }
                     }
                  }
               } catch (e) {
                  // ignore errors
               }
            }

            const validConsentIds = patientConsentHasData[reqObj.patientId];
            for (const consentId of Object.keys(reqObj.artefactDetails)) {
               if (validConsentIds.has(consentId)) {
                  reqObj.artefactDetails[consentId].hasData = true;
               }
            }
         }
      }

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
      const { consentId, patientId, dateFrom, dateTo, dataEraseAt } = req.body;
      const result = await M3ConsentService.requestHealthInformation(consentId, patientId, dateFrom, dateTo, dataEraseAt);
      res.status(202).json({
        success: true,
        transactionId: result.transactionId
      });
    } catch (error) {
      Logger.error("M3ConsentController", "requestHealthData failed", { error: error.message });
      let details = error.message;
      if (error.response && error.response.data) {
        try { details = JSON.stringify(error.response.data); } catch(e) { details = String(error.response.data); }
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
      const M3PatientStorageService = require("../services/m3PatientStorageService");
      
      const docIdVar = typeof docId !== 'undefined' ? docId : null;
      const consentReq = typeof hipId !== 'undefined' ? M3ConsentStore.getConsents().find(c => c.artefactDetails && (c.artefactDetails[hipId] || Object.values(c.artefactDetails).some(art => art.hip && art.hip.id === hipId))) : null;
      
      let allowedHiTypes = [];
      let targetPatientId = "UnknownPatient";
      if (consentReq) {
         if (consentReq.patientId) targetPatientId = consentReq.patientId;
         let art = null;
         if (consentReq.artefactDetails && consentReq.artefactDetails[hipId]) {
             art = consentReq.artefactDetails[hipId];
         } else if (consentReq.artefactDetails) {
             art = Object.values(consentReq.artefactDetails).find(a => a.hip && a.hip.id === hipId) || Object.values(consentReq.artefactDetails)[0];
         }
         
         if (art && art.hiTypes) {
             allowedHiTypes = art.hiTypes.map(t => String(t || "").replace(/\s+/g, "").toLowerCase());
         } else if (consentReq.hiTypes) {
             allowedHiTypes = consentReq.hiTypes.map(t => String(t || "").replace(/\s+/g, "").toLowerCase());
         }
      }

      if (targetPatientId === "UnknownPatient") {
         return res.json({ success: true, data: [] });
      }
      
      const files = M3PatientStorageService.getAllHealthDataFiles(targetPatientId);
      
      let documents = [];
      const globalSeenCareContexts = new Set();

      for (const filePath of files) {
        const file = path.basename(filePath);
        const parts = file.split('_');
        let transactionId = parts.length >= 2 ? parts[1] : "fallback";
        
        if (file.startsWith("HealthData_") && parts.length >= 2) {
          const transaction = M3ConsentStore.transactions && M3ConsentStore.transactions[transactionId];
          if (hipId && transaction && transaction.hipId !== hipId && transaction.consentId !== hipId) continue;
        }

        try {
          const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
          let bundlesToProcess = [];
          
          if (data.entries && Array.isArray(data.entries)) {
            for (const entry of data.entries) {
              if (entry.content) {
                 let contentStr = entry.content;
                 if (typeof contentStr === 'string' && !contentStr.trim().startsWith('{')) {
                   const tId = file.split('_')[1];
                   const transaction = M3ConsentStore.getTransaction(tId);
                   if (transaction && transaction.privateKeyBase64) {
                     try {
                       const fhirEncryptionService = require('../../services/fhirEncryptionService');
                       contentStr = await fhirEncryptionService.decrypt(
                         contentStr,
                         transaction.privateKeyBase64,
                         transaction.senderPublicKeyBase64 || data.keyMaterial?.dhPublicKey?.keyValue,
                         transaction.senderNonceBase64 || data.keyMaterial?.nonce,
                         transaction.nonceBase64
                       );
                     } catch (err) {
                       Logger.warn("M3ConsentController", "Failed to decrypt entry", { error: err.message });
                     }
                   }
                 }
                 try {
                   let bundle = typeof contentStr === 'string' ? JSON.parse(contentStr) : contentStr;
                   bundle._careContextReference = entry.careContextReference;
                   bundlesToProcess.push(bundle);
                 } catch(e) {}
              }
            }
          } else if (data.resourceType === "Bundle") {
            bundlesToProcess.push(data);
          }
          
          bundlesToProcess.forEach((bundle, bIdx) => {
             if (!bundle || bundle.resourceType !== 'Bundle') return;
             
             let docTitle = bundle._careContextReference || "Health Document";
             let docType = "DOCUMENT";
             let docDateStr = new Date().toISOString();
             let doctor = "Unknown";
             let hasPdf = false;
             let dedupeId = bundle._careContextReference || bundle.id || `${transactionId}_${bIdx}`;
             
             if (bundle.entry && Array.isArray(bundle.entry)) {
               const comp = bundle.entry.find(e => e && e.resource && e.resource.resourceType === 'Composition');
               const diag = bundle.entry.find(e => e && e.resource && e.resource.resourceType === 'DiagnosticReport');
               const docRef = bundle.entry.find(e => e && e.resource && e.resource.resourceType === 'DocumentReference');
               
               if (comp && comp.resource) {
                 docType = "COMPOSITION";
                 dedupeId = bundle._careContextReference || comp.resource.id || dedupeId;
                 if (comp.resource.title) docTitle = comp.resource.title;
                 if (comp.resource.date) docDateStr = comp.resource.date;
                 if (comp.resource.author && comp.resource.author[0] && comp.resource.author[0].display) doctor = comp.resource.author[0].display;
               } else if (diag && diag.resource) {
                 docType = "DIAGNOSTIC_REPORT";
                 dedupeId = bundle._careContextReference || diag.resource.id || dedupeId;
                 if (diag.resource.code && diag.resource.code.text) docTitle = diag.resource.code.text;
                 if (diag.resource.effectiveDateTime) docDateStr = diag.resource.effectiveDateTime;
                 if (diag.resource.performer && diag.resource.performer[0]) doctor = diag.resource.performer[0].display || doctor;
               } else if (docRef && docRef.resource) {
                 docType = "DOCUMENT_REFERENCE";
                 dedupeId = bundle._careContextReference || docRef.resource.id || dedupeId;
                 if (docRef.resource.type && docRef.resource.type.text) docTitle = docRef.resource.type.text;
                 if (docRef.resource.date) docDateStr = docRef.resource.date;
                 if (docRef.resource.author && docRef.resource.author[0]) doctor = docRef.resource.author[0].display || doctor;
               } else {
                 const first = bundle.entry.find(e => e && e.resource && !['Patient', 'Practitioner', 'Organization'].includes(e.resource.resourceType));
                 if (first && first.resource) {
                    docType = first.resource.resourceType.toUpperCase();
                    dedupeId = bundle._careContextReference || first.resource.id || dedupeId;
                    if (first.resource.date || first.resource.effectiveDateTime) docDateStr = first.resource.date || first.resource.effectiveDateTime;
                 }
               }
               
               let hasAttachment = JSON.stringify(bundle).includes('"contentType":"application/pdf"');
               for (const bEntry of bundle.entry) {
                  const resource = bEntry ? bEntry.resource : null;
                  if (resource) {
                      if (resource.resourceType === 'DocumentReference') {
                        const attachment = resource.content && resource.content[0] && resource.content[0].attachment;
                        if (attachment && attachment.data) hasAttachment = true;
                      } else if (resource.resourceType === 'DiagnosticReport') {
                        if (resource.presentedForm && resource.presentedForm[0] && resource.presentedForm[0].data) hasAttachment = true;
                      } else if (resource.resourceType === 'Binary') {
                        if (resource.contentType === 'application/pdf' && resource.data) hasAttachment = true;
                      }
                  }
                  if (hasAttachment) break;
               }
               if (hasAttachment) hasPdf = true;
             }
             
             let deducedType = "healthdocumentrecord";
             const t = docTitle.toLowerCase();
             if (t.includes("prescription") || t.includes("medication")) deducedType = "prescription";
             else if (t.includes("diagnostic") || t.includes("lab") || docType === "DIAGNOSTIC_REPORT") deducedType = "diagnosticreport";
             else if (t.includes("consultation") || t.includes("evisit") || t.includes("visit") || docType === "ENCOUNTER") deducedType = "opconsultation";
             else if (t.includes("discharge")) deducedType = "dischargesummary";
             else if (t.includes("immunization") || t.includes("vaccine") || docType === "IMMUNIZATION") deducedType = "immunizationrecord";
             else if (t.includes("vital") || t.includes("wellness")) deducedType = "wellnessrecord";
             else if (t.includes("inv-") || t.includes("invoice") || docType === "INVOICE") deducedType = "invoice";
             
             if (bundle.entry && Array.isArray(bundle.entry)) {
               const comp = bundle.entry.find(e => e.resource && e.resource.resourceType === 'Composition');
               if (comp && comp.resource && comp.resource.type && comp.resource.type.coding && comp.resource.type.coding.length > 0) {
                 const code = comp.resource.type.coding[0].code;
                 if (code === '440545006') deducedType = 'prescription';
                 else if (code === '721981007') deducedType = 'diagnosticreport';
                 else if (code === '371530004') deducedType = 'opconsultation';
                 else if (code === '373942005') deducedType = 'dischargesummary';
                 else if (code === '41000179103') deducedType = 'immunizationrecord';
                 else if (code === '419891008') deducedType = 'healthdocumentrecord';
                 else if (code === '736271009') deducedType = 'wellnessrecord';
               }
             }

             if (allowedHiTypes.length > 0 && !allowedHiTypes.includes(deducedType)) {
                 return; // Skip this document as it is not granted
             }
             
             if (globalSeenCareContexts.has(dedupeId)) return;
             globalSeenCareContexts.add(dedupeId);
             documents.push({
                id: `${transactionId}_${file}_${bIdx}`,
                type: docType,
                title: docTitle,
                date: new Date(docDateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
                doctor: doctor,
                hasPdf: hasPdf,
                _originalId: dedupeId
             });
          });
        } catch(e) {
          Logger.warn("M3ConsentController", "Failed to parse " + file, { error: e.message });
        }
      }

      if (documents.length === 0 && typeof hipId !== 'undefined' && M3ConsentStore.transactions) {
        const txnWithError = Object.values(M3ConsentStore.transactions).find(t => t.hipId === hipId && t.error);
        if (txnWithError) {
          return res.status(400).json({ success: false, error: "Data pull was unsuccfull, please try again after some time", originalError: txnWithError.error });
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
      const parts = docId.split('_');
      if (parts.length < 3) return res.status(400).send("Invalid docId");
      
      const transactionId = parts[0];
      const bundleIdx = parseInt(parts[parts.length - 1], 10);
      const file = parts.slice(1, parts.length - 1).join('_');

      const transaction = M3ConsentStore.getTransaction(transactionId);
      if (!transaction) {
         const Logger = require("../logging/logger");
         Logger.error("M3ConsentController", "404 Transaction not found for docId", { docId });
         return res.status(404).send("File not found");
      }
      
      let targetPatientId = "UnknownPatient";
      if (transaction.consentId) {
         const consentReq = M3ConsentStore.getConsents().find(c => c.artefactDetails && c.artefactDetails[transaction.consentId]);
         if (consentReq && consentReq.patientId) {
             targetPatientId = consentReq.patientId;
         }
      }

      const M3PatientStorageService = require("../services/m3PatientStorageService");
      const filePath = M3PatientStorageService.findFileByTransactionAndName(targetPatientId, file);
      
      if (!filePath || !fs.existsSync(filePath)) {
        const Logger = require("../logging/logger");
        Logger.error("M3ConsentController", "404 File path not found", { docId, file });
        return res.status(404).send("File not found");
      }

      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      let base64Pdf = null;
      
      let bundlesToProcess = [];
      if (data.entries && Array.isArray(data.entries)) {
        for (const entry of data.entries) {
          if (entry.content) {
            let contentStr = entry.content;
            if (typeof contentStr === 'string' && !contentStr.trim().startsWith('{')) {
              if (transaction && transaction.privateKeyBase64) {
                try {
                  const fhirEncryptionService = require('../../services/fhirEncryptionService');
                  contentStr = await fhirEncryptionService.decrypt(
                    contentStr,
                    transaction.privateKeyBase64,
                    transaction.senderPublicKeyBase64 || data.keyMaterial?.dhPublicKey?.keyValue,
                    transaction.senderNonceBase64 || data.keyMaterial?.nonce,
                    transaction.nonceBase64
                  );
                } catch (err) {}
              }
            }
            try {
              let bundle = typeof contentStr === 'string' ? JSON.parse(contentStr) : contentStr;
              bundle._careContextReference = entry.careContextReference;
              bundlesToProcess.push(bundle);
            } catch(e) {}
          }
        }
      } else if (data.resourceType === "Bundle") {
        bundlesToProcess.push(data);
      }

      let bundle = bundlesToProcess[bundleIdx];
      if (bundle && bundle.entry && Array.isArray(bundle.entry)) {
         for (const bEntry of bundle.entry) {
            const resource = bEntry ? bEntry.resource : null;
            if (resource) {
                if (resource.resourceType === 'DocumentReference') {
                  const attachment = resource.content && resource.content[0] && resource.content[0].attachment;
                  if (attachment && attachment.data) base64Pdf = attachment.data;
                } else if (resource.resourceType === 'DiagnosticReport') {
                  if (resource.presentedForm && resource.presentedForm[0] && resource.presentedForm[0].data) base64Pdf = resource.presentedForm[0].data;
                } else if (resource.resourceType === 'Binary' && resource.contentType === 'application/pdf') {
                  if (resource.data) base64Pdf = resource.data;
                }
            }
            if (base64Pdf) break;
         }
      }

      if (base64Pdf && req.query.format !== 'json') {
        const pdfBuffer = Buffer.from(base64Pdf, 'base64');
        res.setHeader('Content-Type', 'application/pdf');
        res.send(pdfBuffer);
      } else if (bundle) {
        res.setHeader('Content-Type', 'application/json');
        res.send(bundle);
      } else {
        const Logger = require("../logging/logger");
        Logger.error("M3ConsentController", "404 No bundle or PDF found", { 
           docId, 
           bundleIdx, 
           bundlesCount: bundlesToProcess.length, 
           hasBundle: !!bundle 
        });
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
