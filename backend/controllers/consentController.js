const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { getHeaders } = require("../utils/headers");
const { getGatewayToken } = require("../services/gatewayService");
const { nowIso } = require("../utils/dateUtils");
const { listHipConsentNotifications } = require("./hipLinkingController");
const transactionStore = require("../utils/transactionStore");

const getErrorPayload = (err) => {
    const status = err.response?.status || 500;
    const data = err.response?.data;

    if (typeof data === "string") {
        return { status, body: { error: data } };
    }

    if (data && typeof data === "object") {
        return { status, body: data };
    }

    return {
        status,
        body: { error: err.message || "Unknown consent API error" },
    };
};

const toNonEmptyString = (value) => {
    if (value === null || value === undefined) return "";
    const text = String(value).trim();
    return text.length > 0 ? text : "";
};

const tryParseJsonString = (value) => {
    if (typeof value !== "string") return value;
    const text = value.trim();
    if (
        !text ||
        ((!text.startsWith("{") || !text.endsWith("}")) &&
            (!text.startsWith("[") || !text.endsWith("]")))
    ) {
        return value;
    }

    try {
        return JSON.parse(text);
    } catch (_) {
        return value;
    }
};

const normalizeJsonLike = (value) => {
    const parsed = tryParseJsonString(value);

    if (Array.isArray(parsed)) {
        return parsed.map((item) => normalizeJsonLike(item));
    }

    if (parsed && typeof parsed === "object") {
        return Object.fromEntries(
            Object.entries(parsed).map(([key, entry]) => [key, normalizeJsonLike(entry)])
        );
    }

    return parsed;
};

const getByPath = (source, path) => {
    let current = source;
    for (const key of path) {
        if (Array.isArray(current) && typeof key === "number") {
            current = current[key];
            continue;
        }

        if (current && typeof current === "object" && key in current) {
            current = current[key];
            continue;
        }

        return undefined;
    }

    return current;
};

const findFirstString = (source, paths) => {
    for (const path of paths) {
        const value = toNonEmptyString(getByPath(source, path));
        if (value) return value;
    }
    return "";
};

const findFirstList = (source, paths) => {
    for (const path of paths) {
        const value = getByPath(source, path);
        if (Array.isArray(value) && value.length > 0) {
            return value;
        }
    }
    return [];
};

const deepFindStringForKeys = (source, keys) => {
    if (Array.isArray(source)) {
        for (const item of source) {
            const found = deepFindStringForKeys(item, keys);
            if (found) return found;
        }
        return "";
    }

    if (!source || typeof source !== "object") return "";

    for (const key of keys) {
        const value = toNonEmptyString(source[key]);
        if (value) return value;
    }

    for (const value of Object.values(source)) {
        const found = deepFindStringForKeys(value, keys);
        if (found) return found;
    }

    return "";
};

const normalizeHiTypes = (value) => {
    if (Array.isArray(value)) {
        return value
            .map((item) => toNonEmptyString(item))
            .filter(Boolean);
    }

    const text = toNonEmptyString(value);
    return text ? [text] : [];
};

const getRequesterName = (item) =>
    findFirstString(item, [
        ["requester", "name"],
        ["request", "requester", "name"],
        ["request", "consent", "requester", "name"],
        ["request", "consentDetail", "requester", "name"],
        ["consentRequest", "requester", "name"],
        ["consentRequest", "consent", "requester", "name"],
        ["consentRequest", "consentDetail", "requester", "name"],
        ["notification", "requester", "name"],
        ["hiu", "name"],
        ["request", "hiu", "name"],
        ["consentRequest", "hiu", "name"],
        ["hip", "name"],
        ["request", "hip", "name"],
        ["consentRequest", "hip", "name"],
        ["consentDetail", "hiu", "name"],
        ["consentDetail", "requester", "name"],
        ["consentDetail", "hip", "name"],
        ["consent", "requester", "name"],
        ["consent", "hiu", "name"],
        ["consent", "hip", "name"],
    ]) ||
    deepFindStringForKeys(item, ["name"]) ||
    "Unknown requester";

const getPurposeText = (item) =>
    findFirstString(item, [
        ["purpose", "text"],
        ["purpose", "code"],
        ["request", "purpose", "text"],
        ["request", "purpose", "code"],
        ["request", "consent", "purpose", "text"],
        ["request", "consent", "purpose", "code"],
        ["request", "consentDetail", "purpose", "text"],
        ["request", "consentDetail", "purpose", "code"],
        ["consentRequest", "purpose", "text"],
        ["consentRequest", "purpose", "code"],
        ["consentRequest", "consent", "purpose", "text"],
        ["consentRequest", "consent", "purpose", "code"],
        ["consentRequest", "consentDetail", "purpose", "text"],
        ["consentRequest", "consentDetail", "purpose", "code"],
        ["consentDetail", "purpose", "text"],
        ["consentDetail", "purpose", "code"],
        ["consent", "purpose", "text"],
        ["consent", "purpose", "code"],
    ]) ||
    "Unknown purpose";

const getHiTypes = (item) =>
    normalizeHiTypes(
        findFirstList(item, [
            ["hiType"],
            ["hiTypes"],
            ["request", "hiType"],
            ["request", "hiTypes"],
            ["request", "consent", "hiType"],
            ["request", "consent", "hiTypes"],
            ["request", "consentDetail", "hiType"],
            ["request", "consentDetail", "hiTypes"],
            ["consentRequest", "hiType"],
            ["consentRequest", "hiTypes"],
            ["consentRequest", "consent", "hiType"],
            ["consentRequest", "consent", "hiTypes"],
            ["consentRequest", "consentDetail", "hiType"],
            ["consentRequest", "consentDetail", "hiTypes"],
            ["consentDetail", "hiType"],
            ["consentDetail", "hiTypes"],
            ["consent", "hiType"],
            ["consent", "hiTypes"],
        ])
    );

const getExpiry = (item) =>
    findFirstString(item, [
        ["permission", "dateRange", "to"],
        ["permission", "dataEraseAt"],
        ["request", "permission", "dateRange", "to"],
        ["request", "permission", "dataEraseAt"],
        ["request", "consent", "permission", "dateRange", "to"],
        ["request", "consent", "permission", "dataEraseAt"],
        ["request", "consentDetail", "permission", "dateRange", "to"],
        ["request", "consentDetail", "permission", "dataEraseAt"],
        ["consentRequest", "permission", "dateRange", "to"],
        ["consentRequest", "permission", "dataEraseAt"],
        ["consentRequest", "consent", "permission", "dateRange", "to"],
        ["consentRequest", "consent", "permission", "dataEraseAt"],
        ["consentRequest", "consentDetail", "permission", "dateRange", "to"],
        ["consentRequest", "consentDetail", "permission", "dataEraseAt"],
        ["consentDetail", "permission", "dateRange", "to"],
        ["consentDetail", "permission", "dataEraseAt"],
        ["consent", "permission", "dateRange", "to"],
        ["consent", "permission", "dataEraseAt"],
        ["lastUpdated"],
        ["request", "lastUpdated"],
        ["consentRequest", "lastUpdated"],
        ["consentDetail", "lastUpdated"],
        ["consent", "lastUpdated"],
    ]) || "";

const getConsentRequestId = (item) =>
    findFirstString(item, [
        ["requestId"],
        ["consentRequestId"],
        ["request", "requestId"],
        ["request", "consentRequestId"],
        ["request", "id"],
        ["response", "requestId"],
        ["notification", "consentRequestId"],
        ["notification", "requestId"],
        ["consentRequest", "requestId"],
        ["consentRequest", "consentRequestId"],
        ["consentRequest", "id"],
        ["consent", "requestId"],
        ["consent", "consentRequestId"],
        ["consentDetail", "requestId"],
        ["consentDetail", "consentRequestId"],
        ["id"],
        ["consentId"],
        ["consent", "id"],
        ["consentDetail", "consentId"],
    ]) ||
    deepFindStringForKeys(item, ["consentRequestId", "requestId"]) ||
    "";

const getConsentAuthToken = (token) =>
    toNonEmptyString(token).replace(/^Bearer\s+/i, "");

const getConsentRefreshToken = (token) =>
    toNonEmptyString(token).replace(/^Bearer\s+/i, "");

const getConsentHeaders = (gatewayToken, authToken) => ({
    ...getHeaders(gatewayToken),
    "X-AUTH-TOKEN": authToken,
});

const getBearerConsentHeaders = (gatewayToken, authToken) => ({
    ...getHeaders(gatewayToken),
    "X-AUTH-TOKEN": `Bearer ${getConsentAuthToken(authToken)}`,
});

const requestConsentProfileToken = async (refreshToken) => {
    const normalizedRefreshToken = getConsentRefreshToken(refreshToken);
    if (!normalizedRefreshToken) return "";

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
                    "R-token": `Bearer ${normalizedRefreshToken}`,
                },
            });

            const nextToken = toNonEmptyString(
                response.data?.tokens?.token ||
                    response.data?.token ||
                    response.data?.accessToken
            );

            if (nextToken) {
                return nextToken;
            }
        } catch (_) {}
    }

    return "";
};

const normalizeConsentSourceItems = (data) =>
    data?.requests ||
    data?.consents?.requests ||
    data?.consents ||
    data?.items ||
    data?.subscriptions ||
    [];

const shouldRetryWithBearer = (err) => {
    const data = err.response?.data;
    const message = toNonEmptyString(
        data?.message || data?.error?.message || data?.error || err.message
    ).toLowerCase();
    return (
        message.includes("invalid jwt token") ||
        message.includes("invalid x-token") ||
        message.includes("access denied")
    );
};

const getConsentMode = (req) =>
    toNonEmptyString(req.header("X-Consent-Mode")).toLowerCase() || "current_default";

const buildConsentAuthContext = async ({
    gatewayToken,
    loginToken,
    refreshToken,
    mode,
}) => {
    const refreshedToken = await requestConsentProfileToken(refreshToken);
    const normalizedLoginToken = getConsentAuthToken(loginToken);
    const normalizedRefreshDerived = getConsentAuthToken(refreshedToken);
    const selectedToken = normalizedLoginToken || normalizedRefreshDerived;

    switch (mode) {
        case "patient_refresh_raw":
            return {
                endpoint: "patient",
                headers: getConsentHeaders(gatewayToken, normalizedRefreshDerived),
                hasAuthToken: Boolean(normalizedRefreshDerived),
                refreshed: Boolean(normalizedRefreshDerived),
                tokenSource: "refresh",
            };
        case "patient_refresh_bearer":
            return {
                endpoint: "patient",
                headers: getBearerConsentHeaders(gatewayToken, normalizedRefreshDerived),
                hasAuthToken: Boolean(normalizedRefreshDerived),
                refreshed: Boolean(normalizedRefreshDerived),
                tokenSource: "refresh",
            };
        case "patient_login_raw":
            return {
                endpoint: "patient",
                headers: getConsentHeaders(gatewayToken, normalizedLoginToken),
                hasAuthToken: Boolean(normalizedLoginToken),
                refreshed: Boolean(normalizedRefreshDerived),
                tokenSource: normalizedLoginToken ? "login" : "",
            };
        case "patient_login_bearer":
            return {
                endpoint: "patient",
                headers: getBearerConsentHeaders(gatewayToken, normalizedLoginToken),
                hasAuthToken: Boolean(normalizedLoginToken),
                refreshed: Boolean(normalizedRefreshDerived),
                tokenSource: normalizedLoginToken ? "login" : "",
            };
        case "consent_refresh_raw":
            return {
                endpoint: "consent",
                headers: getConsentHeaders(gatewayToken, normalizedRefreshDerived),
                hasAuthToken: Boolean(normalizedRefreshDerived),
                refreshed: Boolean(normalizedRefreshDerived),
                tokenSource: "refresh",
            };
        case "consent_refresh_bearer":
            return {
                endpoint: "consent",
                headers: getBearerConsentHeaders(gatewayToken, normalizedRefreshDerived),
                hasAuthToken: Boolean(normalizedRefreshDerived),
                refreshed: Boolean(normalizedRefreshDerived),
                tokenSource: "refresh",
            };
        case "current_default":
        default:
            return {
                endpoint: "patient",
                headers: getConsentHeaders(gatewayToken, selectedToken),
                hasAuthToken: Boolean(selectedToken),
                refreshed: Boolean(normalizedRefreshDerived),
                tokenSource: normalizedLoginToken
                    ? "login"
                    : normalizedRefreshDerived
                      ? "refresh"
                      : "",
            };
    }
};

const callConsentProtected = async ({
    method,
    url,
    gatewayToken,
    consentAuthToken,
    data,
    params,
}) => {
    try {
        return await axios({
            method,
            url,
            data,
            params,
            headers: getConsentHeaders(gatewayToken, consentAuthToken),
        });
    } catch (err) {
        if (!shouldRetryWithBearer(err)) throw err;
        return axios({
            method,
            url,
            data,
            params,
            headers: getBearerConsentHeaders(gatewayToken, consentAuthToken),
        });
    }
};

const fetchConsentRequestsFromConsentList = async (headers) =>
    axios.get(`${process.env.GATEWAY_BASE}/api/hiecm/consent/v3/request`, {
        headers,
        params: {
            limit: 10,
            offset: 0,
            status: "ALL",
        },
    });

const buildConsentRequestsFromHipNotifications = () => {
    const notifications = listHipConsentNotifications();
    const requests = notifications.map((entry) => {
        const normalized = normalizeJsonLike(entry.payload);
        return {
            id:
                getConsentRequestId(normalized) ||
                toNonEmptyString(entry.requestId) ||
                uuidv4(),
            requester: getRequesterName(normalized),
            purpose: getPurposeText(normalized),
            dataTypes: getHiTypes(normalized),
            expiry: getExpiry(normalized) || toNonEmptyString(entry.receivedAt),
            status:
                findFirstString(normalized, [
                    ["notification", "status"],
                    ["status"],
                    ["acknowledgement", "status"],
                ]) || "NOTIFIED",
            raw: normalized,
            receivedAt: entry.receivedAt,
        };
    });

    // Merge in file-backed transactions from transactionStore
    try {
        const allTx = transactionStore.listTransactions() || {};
        for (const tx of Object.values(allTx)) {
            if (!tx.consentId) continue;
            // Check if already in the requests list (by checking consentId or requestId)
            const alreadyExists = requests.some(
                (r) => r.id === tx.consentId || r.id === tx.requestId
            );
            if (!alreadyExists) {
                requests.push({
                    id: tx.consentId,
                    requester: "Sarita ABDM App",
                    purpose: "Referral / Treatment",
                    dataTypes: Array.isArray(tx.hiTypes) ? tx.hiTypes : ["Prescription"],
                    expiry: tx.dateRange?.to || new Date(Date.now() + 365*24*60*60*1000).toISOString(),
                    status: tx.status === "FAILED" ? "FAILED" : "GRANTED",
                    raw: {
                        consentId: tx.consentId,
                        consentDetail: {
                            consentId: tx.consentId,
                            patient: { id: tx.patientId || "" },
                            careContexts: tx.careContexts || [],
                            hiTypes: Array.isArray(tx.hiTypes) ? tx.hiTypes : ["Prescription"],
                            permission: {
                                dateRange: tx.dateRange || {
                                    from: new Date().toISOString(),
                                    to: new Date(Date.now() + 365*24*60*60*1000).toISOString()
                                }
                            }
                        }
                    },
                    receivedAt: tx.updatedAt || new Date().toISOString()
                });
            }
        }
    } catch (err) {
        console.error("[CONSENT CONTROLLER] Error loading consents from persistent store:", err);
    }

    return {
        consents: requests,
        size: requests.length,
        source: "hip-consent-notify-callbacks",
    };
};

const buildConsentFallbackResponse = (reason, extra = {}) => ({
    ...buildConsentRequestsFromHipNotifications(),
    auth: {
        mode: "fallback",
        reason,
        attemptedGatewaySession: Boolean(extra.attemptedGatewaySession),
        attemptedRefresh: Boolean(extra.attemptedRefresh),
        canRecreateGatewaySession: true,
        canRecreatePhrSession: false,
    },
});

exports.listConsentRequests = async (req, res) => {
    try {
        const xAuthToken = String(req.header("X-Auth-Token") || "").trim();
        const xRefreshToken = String(req.header("X-Refresh-Token") || "").trim();
        const consentMode = getConsentMode(req);

        const gatewayToken = await getGatewayToken();
        const authContext = await buildConsentAuthContext({
            gatewayToken,
            loginToken: xAuthToken,
            refreshToken: xRefreshToken,
            mode: consentMode,
        });

        if (!authContext.hasAuthToken) {
            return res.status(401).json({
                error: xRefreshToken
                    ? "M2 refresh token did not produce a usable PHR auth token."
                    : "Missing M2 authentication session. Log in again to create an M2 session.",
            });
        }

        const response =
            authContext.endpoint === "consent"
                ? await fetchConsentRequestsFromConsentList(authContext.headers)
                : await axios.get(
                      `${process.env.GATEWAY_BASE}/api/hiecm/subscription-requests/v3/requests`,
                      {
                          headers: authContext.headers,
                          params: {
                              status: "ALL",
                              limit: 10,
                              offset: 0,
                          },
                      }
                  );

        const sourceItems = normalizeConsentSourceItems(response.data);

        const requests = sourceItems.map((item) => {
            const normalized = normalizeJsonLike(item);
            return {
                id: getConsentRequestId(normalized),
                requester: getRequesterName(normalized),
                purpose: getPurposeText(normalized),
                dataTypes: getHiTypes(normalized),
                expiry: getExpiry(normalized),
                status: normalized?.status || "UNKNOWN",
                raw: normalized,
            };
        });

        res.json({
            consents: requests,
            size: response.data?.size || response.data?.consents?.size || requests.length,
            source: "abdm-live",
            auth: {
                mode: "live",
                endpoint: authContext.endpoint,
                tokenSource: authContext.tokenSource,
                refreshed: authContext.refreshed,
            },
        });
    } catch (err) {
        const { status, body } = getErrorPayload(err);
        res.status(status).json(body);
    }
};

exports.submitConsentDecision = async (req, res) => {
    try {
        const xAuthToken = String(req.header("X-Auth-Token") || "").trim();
        const xRefreshToken = String(req.header("X-Refresh-Token") || "").trim();
        const consentMode = getConsentMode(req);
        const rawConsent =
            req.body?.raw !== undefined ? normalizeJsonLike(req.body.raw) : {};
        const consentId = String(
            req.body?.consentId || getConsentRequestId(rawConsent) || ""
        ).trim();
        const decision = String(req.body?.decision || "").trim().toUpperCase();

        if (!xAuthToken && !xRefreshToken) {
            return res.status(401).json({
                error: "Missing PHR auth token. Please log in again.",
            });
        }

        if (!consentId) {
            return res.status(400).json({ error: "Consent request ID is required" });
        }

        if (!["APPROVED", "DENIED"].includes(decision)) {
            return res.status(400).json({ error: "Invalid consent decision" });
        }

        const gatewayToken = await getGatewayToken();
        const authContext = await buildConsentAuthContext({
            gatewayToken,
            loginToken: xAuthToken,
            refreshToken: xRefreshToken,
            mode: consentMode,
        });
        if (!authContext.hasAuthToken) {
            return res.status(401).json({
                error: xRefreshToken
                    ? "M2 refresh token did not produce a usable PHR auth token."
                    : "Missing PHR auth token. Please log in again.",
            });
        }
        if (decision === "DENIED") {
            await callConsentProtected({
                method: "post",
                url: `${process.env.GATEWAY_BASE}/api/hiecm/consent/v3/request/${encodeURIComponent(
                    consentId
                )}/deny`,
                gatewayToken,
                consentAuthToken: getConsentAuthToken(
                    authContext.headers["X-AUTH-TOKEN"] || ""
                ),
                data: { reason: "Denied from PHR app" },
            });

            return res.json({ status: "DENIED" });
        }

        const artefactResponse = await callConsentProtected({
            method: "get",
            url: `${process.env.GATEWAY_BASE}/api/hiecm/consent/v3/artefact/request/${encodeURIComponent(
                consentId
            )}`,
            gatewayToken,
            consentAuthToken: getConsentAuthToken(
                authContext.headers["X-AUTH-TOKEN"] || ""
            ),
        });

        const artefacts = artefactResponse.data?.consentArtefacts || [];
        const consentArtefactId =
            artefacts[0]?.id ||
            artefacts[0]?.consentId ||
            artefacts[0]?.consentDetail?.consentId ||
            "";

        if (!consentArtefactId) {
            return res.status(404).json({
                error: "No consent artefact found for this consent request",
            });
        }

        return res.json({
            status: "APPROVED",
            consentArtefactId,
        });
    } catch (err) {
        const { status, body } = getErrorPayload(err);
        res.status(status).json(body);
    }
};
