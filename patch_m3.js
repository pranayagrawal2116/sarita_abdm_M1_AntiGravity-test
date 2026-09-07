const fs = require('fs');
const file = 'backend/m3/routes/m3CallbackRoutes.js';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('GatewayAuthMiddleware')) {
    content = content.replace(
        'const M3CallbackController = require("../controllers/m3CallbackController");',
        'const M3CallbackController = require("../controllers/m3CallbackController");\nconst GatewayAuthMiddleware = require("../../middlewares/GatewayAuthMiddleware");'
    );
}

const replacements = [
    {
        find: '], M3CallbackController.onConsentInit);',
        replace: '], GatewayAuthMiddleware, M3CallbackController.onConsentInit);'
    },
    {
        find: '], M3CallbackController.hiuNotify);',
        replace: '], GatewayAuthMiddleware, M3CallbackController.hiuNotify);'
    },
    {
        find: '], M3CallbackController.onConsentFetch);',
        replace: '], GatewayAuthMiddleware, M3CallbackController.onConsentFetch);'
    },
    {
        find: '], M3CallbackController.onHealthInfoRequest);',
        replace: '], GatewayAuthMiddleware, M3CallbackController.onHealthInfoRequest);'
    },
    {
        find: '], M3CallbackController.healthInfoTransfer);',
        replace: '], GatewayAuthMiddleware, M3CallbackController.healthInfoTransfer);'
    }
];

replacements.forEach(r => {
    content = content.replace(r.find, r.replace);
});

fs.writeFileSync(file, content);
console.log("Patched M3");
