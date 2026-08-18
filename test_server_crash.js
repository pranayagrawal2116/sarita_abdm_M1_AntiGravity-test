const axios = require('axios');
async function run() {
  try {
    const res = await axios.post('http://localhost:3000/api/m3/consent/init', {
      patientId: "saurav_50505@sbx",
      requesterName: "Sarita",
      purpose: "Care Management",
      hiTypes: ["DiagnosticReport"],
      dateFrom: "2025-08-13T15:43:00.000Z",
      dateTo: "2026-08-13T15:43:00.000Z",
      dateEraseAt: "2026-08-29T15:43:00.000Z"
    });
    console.log(res.data);
  } catch (err) {
    console.log("Axios error status:", err.response?.status);
    console.log("Axios error data:", err.response?.data);
    console.log("Axios message:", err.message);
  }
}
run();
