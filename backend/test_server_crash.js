const m3 = require("./m3/controllers/m3ConsentController.js");

const req = {
  body: {
    "patientId": "saurav_50505@sbx",
    "requesterName": "Sarita",
    "purpose": "Care Management",
    "hiTypes": ["DiagnosticReport"],
    "dateFrom": "2025-08-13T15:43:00.000Z",
    "dateTo": "2026-08-13T15:43:00.000Z",
    "dateEraseAt": "2026-08-29T15:43:00.000Z"
  }
};

const res = {
  status: function(code) {
    console.log("STATUS", code);
    return this;
  },
  json: function(data) {
    console.log("JSON", data);
  }
};

m3.initConsentRequest(req, res).then(() => console.log("DONE")).catch(e => console.error("CRASH", e));
