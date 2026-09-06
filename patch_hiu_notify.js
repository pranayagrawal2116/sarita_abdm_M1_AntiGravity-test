const fs = require('fs');
let file = 'backend/m2/controllers/m2CallbackController.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /await M2TransactionStore\.updateTransaction\(tx\.transactionId, \{[\s\S]*?bundles: Object\.keys\(bundles\)\.length > 0 \? bundles : tx\.bundles\s*\}\);\s*return res\.status\(202\)\.json\(\{ ok: true, transactionId: tx\.transactionId \}\);/m;

const replacement = `await M2TransactionStore.updateTransaction(tx.transactionId, {
        notifyCallback: payload,
        entries: entries,
        bundles: Object.keys(bundles).length > 0 ? bundles : tx.bundles
      });

      // PROMPT #7: HIU MUST NOTIFY GATEWAY AFTER RECEIVING DATA
      // If we received entries, we acted as the HIU receiving a data push.
      // We must notify the CM that we received it.
      if (entries.length > 0 && payload.entries) {
        try {
          const M2TokenManager = require("../tokens/M2TokenManager");
          const { getHeaders } = require("../helpers/headers");
          const axios = require("axios");

          const token = await M2TokenManager.getGatewayToken();
          const gatewayBase = process.env.GATEWAY_BASE || "https://dev.abdm.gov.in";
          const hiuId = process.env.HIU_ID || "HIU_ID";

          const statusResponses = entries.map(entry => ({
            careContextReference: entry.careContextReference || "default",
            hiStatus: "OK",
            description: "Health information received successfully"
          }));

          const notifyPayload = {
            requestId: require("crypto").randomUUID(),
            timestamp: new Date().toISOString(),
            notification: {
              consentId: tx.consentId,
              transactionId: tx.transactionId,
              doneAt: new Date().toISOString(),
              notifier: {
                type: "HIU",
                id: hiuId
              },
              statusNotification: {
                sessionStatus: "RECEIVED",
                hiuId: hiuId,
                statusResponses
              }
            }
          };

          await axios.post(
            \`\${gatewayBase}/api/hiecm/data-flow/v3/health-information/notify\`,
            notifyPayload,
            { headers: { ...getHeaders(token), "X-HIU-ID": hiuId } }
          );
          Logger.info("M2CallbackController", "Sent HIU Health Information Notify to Gateway (sessionStatus: RECEIVED, hiStatus: OK)");
        } catch (notifyErr) {
          Logger.error("M2CallbackController", "Failed to send HIU Health Information Notify to Gateway.", notifyErr);
        }
      }

      return res.status(202).json({ ok: true, transactionId: tx.transactionId });`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content, 'utf8');
console.log('Patched HIU notify in M2CallbackController');
