const assert = require("assert");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// Generate keys for testing
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const { publicKey: publicKey2, privateKey: privateKey2 } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

// Mock jwksClient BEFORE requiring middleware
let mockKeys = {
  "test-kid": publicKey
};
let jwksRefreshCount = 0;

require.cache[require.resolve("jwks-rsa")] = {
  exports: (options) => ({
    getSigningKey: (kid, cb) => {
      if (mockKeys[kid]) {
        return cb(null, { getPublicKey: () => mockKeys[kid] });
      }
      jwksRefreshCount++;
      // Simulate cache miss and refresh
      if (kid === "test-kid-2") {
         mockKeys["test-kid-2"] = publicKey2;
         return cb(null, { getPublicKey: () => publicKey2 });
      }
      return cb(new Error("Signing key not found"));
    }
  })
};

const GatewayAuthMiddleware = require("../middlewares/GatewayAuthMiddleware");

const reqMock = (headers) => ({
    headers,
    path: "/api/v3/consent/request/on-init"
});

const resMock = () => {
    let statusCode;
    let jsonBody;
    return {
        status: (code) => { statusCode = code; return { json: (body) => { jsonBody = body; } }; },
        get: () => ({ statusCode, jsonBody })
    };
};

const runTests = async () => {
    console.log("Starting GatewayAuthMiddleware Tests...");
    
    // Set env for tests
    process.env.ABDM_GATEWAY_JWT_ISSUER = "test-issuer";
    process.env.ABDM_GATEWAY_JWT_AUDIENCE = "test-audience";

    // 1. Positive: valid RS256 token
    const validToken = jwt.sign({ sub: "client", aud: "test-audience", iss: "test-issuer" }, privateKey, { algorithm: "RS256", keyid: "test-kid", expiresIn: "1h" });
    let res = resMock();
    let nextCalled = false;
    GatewayAuthMiddleware(reqMock({ authorization: `Bearer ${validToken}` }), res, () => { nextCalled = true; });
    
    // JWT verify is async
    await new Promise(r => setTimeout(r, 100));
    assert.ok(nextCalled, "Positive test failed: next() was not called.");

    // 2. Negative: missing Authorization
    res = resMock();
    nextCalled = false;
    GatewayAuthMiddleware(reqMock({}), res, () => { nextCalled = true; });
    assert.strictEqual(res.get().statusCode, 401);
    assert.strictEqual(nextCalled, false);

    // 3. Negative: malformed Authorization
    res = resMock();
    GatewayAuthMiddleware(reqMock({ authorization: `Token ${validToken}` }), res, () => {});
    assert.strictEqual(res.get().statusCode, 401);

    // 4. Negative: expired token
    const expiredToken = jwt.sign({ sub: "client", aud: "test-audience", iss: "test-issuer", exp: Math.floor(Date.now()/1000) - 100 }, privateKey, { algorithm: "RS256", keyid: "test-kid" });
    res = resMock();
    nextCalled = false;
    GatewayAuthMiddleware(reqMock({ authorization: `Bearer ${expiredToken}` }), res, () => { nextCalled = true; });
    await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(res.get().statusCode, 401);
    assert.strictEqual(nextCalled, false);

    // 5. Negative: wrong kid
    const wrongKidToken = jwt.sign({ sub: "client", aud: "test-audience", iss: "test-issuer" }, privateKey, { algorithm: "RS256", keyid: "wrong-kid", expiresIn: "1h" });
    res = resMock();
    nextCalled = false;
    GatewayAuthMiddleware(reqMock({ authorization: `Bearer ${wrongKidToken}` }), res, () => { nextCalled = true; });
    await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(res.get().statusCode, 401);
    
    // 6. Negative: invalid signature
    const tamperedToken = validToken.slice(0, -5) + "abcde";
    res = resMock();
    nextCalled = false;
    GatewayAuthMiddleware(reqMock({ authorization: `Bearer ${tamperedToken}` }), res, () => { nextCalled = true; });
    await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(res.get().statusCode, 401);
    
    // 7. Negative: HS256 algorithm confusion
    const hs256Token = jwt.sign({ sub: "client", aud: "test-audience", iss: "test-issuer" }, "secret123", { algorithm: "HS256", keyid: "test-kid" });
    res = resMock();
    nextCalled = false;
    GatewayAuthMiddleware(reqMock({ authorization: `Bearer ${hs256Token}` }), res, () => { nextCalled = true; });
    await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(res.get().statusCode, 401);

    // 8. Negative: Invalid Issuer
    const wrongIssToken = jwt.sign({ sub: "client", aud: "test-audience", iss: "wrong-issuer" }, privateKey, { algorithm: "RS256", keyid: "test-kid", expiresIn: "1h" });
    res = resMock();
    nextCalled = false;
    GatewayAuthMiddleware(reqMock({ authorization: `Bearer ${wrongIssToken}` }), res, () => { nextCalled = true; });
    await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(res.get().statusCode, 401);

    // 9. Negative: Invalid Audience
    const wrongAudToken = jwt.sign({ sub: "client", aud: "wrong-aud", iss: "test-issuer" }, privateKey, { algorithm: "RS256", keyid: "test-kid", expiresIn: "1h" });
    res = resMock();
    nextCalled = false;
    GatewayAuthMiddleware(reqMock({ authorization: `Bearer ${wrongAudToken}` }), res, () => { nextCalled = true; });
    await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(res.get().statusCode, 401);

    // 10. JWKS Rotation Test
    // Initial unknown kid -> Refresh -> Succeeds
    const newToken = jwt.sign({ sub: "client", aud: "test-audience", iss: "test-issuer" }, privateKey2, { algorithm: "RS256", keyid: "test-kid-2", expiresIn: "1h" });
    res = resMock();
    nextCalled = false;
    GatewayAuthMiddleware(reqMock({ authorization: `Bearer ${newToken}` }), res, () => { nextCalled = true; });
    await new Promise(r => setTimeout(r, 100));
    assert.ok(nextCalled, "Rotation test failed.");
    assert.strictEqual(jwksRefreshCount, 2, "Refresh count should be 2");

    // 11. No Cache + Unavailable
    const tokenNoCache = jwt.sign({ sub: "client", aud: "test-audience", iss: "test-issuer" }, privateKey, { algorithm: "RS256", keyid: "unavailable-kid", expiresIn: "1h" });
    res = resMock();
    nextCalled = false;
    GatewayAuthMiddleware(reqMock({ authorization: `Bearer ${tokenNoCache}` }), res, () => { nextCalled = true; });
    await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(res.get().statusCode, 401);

    console.log("All GatewayAuthMiddleware Tests Passed!");
};
runTests().catch(console.error);
