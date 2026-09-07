const fs = require('fs');
const file = 'backend/m2/routes/m2CallbackRoutes.js';
let content = fs.readFileSync(file, 'utf8');

// Add require
if (!content.includes('GatewayAuthMiddleware')) {
    content = content.replace(
        'const M2CallbackController = require("../controllers/m2CallbackController");',
        'const M2CallbackController = require("../controllers/m2CallbackController");\nconst GatewayAuthMiddleware = require("../../middlewares/GatewayAuthMiddleware");'
    );
}

// Routes to protect:
// /api/v3/consent/request/hip/notify
// /api/v3/consent/request/on-init
// /api/v3/consent/request/on-status
// /api/v3/health-information/hip/request
// /api/v3/health-information/notify

const replacements = [
    {
        find: '  M2CallbackController.onHipConsentNotify);',
        replace: '  GatewayAuthMiddleware,\n  M2CallbackController.onHipConsentNotify);'
    },
    {
        find: '  M2CallbackController.onConsentRequestInit);',
        replace: '  GatewayAuthMiddleware,\n  M2CallbackController.onConsentRequestInit);'
    },
    {
        find: '  M2CallbackController.onConsentRequestStatus);',
        replace: '  GatewayAuthMiddleware,\n  M2CallbackController.onConsentRequestStatus);'
    },
    {
        find: '  M2CallbackController.handleHipRequest);',
        replace: '  GatewayAuthMiddleware,\n  M2CallbackController.handleHipRequest);'
    },
    {
        find: '  M2CallbackController.onHealthInformationNotify);',
        replace: '  GatewayAuthMiddleware,\n  M2CallbackController.onHealthInformationNotify);'
    }
];

replacements.forEach(r => {
    content = content.replace(r.find, r.replace);
});

fs.writeFileSync(file, content);
console.log("Patched M2");
