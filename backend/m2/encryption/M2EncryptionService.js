/**
 * Header: M2EncryptionService.js
 * Purpose: Performs Elliptic Curve Diffie-Hellman (ECDH) Weierstrass key agreement and AES-GCM data encryption/decryption.
 * Responsibility: Expose interfaces for encrypting and decrypting FHIR packets stateless and securely.
 * Methods:
 *   - generateKeyMaterial()
 *   - encryptBundle(plaintext, receiverPublicKey, receiverNonce, senderPrivateKey, senderNonce)
 *   - decryptBundle(ciphertext, receiverPrivateKey, senderPublicKey, senderNonce, receiverNonce)
 *   - validateEncryptionInput(plaintext, receiverPublicKey, receiverNonce)
 *   - validateDecryptionInput(ciphertext, receiverPrivateKey, senderPublicKey, senderNonce, receiverNonce)
 *   - compareBundles(bundle1, bundle2)
 */

const crypto = require("crypto");
const elliptic = require("elliptic");
const hash = require("hash.js");
const Logger = require("../logging/logger");

// 1. Initialize Short Weierstrass curve25519 parameters for Bouncy Castle compatibility
if (!elliptic.curves.wei25519) {
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
}
const ec = new elliptic.ec("wei25519");

/**
 * HKDF-SHA256 derivation provider.
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

class M2EncryptionService {
  /**
   * Generates stateless encryption key materials.
   * @returns {Object} Private key (Base64), Public key (Base64 uncompressed Weierstrass), Nonce (Base64).
   */
  static generateKeyMaterial() {
    Logger.info("M2EncryptionService", "Generating ephemeral key material.");
    try {
      const keypair = ec.genKeyPair();
      const privateKey = Buffer.from(keypair.getPrivate().toArray("be", 32)).toString("base64");
      
      const uncompressedPoint = Buffer.from(keypair.getPublic().encode("array", false));
      // ABDM Curve25519 X.509 SPKI ASN.1 Header
      const asn1Header = Buffer.from("305b301506072a8648ce3d0201060a2b060104019755010501034200", "hex");
      const publicKey = Buffer.concat([asn1Header, uncompressedPoint]).toString("base64");
      
      const nonce = crypto.randomBytes(32).toString("base64");

      return {
        privateKey,
        publicKey,
        nonce
      };
    } catch (err) {
      Logger.error("M2EncryptionService", "Key material generation failed.", err);
      throw err;
    }
  }

  /**
   * Encructs plain FHIR plaintext using Weierstrass Curve25519 and AES-GCM-256.
   * @param {string} plaintext - Plaintext data string.
   * @param {string} receiverPublicKey - Public key of receiver (Base64).
   * @param {string} receiverNonce - Nonce of receiver (Base64).
   * @param {string} [senderPrivateKey] - Optional custom sender private key.
   * @param {string} [senderNonce] - Optional custom sender nonce.
   * @returns {Object} Combined encryption payload payload details.
   */
  static encryptBundle(plaintext, receiverPublicKey, receiverNonce, senderPrivateKey = null, senderNonce = null) {
    const startTime = Date.now();
    Logger.info("M2EncryptionService", "Starting encryption workflow.");

    // Validate inputs
    const validation = this.validateEncryptionInput(plaintext, receiverPublicKey, receiverNonce);
    if (!validation.isValid) {
      throw new Error(`Invalid encryption input: ${validation.reason}`);
    }

    try {
      // 1. Load or generate sender keys
      let ourKey;
      let ourPrivateKeyBase64;
      let ourPublicKeyBase64;
      let ourNonceBase64;
      let ourNonce;

      if (senderPrivateKey && senderNonce) {
        ourPrivateKeyBase64 = senderPrivateKey;
        ourKey = ec.keyFromPrivate(Buffer.from(senderPrivateKey, "base64"));
        const uncompressedPoint = Buffer.from(ourKey.getPublic().encode("array", false));
        const asn1Header = Buffer.from("305b301506072a8648ce3d0201060a2b060104019755010501034200", "hex");
        ourPublicKeyBase64 = Buffer.concat([asn1Header, uncompressedPoint]).toString("base64");
        ourNonceBase64 = senderNonce;
        ourNonce = Buffer.from(senderNonce, "base64");
      } else {
        ourKey = ec.genKeyPair();
        const uncompressedPoint = Buffer.from(ourKey.getPublic().encode("array", false));
        const asn1Header = Buffer.from("305b301506072a8648ce3d0201060a2b060104019755010501034200", "hex");
        ourPublicKeyBase64 = Buffer.concat([asn1Header, uncompressedPoint]).toString("base64");
        
        ourNonce = crypto.randomBytes(32);
        ourNonceBase64 = ourNonce.toString("base64");
      }

      // 2. Load receiver public key (uncompressed point format or X.509 SPKI)
      let receiverPublicKeyBuffer = Buffer.from(receiverPublicKey, "base64");
      if (receiverPublicKeyBuffer.length > 65) {
        // Mock Gateway occasionally sends an X.509 SPKI wrapped key. 
        // We strip the ASN.1 header and take the last 65 bytes (uncompressed point).
        receiverPublicKeyBuffer = receiverPublicKeyBuffer.subarray(receiverPublicKeyBuffer.length - 65);
      } else if (receiverPublicKeyBuffer.length === 64) {
        // Add uncompressed point indicator if missing
        receiverPublicKeyBuffer = Buffer.concat([Buffer.from([0x04]), receiverPublicKeyBuffer]);
      }
      const receiverKey = ec.keyFromPublic(receiverPublicKeyBuffer);

      // 3. Perform ECDH key exchange
      const sharedSecret = Buffer.from(ourKey.derive(receiverKey.getPublic()).toArray("be", 32));

      // 4. Generate IV and Salt from XOR nonce mapping
      const recNonce = Buffer.from(receiverNonce, "base64");
      const xorNonce = Buffer.alloc(32);
      for (let i = 0; i < 32; i++) {
        xorNonce[i] = ourNonce[i] ^ recNonce[i];
      }

      const salt = xorNonce.subarray(0, 20);
      const iv = xorNonce.subarray(20, 32);

      // 5. Derive AES-256 key using HKDF-SHA256
      const aesKey = hkdfSha256(sharedSecret, salt, Buffer.alloc(0), 32);

      // 6. Encrypt plaintext payload with AES-256-GCM
      const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
      let ciphertext = cipher.update(plaintext, "utf8");
      ciphertext = Buffer.concat([ciphertext, cipher.final()]);
      const tag = cipher.getAuthTag();

      // Combined package: ciphertext bytes + 16-byte tag
      const encryptedPayload = Buffer.concat([ciphertext, tag]).toString("base64");
      const checksum = crypto.createHash("sha256").update(encryptedPayload).digest("hex");

      const duration = Date.now() - startTime;
      Logger.info("M2EncryptionService", "Encryption completed successfully.", { durationMs: duration });

      return {
        encryptedPayload,
        keyToShare: ourPublicKeyBase64,
        senderPublicKey: ourPublicKeyBase64,
        senderNonce: ourNonceBase64,
        metadata: {
          checksum,
          algorithm: "ECDH-AES256GCM",
          curve: "curve25519"
        },
        validationStatus: { isValid: true }
      };
    } catch (err) {
      Logger.error("M2EncryptionService", "Encryption workflow failed.", err);
      throw new Error(`Encryption failed: ${err.message}`);
    }
  }

  /**
   * Decrypts AES-GCM payload using receiver private keys.
   * @param {string} ciphertext - Encrypted Base64 content (ciphertext + tag).
   * @param {string} receiverPrivateKey - Private key of receiver (Base64).
   * @param {string} senderPublicKey - Public key of sender (Base64).
   * @param {string} senderNonce - Nonce of sender (Base64).
   * @param {string} receiverNonce - Nonce of receiver (Base64).
   * @returns {string} Decrypted plaintext string.
   */
  static decryptBundle(ciphertext, receiverPrivateKey, senderPublicKey, senderNonce, receiverNonce) {
    const startTime = Date.now();
    Logger.info("M2EncryptionService", "Starting decryption workflow.");

    // Validate inputs
    const validation = this.validateDecryptionInput(ciphertext, receiverPrivateKey, senderPublicKey, senderNonce, receiverNonce);
    if (!validation.isValid) {
      throw new Error(`Invalid decryption input: ${validation.reason}`);
    }

    try {
      // 1. Load keys
      const recPrivateKey = ec.keyFromPrivate(Buffer.from(receiverPrivateKey, "base64"));
      
      // 2. Load sender public key (uncompressed point format or X.509 SPKI)
      let senderPublicKeyBuffer = Buffer.from(senderPublicKey, "base64");
      if (senderPublicKeyBuffer.length > 65) {
        senderPublicKeyBuffer = senderPublicKeyBuffer.subarray(senderPublicKeyBuffer.length - 65);
      } else if (senderPublicKeyBuffer.length === 64) {
        // Add uncompressed point indicator if missing
        senderPublicKeyBuffer = Buffer.concat([Buffer.from([0x04]), senderPublicKeyBuffer]);
      }
      const senderKey = ec.keyFromPublic(senderPublicKeyBuffer);

      // 2. Compute shared secret
      const sharedSecret = Buffer.from(recPrivateKey.derive(senderKey.getPublic()).toArray("be", 32));

      // 3. XOR nonces
      const sendNonce = Buffer.from(senderNonce, "base64");
      const recNonce = Buffer.from(receiverNonce, "base64");
      const xorNonce = Buffer.alloc(32);
      for (let i = 0; i < 32; i++) {
        xorNonce[i] = sendNonce[i] ^ recNonce[i];
      }

      const salt = xorNonce.subarray(0, 20);
      const iv = xorNonce.subarray(20, 32);

      // 4. Derive AES-256 key using HKDF-SHA256
      const aesKey = hkdfSha256(sharedSecret, salt, Buffer.alloc(0), 32);

      // 5. Decrypt payload using AES-256-GCM
      const rawBytes = Buffer.from(ciphertext, "base64");
      if (rawBytes.length < 16) {
        throw new Error("Ciphertext length must be at least 16 bytes (auth tag).");
      }
      const ciphertextBytes = rawBytes.subarray(0, rawBytes.length - 16);
      const tag = rawBytes.subarray(rawBytes.length - 16);

      const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(ciphertextBytes);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      const duration = Date.now() - startTime;
      Logger.info("M2EncryptionService", "Decryption completed successfully.", { durationMs: duration });

      return decrypted.toString("utf8");
    } catch (err) {
      Logger.error("M2EncryptionService", "Decryption workflow failed.", err);
      throw new Error(`Decryption failed: ${err.message}`);
    }
  }

  /**
   * Assures validation checks for encryption inputs.
   */
  static validateEncryptionInput(plaintext, receiverPublicKey, receiverNonce) {
    if (!plaintext || typeof plaintext !== "string") {
      return { isValid: false, reason: "Plaintext must be a non-empty string." };
    }
    if (!receiverPublicKey || typeof receiverPublicKey !== "string") {
      return { isValid: false, reason: "Receiver public key must be a non-empty base64 string." };
    }
    if (!receiverNonce || typeof receiverNonce !== "string") {
      return { isValid: false, reason: "Receiver nonce must be a non-empty base64 string." };
    }
    try {
      Buffer.from(receiverPublicKey, "base64");
      Buffer.from(receiverNonce, "base64");
    } catch (_) {
      return { isValid: false, reason: "Public key or nonce contains invalid base64 encoding." };
    }
    return { isValid: true };
  }

  /**
   * Assures validation checks for decryption inputs.
   */
  static validateDecryptionInput(ciphertext, receiverPrivateKey, senderPublicKey, senderNonce, receiverNonce) {
    if (!ciphertext || typeof ciphertext !== "string") {
      return { isValid: false, reason: "Ciphertext must be a non-empty base64 string." };
    }
    if (!receiverPrivateKey || typeof receiverPrivateKey !== "string") {
      return { isValid: false, reason: "Receiver private key must be a non-empty base64 string." };
    }
    if (!senderPublicKey || typeof senderPublicKey !== "string") {
      return { isValid: false, reason: "Sender public key must be a non-empty base64 string." };
    }
    if (!senderNonce || typeof senderNonce !== "string") {
      return { isValid: false, reason: "Sender nonce must be a non-empty base64 string." };
    }
    if (!receiverNonce || typeof receiverNonce !== "string") {
      return { isValid: false, reason: "Receiver nonce must be a non-empty base64 string." };
    }
    try {
      Buffer.from(ciphertext, "base64");
      Buffer.from(receiverPrivateKey, "base64");
      Buffer.from(senderPublicKey, "base64");
      Buffer.from(senderNonce, "base64");
      Buffer.from(receiverNonce, "base64");
    } catch (_) {
      return { isValid: false, reason: "One or more inputs contain invalid base64 encoding." };
    }
    return { isValid: true };
  }

  /**
   * Compares two bundles for deep structural equality.
   * @param {Object|string} bundle1 - Original bundle.
   * @param {Object|string} bundle2 - Decrypted bundle.
   * @returns {boolean} Equality status.
   */
  static compareBundles(bundle1, bundle2) {
    Logger.info("M2EncryptionService", "Comparing two bundles for structural equality.");
    
    const deepEquals = (a, b) => {
      if (a === b) return true;
      if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
      
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      
      for (const key of keysA) {
        if (!keysB.includes(key)) return false;
        if (!deepEquals(a[key], b[key])) return false;
      }
      return true;
    };

    try {
      const obj1 = typeof bundle1 === "string" ? JSON.parse(bundle1) : bundle1;
      const obj2 = typeof bundle2 === "string" ? JSON.parse(bundle2) : bundle2;
      return deepEquals(obj1, obj2);
    } catch (err) {
      Logger.error("M2EncryptionService", "Failed to parse or compare bundles.", err);
      return false;
    }
  }
}

module.exports = M2EncryptionService;
