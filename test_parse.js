
const fs = require('fs');
const filePath = './saurav_50505@sbx_Saurav_Kumar/Other_hospital_data/HIP_Data/HealthData_fee14a0c-c87f-41f0-b506-b17d06d8a9a1_1787156366249.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
console.log(data.entries.length);
