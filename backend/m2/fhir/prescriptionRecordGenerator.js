/**
 * Prescription Record bundle generator.
 *
 * This module intentionally does not use the shared Composition wrapper because
 * PrescriptionRecord has profile-specific exceptions: Composition.type is text
 * only, Encounter.period.start is UTC, and the attachment is Binary.
 */

const { randomUUID } = require("crypto");

const SNOMED_SYSTEM = "http://snomed.info/sct";
const ABDM_HEALTHID_SYSTEM = "https://healthid.ndhm.gov.in";
const ABDM_DOCTOR_SYSTEM = "https://doctor.ndhm.gov.in";
const ABDM_FACILITY_SYSTEM = "https://facility.ndhm.gov.in";
const ABDM_DOCUMENT_SYSTEM = "https://abdm.gov.in/fhir/r4/document";
const V2_0203_SYSTEM = "http://terminology.hl7.org/CodeSystem/v2-0203";
const V3_ACTCODE_SYSTEM = "http://terminology.hl7.org/CodeSystem/v3-ActCode";

const ROUTE_TABLE = {
  ORAL: { code: "26643006", display: "Oral" },
  TOPICAL: { code: "6064005", display: "Topical" },
  INTRAVENOUS: { code: "47625008", display: "Intravenous" },
  INTRAMUSCULAR: { code: "78421000", display: "Intramuscular" },
  SUBCUTANEOUS: { code: "34206005", display: "Subcutaneous" },
  INHALED: { code: "447694001", display: "Respiratory tract" },
  RECTAL: { code: "37161004", display: "Rectal" },
  SUBLINGUAL: { code: "37839007", display: "Sublingual" }
};

const TIMING_TABLE = {
  BEFORE_FOOD: { code: "415621003", display: "Before Food" },
  AFTER_FOOD: { code: "421521009", display: "After Food" },
  WITH_FOOD: { code: "311504000", display: "With Food" },
  EMPTY_STOMACH: { code: "435911000124101", display: "Take on empty stomach" },
  ANYTIME: { code: "311501008", display: "With or without food" }
};

const text = (value) => String(value ?? "").trim();

const urnRef = (id) => `urn:uuid:${id}`;

const toUTC = (dateInput) => {
  const date = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
};

const toIST = (dateInput) => {
  const date = dateInput ? new Date(dateInput) : new Date();
  const base = Number.isNaN(date.getTime()) ? new Date() : date;
  const istMs = base.getTime() + (5.5 * 60 * 60 * 1000);
  return `${new Date(istMs).toISOString().replace("Z", "")}+05:30`;
};

const doctorDisplayName = (name) => {
  const clean = text(name) || "Doctor";
  return /^dr\.?\s+/i.test(clean) ? clean : `Dr. ${clean}`;
};

const generateIds = (medicationCount) => ({
  patient: randomUUID(),
  practitioner: randomUUID(),
  organization: randomUUID(),
  encounter: randomUUID(),
  composition: randomUUID(),
  medicationRequests: Array.from({ length: medicationCount }, () => randomUUID()),
  binary: randomUUID(),
  bundle: randomUUID()
});

const assertCondition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const validateInput = (input) => {
  assertCondition(input && typeof input === "object", "Prescription input is required.");
  assertCondition(text(input.patient?.abhaAddress).includes("@"), "patient.abhaAddress must be a valid ABHA address.");
  assertCondition(Array.isArray(input.medications) && input.medications.length > 0, "Prescription must contain at least one medication.");
  assertCondition(Object.prototype.hasOwnProperty.call(input.practitioner || {}, "hprId"), "practitioner.hprId field is required, even when empty.");

  input.medications.forEach((med, index) => {
    assertCondition(text(med.indicationText), `medications[${index}].indicationText is required.`);
    assertCondition(text(med.indicationSnomedCode), `medications[${index}].indicationSnomedCode is required.`);
    assertCondition(text(med.drugName), `medications[${index}].drugName is required.`);
    assertCondition(text(med.drugSnomedCode), `medications[${index}].drugSnomedCode is required.`);
    assertCondition(ROUTE_TABLE[med.route], `medications[${index}].route is unsupported.`);
    assertCondition(TIMING_TABLE[med.foodTiming], `medications[${index}].foodTiming is unsupported.`);
  });
};

const buildPatient = (input, ids, nowIst) => ({
  resourceType: "Patient",
  id: ids.patient,
  meta: {
    versionId: "1",
    lastUpdated: nowIst,
    profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient"]
  },
  identifier: [
    {
      type: {
        coding: [{ system: V2_0203_SYSTEM, code: "MR", display: "Medical record number" }],
        text: "Medical record number"
      },
      system: ABDM_HEALTHID_SYSTEM,
      value: input.patient.abhaAddress
    }
  ],
  name: [{ text: input.patient.fullName }],
  telecom: [{ system: "phone", value: input.patient.phone, use: "home" }],
  gender: input.patient.gender,
  birthDate: input.patient.birthDate
});

const buildPractitioner = (input, ids, nowIst) => ({
  resourceType: "Practitioner",
  id: ids.practitioner,
  meta: {
    versionId: "1",
    lastUpdated: nowIst,
    profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Practitioner"]
  },
  identifier: [
    {
      type: {
        coding: [{ system: V2_0203_SYSTEM, code: "MD", display: "Medical License number" }],
        text: "Medical License number"
      },
      system: ABDM_DOCTOR_SYSTEM,
      value: input.practitioner.hprId
    }
  ],
  name: [{ text: doctorDisplayName(input.practitioner.name) }]
});

const buildOrganization = (input, ids) => ({
  resourceType: "Organization",
  id: ids.organization,
  meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Organization"] },
  identifier: [
    {
      type: {
        coding: [{ system: V2_0203_SYSTEM, code: "PRN", display: "Provider number" }],
        text: "Provider number"
      },
      system: ABDM_FACILITY_SYSTEM,
      value: input.organization.hfrId
    }
  ],
  name: input.organization.name
});

const buildEncounter = (input, ids) => ({
  resourceType: "Encounter",
  id: ids.encounter,
  meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Encounter"] },
  identifier: [{ system: "https://abdm.gov.in/fhir/encounter", value: input.encounter.internalId }],
  status: "arrived",
  class: {
    system: V3_ACTCODE_SYSTEM,
    code: "AMB",
    display: "Ambulatory-Walkable Outpatient Encounter"
  },
  subject: { reference: urnRef(ids.patient), display: input.patient.fullName },
  period: { start: toUTC(input.encounter.startTime) }
});

const buildMedicationRequest = (med, input, ids, index) => {
  const route = ROUTE_TABLE[med.route];
  const timing = TIMING_TABLE[med.foodTiming];
  const practitionerName = doctorDisplayName(input.practitioner.name);

  return {
    resourceType: "MedicationRequest",
    id: ids.medicationRequests[index],
    meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/MedicationRequest"] },
    status: "active",
    intent: "order",
    medicationCodeableConcept: {
      coding: [{ system: SNOMED_SYSTEM, code: med.drugSnomedCode, display: med.drugName }],
      text: med.drugName
    },
    subject: { reference: urnRef(ids.patient), display: input.patient.fullName },
    authoredOn: toUTC(med.authoredOn),
    requester: { reference: urnRef(ids.practitioner), display: practitionerName },
    reasonCode: [
      {
        coding: [{ system: SNOMED_SYSTEM, code: med.indicationSnomedCode, display: med.indicationText }],
        text: med.indicationText
      }
    ],
    dosageInstruction: [
      {
        text: `• ${med.dosage.morning}-${med.dosage.afternoon}-${med.dosage.evening}`,
        route: {
          coding: [{ system: SNOMED_SYSTEM, code: route.code, display: route.display }],
          text: route.display
        },
        method: {
          coding: [{ system: SNOMED_SYSTEM, code: timing.code, display: timing.display }],
          text: timing.display
        }
      }
    ]
  };
};

const escapePdfText = (value) => text(value)
  .replace(/\\/g, "\\\\")
  .replace(/\(/g, "\\(")
  .replace(/\)/g, "\\)")
  .replace(/[\r\n]+/g, " ");

const renderPrescriptionPdf = (input) => {
  const lines = [
    `Patient: ${input.patient.fullName}`,
    `ABHA: ${input.patient.abhaAddress}`,
    `DOB/Gender: ${input.patient.birthDate} / ${input.patient.gender}`,
    `Facility: ${input.organization.name}`,
    ...input.medications.map((med, index) => {
      const route = ROUTE_TABLE[med.route].display;
      const timing = TIMING_TABLE[med.foodTiming].display;
      return `${index + 1}. ${med.drugName}; Doses ${med.dosage.morning}-${med.dosage.afternoon}-${med.dosage.evening}; ${route}; ${timing}; Reason: ${med.indicationText}`;
    })
  ];
  const summary = escapePdfText(lines.join(" | "));
  const stream = [
    "BT",
    "/F1 14 Tf",
    "72 760 Td",
    "(Prescription) Tj",
    "0 -24 Td",
    "/F1 10 Tf",
    `(${summary.slice(0, 1000)}) Tj`,
    "ET"
  ].join("\n");
  const pdf = [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream`,
    stream,
    "endstream endobj",
    "trailer << /Root 1 0 R >>",
    "%%EOF"
  ].join("\n");
  return Buffer.from(pdf);
};

const buildBinary = (pdfBytes, ids) => {
  assertCondition(Buffer.isBuffer(pdfBytes) && pdfBytes.length > 8, "Prescription PDF must be a non-empty buffer.");
  assertCondition(/^%PDF-[12]\./.test(pdfBytes.subarray(0, 8).toString("ascii")), "Prescription PDF must start with %PDF-1. or %PDF-2.");
  return {
    resourceType: "Binary",
    id: ids.binary,
    meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Binary"] },
    contentType: "application/pdf",
    data: pdfBytes.toString("base64")
  };
};

const buildComposition = (input, ids, nowIst) => ({
  resourceType: "Composition",
  id: ids.composition,
  meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/PrescriptionRecord"] },
  status: "final",
  type: {
    coding: [{ system: SNOMED_SYSTEM, code: "440545006", display: "Prescription record" }],
    text: "Prescription record"
  },
  subject: { reference: urnRef(ids.patient), display: input.patient.fullName },
  encounter: { reference: urnRef(ids.encounter), display: "Ambulatory" },
  date: nowIst,
  author: [{ reference: urnRef(ids.practitioner), display: doctorDisplayName(input.practitioner.name) }],
  title: "Prescription record",
  custodian: { reference: urnRef(ids.organization), display: input.organization.name },
  section: [
    {
      title: "Patient Information",
      entry: [{ reference: urnRef(ids.patient), display: input.patient.fullName }]
    },
    {
      title: "Medications",
      code: {
        coding: [{ system: SNOMED_SYSTEM, code: "721912009", display: "Medication summary document" }]
      },
      entry: input.medications.map((med, index) => ({
        reference: urnRef(ids.medicationRequests[index]),
        display: med.drugName
      }))
    },
    {
      title: "Prescription Record",
      entry: [{ reference: urnRef(ids.binary), display: "Binary" }]
    }
  ]
});

const collectReferences = (value, refs = []) => {
  if (!value || typeof value !== "object") return refs;
  if (typeof value.reference === "string" && value.reference.startsWith("urn:uuid:")) {
    refs.push(value.reference);
  }
  Object.values(value).forEach((child) => collectReferences(child, refs));
  return refs;
};

const findAllResources = (bundle, resourceType) =>
  bundle.entry.map((entry) => entry.resource).filter((resource) => resource?.resourceType === resourceType);

const findResource = (bundle, resourceType) => findAllResources(bundle, resourceType)[0];

const validateBundle = (bundle) => {
  assertCondition(bundle.resourceType === "Bundle", "Bundle.resourceType must be Bundle.");
  assertCondition(bundle.type === "document", "Bundle.type must be document.");
  assertCondition(bundle.meta?.profile?.includes("https://nrces.in/ndhm/fhir/r4/StructureDefinition/PrescriptionRecord"), "Bundle profile must be PrescriptionRecord.");
  assertCondition(text(bundle.id).startsWith("prescription-record-"), "Bundle.id must start with prescription-record-.");
  assertCondition(bundle.entry?.[0]?.resource?.resourceType === "Composition", "Composition must be the first bundle entry.");

  const composition = bundle.entry[0].resource;
  assertCondition(composition.type?.coding?.[0]?.code === "440545006", "Prescription Composition.type must contain SNOMED code 440545006.");
  assertCondition(composition.title === "Prescription record", "Composition.title must be Prescription record.");
  assertCondition(composition.section?.length === 3, "Prescription Composition must contain exactly three sections.");
  assertCondition(composition.section[0].title === "Patient Information", "First section must be Patient Information.");
  assertCondition(composition.section[1].title === "Medications", "Second section must be Medications.");
  assertCondition(composition.section[1].code?.coding?.[0]?.code === "721912009", "Medication section code must be 721912009.");
  assertCondition(composition.section[2].title === "Prescription Record", "Third section must be Prescription Record.");
  assertCondition(composition.section[2].code === undefined, "Prescription Record section must not contain a code block.");

  const fullUrls = new Set(bundle.entry.map((entry) => entry.fullUrl));
  collectReferences(bundle).forEach((ref) => assertCondition(fullUrls.has(ref), `Dangling reference: ${ref}`));

  const binary = findResource(bundle, "Binary");
  assertCondition(binary, "Binary resource missing.");
  assertCondition(!findResource(bundle, "DocumentReference"), "DocumentReference must not be present for Prescription Record.");
  assertCondition(Object.keys(binary).sort().join(",") === "contentType,data,id,meta,resourceType", "Binary must contain exactly resourceType,id,meta,contentType,data.");
  assertCondition(Buffer.from(binary.data, "base64").subarray(0, 5).toString("ascii") === "%PDF-", "Binary.data must decode to a PDF.");

  const medReqs = findAllResources(bundle, "MedicationRequest");
  assertCondition(medReqs.length >= 1, "Prescription requires at least one MedicationRequest.");
  medReqs.forEach((mr) => {
    assertCondition(mr.reasonCode?.length > 0, "reasonCode missing on MedicationRequest.");
    assertCondition(text(mr.reasonCode[0].coding?.[0]?.code), "reasonCode.coding[0].code missing.");
    assertCondition(text(mr.reasonCode[0].text), "reasonCode.text missing.");
    assertCondition(text(mr.dosageInstruction?.[0]?.route?.coding?.[0]?.code), "route.coding[0].code missing.");
    assertCondition(text(mr.dosageInstruction?.[0]?.method?.coding?.[0]?.code), "method.coding[0].code missing.");
    assertCondition(/^• \d+-\d+-\d+$/.test(mr.dosageInstruction?.[0]?.text || ""), "dosageInstruction.text must be pure • X-X-X.");
  });

  const encounter = findResource(bundle, "Encounter");
  assertCondition(encounter?.class?.code === "AMB", "Encounter.class.code must be AMB.");
  assertCondition(/Z$|\+00:00$/.test(encounter.period?.start || ""), "Encounter.period.start must be UTC.");

  const patient = findResource(bundle, "Patient");
  assertCondition(text(patient?.identifier?.[0]?.value).includes("@"), "Patient identifier must be an ABHA address.");
};

const generatePrescriptionBundle = (input) => {
  validateInput(input);
  const now = new Date();
  const nowIst = toIST(now);
  const ids = generateIds(input.medications.length);
  const medicationRequests = input.medications.map((med, index) => buildMedicationRequest(med, input, ids, index));
  const pdfBytes = input.pdfBase64 ? Buffer.from(input.pdfBase64, "base64") : renderPrescriptionPdf(input);
  const binary = buildBinary(pdfBytes, ids);
  const bundle = {
    resourceType: "Bundle",
    id: `prescription-record-${ids.bundle}`,
    meta: {
      versionId: "1",
      lastUpdated: nowIst,
      profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/PrescriptionRecord"]
    },
    identifier: { system: ABDM_DOCUMENT_SYSTEM, value: randomUUID() },
    type: "document",
    timestamp: nowIst,
    entry: [
      { fullUrl: urnRef(ids.composition), resource: buildComposition(input, ids, nowIst) },
      { fullUrl: urnRef(ids.patient), resource: buildPatient(input, ids, nowIst) },
      { fullUrl: urnRef(ids.practitioner), resource: buildPractitioner(input, ids, nowIst) },
      { fullUrl: urnRef(ids.organization), resource: buildOrganization(input, ids) },
      { fullUrl: urnRef(ids.encounter), resource: buildEncounter(input, ids) },
      ...medicationRequests.map((resource, index) => ({ fullUrl: urnRef(ids.medicationRequests[index]), resource })),
      { fullUrl: urnRef(ids.binary), resource: binary }
    ]
  };
  validateBundle(bundle);
  return bundle;
};

module.exports = {
  generatePrescriptionBundle,
  validateBundle,
  ROUTE_TABLE,
  TIMING_TABLE,
  toIST,
  toUTC
};
