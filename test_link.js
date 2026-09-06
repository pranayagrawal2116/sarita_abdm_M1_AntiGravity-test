const hipLinkingController = require("./backend/controllers/hipLinkingController");
const axios = require("axios");
const originalPost = axios.post;
let capturedPayload = null;
axios.post = async (url, payload, config) => {
  capturedPayload = payload;
  return { status: 202, data: {} };
};

const reqLink = {
  body: {
    hipId: "TEST",
    linkToken: "token",
    patient: [
      {
        referenceNumber: "patient-ref-A",
        display: "Patient A",
        careContexts: [
          { referenceNumber: "cc-1234", display: "Visit 1", hiTypes: ["OPConsultation"] }
        ]
      }
    ]
  },
  header: () => ""
};
const res = {
  status: (code) => { console.log("Status:", code); return res; },
  json: (data) => { console.log("Response:", data); return res; }
};
hipLinkingController.linkCareContext(reqLink, res).then(() => {
  console.log("Payload:", JSON.stringify(capturedPayload, null, 2));
});
