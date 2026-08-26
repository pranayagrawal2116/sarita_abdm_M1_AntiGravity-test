const storage = require('./backend/m3/services/m3PatientStorageService.js');
console.log("Saving...");
storage.saveM3File('saurav_50505@sbx_Saurav_Kumar', '152f0ba4-9e74-418d-b9b2-5c075834ce74', 'VIBE_CLINIC', 'HealthData_123.json', '{}');
console.log("Done.");
