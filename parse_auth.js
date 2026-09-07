const fs = require('fs');

const extract = (filePath, name) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const results = [];
  lines.forEach((line, i) => {
    if (/(Authorization|X-AUTH-TOKEN|JWT|JWKS|Keycloak|certs)/i.test(line)) {
      results.push(`[${name}:${i}] ${line.trim()}`);
    }
  });
  console.log(`--- ${name} ---`);
  console.log(results.slice(0, 30).join('\n'));
};

extract('./lib/m1_safe_space/current_app/project/documentation/MileStoneDocumentation/Scan_and_share_Document_03_03_25_8c48f696e0.pdf.txt', 'SCAN_SHARE');
extract('./lib/m1_safe_space/current_app/project/documentation/MileStoneDocumentation/Updated_M2_Document_07_04_2025_97225f4af2.pdf.txt', 'M2');
extract('./lib/m1_safe_space/current_app/project/documentation/MileStoneDocumentation/M3_Dcoument_03_03_2025_faf0c9aecb.pdf.txt', 'M3');

