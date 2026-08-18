const M3ConsentStore = require("../store/M3ConsentStore");
const Logger = require("../logging/logger");
const M3ConsentService = require("../services/m3ConsentService");
const axios = require("axios");
const config = require("../helpers/config");
const M3TokenManager = require("../tokens/M3TokenManager");
const fs = require("fs");
const path = require("path");

class M3CallbackController {
  
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
        consentArtefacts: consentRequest.consentArtefacts
      });
    }
    res.status(202).send();
  }

  static async hiuNotify(req, res) {
    Logger.info("M3Callback", "Received HIU notify", req.body);
    const { notification } = req.body;
    const reqId = req.headers["request-id"] || req.headers["REQUEST-ID"];
    
    res.status(202).send(); // Immediate ACK
    
    // Process notification async
    try {
      if (notification.status === "GRANTED") {
        // notification.consentArtefacts is an array
        let updated = M3ConsentStore.updateConsentByConsentRequestId(notification.consentRequestId, {
            status: "GRANTED",
            consentArtefacts: notification.consentArtefacts
        });
          
        if (!updated) {
            Logger.warn("M3Callback", "consentRequestId not found, falling back to latest pending request");
            const latestPending = M3ConsentStore.consents.find(c => c.status === "REQUESTED" || c.status === "INITIATED");
            if (latestPending) {
              latestPending.consentRequestId = notification.consentRequestId;
              latestPending.status = "GRANTED";
              latestPending.consentArtefacts = notification.consentArtefacts;
              M3ConsentStore.save();
            }
        }
          
        for (const artefact of notification.consentArtefacts) {
          // Optionally Auto-fetch the artefact
          await M3ConsentService.fetchConsentArtefact(artefact.id);
        }
      } else {
         let updated = M3ConsentStore.updateConsentByConsentRequestId(notification.consentRequestId, {
            status: notification.status
          });
         if (!updated) {
           const latestPending = M3ConsentStore.consents.find(c => c.status === "REQUESTED" || c.status === "INITIATED");
           if (latestPending) {
              latestPending.consentRequestId = notification.consentRequestId;
              latestPending.status = notification.status;
              M3ConsentStore.save();
           }
         }
      }

      // Send on-notify acknowledgment back to ABDM
      const M3TokenManager = require("../tokens/M3TokenManager");
      const token = await M3TokenManager.getGatewayToken();
      const onNotifyPayload = {
        acknowledgement: [
          {
            status: "OK",
            consentId: notification.consentRequestId
          }
        ],
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
      const consentReq = M3ConsentStore.consents.find(c => 
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
      // Try to find the ABHA ID in the store if we tracked transactionId (we didn't store transactionId yet in store, let's assume we can fetch it or just use a generic folder if missing)
      
      const rootDir = path.resolve(__dirname, "../../../");
      const dirs = fs.readdirSync(rootDir);
      let targetUserDir = dirs.find(d => d.includes("@sbx"));
      const transaction = M3ConsentStore.getTransaction(transactionId);
      if (transaction && transaction.consentId) {
        const consentReq = M3ConsentStore.consents.find(c => c.artefactDetails && c.artefactDetails[transaction.consentId]);
        if (consentReq && consentReq.patientId) {
          const found = dirs.find(d => d.startsWith(consentReq.patientId));
          if (found) targetUserDir = found;
        }
      }
      
      if (!targetUserDir) {
        targetUserDir = `User_${new Date().getTime()}@sbx`;
        fs.mkdirSync(path.join(rootDir, targetUserDir), { recursive: true });
      }

      const hospitalDir = path.join(rootDir, targetUserDir, "Other_hospital_data", "HIP_Data");
      fs.mkdirSync(hospitalDir, { recursive: true });

      const fileName = `HealthData_${transactionId}_${new Date().getTime()}.json`;
      fs.writeFileSync(path.join(hospitalDir, fileName), JSON.stringify(req.body, null, 2), "utf-8");

      Logger.info("M3Callback", `Saved health data to ${hospitalDir}/${fileName}`);

      // Now notify ABDM that we received the data
      const M3ConsentService = require("../services/m3ConsentService");
      const transaction = M3ConsentStore.getTransaction(transactionId);
      
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
