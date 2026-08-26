const M3ConsentStore = require("../store/M3ConsentStore");
const Logger = require("../logging/logger");
const M3ConsentService = require("../services/m3ConsentService");
const axios = require("axios");
const config = require("../helpers/config");
const M3TokenManager = require("../tokens/M3TokenManager");
const fs = require("fs");
const path = require("path");

class M3CallbackController {
  
  static _deleteDataForConsent(patientId, consentId) {
    if (!consentId) return;
    try {
      const M3PatientStorageService = require("../services/m3PatientStorageService");
      if (patientId) {
        M3PatientStorageService.deleteConsentData(patientId, consentId);
      } else {
        Logger.warn("M3Callback", `Cannot delete data for consent ${consentId} because patientId is missing`);
      }
    } catch (e) {
      Logger.error("M3Callback", `Failed to delete data for consent ${consentId}`, { error: e.message });
    }
  }
  static async onConsentInit(req, res) {
    Logger.info("M3Callback", "Received consent on-init", req.body);
    const { consentRequest, error, response } = req.body;
    
    // We get consentRequest.id which is the actual consentRequestId from ABDM
    if (consentRequest && consentRequest.id) {
      M3ConsentStore.updateConsentByRequestId(response.requestId, {
        status: "INITIATED",
        consentRequestId: consentRequest.id,
      });
    } else if (error) {
      M3ConsentStore.updateConsentByRequestId(response.requestId, {
        status: "FAILED",
        error: error.message
      });
    }
    res.status(202).send();
  }

  static async onConsentStatus(req, res) {
    Logger.info("M3Callback", "Received consent status", req.body);
    const { consentRequest, error, response } = req.body;
    
    if (consentRequest && consentRequest.id) {
      M3ConsentStore.updateConsentByConsentRequestId(consentRequest.id, {
        status: consentRequest.status,
        consentArtefacts: consentRequest.consentArtefacts,
        updatedAt: req.body.timestamp || new Date().toISOString()
      });
      
      if (consentRequest.status === "EXPIRED" || consentRequest.status === "REVOKED") {
         const existingReq = M3ConsentStore.getConsents().find(c => c.consentRequestId === consentRequest.id);
         if (existingReq) {
             if (existingReq.consentArtefacts) {
               existingReq.consentArtefacts.forEach(artefact => {
                  M3CallbackController._deleteDataForConsent(existingReq.patientId, artefact.id);
               });
            }
            if (existingReq.consentId) {
               M3CallbackController._deleteDataForConsent(existingReq.patientId, existingReq.consentId);
            }
         }
         if (consentRequest.consentArtefacts) {
            consentRequest.consentArtefacts.forEach(artefact => {
               M3CallbackController._deleteDataForConsent(existingReq ? existingReq.patientId : null, artefact.id);
            });
         }
      }
    }
    res.status(202).send();
  }

  static async hiuNotify(req, res) {
    Logger.info("M3Callback", "Received HIU notify", req.body);
    const { notification } = req.body;
    const reqId = req.headers["request-id"] || req.headers["REQUEST-ID"];
    const timestamp = req.body.timestamp || new Date().toISOString();
    
    res.status(202).send(); // Immediate ACK
    
    // Process notification async
    try {
      if (notification.status === "GRANTED") {
        // notification.consentArtefacts is an array
        let updated = M3ConsentStore.updateConsentByConsentRequestId(notification.consentRequestId, {
            status: "GRANTED",
            consentArtefacts: notification.consentArtefacts,
            updatedAt: timestamp
        });
          
        if (!updated) {
            Logger.warn("M3Callback", "consentRequestId not found, falling back to latest pending request");
            const latestPending = M3ConsentStore.getConsents().find(c => c.status === "REQUESTED" || c.status === "INITIATED");
            if (latestPending) {
              latestPending.consentRequestId = notification.consentRequestId;
              latestPending.status = "GRANTED";
              latestPending.consentArtefacts = notification.consentArtefacts;
              latestPending.updatedAt = timestamp;
              M3ConsentStore.save();
            }
        }
          
        for (const artefact of notification.consentArtefacts) {
          // Optionally Auto-fetch the artefact
          await M3ConsentService.fetchConsentArtefact(artefact.id);
        }
      } else {
         let updated = M3ConsentStore.updateConsentByConsentRequestId(notification.consentRequestId, {
            status: notification.status,
            updatedAt: timestamp
          });
         if (!updated) {
           const latestPending = M3ConsentStore.getConsents().find(c => c.status === "REQUESTED" || c.status === "INITIATED");
           if (latestPending) {
              latestPending.consentRequestId = notification.consentRequestId;
              latestPending.status = notification.status;
              latestPending.updatedAt = timestamp;
              M3ConsentStore.save();
           }
         }
         
         if (notification.status === "EXPIRED" || notification.status === "REVOKED") {
            const existingReq = M3ConsentStore.getConsents().find(c => c.consentRequestId === notification.consentRequestId);
            if (existingReq) {
               if (existingReq.consentArtefacts) {
                  existingReq.consentArtefacts.forEach(artefact => {
                     M3CallbackController._deleteDataForConsent(existingReq.patientId, artefact.id);
                  });
               }
               if (existingReq.consentId) {
                  M3CallbackController._deleteDataForConsent(existingReq.patientId, existingReq.consentId);
               }
            }
            if (notification.consentArtefacts) {
               notification.consentArtefacts.forEach(artefact => {
                  M3CallbackController._deleteDataForConsent(existingReq ? existingReq.patientId : null, artefact.id);
               });
            }
         }
      }

      // Send on-notify acknowledgment back to ABDM
      const M3TokenManager = require("../tokens/M3TokenManager");
      const token = await M3TokenManager.getGatewayToken();
      const acknowledgements = [];
      if (notification.consentArtefacts && notification.consentArtefacts.length > 0) {
        notification.consentArtefacts.forEach(artefact => {
          acknowledgements.push({
            status: "OK",
            consentId: artefact.id
          });
        });
      } else {
        acknowledgements.push({
          status: "OK",
          consentId: notification.consentRequestId
        });
      }

      const onNotifyPayload = {
        acknowledgement: acknowledgements,
        response: {
          requestId: reqId
        }
      };

      const newReqId = require("uuid").v4();
      const ts = new Date().toISOString();
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "REQUEST-ID": newReqId,
        "TIMESTAMP": ts,
        "X-CM-ID": config.cmId || "sbx"
      };

      await axios.post(
        `${config.gatewayBaseUrl}/api/hiecm/consent/v3/request/hiu/on-notify`,
        onNotifyPayload,
        { headers }
      );
    } catch (error) {
      Logger.error("M3Callback", "Failed to process HIU notify", { error: error.message });
    }
  }

  static async onConsentFetch(req, res) {
    Logger.info("M3Callback", "Received consent on-fetch", req.body);
    const { consent, error, response } = req.body;
    
    if (consent && consent.consentDetail) {
      // Find the request that has this artefact
      const consentReq = M3ConsentStore.getConsents().find(c => 
        (c.consentArtefacts && c.consentArtefacts.some(a => a.id === consent.consentDetail.consentId)) ||
        (c.consentId === consent.consentDetail.consentId)
      );

      if (consentReq) {
        if (!consentReq.artefactDetails) consentReq.artefactDetails = {};
        consentReq.artefactDetails[consent.consentDetail.consentId] = consent.consentDetail;
        
        Object.assign(consentReq, {
          status: "FETCHED",
          artefactDetails: consentReq.artefactDetails,
          details: consent.consentDetail // keep backward compatibility for single artefact
        });
        M3ConsentStore.save();
      }
    }
    res.status(202).send();
  }

  static async onHealthInfoRequest(req, res) {
    Logger.info("M3Callback", "Received health info on-request", req.body);
    res.status(202).send();

    try {
      const { hiRequest, resp, error } = req.body;
      if (resp && resp.requestId) {
        M3ConsentStore.load(); // Ensure fresh state for multi-process environments
        const transactions = M3ConsentStore.transactions || {};
        let txn = null;
        let matchedOldTxnId = null;

        for (const [oldTransactionId, t] of Object.entries(transactions)) {
          if (t.requestId === resp.requestId) {
            txn = t;
            matchedOldTxnId = oldTransactionId;
            break;
          }
        }

        if (txn) {
          if (error) {
            Logger.error("M3Callback", `Error from on-request for ${matchedOldTxnId}: ${error.message}`);
            txn.error = error.message;
            M3ConsentStore.save();
          } else if (hiRequest && hiRequest.transactionId) {
            Logger.info("M3Callback", `Mapping ABDM transactionId ${hiRequest.transactionId} to our internal transaction.`);
            M3ConsentStore.addTransaction(hiRequest.transactionId, txn);
          }
        }
      }
    } catch (e) {
      Logger.error("M3Callback", "Error mapping transactionId from on-request", { error: e.message });
    }
  }

  // Receives actual health data from HIP (FIData)
  static async healthInfoTransfer(req, res) {
    Logger.info("M3Callback", "Received health info transfer (Data Push)", req.body);
    res.status(202).send(); // ACK the receipt

    try {
      const { transactionId, entries } = req.body;
      
      // Usually, the consent fetch artifact tells us the patient's ABHA ID.
      // We can look up the transaction locally to find the ABHA ID.
      // For now, let's extract it from the payload if possible, or fallback to unknown.
      
      let abhaId = "UnknownPatient";
      let consentId = "UnknownConsent";
      let hipName = "UnknownHIP";

      let transaction = M3ConsentStore.getTransaction(transactionId);
      
      // Fallback for missing on-request webhook or race conditions
      if (!transaction) {
        M3ConsentStore.load();
        const transactions = M3ConsentStore.transactions || {};
        const pendingTxns = Object.values(transactions).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        if (pendingTxns.length > 0) {
          transaction = pendingTxns[0];
          
          // Re-key it immediately so future chunks map correctly
          M3ConsentStore.transactions[transactionId] = transaction;
          M3ConsentStore.save();
          Logger.warn("M3Callback", "Fallback used: Mapped unmapped transaction to incoming health data", { transactionId });
        }
      }

      if (transaction && transaction.consentId) {
        consentId = transaction.consentId;
        hipName = transaction.hipName || transaction.hipId || "UnknownHIP";
        const consentReq = M3ConsentStore.getConsents().find(c => c.artefactDetails && c.artefactDetails[transaction.consentId]);
        if (consentReq && consentReq.patientId) {
          abhaId = consentReq.patientId;
        }
      }

      const M3PatientStorageService = require("../services/m3PatientStorageService");
      const fileName = `HealthData_${transactionId}_${new Date().getTime()}.json`;
      
      const filePath = M3PatientStorageService.saveM3File(
        abhaId,
        consentId,
        hipName,
        fileName,
        JSON.stringify(req.body, null, 2)
      );

      Logger.info("M3Callback", `Saved health data to ${filePath}`);

      // Now notify ABDM that we received the data
      const M3ConsentService = require("../services/m3ConsentService");
      
      if (transaction) {
        await M3ConsentService.notifyHealthInformationStatus({
          consentId: transaction.consentId,
          transactionId: transactionId,
          sessionStatus: "TRANSFERRED",
          hipId: transaction.hipId,
          statusResponses: entries ? entries.map(e => ({
            careContextReference: e.careContextReference || "unknown",
            hiStatus: "OK",
            description: "Data received successfully"
          })) : []
        });
      } else {
        Logger.warn("M3Callback", "Could not find transaction tracking info, skipping notifyHealthInformationStatus", { transactionId });
      }
    } catch (err) {
      Logger.error("M3Callback", "Error saving health data", { error: err.message });
    }
  }

  // Subscription Callbacks

  static async onSubscriptionInit(req, res) {
    Logger.info("M3Callback", "Received subscription on-init", req.body);
    res.status(202).send();
  }

  static async subscriptionNotify(req, res) {
    Logger.info("M3Callback", "Received subscription notify", req.body);
    res.status(202).send();

    try {
      const { notification, requestId } = req.body;
      const M3SubscriptionService = require("../services/m3SubscriptionService");

      // Acknowledge the notification back to the gateway
      const ackPayload = {
        acknowledgement: {
          status: "OK",
          subscriptionRequestId: notification?.subscriptionRequestId || "unknown"
        },
        response: {
          requestId: requestId
        }
      };

      await M3SubscriptionService.hiuOnNotify(ackPayload);
    } catch (err) {
      Logger.error("M3Callback", "Failed to process subscription notify", { error: err.message });
    }
  }

  static async subscriptionContextNotify(req, res) {
    Logger.info("M3Callback", "Received subscription care-context notify", req.body);
    res.status(202).send();

    try {
      const { notification, requestId } = req.body;
      const M3SubscriptionService = require("../services/m3SubscriptionService");

      // Acknowledge the notification back to the gateway
      const ackPayload = {
        acknowledgement: {
          status: "OK",
          eventId: notification?.eventId || "unknown"
        },
        response: {
          requestId: requestId
        }
      };

      await M3SubscriptionService.careContextOnNotify(ackPayload);
    } catch (err) {
      Logger.error("M3Callback", "Failed to process subscription care-context notify", { error: err.message });
    }
  }
}

module.exports = M3CallbackController;
