const axios = require("axios");
const hospitalConfig = require("../config/hospitalConfig");
const { getGatewayToken } = require("../services/gatewayService");
const { getHeaders } = require("../utils/headers");

const toText = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text.length > 0 ? text : "";
};

const toObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

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
    body: { error: err.message || "ABDM API call failed" },
  };
};

const getGatewayBase = () => toText(process.env.GATEWAY_BASE);
const getFacilityBase = () =>
  toText(process.env.FACILITY_BASE) || "https://apihspsbx.abdm.gov.in/v4/int";

const withGatewayHeaders = async () => {
  const gatewayToken = await getGatewayToken();
  return {
    ...getHeaders(gatewayToken),
  };
};

const withFacilityHeaders = async () => {
  const gatewayToken = await getGatewayToken();
  return {
    accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${gatewayToken}`,
  };
};

const buildScanShareSetupValues = (raw = {}) => {
  const bridgeId =
    toText(raw.bridgeId) ||
    toText(process.env.BRIDGE_ID) ||
    toText(process.env.ABDM_CLIENT_ID) ||
    toText(process.env.CLIENT_ID);
  const publicBaseUrl = (
    toText(raw.url) ||
    toText(raw.publicBaseUrl) ||
    toText(process.env.PUBLIC_BASE_URL)
  ).replace(/\/$/, "");
  const facilityId =
    toText(raw.facilityId) ||
    toText(process.env.FACILITY_ID) ||
    toText(hospitalConfig.scanShareHipId);
  const facilityName =
    toText(raw.facilityName) ||
    toText(process.env.SCAN_SHARE_HOSPITAL_NAME) ||
    toText(process.env.FACILITY_NAME) ||
    toText(hospitalConfig.scanShareHospitalName);
  const serviceName =
    toText(raw.serviceName) ||
    toText(raw.hipName) ||
    toText(process.env.SERVICE_NAME) ||
    facilityName;
  const serviceId =
    toText(raw.serviceId) ||
    toText(process.env.SCAN_SHARE_HIP_ID) ||
    toText(process.env.HIP_ID) ||
    facilityId;

  return {
    bridgeId,
    publicBaseUrl,
    facilityId,
    facilityName,
    serviceName,
    serviceId,
  };
};

const runStep = async (name, fn, { required = true } = {}) => {
  try {
    const result = await fn();
    return {
      name,
      ok: true,
      required,
      ...result,
    };
  } catch (err) {
    const { status, body } = getErrorPayload(err);
    return {
      name,
      ok: false,
      required,
      status,
      error: body,
    };
  }
};

const isDuplicateBridgePatchError = (step) => {
  const error = step?.error?.error || step?.error;
  const code = String(error?.code || "").trim();
  const message = String(error?.message || error?.error || "").toLowerCase();
  return code === "ABDM-1094" || message.includes("duplicate bridge patch");
};

exports.checkSession = async (_req, res) => {
  try {
    const accessToken = await getGatewayToken();
    return res.json({
      ok: true,
      accessTokenPresent: Boolean(toText(accessToken)),
      gatewayBase: getGatewayBase(),
      facilityBase: getFacilityBase(),
      xCmId: toText(process.env.X_CM_ID),
      clientId: toText(process.env.ABDM_CLIENT_ID || process.env.CLIENT_ID),
    });
  } catch (err) {
    const { status, body } = getErrorPayload(err);
    return res.status(status).json(body);
  }
};

exports.runScanShareSetup = async (req, res) => {
  const values = buildScanShareSetupValues(toObject(req.body));
  const missing = Object.entries({
    bridgeId: values.bridgeId,
    publicBaseUrl: values.publicBaseUrl,
    facilityId: values.facilityId,
    facilityName: values.facilityName,
  })
    .filter(([, value]) => !toText(value))
    .map(([key]) => key);

  if (missing.length > 0) {
    return res.status(400).json({
      ok: false,
      error: `Missing Scan and Share setup value(s): ${missing.join(", ")}`,
      values,
    });
  }

  const steps = [];

  steps.push(
    await runStep("session", async () => {
      const accessToken = await getGatewayToken();
      return {
        status: 200,
        accessTokenPresent: Boolean(toText(accessToken)),
      };
    })
  );

  if (!steps[0].ok) {
    return res.status(502).json({
      ok: false,
      values,
      callbackUrl: `${values.publicBaseUrl}/api/hiecm/patient-share/v3/share`,
      steps,
    });
  }

  const gatewayHeaders = await withGatewayHeaders();
  const facilityHeaders = await withFacilityHeaders();

  const bridgeUrlStep = await runStep("updateBridgeUrl", async () => {
    const payload = {
      url: values.publicBaseUrl,
    };
    const response = await axios.patch(
      `${getGatewayBase()}/api/hiecm/gateway/v3/bridge/url`,
      payload,
      { headers: gatewayHeaders, timeout: 10000 }
    );
    return {
      status: response.status,
      payload,
    };
  });

  steps.push(
    isDuplicateBridgePatchError(bridgeUrlStep)
      ? {
        ...bridgeUrlStep,
        ok: true,
        duplicateAccepted: true,
        message:
          "ABDM already has a pending bridge URL patch for this bridge; continuing with QR display.",
      }
      : bridgeUrlStep
  );

  steps.push(
    await runStep("registerBridgeServices", async () => {
      const payload = {
        facilityId: values.facilityId,
        facilityName: values.facilityName,
        HRP: [
          {
            bridgeId: values.bridgeId,
            hipName: values.serviceName,
            type: "HIP",
            active: true,
          },
        ],
      };
      const response = await axios.post(
        `${getFacilityBase()}/v1/bridges/MutipleHRPAddUpdateServices`,
        payload,
        { headers: facilityHeaders, timeout: 6000 }
      );
      return {
        status: response.status,
        payload,
        data: response.data,
      };
    }, { required: false })
  );

  steps.push(
    await runStep(
      "findBridgeServiceByServiceId",
      async () => {
        const response = await axios.get(
          `${getGatewayBase()}/api/hiecm/gateway/v3/bridge-service/serviceId/${encodeURIComponent(values.serviceId)}`,
          { headers: gatewayHeaders }
        );
        return {
          status: response.status,
          serviceId: values.serviceId,
          data: response.data,
        };
      },
      { required: false }
    )
  );

  steps.push(
    await runStep(
      "findServicesByBridgeId",
      async () => {
        const response = await axios.get(
          `${getGatewayBase()}/api/hiecm/gateway/v3/bridge-services/${encodeURIComponent(values.bridgeId)}`,
          { headers: gatewayHeaders }
        );
        return {
          status: response.status,
          bridgeId: values.bridgeId,
          data: response.data,
        };
      },
      { required: false }
    )
  );

  const requiredOk = steps
    .filter((step) => step.required)
    .every((step) => step.ok);

  return res.status(requiredOk ? 200 : 502).json({
    ok: requiredOk,
    values,
    callbackUrl: `${values.publicBaseUrl}/api/hiecm/patient-share/v3/share`,
    steps,
  });
};

exports.updateBridgeUrl = async (req, res) => {
  try {
    const bridgeId =
      toText(req.body?.bridgeId) ||
      toText(process.env.BRIDGE_ID) ||
      toText(process.env.ABDM_CLIENT_ID);
    const url =
      toText(req.body?.url) ||
      toText(process.env.PUBLIC_BASE_URL);

    if (!bridgeId) {
      return res.status(400).json({ error: "bridgeId is required" });
    }
    if (!url) {
      return res.status(400).json({ error: "url is required" });
    }

    const headers = await withGatewayHeaders();
    const payload = { bridgeId, url };
    const bridgeUrlPayload = { url };

    const response = await axios.patch(
      `${getGatewayBase()}/api/hiecm/gateway/v3/bridge/url`,
      bridgeUrlPayload,
      { headers }
    );

    return res.status(response.status).json({
      accepted: response.status === 202,
      bridgeId,
      url,
      statusCode: response.status,
      payload: bridgeUrlPayload,
      message: "Bridge URL update request sent to ABDM gateway",
    });
  } catch (err) {
    const { status, body } = getErrorPayload(err);
    return res.status(status).json(body);
  }
};

exports.registerBridgeServices = async (req, res) => {
  try {
    const raw = toObject(req.body);
    const facilityId =
      toText(raw.facilityId) ||
      toText(process.env.FACILITY_ID) ||
      toText(hospitalConfig.scanShareHipId);
    const facilityName =
      toText(raw.facilityName) ||
      toText(process.env.SCAN_SHARE_HOSPITAL_NAME) ||
      toText(process.env.FACILITY_NAME) ||
      toText(hospitalConfig.scanShareHospitalName);
    const bridgeId =
      toText(raw.bridgeId) ||
      toText(process.env.BRIDGE_ID) ||
      toText(process.env.ABDM_CLIENT_ID);
    const serviceName =
      toText(raw.serviceName) ||
      toText(raw.hipName) ||
      toText(process.env.SCAN_SHARE_HOSPITAL_NAME) ||
      facilityName;
    const registerHip = raw.registerHip !== false;
    const registerHiu = raw.registerHiu === true;

    const payload =
      Array.isArray(raw.HRP) && raw.HRP.length
        ? raw
        : {
          facilityId,
          facilityName,
          HRP: [
            ...(registerHip
              ? [
                {
                  bridgeId,
                  hipName: serviceName,
                  type: "HIP",
                  active: true,
                },
              ]
              : []),
            ...(registerHiu
              ? [
                {
                  bridgeId,
                  hipName: serviceName,
                  type: "HIU",
                  active: true,
                },
              ]
              : []),
          ],
        };

    if (!toText(payload.facilityId)) {
      return res.status(400).json({ error: "facilityId is required" });
    }
    if (!toText(payload.facilityName)) {
      return res.status(400).json({ error: "facilityName is required" });
    }
    if (!Array.isArray(payload.HRP) || payload.HRP.length === 0) {
      return res.status(400).json({ error: "At least one HRP registration entry is required" });
    }

    const headers = await withFacilityHeaders();
    const response = await axios.post(
      `${getFacilityBase()}/v1/bridges/MutipleHRPAddUpdateServices`,
      payload,
      { headers }
    );

    return res.status(response.status).json(
      response.data && typeof response.data === "object"
        ? response.data
        : {
          statusCode: response.status,
          message: "Bridge service registration request completed",
          payload,
        }
    );
  } catch (err) {
    const { status, body } = getErrorPayload(err);
    return res.status(status).json(body);
  }
};

exports.findBridgeServiceByServiceId = async (req, res) => {
  try {
    const serviceId =
      toText(req.params?.serviceId) || toText(req.query?.serviceId);
    if (!serviceId) {
      return res.status(400).json({ error: "serviceId is required" });
    }

    const headers = await withGatewayHeaders();
    const response = await axios.get(
      `${getGatewayBase()}/api/hiecm/gateway/v3/bridge-service/serviceId/${encodeURIComponent(serviceId)}`,
      { headers }
    );

    return res.status(response.status).json(response.data);
  } catch (err) {
    const { status, body } = getErrorPayload(err);
    return res.status(status).json(body);
  }
};

exports.findServicesByBridgeId = async (req, res) => {
  try {
    const bridgeId =
      toText(req.params?.bridgeId) ||
      toText(req.query?.bridgeId) ||
      toText(process.env.BRIDGE_ID) ||
      toText(process.env.ABDM_CLIENT_ID);
    if (!bridgeId) {
      return res.status(400).json({ error: "bridgeId is required" });
    }

    const headers = await withGatewayHeaders();
    const response = await axios.get(
      `${getGatewayBase()}/api/hiecm/gateway/v3/bridge-services/${encodeURIComponent(bridgeId)}`,
      { headers }
    );

    return res.status(response.status).json(response.data);
  } catch (err) {
    const { status, body } = getErrorPayload(err);
    return res.status(status).json(body);
  }
};

exports.fetchGatewayCerts = async (_req, res) => {
  try {
    const headers = await withGatewayHeaders();
    const response = await axios.get(
      `${getGatewayBase()}/api/hiecm/gateway/v3/certs`,
      { headers }
    );

    return res.status(response.status).json(response.data);
  } catch (err) {
    const { status, body } = getErrorPayload(err);
    return res.status(status).json(body);
  }
};

exports.fetchOpenIdConfiguration = async (_req, res) => {
  try {
    const headers = await withGatewayHeaders();
    const response = await axios.get(
      `${getGatewayBase()}/api/hiecm/gateway/v3/.well-known/openid-configuration`,
      { headers }
    );

    return res.status(response.status).json(response.data);
  } catch (err) {
    const { status, body } = getErrorPayload(err);
    return res.status(status).json(body);
  }
};
