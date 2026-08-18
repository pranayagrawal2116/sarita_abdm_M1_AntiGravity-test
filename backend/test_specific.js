const m3 = require("./m3/services/m3ConsentService.js");
async function run() {
  try {
    const res = await m3.initConsentRequest({
      patientId: "Saurav_50505@sbx",
      requesterName: "Sarita",
      purpose: "Care Management",
      hiTypes: [
        "DiagnosticReport",
        "Prescription",
        "OPConsultation",
        "DischargeSummary",
        "ImmunizationRecord",
        "HealthDocumentRecord",
        "WellnessRecord",
        "Invoice"
      ],
      dateFrom: "2025-08-13T10:19:45.193984Z",
      dateTo: "2026-08-13T10:19:45.194738Z",
      dateEraseAt: "2026-08-29T10:19:00.000Z"
    });
    console.log("SUCCESS", res);
  } catch (e) {
    console.error("FAIL", e.message);
  }
}
run();
