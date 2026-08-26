const M3ConsentService = require('./backend/m3/services/m3ConsentService');
(async () => {
  try {
    const result = await M3ConsentService.requestHealthInformation("924fc90d-9055-4f21-a321-84643ab7b46c", "saurav_50505@sbx");
    console.log("SUCCESS:", result);
  } catch (e) {
    console.error("FAILED:", e.message);
  }
})();
