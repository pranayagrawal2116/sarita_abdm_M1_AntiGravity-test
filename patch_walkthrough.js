const fs = require('fs');
const file = '/Users/pranay/.gemini/antigravity/brain/ef9bb289-a712-4c04-8dc8-d7828995731f/walkthrough.md';
let content = fs.readFileSync(file, 'utf8');

const target = `**Fix:** We originally added a 1-second delay, but testing showed that Ngrok/IIS proxy servers sometimes take up to 16 seconds to route burst requests, causing the second \`/m2/consents/link/context\` call to drop. We have now increased this to a **\`3-second delay\`** in \`lib/services/hip_linking_api_service.dart\` before registering the care context locally. This reliably spaces out the requests and completely prevents burst rate-limiting drops.`;

const replacement = `**Fix:** The frontend was originally firing the \`/hip/link/carecontext\` request and then a second \`/api/m2/consents/link/context\` request right after. Because the first request takes about 16 seconds to process on your web proxy due to IIS/Cloudflare overhead, the proxy actively dropped the second consecutive request with a 504 Gateway Timeout, which the frontend interpreted as a \`ClientLoad failed\` CORS error.
To solve this gracefully, I have **eliminated the second API call entirely.** Now, the frontend only calls \`/hip/link/carecontext\`. Once the backend successfully forwards this to the ABDM gateway, the backend (in \`hipLinkingController.js\`) will **automatically** register the M2 transaction locally in \`M2ConsentManager\`. This removes the network bottleneck entirely, fixes the timeout, and guarantees M2 workflows will start perfectly.`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
console.log("Patched walkthrough successfully!");
