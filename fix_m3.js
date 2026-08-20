const fs = require('fs');

let code = fs.readFileSync('backend/m3/controllers/m3ConsentController.js', 'utf8');

// 1. Fix getHealthDocuments
const getHealthDocsOld = `      let documents = [];

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
                       const fhirEncryptionService = require('../../services/fhirEncryptionService');
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
  // LOG ALL RESOURCES
  let rTypes = [];
  if (bundle.entry) {
    bundle.entry.forEach(e => {
      if(e.resource) rTypes.push(e.resource.resourceType);
    });
  }
  console.log('Decrypted Bundle contains resourceTypes:', [...new Set(rTypes)]);
              }
            });
          } else if (data.resourceType === "Bundle") {
            bundlesToProcess.push(data);
          }
          bundlesToProcess.forEach((bundle, bIdx) => {
            let resIndex = 0;
            const seenIds = new Set();
            
            const extractResources = (obj) => {
              if (!obj || typeof obj !== 'object') return;
              
              if (obj.resourceType && (obj.resourceType === 'DocumentReference' || obj.resourceType === 'DiagnosticReport' || obj.resourceType === 'Composition')) {
                  if (obj.id && seenIds.has(obj.id)) return; // Prevent duplicates if tree has loops or same resource included multiple times
                  if (obj.id) seenIds.add(obj.id);
                  
                  let title = obj.resourceType;
                  let docType = obj.resourceType;
                  let dateStr = new Date().toISOString();
                  let doctor = "Unknown";
                  let hasPdf = false;

                  if (obj.resourceType === 'DocumentReference') {
                    if (obj.type && obj.type.text) title = obj.type.text;
                    if (obj.date) dateStr = obj.date;
                    if (obj.author && obj.author[0] && obj.author[0].display) doctor = obj.author[0].display;
                    
                    const attachment = obj.content && obj.content[0] && obj.content[0].attachment;
                    if (attachment && attachment.data) hasPdf = true;
                  } else if (obj.resourceType === 'DiagnosticReport') {
                    if (obj.code && obj.code.text) title = obj.code.text;
                    if (obj.effectiveDateTime) dateStr = obj.effectiveDateTime;
                    if (obj.performer && obj.performer[0] && obj.performer[0].display) doctor = obj.performer[0].display;
                    if (obj.presentedForm && obj.presentedForm[0] && obj.presentedForm[0].data) hasPdf = true;
                  } else if (obj.resourceType === 'Composition') {
                    if (obj.title) title = obj.title;
                    if (obj.date) dateStr = obj.date;
                    if (obj.author && obj.author[0] && obj.author[0].display) doctor = obj.author[0].display;
                    hasPdf = false;
                  }

                  documents.push({
                    id: \`\${transactionId}_\${file}_\${bIdx}_\${resIndex++}\`,
                    type: docType.toUpperCase(),
                    title: title,
                    date: new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
                    doctor: doctor,
                    hasPdf: hasPdf,
                    _originalId: obj.id
                  });
              }
              
              // Recurse
              if (Array.isArray(obj)) {
                 obj.forEach(extractResources);
              } else {
                 Object.values(obj).forEach(extractResources);
              }
            };
            
            extractResources(bundle);
          });
        } catch (error) {
          Logger.error("M3ConsentController", "Failed to parse " + file, { error: error.message });
        }
      }`;

const getHealthDocsNew = `      let documents = [];
      const globalSeenCompositions = new Set();

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
                       const fhirEncryptionService = require('../../services/fhirEncryptionService');
                       contentStr = fhirEncryptionService.decrypt(
                         contentStr,
                         transaction.privateKeyBase64,
                         data.keyMaterial.dhPublicKey.keyValue,
                         data.keyMaterial.nonce,
                         transaction.nonceBase64
                       );
                     } catch (err) {}
                   }
                 }
                 try {
                   let bundle = typeof contentStr === 'string' ? JSON.parse(contentStr) : contentStr;
                   bundlesToProcess.push(bundle);
                 } catch(e) {}
              }
            });
          } else if (data.resourceType === "Bundle") {
            bundlesToProcess.push(data);
          }
          
          bundlesToProcess.forEach((bundle, bIdx) => {
            let comp = null;
            if (bundle.entry && Array.isArray(bundle.entry)) {
              const compEntry = bundle.entry.find(e => e.resource && e.resource.resourceType === 'Composition');
              if (compEntry) comp = compEntry.resource;
            }
            if (!comp && bundle.resourceType === 'Composition') comp = bundle;
            
            let title = comp && comp.title ? comp.title : 'Health Record';
            let dateStr = comp && comp.date ? comp.date : new Date().toISOString();
            let doctor = "Unknown";
            if (comp && comp.author && comp.author[0] && comp.author[0].display) {
               doctor = comp.author[0].display;
            }
            
            let dupKey = comp && comp.id ? comp.id : (title + dateStr);
            if (globalSeenCompositions.has(dupKey)) return;
            globalSeenCompositions.add(dupKey);
            
            let hasPdf = false;
            if (bundle.entry && Array.isArray(bundle.entry)) {
               for (let i = 0; i < bundle.entry.length; i++) {
                 const res = bundle.entry[i].resource;
                 if (res && res.resourceType === 'DocumentReference') {
                    const attachment = res.content && res.content[0] && res.content[0].attachment;
                    if (attachment && attachment.data) {
                       hasPdf = true; break;
                    }
                 } else if (res && res.resourceType === 'DiagnosticReport') {
                    if (res.presentedForm && res.presentedForm[0] && res.presentedForm[0].data) {
                       hasPdf = true; break;
                    }
                 }
               }
            }
            
            let docType = comp ? 'COMPOSITION' : (bundle.type || 'BUNDLE');

            documents.push({
               id: \`\${transactionId}_\${file}_\${bIdx}\`,
               type: docType.toUpperCase(),
               title: title,
               date: new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
               doctor: doctor,
               hasPdf: hasPdf,
               _originalId: comp ? comp.id : undefined
            });
          });
        } catch (error) {
          Logger.error("M3ConsentController", "Failed to parse " + file, { error: error.message });
        }
      }`;

// 2. Fix getHealthDocumentPdf
const getPdfOld = `  static async getHealthDocumentPdf(req, res) {
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
                  const fhirEncryptionService = require('../../services/fhirEncryptionService');
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
  // LOG ALL RESOURCES
  let rTypes = [];
  if (bundle.entry) {
    bundle.entry.forEach(e => {
      if(e.resource) rTypes.push(e.resource.resourceType);
    });
  }
  console.log('Decrypted Bundle contains resourceTypes:', [...new Set(rTypes)]);
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
  }`;

const getPdfNew = `  static async getHealthDocumentPdf(req, res) {
    try {
      const { docId } = req.params;
      const parts = docId.split('_');
      if (parts.length < 3) return res.status(400).send("Invalid docId");
      
      const transactionId = parts[0];
      const bundleIdx = parseInt(parts[parts.length - 1], 10);
      const file = parts.slice(1, parts.length - 1).join('_');

      const fs = require('fs');
      const path = require('path');
      const rootDir = path.resolve(__dirname, "../../../");
      const dirs = fs.readdirSync(rootDir);
      let targetUserDir = dirs.find(d => d.includes("@sbx"));
      if (!targetUserDir) return res.status(404).send("Not found");
      
      const hospitalDir = path.join(rootDir, targetUserDir, "Other_hospital_data", "HIP_Data");
      let filePath = path.join(hospitalDir, file);
      
      if (!fs.existsSync(filePath)) {
         filePath = path.join(rootDir, targetUserDir, file);
      }
      if (!fs.existsSync(filePath)) return res.status(404).send("File not found");

      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      let base64Pdf = null;
      
      const transaction = M3ConsentStore.getTransaction(transactionId);
      
      let bundlesToProcess = [];
      if (data.entries && Array.isArray(data.entries)) {
        for (const entry of data.entries) {
          if (entry.content) {
            let contentStr = entry.content;
            if (typeof contentStr === 'string' && !contentStr.trim().startsWith('{')) {
              if (transaction && transaction.privateKeyBase64) {
                try {
                  const fhirEncryptionService = require('../../services/fhirEncryptionService');
                  contentStr = fhirEncryptionService.decrypt(
                    contentStr,
                    transaction.privateKeyBase64,
                    data.keyMaterial.dhPublicKey.keyValue,
                    data.keyMaterial.nonce,
                    transaction.nonceBase64
                  );
                } catch (err) {}
              }
            }
            try { bundlesToProcess.push(JSON.parse(contentStr)); } catch(e){}
          }
        }
      } else if (data.resourceType === "Bundle") {
        bundlesToProcess.push(data);
      }

      let bundle = bundlesToProcess[bundleIdx];
      if (bundle && bundle.entry && Array.isArray(bundle.entry)) {
         for (const bEntry of bundle.entry) {
            const resource = bEntry.resource;
            if (resource) {
                if (resource.resourceType === 'DocumentReference') {
                  const attachment = resource.content && resource.content[0] && resource.content[0].attachment;
                  if (attachment && attachment.data) base64Pdf = attachment.data;
                } else if (resource.resourceType === 'DiagnosticReport') {
                  if (resource.presentedForm && resource.presentedForm[0] && resource.presentedForm[0].data) base64Pdf = resource.presentedForm[0].data;
                }
            }
            if (base64Pdf) break;
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
  }`;

code = code.replace(getHealthDocsOld, getHealthDocsNew);
code = code.replace(getPdfOld, getPdfNew);
fs.writeFileSync('backend/m3/controllers/m3ConsentController.js', code);
console.log('Fixed m3ConsentController.js!');
