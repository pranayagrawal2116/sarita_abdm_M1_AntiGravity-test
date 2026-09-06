const fs = require('fs');
let file = 'backend/m2/callbacks/M2CallbackManager.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /const updatePayload = \{[\s\S]*?\};\s*if \(type === "Health Information Request" && incomingTransactionId && tx\.transactionId && incomingTransactionId \!== tx\.transactionId\) \{[\s\S]*?\} else \{\s*tx = await M2TransactionStore\.updateTransaction\(tx\.transactionId \|\| tx\.requestId, updatePayload\);\s*\}/m;

const replacement = `if (type === "Health Information Request" && incomingTransactionId && tx.transactionId && incomingTransactionId !== tx.transactionId) {
        const updatePayload = {
          transactionId: incomingTransactionId,
          gatewayRequestId: callbackRequestId || tx.gatewayRequestId,
          consentId: tx.consentId || incomingConsentId,
          consentRequestId: tx.consentRequestId || payload.notification?.consentRequestId || payload.notification?.consentDetail?.consentId || "",
          patientId: tx.patientId,
          abhaAddress: tx.abhaAddress,
          healthInformationRequestId: callbackRequestId,
          dataPushUrl: payload.hiRequest?.dataPushUrl || tx.dataPushUrl || "",
          receiverPublicKey: payload.hiRequest?.keyMaterial?.dhPublicKey?.keyValue || tx.receiverPublicKey || "",
          receiverNonce: payload.hiRequest?.keyMaterial?.nonce || tx.receiverNonce || "",
          careContexts: payload.notification?.consentDetail?.careContexts || payload.notification?.careContexts || tx.careContexts || []
        };
        tx = await M2TransactionStore.createTransaction({
          ...tx,
          ...updatePayload,
          dataPushAcknowledgement: null,
          dataPushError: null,
          dataPushResult: null,
          dataPushPayload: null,
          auditHistory: [],
          callbackHistory: [],
          currentState: "Created"
        });
      } else {
        tx = await M2TransactionStore.updateTransaction(tx.transactionId || tx.requestId, (currentTx) => {
          return {
            transactionId: incomingTransactionId,
            gatewayRequestId: callbackRequestId || currentTx.gatewayRequestId,
            consentId: type === "Consent Notification" ? (incomingConsentId || currentTx.consentId || "") : (currentTx.consentId || incomingConsentId),
            consentRequestId: currentTx.consentRequestId || payload.notification?.consentRequestId || payload.notification?.consentDetail?.consentId || "",
            patientId: type === "Consent Notification" ? (incomingPatientId || currentTx.patientId || "") : currentTx.patientId,
            abhaAddress: type === "Consent Notification" ? (incomingPatientId || currentTx.abhaAddress || "") : currentTx.abhaAddress,
            healthInformationRequestId: type === "Health Information Request" ? callbackRequestId : currentTx.healthInformationRequestId,
            dataPushUrl: payload.hiRequest?.dataPushUrl || currentTx.dataPushUrl || "",
            receiverPublicKey: payload.hiRequest?.keyMaterial?.dhPublicKey?.keyValue || currentTx.receiverPublicKey || "",
            receiverNonce: payload.hiRequest?.keyMaterial?.nonce || currentTx.receiverNonce || "",
            careContexts: payload.notification?.consentDetail?.careContexts || payload.notification?.careContexts || currentTx.careContexts || []
          };
        });
      }`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content, 'utf8');
console.log('Patched M2CallbackManager updater');
