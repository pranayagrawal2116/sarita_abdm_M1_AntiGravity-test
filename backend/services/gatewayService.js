const axios = require("axios");
const http = require("http");
const https = require("https");
const { getHeaders } = require("../utils/headers");

let cachedAccessToken = "";
let cachedExpiryMs = 0;
let tokenRequestPromise = null;

// Reuse outbound sockets.  Windows Server otherwise pays a fresh DNS/TLS
// setup cost after the API has been idle, precisely when the mobile callback
// has the smallest timeout budget.
const httpAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 30000, maxSockets: 32 });
const httpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 30000, maxSockets: 32 });
const TOKEN_TIMEOUT_MS = Number(process.env.GATEWAY_TOKEN_TIMEOUT_MS || 8000);
const TOKEN_ATTEMPTS = Number(process.env.GATEWAY_TOKEN_ATTEMPTS || 2);

const parseTokenExpiryMs = (token) => {
    try {
        const parts = String(token || "").split(".");
        if (parts.length < 2) return 0;
        const normalizedPayload = parts[1]
            .replace(/-/g, "+")
            .replace(/_/g, "/")
            .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
        const payload = JSON.parse(
            Buffer.from(normalizedPayload, "base64").toString("utf8")
        );
        const exp = Number(payload?.exp || 0);
        return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0;
    } catch (_) {
        return 0;
    }
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryable = (error) => {
    const status = error?.response?.status;
    return !status || status === 408 || status === 429 || status >= 500;
};

const requestGatewayToken = async () => {
    const clientId = process.env.CLIENT_ID || process.env.ABDM_CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET || process.env.ABDM_CLIENT_SECRET;
    let lastError;

    // On a fresh IIS/PM2 restart the first TLS or gateway request can be
    // transiently unavailable. Retry it here so the caller never has to make
    // the same API request twice.
    for (let attempt = 0; attempt < TOKEN_ATTEMPTS; attempt += 1) {
        try {
            const res = await axios.post(
                `${process.env.GATEWAY_BASE}/gateway/v0.5/sessions`,
                { clientId, clientSecret, grantType: "client_credentials" },
                {
                    headers: getHeaders(),
                    timeout: TOKEN_TIMEOUT_MS,
                    httpAgent,
                    httpsAgent,
                }
            );
            const accessToken = res.data.accessToken;
            if (!accessToken) throw new Error("Gateway response did not contain accessToken.");
            cachedAccessToken = accessToken;
            cachedExpiryMs = parseTokenExpiryMs(accessToken) || Date.now() + 15 * 60 * 1000;
            return accessToken;
        } catch (error) {
            lastError = error;
            if (!isRetryable(error) || attempt === TOKEN_ATTEMPTS - 1) break;
            await wait(500 * (attempt + 1));
        }
    }
    throw lastError;
};

exports.getGatewayToken = async () => {
    const now = Date.now();
    if (cachedAccessToken && cachedExpiryMs > now + 60 * 1000) {
        return cachedAccessToken;
    }

    if (!tokenRequestPromise) {
        tokenRequestPromise = requestGatewayToken().finally(() => {
            tokenRequestPromise = null;
        });
    }
    return tokenRequestPromise;
};

exports.clearCache = () => {
    cachedAccessToken = "";
    cachedExpiryMs = 0;
};

exports.startTokenMaintenance = () => {
    const intervalMs = Number(process.env.GATEWAY_TOKEN_WARM_INTERVAL_MS || 60000);
    if (!Number.isFinite(intervalMs) || intervalMs < 15000) return;

    const warm = () => {
        exports.getGatewayToken().catch((error) => {
            console.warn("[Gateway] Background token refresh failed:", error.message);
        });
    };
    warm();
    const timer = setInterval(warm, intervalMs);
    timer.unref();
};
