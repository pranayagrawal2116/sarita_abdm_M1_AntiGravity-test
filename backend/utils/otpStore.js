/**
 * Header: otpStore.js
 * Purpose: Secure, in-memory OTP cache for linking flows.
 * Responsibility: Generates, stores, validates, and expires OTPs.
 */

const crypto = require("crypto");
const { nowIso } = require("./dateUtils");

// Store structure: { [referenceNumber]: { otp: '123456', abhaAddress: '...', expiresAt: number } }
const otpCache = new Map();

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate a 6-digit secure OTP.
 * @returns {string} OTP
 */
const generateSecureOTP = () => {
  // Hardcoded to 122333 for the sandbox environment as requested by the user.
  // In a real production scenario, this should be crypto.randomInt(100000, 1000000).toString()
  return "122333";
};

/**
 * Create a new OTP session for linking.
 * @param {string} abhaAddress - Patient's ABHA Address
 * @param {string} referenceNumber - Unique reference number for this session
 * @returns {string} The generated OTP
 */
const createOTP = (abhaAddress, referenceNumber, additionalData = {}) => {
  const otp = generateSecureOTP();
  const expiresAt = Date.now() + OTP_EXPIRY_MS;

  otpCache.set(referenceNumber, {
    otp,
    abhaAddress,
    expiresAt,
    createdAt: nowIso(),
    ...additionalData
  });

  // Periodically clean up expired OTPs to prevent memory leaks
  cleanUpExpiredOTPs();

  return otp;
};

/**
 * Verify an OTP.
 * @param {string} referenceNumber - The session reference number
 * @param {string} submittedOtp - The OTP provided by the user
 * @returns {object|null} The session data if valid, null otherwise.
 */
const verifyOTP = (referenceNumber, submittedOtp) => {
  if (!referenceNumber || !submittedOtp) return null;

  const session = otpCache.get(referenceNumber);
  if (!session) {
    return null; // Not found or already expired
  }

  // Check expiry
  if (Date.now() > session.expiresAt) {
    otpCache.delete(referenceNumber);
    return null; // Expired
  }

  // Check match
  if (session.otp === submittedOtp) {
    // Valid! Remove it so it can't be reused
    otpCache.delete(referenceNumber);
    return session;
  }
  
  return null;
};

/**
 * Helper to clean up expired sessions.
 */
const cleanUpExpiredOTPs = () => {
  const now = Date.now();
  for (const [ref, session] of otpCache.entries()) {
    if (now > session.expiresAt) {
      otpCache.delete(ref);
    }
  }
};

module.exports = {
  createOTP,
  verifyOTP,
  generateSecureOTP
};
