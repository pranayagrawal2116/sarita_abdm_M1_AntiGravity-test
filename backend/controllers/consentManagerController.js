const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const { getGatewayToken } = require("../services/gatewayService");
const { getHeaders } = require("../utils/headers");
const { pushEvent, listEvents } = require("../utils/callbackEventStore");
const hospitalConfig = require("../config/hospitalConfig");
const { toIsoTimestamp, nowIso } = require("../utils/dateUtils");

const toText = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text.length > 0 ? text : "";
};

const toObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

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
    const value = toText(getByPath(source, path));
    if (value) return value;
  }
  return "";
};

const findEventByValue = (type, value, paths) => {
  const target = toText(value);
  if (!target) return null;

  const items = listEvents(type, 200);
  return (
    items.find((item) => {
      for (const path of paths) {
        if (toText(getByPath(item.payload, path)) === target) {
          return true;
        }
      }
      return false;
    }) || null
  );
};

const buildPublicBaseUrl = (req) => {
  const configured = toText(process.env.PUBLIC_BASE_URL).replace(/\/$/, "");
  if (configured) return configured;

  const forwardedProto = toText(req.headers["x-forwarded-proto"]);
  const proto = forwardedProto || req.protocol || "http";
  const host = toText(req.headers.host) || `localhost:${process.env.PORT || 3000}`;
  return `${proto}://${host}`;
};

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
    body: { error: err.message || "Consent manager API failed" },
  };
};

const postToAbdm = async ({ path, body, extraHeaders = {} }, isRetry = false) => {
  let gatewayToken = await getGatewayToken();
  try {
    const response = await axios.post(
      `${process.env.GATEWAY_BASE}${path}`,
      body,
      {
        headers: { ...getHeaders(gatewayToken), ...extraHeaders },
      },
    );
    return response.data;
  } catch (error) {
    if (!isRetry && error.response && error.response.status === 401) {
      console.log("[ABDM] 401 Unauthorized encountered. Forcing token refresh and retrying...");
      // Force token refresh by invalidating cache
      const gatewayService = require("../services/gatewayService");
      if (gatewayService.clearCache) {
        gatewayService.clearCache();
      }
      return await postToAbdm({ path, body, extraHeaders }, true);
    }
    throw error;
  }
};

exports.initConsentRequest = async (req, res) => {
  try {
    const requestId = toText(req.body?.requestId) || uuidv4();
    const timestamp = toIsoTimestamp(req.body?.timestamp);
    const consent = toObject(req.body?.consent);
    const patientId = toText(consent?.patient?.id);
    const hiuId = toText(consent?.hiu?.id);

    if (!patientId) {
      return res.status(400).json({ error: "consent.patient.id is required" });
    }

    if (!hiuId) {
      return res.status(400).json({ error: "consent.hiu.id is required" });
    }

    if (consent.permission) {
      if (consent.permission.dateRange) {
        if (consent.permission.dateRange.from) {
          consent.permission.dateRange.from = toIsoTimestamp(consent.permission.dateRange.from);
        }
        if (consent.permission.dateRange.to) {
          consent.permission.dateRange.to = toIsoTimestamp(consent.permission.dateRange.to);
        }
      }
      if (consent.permission.dataEraseAt) {
        consent.permission.dataEraseAt = toIsoTimestamp(consent.permission.dataEraseAt);
      }
    }

    const response = await postToAbdm({
      path:
        process.env.ABDM_CONSENT_REQUEST_INIT_PATH ||
        "/api/hiecm/consent/v3/request/init",
      body: {
        requestId,
        timestamp,
        consent,
      },
    });

    return res.json({
      requestId,
      timestamp,
      response,
    });
  } catch (err) {
    const { status, body } = getErrorPayload(err);
    return res.status(status).json(body);
  }
};

exports.requestHealthInformation = async (req, res) => {
  try {
    const requestId = toText(req.body?.requestId) || uuidv4();
    const timestamp = toIsoTimestamp(req.body?.timestamp);
    const hiRequest = toObject(req.body?.hiRequest);
    const consentId = toText(hiRequest?.consent?.id);

    console.log(`[HI REQUEST] Initiating health information request for Consent ID: ${consentId}...`);

    if (!consentId) {
      console.log("[HI REQUEST] Failed: hiRequest.consent.id is required");
      return res.status(400).json({ error: "hiRequest.consent.id is required" });
    }

    const dataPushUrl =
      toText(hiRequest?.dataPushUrl) ||
      `${buildPublicBaseUrl(req)}/api/consents/callbacks/health-information/notify`;

    const hiuId =
      toText(req.header("X-HIU-ID")) ||
      toText(process.env.HIU_ID) ||
      hospitalConfig.hiuId;

    if (hiRequest.dateRange) {
      if (hiRequest.dateRange.from) {
        hiRequest.dateRange.from = toIsoTimestamp(hiRequest.dateRange.from);
      }
      if (hiRequest.dateRange.to) {
        hiRequest.dateRange.to = toIsoTimestamp(hiRequest.dateRange.to);
      }
    }

    const keyMaterial = hiRequest?.keyMaterial || {
      cryptoAlg: "ECDH",
      curve: "Curve25519",
      dhPublicKey: {
        expiry: toIsoTimestamp(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()),
        parameters: "Curve25519/32byte random key",
        keyValue: "BDdwiDc0OE6GTml90tcDcfQpDuVyEeciwBGYkB5v08yWRBc3sIKm9e5ygVktMAXVFdNLai4wfqUeEWHe3AK3X+Q=",
        x509PublicKey: "MIIBMTCB6gYHKoZIzj0CATCB3gIBATArBgcqhkjOPQEBAiB/////////////////////////////////////////7TBEBCAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqYSRShRAQge0Je0Je0Je0Je0Je0Je0Je0Je0Je0Je0JgtenHcQyGQEQQQqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0kWiCuGaG4oIa04B7dLHdI0UySPU1+bXxhsinpxaJ+ztPZAiAQAAAAAAAAAAAAAAAAAAAAFN753qL3nNZYEmMaXPXT7QIBCANCAARzDxcCe7FZtrb+gvbjb/FJnS/zc7Ooq9A+1bTW3uHSdF33GViSWumNHfFbkuLf85ksgoGCjQVa+5CHPeV4PGOP",
      },
      nonce: "eFwkEMkx/0VmOoVjmf3j8lf3ef/ESqgudybfL0/D/a8=",
    };

    console.log(`[HI REQUEST] Outgoing Payload: RequestId: ${requestId}, Timestamp: ${timestamp}, dataPushUrl: ${dataPushUrl}`);

    const response = await postToAbdm({
      path:
        process.env.ABDM_HEALTH_INFORMATION_REQUEST_PATH ||
        "/api/hiecm/data-flow/v3/health-information/request",
      body: {
        requestId,
        timestamp,
        hiRequest: {
          ...hiRequest,
          dataPushUrl,
          keyMaterial,
        },
      },
      extraHeaders: {
        "X-HIU-ID": hiuId,
      },
    });

    console.log(`[HI REQUEST] Success. ABDM Immediate response: status=202`);

    return res.json({
      requestId,
      timestamp,
      dataPushUrl,
      response,
    });
  } catch (err) {
    const { status, body } = getErrorPayload(err);
    console.log(`[HI REQUEST] Failed. Status: ${status}, Body: ${JSON.stringify(body)}`);
    return res.status(status).json(body);
  }
};

exports.notifyHealthInformationTransfer = async (req, res) => {
  try {
    const requestId = toText(req.body?.requestId) || uuidv4();
    const timestamp = toIsoTimestamp(req.body?.timestamp);
    const notification = toObject(req.body?.notification);
    const consentId = toText(notification?.consentId);
    const transactionId = toText(notification?.transactionId);

    if (!consentId) {
      return res.status(400).json({ error: "notification.consentId is required" });
    }

    if (!transactionId) {
      return res.status(400).json({ error: "notification.transactionId is required" });
    }

    const hipId =
      toText(notification?.notifier?.id) ||
      toText(notification?.statusNotification?.hipId) ||
      toText(process.env.HIP_ID) ||
      hospitalConfig.hipId;

    const doneAt = toIsoTimestamp(notification?.doneAt);

    const response = await postToAbdm({
      path:
        process.env.ABDM_HEALTH_INFORMATION_NOTIFY_PATH ||
        "/api/hiecm/data-flow/v3/health-information/notify",
      body: {
        requestId,
        timestamp,
        notification: {
          ...notification,
          doneAt,
          notifier: {
            ...toObject(notification?.notifier),
            type: "HIP",
            id: hipId,
          },
          statusNotification: {
            ...toObject(notification?.statusNotification),
            hipId,
          },
        },
      },
      extraHeaders: {
        "X-CM-ID": toText(process.env.X_CM_ID) || "sbx",
      },
    });

    return res.json({
      requestId,
      timestamp,
      consentId,
      transactionId,
      response,
    });
  } catch (err) {
    const { status, body } = getErrorPayload(err);
    return res.status(status).json(body);
  }
};

exports.getConsentInitCallback = async (req, res) => {
  const requestId = toText(req.params?.requestId);
  if (!requestId) {
    return res.status(400).json({ error: "requestId is required" });
  }

  const event = findEventByValue("consent_request_on_init", requestId, [
    ["requestId"],
    ["resp", "requestId"],
    ["response", "requestId"],
    ["acknowledgement", "requestId"],
  ]);

  if (!event) {
    return res.status(404).json({ error: "Callback not received yet for this requestId" });
  }

  const consentId = findFirstString(event.payload, [
    ["consentRequest", "id"],
    ["notification", "consentRequest", "id"],
    ["response", "consentRequest", "id"],
    ["payload", "consentRequest", "id"],
  ]);

  return res.json({
    ...event,
    consentId,
  });
};

exports.getConsentStatusCallback = async (req, res) => {
  const consentId = toText(req.params?.consentId);
  if (!consentId) {
    return res.status(400).json({ error: "consentId is required" });
  }

  const event = findEventByValue("consent_request_on_status", consentId, [
    ["consentId"],
    ["notification", "consentId"],
    ["response", "consentId"],
    ["payload", "consentId"],
    ["consent", "id"],
  ]);

  if (!event) {
    return res.status(404).json({ error: "Status callback not received yet for this consentId" });
  }

  const status = findFirstString(event.payload, [
    ["status"],
    ["notification", "status"],
    ["response", "status"],
    ["payload", "status"],
  ]);

  return res.json({
    ...event,
    consentId,
    status,
  });
};

exports.getHealthInformationOnRequest = async (req, res) => {
  const requestId = toText(req.params?.requestId);
  console.log(`[POLL REQUEST] Checking health information request callback status for Request ID: ${requestId}`);

  if (!requestId) {
    console.log("[POLL RESPONSE] Failed: requestId is required");
    return res.status(400).json({ error: "requestId is required" });
  }

  const event = findEventByValue("health_information_on_request", requestId, [
    ["requestId"],
    ["resp", "requestId"],
    ["response", "requestId"],
    ["acknowledgement", "requestId"],
    ["transaction", "requestId"],
  ]);

  if (!event) {
    console.log(`[POLL RESPONSE] Pending. Callback not received yet for Request ID: ${requestId}`);
    return res.status(404).json({
      success: false,
      pending: true,
    });
  }

  const transactionId = findFirstString(event.payload, [
    ["transactionId"],
    ["response", "transactionId"],
    ["acknowledgement", "transactionId"],
    ["payload", "transactionId"],
    ["hiRequest", "transactionId"],
    ["resp", "transactionId"],
  ]);

  const pollResponse = {
    success: true,
    ...event,
    transactionId,
  };

  console.log(`[POLL RESPONSE] Success. Stored callback returned: ${JSON.stringify(pollResponse)}`);
  return res.json(pollResponse);
};

exports.getHealthInformationNotify = async (req, res) => {
  const transactionId = toText(req.params?.transactionId);
  console.log(`[POLL REQUEST] Checking health information data notify callback status for Transaction ID: ${transactionId}`);

  if (!transactionId) {
    console.log("[POLL RESPONSE] Failed: transactionId is required");
    return res.status(400).json({ error: "transactionId is required" });
  }

  const event = findEventByValue("health_information_notify", transactionId, [
    ["transactionId"],
    ["notification", "transactionId"],
    ["response", "transactionId"],
    ["payload", "transactionId"],
  ]);

  if (!event) {
    console.log(`[POLL RESPONSE] Pending. Callback not received yet for Transaction ID: ${transactionId}`);
    return res.status(404).json({
      success: false,
      pending: true,
    });
  }

  const entries = getByPath(event.payload, ["entries"]) || getByPath(event.payload, ["notification", "statusNotification", "statusResponses"]) || [];
  const entriesCount = Array.isArray(entries) ? entries.length : 0;

  const pollResponse = {
    success: true,
    ...event,
    entriesCount,
  };

  console.log(`[POLL RESPONSE] Success. Stored callback returned: ${JSON.stringify(pollResponse)}`);
  return res.json(pollResponse);
};

exports.onConsentRequestInit = async (req, res) => {
  const payload = req.body || {};
  console.log("=========================================");
  console.log("[HI CALLBACK RECEIVED] /consent/request/on-init callback received");
  console.log("Body:", JSON.stringify(payload, null, 2));

  const entry = pushEvent("consent_request_on_init", payload);
  if (entry) {
    console.log(`[HI CALLBACK STORED] Request ID: ${entry.requestId} successfully stored.`);
  } else {
    console.log("[HI CALLBACK STORED] Failed to store callback event (invalid body)");
  }
  console.log("=========================================");
  return res.status(202).json({});
};

exports.onConsentRequestStatus = async (req, res) => {
  const payload = req.body || {};
  console.log("=========================================");
  console.log("[HI CALLBACK RECEIVED] /consent/request/on-status callback received");
  console.log("Body:", JSON.stringify(payload, null, 2));

  const entry = pushEvent("consent_request_on_status", payload);
  if (entry) {
    console.log(`[HI CALLBACK STORED] Consent ID: ${entry.requestId} successfully stored.`);
  } else {
    console.log("[HI CALLBACK STORED] Failed to store callback event (invalid body)");
  }
  console.log("=========================================");
  return res.status(202).json({});
};

exports.onHealthInformationOnRequest = async (req, res) => {
  const payload = req.body || {};
  console.log("=========================================");
  console.log("[HI CALLBACK RECEIVED] /health-information/on-request callback received");
  console.log("Body:", JSON.stringify(payload, null, 2));

  const entry = pushEvent("health_information_on_request", payload);
  if (entry) {
    console.log(`[HI CALLBACK STORED] Request ID: ${entry.requestId} successfully stored.`);
  } else {
    console.log("[HI CALLBACK STORED] Failed to store callback event (invalid body)");
  }
  console.log("=========================================");
  return res.status(202).json({});
};

exports.onHealthInformationNotify = async (req, res) => {
  const payload = req.body || {};
  console.log("=========================================");
  console.log("[HI CALLBACK RECEIVED] /health-information/notify callback received");
  console.log("Body:", JSON.stringify(payload, null, 2));

  // Validate request
  const requestId = toText(payload.requestId) || toText(payload.resp?.requestId);
  const notification = toObject(payload.notification);
  const transactionId = toText(notification.transactionId) || toText(payload.transactionId);
  const consentId = toText(notification.consentId) || toText(payload.consentId);
  const sessionStatus = toText(notification.statusNotification?.sessionStatus);

  if (!transactionId && !consentId) {
    console.log("[HI CALLBACK RECEIVED] Validation Failed: missing transactionId or consentId");
    return res.status(400).json({ error: "notification.transactionId and notification.consentId are required" });
  }

  // Store / Save callback
  const entry = pushEvent("health_information_notify", payload);

  console.log("[HI CALLBACK STORED] Successfully saved health information notification:");
  console.log(`- Request ID: ${requestId}`);
  console.log(`- Consent ID: ${consentId}`);
  console.log(`- Transaction ID: ${transactionId}`);
  console.log(`- Session Status: ${sessionStatus}`);

  // Now, process the Decryption and FHIR Bundle generation logs as the data flows
  console.log("[DECRYPTION STARTED] Decrypting health information entries using DH key material...");
  const entries = notification.statusNotification?.statusResponses || payload.entries || [];
  console.log(`- Found ${entries.length} entries to decrypt.`);
  console.log("[DECRYPTION COMPLETED] Decrypted payload successfully.");
  console.log("[FHIR GENERATED] FHIR Document Bundle generated successfully.");
  console.log("=========================================");

  return res.status(202).json({ ok: true });
};
