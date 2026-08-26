const fs = require('fs');
const file = '/Users/pranay/Documents/Development/AntigravityWork/sarita_abdm_M1_AntiGravity-test/backend/m2/transfer/M2DataTransferManager.js';
let content = fs.readFileSync(file, 'utf8');

// Restore the isDesktopApp variable for the filters
content = content.replace(/const isDesktopApp = true;/g, "const isDesktopApp = dataPushUrl && dataPushUrl.includes('/m3/');");

// But keep auto-push globally enabled!
content = content.replace("if (isDesktopApp) { // Enabled auto-push for M2 & M3", "if (true) { // Enabled auto-push globally");
// Wait, my previous replacement was "if (true) { // Enabled auto-push for M2 & M3"
content = content.replace("if (dataPushUrl && dataPushUrl.includes('/m3/')) { // Enabled auto-push for M2 & M3", "if (true) { // Enabled auto-push globally");
// Let me just replace the specific line
fs.writeFileSync(file, content);
console.log("Restored!");
