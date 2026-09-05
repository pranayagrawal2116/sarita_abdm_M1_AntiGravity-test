const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

async function testConsentInit() {
  try {
    // 1. Fetch token
    const tokenRes = await axios.post('https://dev.abdm.gov.in/gateway/v0.5/sessions', {
      clientId: process.env.ABDM_CLIENT_ID || "REPLACE_ME_CLIENT_ID",
      clientSecret: process.env.ABDM_CLIENT_SECRET || "REPLACE_ME_CLIENT_SECRET",
      grantType: "client_credentials"
    }, {
      headers: {
        "Content-Type": "application/json",
        "REQUEST-ID": uuidv4(),
        "TIMESTAMP": new Date().toISOString()
      }
    });

    const token = tokenRes.data.accessToken;

    const payload = {
        requestId: uuidv4(),
        timestamp: new Date().toISOString(),
        consent: {
          purpose: {
            text: "Care Management",
            code: "CAREMGT",
            refUri: "http://example.com/purpose"
          },
          patient: {
            id: "pranay_1200621@sbx"
          },
          hiu: {
            id: process.env.ABDM_CLIENT_ID || "REPLACE_ME_CLIENT_ID"
          },
          // Adding these explicitly as per Postman
          hip: null,
          careContexts: null,
          requester: {
            name: "Dr. Smith",
            identifier: {
              type: "REGNO",
              value: "MH1001",
              system: "https://www.mciindia.org"
            }
          },
          hiTypes: ["DiagnosticReport"],
          permission: {
            accessMode: "VIEW",
            dateRange: {
              from: new Date(Date.now() - 86400000).toISOString(),
              to: new Date().toISOString()
            },
            dataEraseAt: new Date(Date.now() + 86400000).toISOString(),
            frequency: {
              unit: "HOUR",
              value: 0,
              repeats: 0
            }
          }
        }
      };

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "REQUEST-ID": payload.requestId,
      "TIMESTAMP": payload.timestamp,
      "X-CM-ID": "sbx"
    };

    const res = await axios.post('https://dev.abdm.gov.in/api/hiecm/consent/v3/request/init', payload, { headers });
    console.log("SUCCESS", res.status, res.data);
  } catch (error) {
    if (error.response) {
      console.error("ABDM ERROR RESPONSE:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error("OTHER ERROR:", error.message);
    }
  }
}

testConsentInit();
