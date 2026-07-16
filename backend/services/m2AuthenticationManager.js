const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { getHeaders } = require("../utils/headers");
const { nowIso } = require("../utils/dateUtils");

let cachedGatewayToken = "";
let cachedGatewayExpiryMs = 0;

// Helper to decode JWT expiry
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

const cleanToken = (token) => String(token || "").trim().replace(/^Bearer\s+/i, "");

// Module 1: Gateway Session Token
const getGatewayToken = async () => {
    const now = Date.now();
    if (cachedGatewayToken && cachedGatewayExpiryMs > now + 60 * 1000) {
        return cachedGatewayToken;
    }

    const clientId = process.env.CLIENT_ID || process.env.ABDM_CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET || process.env.ABDM_CLIENT_SECRET;

    const res = await axios.post(
        `${process.env.GATEWAY_BASE}/api/hiecm/gateway/v3/sessions`,
        {
            clientId,
            clientSecret,
            grantType: "client_credentials",
        },
        { headers: getHeaders() }
    );

    const accessToken = res.data.accessToken;
    cachedGatewayToken = accessToken;
    cachedGatewayExpiryMs = parseTokenExpiryMs(accessToken) || Date.now() + 15 * 60 * 1000;

    return accessToken;
};

// Module 1: Patient/PHR Token Refresh
const refreshPatientToken = async (refreshToken) => {
    const cleanedRefresh = cleanToken(refreshToken);
    if (!cleanedRefresh) return "";

    const candidates = [
        `${process.env.Abha_BASE}/Abha/api/v3/phr/app/login/profile/request/token`,
        `${process.env.Abha_BASE}/Abha/api/v3/profile/account/request/token`,
    ];

    for (const url of candidates) {
        try {
            const response = await axios.get(url, {
                headers: {
                    "REQUEST-ID": uuidv4(),
                    "TIMESTAMP": nowIso(),
                    "R-token": `Bearer ${cleanedRefresh}`,
                },
            });

            const nextToken = cleanToken(
                response.data?.tokens?.token ||
                response.data?.token ||
                response.data?.accessToken
            );

            if (nextToken) {
                return nextToken;
            }
        } catch (_) { }
    }

    return "";
};

// Expose M2AuthenticationManager API
module.exports = {
    getGatewayToken,
    refreshPatientToken,
    cleanToken,

    // Central helper to make an authorized gateway call on behalf of patient
    callPatientGatewayApi: async ({ method, url, loginToken, refreshToken, data, params, extraHeaders = {} }) => {
        const gatewayToken = await getGatewayToken();
        const cleanedLoginToken = cleanToken(loginToken);

        const sendRequest = async (tokenVal, isBearer = false) => {
            const authHeader = isBearer ? `Bearer ${tokenVal}` : tokenVal;
            return axios({
                method,
                url,
                data,
                params,
                headers: {
                    ...getHeaders(gatewayToken),
                    "X-AUTH-TOKEN": authHeader,
                    ...extraHeaders,
                },
            });
        };

        try {
            // First attempt with original token
            try {
                return await sendRequest(cleanedLoginToken);
            } catch (err) {
                // If denied due to token format or signature, try with Bearer prefix
                const status = err.response?.status;
                if (status === 401 || status === 403) {
                    return await sendRequest(cleanedLoginToken, true);
                }
                throw err;
            }
        } catch (originalErr) {
            const status = originalErr.response?.status;
            // If unauthorized/expired and we have a refresh token, perform refresh and retry
            if ((status === 401 || status === 403) && refreshToken) {
                console.log("[M2 AUTH MANAGER] Token expired. Attempting token refresh...");
                const newLoginToken = await refreshPatientToken(refreshToken);
                if (newLoginToken) {
                    try {
                        return await sendRequest(newLoginToken);
                    } catch (retryErr) {
                        const retryStatus = retryErr.response?.status;
                        if (retryStatus === 401 || retryStatus === 403) {
                            return await sendRequest(newLoginToken, true);
                        }
                        throw retryErr;
                    }
                }
            }
            throw originalErr;
        }
    },

    // Gateway-only API call (no patient token required)
    callGatewayApi: async ({ method, url, data, params, extraHeaders = {} }) => {
        const gatewayToken = await getGatewayToken();
        return axios({
            method,
            url,
            data,
            params,
            headers: {
                ...getHeaders(gatewayToken),
                ...extraHeaders,
            },
        });
    }
};
