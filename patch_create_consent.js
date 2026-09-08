const fs = require('fs');
const file = 'backend/m2/consent/M2ConsentManager.js';
let code = fs.readFileSync(file, 'utf8');

const replacement = `
      await M2TransactionStore.appendAuditEvent(tx.transactionId, "CONSENT_CREATED", "Consent request initialized and persisted locally.", {
        consentId: tx.consentId,
        status: "Requested"
      });

      // 5. Send ACTUAL Consent Request to ABDM Gateway
      const timestamp = new Date().toISOString();
      const gatewayHeaders = getHeaders(token, tx.requestId, timestamp);
      const hiuId = process.env.HIU_ID || hospitalConfig.hiuId || "Sub_HIU";

      const gatewayPayload = {
        requestId: tx.requestId,
        timestamp,
        consent: {
          purpose: {
            text: consentData.purpose?.text || "Care Management",
            code: consentData.purpose?.code || "CAREMGT",
            refUri: consentData.purpose?.refUri || "https://www.mciindia.org"
          },
          patient: {
            id: tx.patientId
          },
          hiu: {
            id: hiuId
          },
          requester: {
            name: "Dr. Manjula",
            identifier: {
              type: "REGNO",
              value: "MH1001",
              system: "https://www.mciindia.org"
            }
          },
          hiTypes: consentData.hiTypes && consentData.hiTypes.length > 0 ? consentData.hiTypes : ["OPCONSULTATION"],
          permission: {
            accessMode: "VIEW",
            dateRange: {
              from: consentData.dateRange?.from ? new Date(consentData.dateRange.from).toISOString() : new Date(Date.now() - 365*24*60*60*1000).toISOString(),
              to: consentData.dateRange?.to ? new Date(consentData.dateRange.to).toISOString() : new Date().toISOString()
            },
            dataEraseAt: consentData.expiry ? new Date(consentData.expiry).toISOString() : new Date(Date.now() + 30*24*60*60*1000).toISOString(),
            frequency: {
              unit: "HOUR",
              value: 0,
              repeats: 0
            }
          }
        }
      };

      if (consentData.careContexts && consentData.careContexts.length > 0) {
        gatewayPayload.consent.careContexts = consentData.careContexts;
      }

      Logger.info("M2ConsentManager", "Dispatching Consent Request to ABDM Gateway", { url: \`\${config.gatewayBaseUrl}/api/hiecm/consent/v3/request/init\` });
      
      const response = await axios.post(
        \`\${config.gatewayBaseUrl}/api/hiecm/consent/v3/request/init\`,
        gatewayPayload,
        { headers: gatewayHeaders }
      );

      await M2TransactionStore.appendAuditEvent(tx.transactionId, "CONSENT_GATEWAY_DISPATCHED", "Gateway accepted consent initialization.", {
        statusCode: response.status
      });

      Logger.info("M2ConsentManager", "Consent record created successfully.", { consentId: tx.consentId });
      return consentObj;
`;

code = code.replace(/await M2TransactionStore\.appendAuditEvent\(tx\.transactionId, "CONSENT_CREATED"[\s\S]*?return consentObj;/m, replacement);
fs.writeFileSync(file, code);
