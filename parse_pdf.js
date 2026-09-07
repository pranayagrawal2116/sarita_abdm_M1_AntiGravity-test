const fs = require('fs');
const pdf = require('pdf-parse');
let dataBuffer = fs.readFileSync('./lib/m1_safe_space/current_app/project/documentation/MileStoneDocumentation/M3_Dcoument_03_03_2025_faf0c9aecb.pdf.txt');
pdf(dataBuffer).then(function(data) {
    fs.writeFileSync('./m3_doc.txt', data.text);
}).catch(console.error);
