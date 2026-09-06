const fs = require('fs');
const file = 'backend/m2/callbacks/M2CallbackManager.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /if \(\!tx\) \{\s*Logger\.info\("M2CallbackManager", "Transaction not found\. Initializing new record\.", \{ lookupId \}\);\s*\/\/ Auto-create transaction for initial consent notification[\s\S]*?currentState: "Created"\s*\}\);\s*\} else \{/m;

const replacement = `if (!tx) {
      // PROMPT #5 SECURITY: Only specific callbacks are allowed to initialize a NEW transaction.
      // Other callbacks MUST match an existing transaction, otherwise they are rejected.
      const allowedToInitialize = ["Consent Notification"];
      if (!allowedToInitialize.includes(type)) {
        Logger.warn("M2CallbackManager", "Transaction not found. Rejecting uncorrelatable callback.", { lookupId, type, callbackRequestId });
        await this.appendAudit(callbackRequestId, "UNCORRELATABLE_CALLBACK_REJECTED", \`Callback "\${type}" could not be correlated to an existing transaction.\`, {
          callbackRequestId,
          type
        });
        return { status: "error", error: "TRANSACTION_NOT_FOUND", message: "Callback could not be correlated to an existing transaction." };
      }

      Logger.info("M2CallbackManager", "Transaction not found. Initializing new record.", { lookupId });
      
      // Auto-create transaction for initial consent notification
      tx = await M2TransactionStore.createTransaction({
        transactionId: this.extractTransactionId(payload, {}),
        requestId: callbackRequestId || lookupId,
        gatewayRequestId: callbackRequestId || lookupId,
        consentId: payload.notification?.consentId || payload.notification?.consentDetail?.consentId || payload.hiRequest?.consent?.id || payload.consentId || "",
        consentRequestId: payload.notification?.consentRequestId || payload.notification?.consentDetail?.consentId || "",
        patientId: this.extractNotificationPatientId(payload),
        abhaAddress: this.extractNotificationPatientId(payload),
        hipId: this.extractNotificationHipId(payload),
        healthInformationRequestId: type === "Health Information Request" ? callbackRequestId : "",
        dataPushUrl: payload.hiRequest?.dataPushUrl || "",
        receiverPublicKey: payload.hiRequest?.keyMaterial?.dhPublicKey?.keyValue || "",
        receiverNonce: payload.hiRequest?.keyMaterial?.nonce || "",
        careContexts: payload.notification?.consentDetail?.careContexts || payload.notification?.careContexts || [],
        unmatchedConsentContext: type === "Consent Notification" && !matchMeta?.tx,
        currentState: "Created"
      });
    } else {`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content, 'utf8');
console.log('Patched tx creation.');
