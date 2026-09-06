const fs = require('fs');
let file = 'backend/m2/storage/PatientStorageService.js';
let content = fs.readFileSync(file, 'utf8');

const replacement = `const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, filePath);`;

content = content.replace(/fs\.writeFileSync\(filePath, content, 'utf8'\);/, replacement);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched PatientStorageService for atomic writes');
