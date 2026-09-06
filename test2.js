const hipLinkingController = require("./backend/controllers/hipLinkingController");
const reqLink = {
  body: {
    hipId: "TEST",
    linkToken: "token",
    AbhaAddress: "patientA@sbx",
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
  status: (c) => { res.code = c; return res; },
  json: (d) => { console.log(res.code, d); return res; }
};
hipLinkingController.linkCareContext(reqLink, res);
