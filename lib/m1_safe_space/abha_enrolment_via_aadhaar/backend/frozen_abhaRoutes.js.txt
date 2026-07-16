// @ts-nocheck

const express = require("express");
const router = express.Router();
const controller = require("../controllers/AbhaController");

router.post("/request-otp", controller.requestOtp);
router.post("/verify-otp", controller.verifyOtp);
router.post("/phr/suggestions", controller.getPhrSuggestions);
router.post("/phr/check", controller.checkPhrAvailability);
router.post("/phr/link", controller.linkPhrAddress);
router.post("/search/mobile", controller.searchAbhaByMobile);
router.post("/verification/request-otp", controller.requestVerificationOtp);
router.post("/verification/verify-otp", controller.verifyVerificationOtp);
router.post("/verification/mobile/verify-user", controller.verifyVerificationMobileUser);
router.post("/login/search", controller.searchLoginAuthMethods);
router.post("/login/request-otp", controller.requestLoginOtp);
router.post("/login/verify-otp", controller.verifyLoginOtp);
router.get("/profile/me", controller.getLoggedInProfile);
router.get("/profile/enrollment/details", controller.getEnrollmentProfileDetails);
router.get("/profile/phr-card", controller.downloadPhrCard);
router.get("/profile/account-card", controller.downloadProfileAccountCard);
router.post("/profile/update-mobile/request-otp", controller.requestProfileMobileUpdateOtp);
router.post("/profile/update-mobile/verify-otp", controller.verifyProfileMobileUpdateOtp);
router.patch("/profile/account", controller.updateProfileAccount);

module.exports = router;
