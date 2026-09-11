const axios = require("axios");

const hospitalConfig = require("../config/hospitalConfig");
const { getGatewayToken } = require("../services/gatewayService");
const { getHeaders } = require("../utils/headers");
const { nowIso } = require("../utils/dateUtils");
const {
  recordIssuedToken,
  getLatestIssuedToken,
  listIssuedTokens,
  updateIssuedTokenStatus,
  updateIssuedToken,
} = require("../utils/scanShareTokenStore");

const toText = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text && text.toLowerCase() !== "null" ? text : "";
};

const summarizePatient = (payload = {}) => {
  const patient = payload?.profile?.patient || {};
  const address = patient.address || {};
  return {
    abhaNumber: toText(
      patient.AbhaNumber || patient.ABHANumber || patient.abhaNumber
    ),
    abhaAddress: toText(
      patient.AbhaAddress || patient.abhaAddress || patient.preferredAbhaAddress
    ),
    name: toText(patient.name || patient.fullName),
    gender: toText(patient.gender),
    dob: [patient.dayOfBirth, patient.monthOfBirth, patient.yearOfBirth]
      .map(toText)
      .filter(Boolean)
      .join("-"),
    mobile: toText(patient.phoneNumber || patient.mobile),
    address: toText(address.line || patient.address),
    district: toText(address.district),
    state: toText(address.state),
    pincode: toText(address.pinCode || address.pincode),
    rawProfile: patient,
  };
};

const getRequestId = (req, payload = {}) =>
  toText(payload?.response?.requestId) ||
  toText(payload?.requestId) ||
  toText(req.headers["request-id"]);

const getHipId = (payload = {}) =>
  toText(
    payload?.metaData?.hipId ||
      payload?.metadata?.hipId ||
      hospitalConfig.scanShareHipId
  );


const buildAcknowledgementPayload = ({ requestId, abhaAddress, tokenNumber }) => ({
  timestamp: nowIso(),
  acknowledgement: {
    status: "SUCCESS",
    abhaAddress,
    profile: {
      context: "5",
      tokenNumber,
      expiry: "1800",
    },
  },
  resp: {
    requestId,
  },
  response: {
    requestId,
  },
});

const buildOpenOrderAcknowledgementPayload = ({
  requestId,
  abhaAddress,
  tokenNumber,
}) => ({
  requestId,
  timestamp: nowIso(),
  intent: "OPEN_PAYMENT_ORDER",
  AbhaAddress: abhaAddress,
  patientUid: tokenNumber,
  procedures: [
    {
      category: "OPD consultation",
      services: [
        {
          serviceId: "scan-share-token",
          name: "Scan and Share Queue Token",
          description: "Queue token generated for hospital registration",
          amount: 0,
        },
      ],
    },
  ],
  resp: {
    requestId,
  },
  response: {
    requestId,
  },
});

const sendOnShareAcknowledgement = async (payload) => {
  const gatewayToken = await getGatewayToken();
  const response = await axios.post(
    `${process.env.GATEWAY_BASE}/api/hiecm/patient-share/v3/on-share`,
    payload,
    {
      headers: getHeaders(gatewayToken),
    }
  );
  return response.data || {};
};

const sendOpenOrderAcknowledgement = async (payload) => {
  const gatewayToken = await getGatewayToken();
  const response = await axios.post(
    `${process.env.GATEWAY_BASE}/api/hiecm/scan-gateway/v3/patient/on-share/open-order`,
    payload,
    {
      headers: getHeaders(gatewayToken),
    }
  );
  return response.data || {};
};

const acknowledgeInBackground = async ({
  issued,
  isOpenOrder,
  acknowledgementPayload,
}) => {
  try {
    const acknowledgementResponse = isOpenOrder
      ? await sendOpenOrderAcknowledgement(acknowledgementPayload)
      : await sendOnShareAcknowledgement(acknowledgementPayload);

    updateIssuedToken(issued.tokenNumber, {
      acknowledgementStatus: "sent",
      acknowledgementSentAt: nowIso(),
      acknowledgementResponse,
    });
  } catch (error) {
    updateIssuedToken(issued.tokenNumber, {
      acknowledgementStatus: "failed",
      acknowledgementFailedAt: nowIso(),
      acknowledgementError:
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        "Failed to acknowledge patient share",
    });
    console.error(
      "[ScanShare] Failed to send on-share acknowledgement",
      error.response?.data || error.message || error
    );
  }
};

const handlePatientShare = async (req, res, { openOrder = false } = {}) => {
  const payload = req.body || {};
  const isOpenOrder =
    openOrder || toText(payload.intent).toUpperCase() === "OPEN_PAYMENT_ORDER";
  const requestId = getRequestId(req, payload);
  const patient = summarizePatient(payload);
  const hipId = getHipId(payload);

  try {
    if (!requestId) {
      return res.status(400).json({
        accepted: false,
        error: "requestId is required for Scan and Share callback",
      });
    }

    const issued = recordIssuedToken({
      requestId,
      hipId,
      patient,
      facilityName: hospitalConfig.scanShareHospitalName,
      counterLabel: hospitalConfig.scanShareCounterLabel,
      flow: isOpenOrder ? "open-order" : "profile-share",
      source: isOpenOrder
        ? "open-order-share-callback"
        : "patient-share-callback",
      acknowledgementStatus: "pending",
    });

    console.log(
      "[ScanShare] Patient scan added to queue",
      JSON.stringify(
        {
          tokenNumber: issued.tokenNumber,
          duplicateScan: issued.duplicateScan === true,
          scanCount: issued.scanCount,
          name: patient.name,
          abhaAddress: patient.abhaAddress,
          abhaNumber: patient.abhaNumber,
          mobile: patient.mobile,
          hipId,
          flow: issued.flow,
        },
        null,
        2
      )
    );

    const acknowledgementPayload = isOpenOrder
      ? buildOpenOrderAcknowledgementPayload({
          requestId,
          abhaAddress: patient.abhaAddress,
          tokenNumber: issued.tokenNumber,
        })
      : buildAcknowledgementPayload({
          requestId,
          abhaAddress: patient.abhaAddress,
          tokenNumber: issued.tokenNumber,
        });

    acknowledgeInBackground({
      issued,
      isOpenOrder,
      acknowledgementPayload,
    });

    return res.status(202).json({
      accepted: true,
      requestId,
      hipId,
      flow: issued.flow,
      tokenNumber: issued.tokenNumber,
      expirySeconds: issued.expirySeconds,
      duplicateScan: issued.duplicateScan === true,
      scanCount: issued.scanCount,
      acknowledgementStatus: "pending",
    });
  } catch (error) {
    return res.status(202).json({
      accepted: false,
      requestId,
      hipId,
      error:
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        "Failed to acknowledge patient share",
    });
  }
};

exports.onPatientShare = (req, res) => handlePatientShare(req, res);

exports.onOpenOrderShare = (req, res) =>
  handlePatientShare(req, res, { openOrder: true });

exports.getLatestScanShareStatus = async (_req, res) => {
  return res.json({
    hospitalName: hospitalConfig.scanShareHospitalName,
    hipId: hospitalConfig.scanShareHipId,
    latest: getLatestIssuedToken(),
  });
};

exports.listScanShareQueue = async (req, res) => {
  const status = toText(req.query.status);
  return res.json({
    hospitalName: hospitalConfig.scanShareHospitalName,
    hipId: hospitalConfig.scanShareHipId,
    queue: listIssuedTokens({ status }),
  });
};

exports.markScanShareRegistered = async (req, res) => {
  const tokenNumber = toText(req.params.tokenNumber);
  const updated = updateIssuedTokenStatus(tokenNumber, "registered");
  if (!updated) {
    return res.status(404).json({
      error: "Scan and share token not found",
      tokenNumber,
    });
  }

  return res.json({
    updated,
  });
};

exports.skipScanShareToken = async (req, res) => {
  const tokenNumber = toText(req.params.tokenNumber);
  const updated = updateIssuedTokenStatus(tokenNumber, "skipped");
  if (!updated) {
    return res.status(404).json({
      error: "Scan and share token not found",
      tokenNumber,
    });
  }

  return res.json({
    updated,
  });
};
