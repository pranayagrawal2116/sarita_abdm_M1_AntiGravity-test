const M2CallbackManager = require('./m2/callbacks/M2CallbackManager');

const tx = {
  callbackHistory: [{
    timestamp: Date.now(),
    type: "Health Information Request",
    requestId: "req-123"
  }],
  auditHistory: [{
    timestamp: Date.now(),
    eventType: "STATE_TRANSITION",
    details: { requestId: "req-123", source: "Official HIP Health Information Response" }
  }]
};

console.log("Is duplicate?", M2CallbackManager.detectDuplicate(tx, "req-123"));
