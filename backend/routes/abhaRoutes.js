// @ts-nocheck

const express = require("express");
const rateLimit = require('express-rate-limit');
const router = express.Router();
const controller = require("../controllers/AbhaController");

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many OTP attempts from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/request-otp", otpLimiter, controller.requestOtp);
router.post("/verify-otp", otpLimiter, controller.verifyOtp);
router.post("/phr/suggestions", controller.getPhrSuggestions);
router.post("/phr/check", controller.checkPhrAvailability);
router.post("/phr/link", controller.linkPhrAddress);
router.post("/search/mobile", controller.searchAbhaByMobile);
router.post("/verification/request-otp", otpLimiter, controller.requestVerificationOtp);
router.post("/verification/verify-otp", otpLimiter, controller.verifyVerificationOtp);
router.post("/verification/mobile/verify-user", controller.verifyVerificationMobileUser);
router.post("/login/search", controller.searchLoginAuthMethods);
router.post("/login/request-otp", otpLimiter, controller.requestLoginOtp);
router.post("/login/verify-otp", otpLimiter, controller.verifyLoginOtp);
router.get("/profile/me", controller.getLoggedInProfile);
router.get("/profile/enrollment/details", controller.getEnrollmentProfileDetails);
router.get("/profile/phr-card", controller.downloadPhrCard);
router.get("/profile/account-card", controller.downloadProfileAccountCard);
router.post("/profile/update-mobile/request-otp", controller.requestProfileMobileUpdateOtp);
router.post("/profile/update-mobile/verify-otp", controller.verifyProfileMobileUpdateOtp);
router.patch("/profile/account", controller.updateProfileAccount);

module.exports = router;
