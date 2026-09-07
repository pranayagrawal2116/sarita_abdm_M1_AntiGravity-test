const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const Logger = require("../m2/logging/logger");

let client = null;

const getJwksClient = () => {
    if (!client) {
        const jwksUri = process.env.ABDM_GATEWAY_JWKS_URL || "https://dev.abdm.gov.in/gateway/v0.5/certs";
        client = jwksClient({
            jwksUri: jwksUri,
            cache: true,
            cacheMaxEntries: 10,
            cacheMaxAge: 3600000, // 1 hour
            timeout: 5000 // 5 seconds
        });
    }
    return client;
};

const getSigningKey = (header, callback) => {
    if (!header.kid) {
        return callback(new Error("Missing kid in JWT header"));
    }
    
    // Enforce RS256 algorithm to prevent confusion attacks
    if (header.alg !== "RS256") {
        return callback(new Error("Invalid algorithm, expected RS256"));
    }

    getJwksClient().getSigningKey(header.kid, (err, key) => {
        if (err) {
            Logger.error("GatewayAuthMiddleware", `JWKS signing key lookup failed`, { error: err.message, kid: header.kid });
            return callback(err);
        }
        const signingKey = key.getPublicKey();
        callback(null, signingKey);
    });
};

const GatewayAuthMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader) {
            Logger.warn("GatewayAuthMiddleware", "Missing Authorization header", { path: req.path });
            return res.status(401).json({ error: "Unauthorized: Missing Authorization header" });
        }

        const parts = authHeader.split(" ");
        if (parts.length !== 2 || /^Bearer$/i.test(parts[0]) === false) {
            Logger.warn("GatewayAuthMiddleware", "Malformed Authorization header", { path: req.path });
            return res.status(401).json({ error: "Unauthorized: Malformed Bearer token" });
        }

        const token = parts[1];
        if (!token) {
            return res.status(401).json({ error: "Unauthorized: Token empty" });
        }

        // Configuration
        const expectedIssuer = process.env.ABDM_GATEWAY_JWT_ISSUER || "https://dev.ndhm.gov.in/auth/realms/central-registry";
        const expectedAudience = process.env.ABDM_GATEWAY_JWT_AUDIENCE || "account";

        const options = {
            algorithms: ["RS256"],
            issuer: expectedIssuer,
            audience: expectedAudience
        };

        jwt.verify(token, getSigningKey, options, (err, decoded) => {
            if (err) {
                Logger.warn("GatewayAuthMiddleware", "JWT verification failed", { 
                    error: err.name, 
                    message: err.message,
                    path: req.path 
                });
                return res.status(401).json({ error: "Unauthorized: Invalid token" });
            }

            // Success
            req.user = decoded;
            next();
        });
    } catch (err) {
        Logger.error("GatewayAuthMiddleware", "Unexpected error in middleware", { error: err.message });
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

module.exports = GatewayAuthMiddleware;
