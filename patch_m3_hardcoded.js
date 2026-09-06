const fs = require('fs');

let file = 'backend/m3/services/m3ConsentService.js';
let content = fs.readFileSync(file, 'utf8');

// The requester is hardcoded. Let's make it configurable.
// hospitalConfig.requesterIdentifier || "MH1001"
// hospitalConfig.requesterSystem || "https://www.mciindia.org"

content = content.replace(
  /type: "REGNO",\s+value: "MH1001",\s+system: "https:\/\/www\.mciindia\.org"/g,
  `type: "REGNO",
              value: hospitalConfig.requesterIdentifier || payload.requesterIdentifier || "MH1001",
              system: hospitalConfig.requesterSystem || payload.requesterSystem || "https://www.mciindia.org"`
);

// We previously identified sample/hardcoded values such as: purpose = CAREMGT, refUri = example.com
content = content.replace(
  /code: "CAREMGT",\s+refUri: "http:\/\/example\.com",\s+display: "Care Management"/g,
  `code: payload.purposeCode || hospitalConfig.purposeCode || "CAREMGT",
            refUri: payload.purposeRefUri || hospitalConfig.purposeRefUri || "http://example.com",
            display: payload.purposeDisplay || hospitalConfig.purposeDisplay || "Care Management"`
);

fs.writeFileSync(file, content, 'utf8');
console.log("Patched hardcoded values in m3ConsentService.js");
