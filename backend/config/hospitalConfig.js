const text = (value) => {
  if (value === null || value === undefined) return "";
  const next = String(value).trim();
  return next.length > 0 ? next : "";
};

const hospitalName = text(process.env.FACILITY_NAME) || "Sarita Health Care";
const hospitalShortName =
  text(process.env.HOSPITAL_SHORT_NAME) || "Sarita";
const hospitalLegalName =
  text(process.env.BENEFIT_NAME) || text(process.env.HOSPITAL_LEGAL_NAME) || "SaritaInfotech";
const hipId = text(process.env.HIP_ID) || "IN2410002480";
const hiuId = text(process.env.HIU_ID) || hipId;
const requesterName =
  text(process.env.REQUESTER_NAME) || `${hospitalShortName} ABDM App`;
const scanShareHospitalName =
  text(process.env.SCAN_SHARE_HOSPITAL_NAME) || "Yashfeen Group of Hospitals";
const scanShareHipId =
  text(process.env.SCAN_SHARE_HIP_ID) || "IN2410002480";
const scanShareCounterLabel =
  text(process.env.SCAN_SHARE_COUNTER_LABEL) || "Counter: 1";

module.exports = {
  hospitalName,
  hospitalShortName,
  hospitalLegalName,
  requesterName,
  hipId,
  hiuId,
  scanShareHospitalName,
  scanShareHipId,
  scanShareCounterLabel,
};
