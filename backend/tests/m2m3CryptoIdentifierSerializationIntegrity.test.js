const { v4: uuidv4 } = require('uuid');
const fhirEncryptionService = require('../services/fhirEncryptionService');
const M2EncryptionService = require('../m2/encryption/M2EncryptionService');
const elliptic = require("elliptic");
const crypto = require("crypto");

describe('Prompt #35 Crypto and Identifier Integrity', () => {

  it('1. Curve25519 Key Generation and 65-byte Representation', () => {
    const keyMaterial = M2EncryptionService.generateKeyMaterial();
    expect(keyMaterial.privateKey).toBeDefined();
    expect(keyMaterial.publicKey).toBeDefined();
    expect(keyMaterial.nonce).toBeDefined();
    
    // M2 outputs with ASN.1 header (93 bytes)
    const pubBuffer = Buffer.from(keyMaterial.publicKey, 'base64');
    expect(pubBuffer.length).toBe(93);
    
    // Test native 65-byte without header handling (M3 approach)
    const ec = new elliptic.ec("wei25519");
    const keyPair = ec.genKeyPair();
    const publicKeyBase64 = Buffer.from(keyPair.getPublic().encode("array", false)).toString("base64");
    expect(Buffer.from(publicKeyBase64, 'base64').length).toBe(65);
    expect(Buffer.from(publicKeyBase64, 'base64')[0]).toBe(0x04);
  });

  it('2. AES-GCM Encryption/Decryption Round-Trip without checksum', () => {
    const plaintext = JSON.stringify({ resourceType: "Bundle", type: "document" });
    
    const receiverKeyMaterial = M2EncryptionService.generateKeyMaterial();
    
    const encrypted = M2EncryptionService.encryptBundle(
      plaintext, 
      receiverKeyMaterial.publicKey, 
      receiverKeyMaterial.nonce
    );
    
    expect(encrypted.metadata.checksum).toBeUndefined(); // Verify checksum is removed

    // Decrypt using M3 fhirEncryptionService (simulating dataPush)
    const decrypted = fhirEncryptionService.decrypt(
      encrypted.encryptedPayload,
      receiverKeyMaterial.privateKey,
      encrypted.senderPublicKey,
      encrypted.senderNonce,
      receiverKeyMaterial.nonce
    );
    
    expect(decrypted).toBe(plaintext);
  });

  it('3. Modified Ciphertext Fails Authentication (Fail Closed)', () => {
    const plaintext = "test clinical data";
    const receiverKeyMaterial = M2EncryptionService.generateKeyMaterial();
    const encrypted = M2EncryptionService.encryptBundle(plaintext, receiverKeyMaterial.publicKey, receiverKeyMaterial.nonce);
    
    let rawCipher = Buffer.from(encrypted.encryptedPayload, 'base64');
    rawCipher[0] = rawCipher[0] ^ 0xFF; // Modify ciphertext
    const tamperedPayload = rawCipher.toString('base64');
    
    expect(() => {
      fhirEncryptionService.decrypt(
        tamperedPayload,
        receiverKeyMaterial.privateKey,
        encrypted.senderPublicKey,
        encrypted.senderNonce,
        receiverKeyMaterial.nonce
      );
    }).toThrow(/Unsupported state or unable to authenticate data/);
  });

  it('4. Wrong Private Key Fails Decryption (Cross-Patient Isolation)', () => {
    const plaintext = "test clinical data";
    const receiverA = M2EncryptionService.generateKeyMaterial();
    const receiverB = M2EncryptionService.generateKeyMaterial();
    
    const encryptedForA = M2EncryptionService.encryptBundle(plaintext, receiverA.publicKey, receiverA.nonce);
    
    // Try to decrypt A's payload using B's private key
    expect(() => {
      fhirEncryptionService.decrypt(
        encryptedForA.encryptedPayload,
        receiverB.privateKey,
        encryptedForA.senderPublicKey,
        encryptedForA.senderNonce,
        receiverA.nonce // even if nonce was somehow known
      );
    }).toThrow();
  });

  it('5. Header vs Body ID Relationship Alignment', () => {
    // Assert getHeaders now takes customRequestId and customTimestamp
    const headersUtils = require('../utils/headers');
    const customId = uuidv4();
    const customTs = new Date().toISOString();
    const headers = headersUtils.getHeaders('dummyToken', customId, customTs);
    
    expect(headers['REQUEST-ID']).toBe(customId);
    expect(headers['TIMESTAMP']).toBe(customTs);
  });

});
