const crypto = require("crypto");
const elliptic = require("elliptic");
const hash = require("hash.js");

// Initialize and register Wei25519 short Weierstrass Curve25519 parameters in elliptic.curves
elliptic.curves.wei25519 = new elliptic.curves.PresetCurve({
  type: "short",
  prime: "p25519",
  p: "7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed",
  a: "2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa984914a144",
  b: "7b425ed097b425ed097b425ed097b425ed097b425ed097b4260b5e9c7710c864",
  n: "1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed",
  g: [
    "2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaad245a",
    "20ae19a1b8a086b4e01edd2c7748d14c923d4d7e6d7c61b229e9c5a27eced3d9"
  ],
  hash: hash.sha256
});

const ec = new elliptic.ec("wei25519");

/**
 * Fallback HKDF-SHA256 implementation to ensure Node.js compatibility across versions.
 */
const hkdfSha256 = (secret, salt, info, length) => {
  const prk = crypto.createHmac("sha256", salt).update(secret).digest();
  const infoBuffer = Buffer.from(info || "");
  const okm = Buffer.alloc(length);
  let t = Buffer.alloc(0);
  let offset = 0;
  let counter = 1;
  while (offset < length) {
    const hmac = crypto.createHmac("sha256", prk);
    hmac.update(t);
    hmac.update(infoBuffer);
    hmac.update(Buffer.from([counter]));
    t = hmac.digest();
    t.copy(okm, offset);
    offset += t.length;
    counter++;
  }
  return okm;
};

/**
 * Encrypts FHIR Bundle using ECDH (Curve25519 Short Weierstrass) + AES-GCM-256.
 *
 * @param {string} plaintextPlain Plaintext data (e.g. JSON string)
 * @param {string} receiverPublicKeyBase64 Base64 uncompressed public key from HIU
 * @param {string} receiverNonceBase64 Base64 32-byte nonce from HIU
 */
exports.encrypt = (plaintextPlain, receiverPublicKeyBase64, receiverNonceBase64) => {
  if (!receiverPublicKeyBase64) {
    throw new Error("HIU public key is required for ABDM ECDH encryption.");
  }
  if (!receiverNonceBase64) {
    throw new Error("HIU nonce is required for ABDM ECDH encryption.");
  }

  // 1. Load receiver public key (HIU)
  let receiverPublicKeyBuffer;
  try {
    receiverPublicKeyBuffer = Buffer.from(receiverPublicKeyBase64, "base64");
    // If the uncompressed format byte 0x04 is missing, prepend it (64 bytes -> 65 bytes)
    if (receiverPublicKeyBuffer.length === 64) {
      receiverPublicKeyBuffer = Buffer.concat([Buffer.from([0x04]), receiverPublicKeyBuffer]);
    }
    // Test if parsing is valid
    ec.keyFromPublic(receiverPublicKeyBuffer);
  } catch (err) {
    throw new Error(`Invalid HIU Curve25519 public key: ${err.message}`);
  }
  
  const receiverKey = ec.keyFromPublic(receiverPublicKeyBuffer);
  
  // 2. Generate our ephemeral keypair (HIP)
  const ourKey = ec.genKeyPair();
  const ourPublicKeyBuffer = Buffer.from(ourKey.getPublic().encode("array", false));
  const ourPublicKeyBase64 = ourPublicKeyBuffer.toString("base64");
  
  // 3. Generate our 32-byte random nonce
  const ourNonce = crypto.randomBytes(32);
  const ourNonceBase64 = ourNonce.toString("base64");
  
  // 4. Calculate Shared Secret (X-coordinate of the DH point)
  const sharedSecret = Buffer.from(ourKey.derive(receiverKey.getPublic()).toArray("be", 32));
  
  // 5. XOR Nonces for salt and IV
  let receiverNonce;
  try {
    receiverNonce = Buffer.from(receiverNonceBase64, "base64");
    if (receiverNonce.length !== 32) {
      throw new Error(`expected 32 bytes, received ${receiverNonce.length}`);
    }
  } catch (err) {
    throw new Error(`Invalid HIU nonce: ${err.message}`);
  }
  
  const xorNonce = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    xorNonce[i] = ourNonce[i] ^ receiverNonce[i];
  }
  
  // Salt: first 20 bytes, IV: last 12 bytes
  const salt = xorNonce.subarray(0, 20);
  const iv = xorNonce.subarray(20, 32);
  
  // 6. Derive 32-byte AES key using HKDF-SHA256
  const aesKey = hkdfSha256(sharedSecret, salt, Buffer.alloc(0), 32);
  
  // 7. Encrypt using AES-256-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  let ciphertext = cipher.update(plaintextPlain, "utf8");
  ciphertext = Buffer.concat([ciphertext, cipher.final()]);
  const tag = cipher.getAuthTag();
  
  // 8. Output is base64 of ciphertext + tag
  const encryptedContent = Buffer.concat([ciphertext, tag]).toString("base64");
  
  // 9. Checksum is SHA-256 hex of the base64-encoded encrypted content
  const checksum = crypto.createHash("sha256").update(encryptedContent).digest("hex");
  
  return {
    encryptedContent,
    checksum,
    ourPublicKey: ourPublicKeyBase64,
    ourNonce: ourNonceBase64
  };
};

/**
 * Decrypts encrypted FHIR content for HIU side verification testing.
 */
exports.decrypt = (encryptedContentBase64, receiverPrivateKeyBase64, senderPublicKeyBase64, senderNonceBase64, receiverNonceBase64) => {
  const receiverPrivateKey = ec.keyFromPrivate(Buffer.from(receiverPrivateKeyBase64, "base64"));
  
  let senderPublicKeyBuffer = Buffer.from(senderPublicKeyBase64, "base64");
  if (senderPublicKeyBuffer.length === 64) {
    senderPublicKeyBuffer = Buffer.concat([Buffer.from([0x04]), senderPublicKeyBuffer]);
  }
  const senderKey = ec.keyFromPublic(senderPublicKeyBuffer);
  
  const sharedSecret = Buffer.from(receiverPrivateKey.derive(senderKey.getPublic()).toArray("be", 32));
  
  const senderNonce = Buffer.from(senderNonceBase64, "base64");
  const receiverNonce = Buffer.from(receiverNonceBase64, "base64");
  
  const xorNonce = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    xorNonce[i] = senderNonce[i] ^ receiverNonce[i];
  }
  
  const salt = xorNonce.subarray(0, 20);
  const iv = xorNonce.subarray(20, 32);
  
  const aesKey = hkdfSha256(sharedSecret, salt, Buffer.alloc(0), 32);
  
  const rawBytes = Buffer.from(encryptedContentBase64, "base64");
  const ciphertext = rawBytes.subarray(0, rawBytes.length - 16);
  const tag = rawBytes.subarray(rawBytes.length - 16);
  
  const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, iv);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString("utf8");
};
