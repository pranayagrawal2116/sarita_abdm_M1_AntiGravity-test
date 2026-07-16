const axios = require("axios");
const { getHeaders } = require("../utils/headers");

let cachedAccessToken = "";
let cachedExpiryMs = 0;

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

exports.getGatewayToken = async () => {
    const now = Date.now();
    if (cachedAccessToken && cachedExpiryMs > now + 60 * 1000) {
        return cachedAccessToken;
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
    cachedAccessToken = accessToken;
    cachedExpiryMs =
        parseTokenExpiryMs(accessToken) || Date.now() + 15 * 60 * 1000;

    return accessToken;
};
