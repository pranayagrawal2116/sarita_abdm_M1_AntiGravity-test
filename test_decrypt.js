const fhirEncryptionService = require('./backend/services/fhirEncryptionService');
const crypto = require('crypto');
const elliptic = require('elliptic');
const ec = new elliptic.ec("wei25519");

// Generate HIU keys
const hiuKey = ec.genKeyPair();
const hiuPrivateKeyBase64 = Buffer.from(hiuKey.getPrivate().toArray("be", 32)).toString("base64");
const hiuPublicKeyBase64 = Buffer.from(hiuKey.getPublic().encode("array", false)).toString("base64");
const hiuNonceBase64 = crypto.randomBytes(32).toString("base64");

// Encrypt payload (Simulate HIP)
const plaintext = JSON.stringify({ resourceType: "Bundle", id: "123" });
const encrypted = fhirEncryptionService.encrypt(plaintext, hiuPublicKeyBase64, hiuNonceBase64);

console.log("Encrypted:", encrypted);

// Decrypt payload (Simulate HIU)
try {
  const decrypted = fhirEncryptionService.decrypt(
    encrypted.encryptedContent,
    hiuPrivateKeyBase64,
    encrypted.ourPublicKey,
    encrypted.ourNonce,
    hiuNonceBase64
  );
  console.log("Decrypted:", decrypted);
} catch (e) {
  console.error("Decryption failed:", e.message);
}
