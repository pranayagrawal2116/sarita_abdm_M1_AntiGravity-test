const express = require('express');
const router = express.Router();
const UserInitController = require('./controllers/UserInitController');

// Gateway Callbacks (HIE-CM -> HIP)
router.post(
  [
    "/api/v3/hip/patient/care-context/discover",
    "/v3/hip/patient/care-context/discover"
  ],
  UserInitController.handleDiscover
);

router.post(
  [
    "/api/v3/hip/link/care-context/init",
    "/v3/hip/link/care-context/init"
  ],
  UserInitController.handleLinkInit
);

router.post(
  [
    "/api/v3/hip/link/care-context/confirm",
    "/v3/hip/link/care-context/confirm"
  ],
  UserInitController.handleLinkConfirm
);

module.exports = router;
