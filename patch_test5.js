const fs = require('fs');
let f1 = 'backend/tests/scanShareReplayIdempotency.test.js';
let c1 = fs.readFileSync(f1, 'utf8');

const replaceStr = `axios.post = async (url, payload, options) => {
    if (url.includes("/sessions")) {
        return { data: { accessToken: "mock-token" } };
    }
    if (url.includes("/on-share")) {
        ackCallCount++;
        // Simulate network delay to test concurrency
        await new Promise(r => setTimeout(r, 200));
        return { data: { message: "ACK" } };
    }
    return originalPost(url, payload, options);
};`;

c1 = c1.replace(/axios\.post = async \(url, payload, options\) => {[\s\S]*?return originalPost\(url, payload, options\);\n};/, replaceStr);
fs.writeFileSync(f1, c1);
console.log("Patched correctly");
