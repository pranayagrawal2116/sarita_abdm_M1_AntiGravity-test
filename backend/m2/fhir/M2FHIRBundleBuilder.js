/**
 * M2FHIRBundleBuilder.js
 *
 * Builds a FHIR R4 Bundle from a persisted M2 transaction.
 *
 * The transaction contains:
 *   - transaction.patient  → array of { referenceNumber, hiType, careContexts[] }
 *   - transaction.hiTypes  → array of consented HI types from the gateway consent
 *   - transaction.consentDetail → { careContexts[], permission.dateRange, ... }
 *   - transaction.abhaAddress  → patient ABHA address / identifier
 *   - transaction.consentArtefactId → used in Bundle.identifier
 *
 * The bundle type is "document" per ABDM M2 spec.
 */

const { randomUUID } = require("crypto");
const hospitalConfig = require("../../config/hospitalConfig");
const M2FHIRBuilder = require("./M2FHIRBuilder");
const { generatePrescriptionBundle } = require("./prescriptionRecordGenerator");

const log = (event, details = {}) => {
  console.log(JSON.stringify({ scope: "M2FHIRBundleBuilder", event, ...details }));
};

const text = (value) => String(value ?? "").trim();

const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// HI Type → FHIR resourceType mapping (ABDM canonical names)
// ---------------------------------------------------------------------------
const HI_TYPE_TO_FHIR_RESOURCE = {
  DiagnosticReport: "DiagnosticReport",
  Prescription: "MedicationRequest",
  OPConsultation: "Composition",
  DischargeSummary: "Composition",
  ImmunizationRecord: "Immunization",
  HealthDocumentRecord: "DocumentReference",
  WellnessRecord: "Observation",
  Invoice: "Invoice",
};

const HI_TYPE_TO_RECORD_TYPE = {
  DiagnosticReport: "Diagnostic Report",
  Prescription: "Prescription",
  OPConsultation: "OPConsultation",
  DischargeSummary: "Discharge Summary",
  ImmunizationRecord: "Immunization",
  HealthDocumentRecord: "Health Document",
  WellnessRecord: "Wellness",
};

// Normalise an ABDM HI type string to the canonical key used above.
// Handles common variants like "Wellness", "Wellness Record", "OP Consultation".
const normalizeHiType = (raw) => {
  const s = text(raw).replace(/\s+/g, "").toLowerCase();
  if (s === "diagnosticreport") return "DiagnosticReport";
  if (s === "prescription" || s === "prescriptionrecord") return "Prescription";
  if (s === "opconsultation" || s === "consultation") return "OPConsultation";
  if (s === "dischargesummary" || s === "discharge") return "DischargeSummary";
  if (s === "immunizationrecord" || s === "immunization") return "ImmunizationRecord";
  if (s === "healthdocumentrecord" || s === "healthdocument") return "HealthDocumentRecord";
  if (s === "wellnessrecord" || s === "wellness") return "WellnessRecord";
  if (s === "invoice") return "Invoice";
  // Fallback: return the raw value unchanged so we don't silently discard it
  return text(raw);
};

const escapePdfText = (value) => text(value)
  .replace(/\\/g, "\\\\")
  .replace(/\(/g, "\\(")
  .replace(/\)/g, "\\)");

const createPdfBase64 = (title, content) => {
  const safeTitle = escapePdfText(title || "Health Record").replace(/[\r\n]+/g, " ");
  const rawContent = (content || "Clinical record generated for ABDM transfer.").split(/\r?\n/);
  
  const lines = [
    "BT",
    "/F1 14 Tf",
    "72 760 Td",
    `(${safeTitle}) Tj`,
    "0 -24 Td",
    "/F1 10 Tf"
  ];

  let currentY = 736;
  for (const line of rawContent) {
    if (currentY < 50) break; // Avoid writing off bottom of page
    const safeLine = escapePdfText(line).slice(0, 110);
    lines.push(`(${safeLine}) Tj`);
    lines.push("0 -14 Td");
    currentY -= 14;
  }
  lines.push("ET");
  
  const stream = lines.join("\n");
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
  return Buffer.from(pdf).toString("base64");
};

const extractAbhaNumber = (value) => {
  const match = text(value).match(/\b\d{2}-\d{4}-\d{4}-\d{4}\b/);
  return match ? match[0] : "";
};

const contentLines = (content) => text(content)
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const patientNameFromFolder = (folderName, abhaId) => {
  const suffix = text(folderName)
    .replace(abhaId, "")
    .replace(/^_/, "")
    .replace(/_/g, " ")
    .trim();
  return suffix || abhaId;
};

const matchField = (content, label) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text(content).match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+?)\\s*$`, "im"));
  return match ? text(match[1]) : "";
};

const normalizeGenderValue = (value) => {
  const raw = text(value).toLowerCase();
  if (raw === "m" || raw === "male") return "male";
  if (raw === "f" || raw === "female") return "female";
  if (raw === "o" || raw === "other") return "other";
  if (raw === "u" || raw === "unknown") return "unknown";
  return raw || "unknown";
};

const normalizeBirthDateValue = (value) => {
  const raw = text(value);
  const parts = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (parts) {
    return `${parts[3]}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  }
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }
  return "2000-01-01";
};

const extractIndentedValue = (lines, sectionPattern, fieldPattern) => {
  const start = lines.findIndex((line) => sectionPattern.test(line));
  if (start < 0) return "";
  for (let i = start + 1; i < Math.min(lines.length, start + 12); i += 1) {
    const line = lines[i];
    if (/^[A-Za-z].*:\s*$/.test(line) && !fieldPattern.test(line)) break;
    const match = line.match(fieldPattern);
    if (match && text(match[1]) && text(match[1]) !== "-") return text(match[1]);
  }
  return "";
};

const extractIndentedList = (lines, sectionPattern) => {
  const start = lines.findIndex((line) => sectionPattern.test(line));
  if (start < 0) return [];
  const items = [];
  for (let i = start + 1; i < Math.min(lines.length, start + 20); i += 1) {
    const line = lines[i];
    if (/^[A-Za-z].*:\s*$/.test(line) || /^[A-Za-z].*:\s*.+$/.test(line)) break;
    const match = line.match(/^\s*-\s*(.+)$/);
    if (match && text(match[1]) && text(match[1]) !== "-") {
      items.push(text(match[1]));
    }
  }
  return items;
};

const normalizeRouteEnum = (value) => {
  const raw = text(value).replace(/[\s-]+/g, "_").toUpperCase();
  const aliases = {
    ORAL: "ORAL",
    TOPICAL: "TOPICAL",
    IV: "INTRAVENOUS",
    INTRAVENOUS: "INTRAVENOUS",
    IM: "INTRAMUSCULAR",
    INTRAMUSCULAR: "INTRAMUSCULAR",
    SC: "SUBCUTANEOUS",
    SUBCUTANEOUS: "SUBCUTANEOUS",
    INHALED: "INHALED",
    RESPIRATORY_TRACT: "INHALED",
    RECTAL: "RECTAL",
    SUBLINGUAL: "SUBLINGUAL"
  };
  return aliases[raw] || "ORAL";
};

const normalizeFoodTimingEnum = (value) => {
  const raw = text(value).replace(/[\s-]+/g, "_").toUpperCase();
  const aliases = {
    BEFORE_FOOD: "BEFORE_FOOD",
    BEFORE: "BEFORE_FOOD",
    AFTER_FOOD: "AFTER_FOOD",
    AFTER: "AFTER_FOOD",
    WITH_FOOD: "WITH_FOOD",
    WITH: "WITH_FOOD",
    EMPTY_STOMACH: "EMPTY_STOMACH",
    ANYTIME: "ANYTIME",
    ANY_TIME: "ANYTIME"
  };
  return aliases[raw] || "ANYTIME";
};

const parseDoseSchedule = (value) => {
  const match = text(value).match(/(\d+)\s*[-–]\s*(\d+)\s*[-–]\s*(\d+)/);
  if (!match) return { morning: 1, afternoon: 0, evening: 1 };
  return {
    morning: Number(match[1]),
    afternoon: Number(match[2]),
    evening: Number(match[3])
  };
};

const inferDrugCode = (drugName) => {
  const raw = text(drugName).toLowerCase();
  if (/para|acetaminophen|paracetamol/.test(raw)) return "387517004";
  if (/amoxicillin/.test(raw)) return "387544009";
  if (/pantoprazole/.test(raw)) return "1086921000168107";
  return "387517004";
};

const inferIndicationCode = (indicationText) => {
  const raw = text(indicationText).toLowerCase();
  if (/fever|pyrexia/.test(raw)) return "386661006";
  if (/pain|ache/.test(raw)) return "22253000";
  if (/gas|gastr|acid|reflux/.test(raw)) return "235595009";
  if (/cough/.test(raw)) return "49727002";
  return "404684003";
};

const normalizeDrugName = (value) => {
  const raw = text(value);
  if (/^para$/i.test(raw)) return "Paracetamol 500mg Tablet";
  return raw || "Clinical medication as recorded";
};

const buildPrescriptionInput = (businessData) => {
  const medication = businessData.medications?.[0] || {};
  return {
    patient: {
      abhaAddress: businessData.abhaAddress,
      fullName: businessData.patientName,
      phone: businessData.mobile,
      gender: businessData.gender === "unknown" ? "other" : businessData.gender,
      birthDate: businessData.birthDate
    },
    practitioner: {
      name: businessData.doctorName,
      hprId: Object.prototype.hasOwnProperty.call(businessData, "doctorLicense") ? businessData.doctorLicense : ""
    },
    organization: {
      name: businessData.facilityName,
      hfrId: businessData.facilityCode
    },
    encounter: {
      internalId: businessData.encounterId || randomUUID(),
      startTime: businessData.timestamp
    },
    medications: businessData.medications.map((med) => ({
      drugName: normalizeDrugName(med.drugName || med.medDisplay),
      drugSnomedCode: text(med.drugSnomedCode || med.medCode) || inferDrugCode(med.drugName || med.medDisplay),
      indicationText: text(med.indicationText || med.reasonDisplay || med.instructions || medication.indicationText) || "Clinical indication recorded",
      indicationSnomedCode: text(med.indicationSnomedCode || med.reasonCode) || inferIndicationCode(med.indicationText || med.reasonDisplay || med.instructions),
      dosage: med.dosage || parseDoseSchedule(med.dose || med.dosageText || ""),
      route: normalizeRouteEnum(med.route),
      foodTiming: normalizeFoodTimingEnum(med.foodTiming || med.timing),
      authoredOn: med.authoredOn || businessData.timestamp
    }))
  };
};

const buildBusinessDataFromTextFile = ({ abhaId, folderName, file }) => {
  const lines = contentLines(file.content);
  const summary = lines.slice(0, 8).join("; ") || `${file.hiType} generated for ABDM transfer`;
  const primaryLine = lines[0] || "Clinical record review";
  const patientName = matchField(file.content, "Name") || patientNameFromFolder(folderName, abhaId);
  const abhaAddress = matchField(file.content, "ABHA Address") || abhaId;
  const abhaNumber =
    matchField(file.content, "ABHA Number") ||
    extractAbhaNumber(file.fileName) ||
    extractAbhaNumber(file.filePath);
  const mobile = matchField(file.content, "Mobile");
  const gender = normalizeGenderValue(matchField(file.content, "Gender") || matchField(file.content, "Sex"));
  const birthDate = normalizeBirthDateValue(
    matchField(file.content, "DOB / YOB") ||
    matchField(file.content, "DOB") ||
    matchField(file.content, "Date of Birth")
  );
  const medicationName =
    extractIndentedValue(lines, /^Medications:/i, /^\s*Name:\s*(.+)$/i) ||
    extractIndentedValue(lines, /^Draft Medication:/i, /^\s*Name:\s*(.+)$/i) ||
    lines.find((line) => /tablet|capsule|syrup|mg|drug|medicine/i.test(line));
  const dosage = extractIndentedValue(lines, /^Medications:/i, /^\s*(?:Dose|Doses|Dosage):\s*(.+)$/i);
  const route = extractIndentedValue(lines, /^Medications:/i, /^\s*Route:\s*(.+)$/i);
  const timing = extractIndentedValue(lines, /^Medications:/i, /^\s*Timing:\s*(.+)$/i);
  const instructions = extractIndentedValue(lines, /^Medications:/i, /^\s*Instructions:\s*(.+)$/i);
  const medDisplay = text(medicationName) || "Clinical medication as recorded";
  const instructionText = [dosage && `Doses: ${dosage}`, route && `Route: ${route}`, timing && `Timing: ${timing}`]
    .filter(Boolean)
    .join("; ") || "As directed";
  const labStart = lines.findIndex((line) => /^(?:Reports?|Lab Reports):/i.test(line));
  const labObservations = [];
  let reportName = "Diagnostic report";
  if (labStart >= 0) {
    for (let i = labStart + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^(?:Vitals|Medications|Allergies|Medical History|Chief Complaints|Complaints|Investigation Advice):/i.test(line)) break; // next main section
      const rnMatch = line.match(/^\s*Report Name:\s*(.+)$/i);
      if (rnMatch) reportName = text(rnMatch[1]);
      const tnMatch = line.match(/^\s*Test Name:\s*(.+)$/i);
      if (tnMatch) {
        // Look ahead for Value and Unit
        let v = "Recorded", u = "";
        for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
           const vMatch = lines[j].match(/^\s*Value:\s*(.+)$/i);
           if (vMatch) v = text(vMatch[1]);
           const uMatch = lines[j].match(/^\s*Unit:\s*(.+)$/i);
           if (uMatch) u = text(uMatch[1]);
        }
        const parsedValue = !isNaN(Number(v)) && v.trim() !== "" ? Number(v) : v;
        labObservations.push({ code: "718-7", display: text(tnMatch[1]), value: parsedValue, unit: u });
      }
    }
  }

  const temperature = extractIndentedValue(lines, /^Vitals:/i, /^\s*Temperature:\s*(.+)$/i);
  const height = extractIndentedValue(lines, /^Vitals:/i, /^\s*Height:\s*(.+)$/i);
  const weight = extractIndentedValue(lines, /^Vitals:/i, /^\s*Weight:\s*(.+)$/i);
  const bmi = extractIndentedValue(lines, /^Vitals:/i, /^\s*Bmi:\s*(.+)$/i);
  const respRate = extractIndentedValue(lines, /^Vitals:/i, /^\s*(?:Respiratory rate|Resp Rate):\s*(.+)$/i);
  const heartRate = extractIndentedValue(lines, /^Vitals:/i, /^\s*(?:Heart rate|Pulse):\s*(.+)$/i);
  const spo2 = extractIndentedValue(lines, /^Vitals:/i, /^\s*(?:Oxygen|SpO2):\s*(.+)$/i);
  const bpSys = extractIndentedValue(lines, /^Vitals:/i, /^\s*(?:Bp Systolic|BP Systolic):\s*(.+)$/i);
  const bpDia = extractIndentedValue(lines, /^Vitals:/i, /^\s*(?:Bp Diastolic|BP Diastolic):\s*(.+)$/i);

  const allergiesList = extractIndentedList(lines, /^Allergies:/i);
  const historyList = extractIndentedList(lines, /^Medical History:/i);
  const complaintsList = extractIndentedList(lines, /^(?:Chief )?Complaints:/i);
  const investigationsList = extractIndentedList(lines, /^Investigation Advice:/i);

  const vitals = [];
  if (respRate) vitals.push({ code: "9279-1", display: "Respiratory rate", value: Number(respRate), unit: "/min" });
  if (heartRate) vitals.push({ code: "8867-4", display: "Heart rate", value: Number(heartRate), unit: "/min" });
  if (spo2) vitals.push({ code: "2708-6", display: "Oxygen saturation in Arterial blood", value: Number(spo2), unit: "%" });
  if (temperature) vitals.push({ code: "8310-5", display: "Body surface temperature", value: Number(temperature), unit: "degF" });
  if (bpSys) vitals.push({ code: "8480-6", display: "Systolic blood pressure", value: Number(bpSys), unit: "mmHg" });
  if (bpDia) vitals.push({ code: "8462-4", display: "Diastolic blood pressure", value: Number(bpDia), unit: "mmHg" });

  const measurements = [];
  if (height) measurements.push({ code: "8302-2", display: "Body height", value: Number(height), unit: "cm" });
  if (weight) measurements.push({ code: "29463-7", display: "Body weight", value: Number(weight), unit: "kg" });
  if (bmi) measurements.push({ code: "39156-5", display: "Body mass index (BMI) [Ratio]", value: Number(bmi), unit: "kg/m2" });

  const sleepHours = extractIndentedValue(lines, /^Physical Activity:/i, /^\s*Sleep Hours:\s*(.+)$/i);
  const caloriesBurned = extractIndentedValue(lines, /^Physical Activity:/i, /^\s*Calories Burned:\s*(.+)$/i);
  const stepCount = extractIndentedValue(lines, /^Physical Activity:/i, /^\s*Step Count:\s*(.+)$/i);

  const physicalActivity = [];
  if (sleepHours) physicalActivity.push({ code: "248263006", display: "Sleep Hours", value: Number(sleepHours), unit: "h" });
  if (caloriesBurned) physicalActivity.push({ code: "41981-2", display: "Calories Burned", value: Number(caloriesBurned), unit: "kcal" });
  if (stepCount) physicalActivity.push({ code: "55423-8", display: "Step Count", value: Number(stepCount), unit: "/d" });

  const calIntake = extractIndentedValue(lines, /^General Assessment:/i, /^\s*Calories Intake:\s*(.+)$/i);
  const fluidIntake = extractIndentedValue(lines, /^General Assessment:/i, /^\s*Fluid Intake:\s*(.+)$/i);
  const generalAssessment = [];
  if (calIntake) generalAssessment.push({ display: "Calorie intake", value: Number(calIntake) });
  if (fluidIntake) generalAssessment.push({ display: "Fluid intake", value: Number(fluidIntake) });

  const ageAtMenarche = extractIndentedValue(lines, /^Women Health:/i, /^\s*Age At Menarche:\s*(.+)$/i);
  const lmd = extractIndentedValue(lines, /^Women Health:/i, /^\s*Last Menstrual Date:\s*(.+)$/i);
  const womenHealth = [];
  if (ageAtMenarche) womenHealth.push({ display: "Age at menarche", value: Number(ageAtMenarche) });
  if (lmd) womenHealth.push({ display: "Last menstrual period start date", value: lmd });

  const smoking = extractIndentedValue(lines, /^Lifestyle:/i, /^\s*Smoking:\s*(.+)$/i);
  const diet = extractIndentedValue(lines, /^Lifestyle:/i, /^\s*Diet:\s*(.+)$/i);
  const lifestyle = [];
  if (smoking) lifestyle.push({ display: "Smoking status", value: smoking });
  if (diet) lifestyle.push({ display: "Diet type", value: diet });

  const complaints = complaintsList.length > 0 
    ? complaintsList.map(c => ({ code: "386661006", display: c }))
    : [{ code: "386661006", display: primaryLine }];
  
  const allergies = allergiesList.map(a => ({ code: "256349002", display: a }));
  
  const history = historyList.length > 0
    ? historyList.map(h => ({ code: "16100001", display: h }))
    : [{ code: "16100001", display: "Medical history noted" }];

  const invoiceItems = [];
  const itemsStart = lines.findIndex((line) => /^Items:/i.test(line));
  if (itemsStart >= 0) {
    for (let i = itemsStart + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^(?:Summary|Header|Draft Item):/i.test(line)) break;
      const match = line.match(/^\s*Name:\s*(.+)$/i);
      if (match && text(match[1]) !== "-") {
        let name = text(match[1]);
        let rate = 0, qty = 1, total = 0, mrp = 0, discount = 0, gstPct = 0, gstAmt = 0;
        for (let j = i + 1; j < Math.min(lines.length, i + 12); j++) {
           if (/^\s*-\s*Item/i.test(lines[j])) break; // Stop at next item
           const rMatch = lines[j].match(/^\s*Rate:\s*([\d.]+)/i);
           if (rMatch) rate = Number(rMatch[1]);
           const qMatch = lines[j].match(/^\s*Qty:\s*([\d.]+)/i);
           if (qMatch) qty = Number(qMatch[1]);
           const tMatch = lines[j].match(/^\s*Total:\s*([\d.]+)/i);
           if (tMatch) total = Number(tMatch[1]);
           
           const mrpMatch = lines[j].match(/^\s*Mrp:\s*([\d.]+)/i);
           if (mrpMatch) mrp = Number(mrpMatch[1]);
           const dMatch = lines[j].match(/^\s*Discount:\s*([\d.]+)/i);
           if (dMatch) discount = Number(dMatch[1]);
           const gpMatch = lines[j].match(/^\s*Gst Pct:\s*([\d.]+)/i);
           if (gpMatch) gstPct = Number(gpMatch[1]);
           const gaMatch = lines[j].match(/^\s*Gst Amt:\s*([\d.]+)/i);
           if (gaMatch) gstAmt = Number(gaMatch[1]);
        }
        invoiceItems.push({ name, rate, qty, total, mrp, discount, gstPct, gstAmt });
      }
    }
  }

  let invoiceTotal = 0;
  let invoiceTotalGross = invoiceItems.reduce((acc, item) => acc + (item.rate * item.qty), 0);
  for (const line of lines) {
    const m = line.match(/^\s*Grand Total:\s*([\d.]+)/i);
    if (m) {
      invoiceTotal = Number(m[1]);
      break;
    }
  }

  let conclusionText = "";
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*(?:Conclusion|Diagnosis|Impression):\s*(.+)$/i);
    if (match) {
      conclusionText = match[1].trim();
      break;
    }
  }
  const cleanConclusion = conclusionText || "Clinical diagnostic report generated successfully.";

  const investigations = labObservations.length > 0 
    ? labObservations 
    : investigationsList.length > 0
      ? investigationsList.map(inv => ({ code: "718-7", display: inv, value: "Advised", unit: "" }))
      : [{ code: "718-7", display: reportName, value: "Recorded", unit: "" }];

  // --- Extract Procedures ---
  const proceduresList = extractIndentedList(lines, /^Procedures:/i);
  const procedures = proceduresList.map(p => ({ display: p }));

  // --- Extract Medications List (complex objects) ---
  const medicationsList = [];
  const medsStart = lines.findIndex((line) => /^Medications:/i.test(line));
  if (medsStart >= 0) {
    for (let i = medsStart + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^(?:Family History|Follow Up|Items|Summary|Header|Draft Item):/i.test(line)) break;
      const match = line.match(/^\s*Name:\s*(.+)$/i);
      if (match && text(match[1]) !== "-") {
        let name = text(match[1]);
        let dose = "1-0-1", route = "Oral", timing = "After Food", instr = "";
        for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
           if (/^\s*-\s*Item/i.test(lines[j])) break;
           const dMatch = lines[j].match(/^\s*Dose:\s*(.+)$/i);
           if (dMatch) dose = text(dMatch[1]);
           const rMatch = lines[j].match(/^\s*Route:\s*(.+)$/i);
           if (rMatch) route = text(rMatch[1]);
           const tMatch = lines[j].match(/^\s*Timing:\s*(.+)$/i);
           if (tMatch) timing = text(tMatch[1]);
           const iMatch = lines[j].match(/^\s*Instructions:\s*(.+)$/i);
           if (iMatch) instr = text(iMatch[1]);
        }
        medicationsList.push({ drugName: name, dose, route, timing, instructions: instr });
      }
    }
  }

  // Fallback to simple extraction if empty (for single Medication or Prescription)
  if (medicationsList.length === 0) {
    if (medicationName) {
      medicationsList.push({ drugName: medicationName, dose: dosage, route, timing, instructions });
    }
  }

  // --- Extract Immunizations List ---
  const immunizationsList = [];
  const immStart = lines.findIndex((line) => /^\s*Entries:/i.test(line));
  if (immStart >= 0) {
    for (let i = immStart + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^(?:Draft Entry):/i.test(line)) break;
      const match = line.match(/^\s*Vaccine Name:\s*(.+)$/i);
      if (match && text(match[1]) !== "-") {
        let vaccineName = text(match[1]);
        let brand = "", date = "", lotNumber = "", doseNo = "";
        for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
           if (/^\s*-\s*Item/i.test(lines[j])) break;
           const bMatch = lines[j].match(/^\s*Brand:\s*(.+)$/i);
           if (bMatch) brand = text(bMatch[1]);
           const dMatch = lines[j].match(/^\s*Date:\s*(.+)$/i);
           if (dMatch) date = text(dMatch[1]);
           const lMatch = lines[j].match(/^\s*Lot Number:\s*(.+)$/i);
           if (lMatch) lotNumber = text(lMatch[1]);
           const dnMatch = lines[j].match(/^\s*Dose No:\s*(.+)$/i);
           if (dnMatch) doseNo = text(dnMatch[1]);
        }
        immunizationsList.push({ vaccineName, brand, date, lotNumber, doseNo });
      }
    }
  }

  // Fallback to Draft Entry if empty
  if (immunizationsList.length === 0) {
    const draftVaccineName = extractIndentedValue(lines, /^Draft Entry:/i, /^\s*Vaccine Name:\s*(.+)$/i) || 
                             extractIndentedValue(lines, /^Draft Entry/i, /^\s*Vaccine Name:\s*(.+)$/i);
    const draftBrand = extractIndentedValue(lines, /^Draft Entry/i, /^\s*Brand:\s*(.+)$/i);
    const draftDate = extractIndentedValue(lines, /^Draft Entry/i, /^\s*Date:\s*(.+)$/i);
    const draftLotNumber = extractIndentedValue(lines, /^Draft Entry/i, /^\s*Lot Number:\s*(.+)$/i);
    const draftDoseNo = extractIndentedValue(lines, /^Draft Entry/i, /^\s*Dose No:\s*(.+)$/i);

    if (draftVaccineName) {
      immunizationsList.push({ vaccineName: draftVaccineName, brand: draftBrand, date: draftDate, lotNumber: draftLotNumber, doseNo: draftDoseNo });
    }
  }

  // --- Extract Family History ---
  const familyHistoryList = extractIndentedList(lines, /^Family History:/i);
  const familyHistory = familyHistoryList.map(fh => ({ display: fh }));

  // --- Extract Follow Up ---
  const followUpReason = extractIndentedValue(lines, /^Follow Up:/i, /^\s*Reason:\s*(.+)$/i) || extractIndentedValue(lines, /^Care Plan:/i, /^\s*Reason:\s*(.+)$/i);
  const followUpDate = extractIndentedValue(lines, /^Follow Up:/i, /^\s*Date:\s*(.+)$/i) || extractIndentedValue(lines, /^Care Plan:/i, /^\s*Follow Up Date:\s*(.+)$/i);
  const followUpTime = extractIndentedValue(lines, /^Follow Up:/i, /^\s*Time:\s*(.+)$/i) || extractIndentedValue(lines, /^Care Plan:/i, /^\s*Follow Up Time:\s*(.+)$/i);
  const followUp = (followUpReason || followUpDate) ? { reason: followUpReason, date: followUpDate, time: followUpTime } : null;

  // --- Extract Care Plan ---
  const carePlanTitle = extractIndentedValue(lines, /^Care Plan:/i, /^\s*Title:\s*(.+)$/i);
  const carePlanDesc = extractIndentedValue(lines, /^Care Plan:/i, /^\s*Description:\s*(.+)$/i);
  let carePlan = null;
  if (carePlanTitle || carePlanDesc) {
    carePlan = { title: carePlanTitle, description: carePlanDesc };
  } else if (followUp) {
    carePlan = { title: "Discharge Care Plan", description: "Follow up as directed" };
  }

  // Replace string building PDF with pdfmake generator
  const { generateOPConsultationPDF } = require("./pdfGenerator");
  
  // --- Extract Base64 PDF if present ---
  const pdfBase64Match = file.content.match(/^PDF_BASE64:\s*([A-Za-z0-9+/=]+)$/m);
  const explicitPdfBase64 = pdfBase64Match ? pdfBase64Match[1] : null;

  // Note: we can't call await here if buildBusinessDataFromTextFile is synchronous.
  // We'll attach the pdfBase64 asynchronously in generateOPConsultationBundle instead!
  
  return {
    patientName: patientName,
    pdfBase64: explicitPdfBase64,
    abhaAddress,
    abhaNumber,
    mobile,
    gender,
    birthDate,
    doctorName: process.env.DOCTOR_NAME || "Dr. Sarita",
    doctorLicense: process.env.DOCTOR_LICENSE || "",
    facilityName: hospitalConfig.hospitalName,
    facilityCode: process.env.FACILITY_ID || hospitalConfig.hipId,
    timestamp: nowIso(),
    title: file.fileName.replace(/\.txt$/i, ""),
    textContent: file.content,
    complaints,
    vitals,
    measurements,
    physicalActivity,
    generalAssessment,
    womenHealth,
    lifestyle,
    allergies,
    history,
    investigations,
    invoiceItems,
    procedures,
    medicationsList,
    familyHistory,
    carePlan,
    followUp,
    invoiceTotal,
    invoiceTotalGross,
    immunizationsList,
    diagnosticReports: [{ code: "11502-2", display: reportName, conclusion: cleanConclusion }],
    treatments: medicationName ? [{ medCode: inferDrugCode(medDisplay), medDisplay: medDisplay, instructionText: instructionText }] : [{ medCode: "387458008", medDisplay: "Clinical treatment as recorded", instructionText: "As directed" }],
    medications: medicationsList.map(med => ({
      medCode: inferDrugCode(med.drugName),
      medDisplay: normalizeDrugName(med.drugName),
      drugName: normalizeDrugName(med.drugName),
      drugSnomedCode: inferDrugCode(med.drugName),
      indicationText: text(med.instructions) || "Clinical indication recorded",
      indicationSnomedCode: inferIndicationCode(med.instructions),
      dose: med.dose,
      dosage: parseDoseSchedule(med.dose),
      route: med.route,
      foodTiming: med.timing,
      instructionText: text(med.instructions) || "As directed",
      authoredOn: nowIso()
    })),
    vaccineCode: "1119305005",
    vaccineDisplay: primaryLine,
    contentType: "application/pdf"
  };
};

const buildWithRecordBuilder = async ({ abhaId, folderName, file, canonicalHiType, recordType }) => {
  const businessData = buildBusinessDataFromTextFile({ abhaId, folderName, file });
  
  if (businessData.pdfBase64) {
    // Explicitly provided via PDF_BASE64 in the text file
    log("Using explicit PDF_BASE64 from text document for", { recordType });
  } else if (recordType === "OP Consultation") {
    const { generateOPConsultationPDF } = require("./pdfGenerator");
    try {
      businessData.pdfBase64 = await generateOPConsultationPDF(businessData);
    } catch (e) {
      console.error("Failed to generate OP Consultation PDF", e);
      businessData.pdfBase64 = Buffer.from(businessData.textContent || "Record").toString("base64");
    }
  } else if (recordType === "Wellness") {
    const { generateWellnessRecordPDF } = require("./pdfGenerator");
    try {
      businessData.pdfBase64 = await generateWellnessRecordPDF(businessData);
    } catch (e) {
      console.error("Failed to generate Wellness PDF", e);
      businessData.pdfBase64 = createPdfBase64(file.hiType, file.content || file.textContent || "Record");
    }
  } else if (recordType === "Diagnostic Report") {
    const { generateDiagnosticReportPDF } = require("./pdfGenerator");
    try {
      businessData.pdfBase64 = await generateDiagnosticReportPDF(businessData);
    } catch (e) {
      console.error("Failed to generate Diagnostic Report PDF", e);
      businessData.pdfBase64 = createPdfBase64(file.hiType, file.content || file.textContent || "Record");
    }
  } else if (recordType === "Immunization") {
    const { generateImmunizationRecordPDF } = require("./pdfGenerator");
    try {
      businessData.pdfBase64 = await generateImmunizationRecordPDF(businessData);
    } catch (e) {
      console.error("Failed to generate Immunization PDF", e);
      businessData.pdfBase64 = createPdfBase64(file.hiType, file.content || file.textContent || "Record");
    }
  } else if (recordType === "Discharge Summary") {
    const { generateDischargeSummaryPDF } = require("./pdfGenerator");
    try {
      businessData.pdfBase64 = await generateDischargeSummaryPDF(businessData);
    } catch (e) {
      console.error("Failed to generate Discharge Summary PDF", e);
      businessData.pdfBase64 = createPdfBase64(file.hiType, file.content || file.textContent || "Record");
    }
  } else {
    businessData.pdfBase64 = createPdfBase64(file.hiType, file.content || file.textContent || "Record");
  }
  businessData.dataBase64 = businessData.pdfBase64;
  businessData.contentType = "application/pdf";

  const bundle = M2FHIRBuilder.buildBundle(recordType, businessData);
  log("Built dedicated ABDM record bundle from text file", {
    abhaId,
    hiType: canonicalHiType,
    recordType,
    entryCount: bundle.entry?.length || 0
  });
  return bundle;
};

const { generatePrescriptionPDF } = require("./pdfGenerator");

const generatePrescriptionRecordBundle = async ({ abhaId, folderName, file, canonicalHiType }) => {
  const businessData = buildBusinessDataFromTextFile({ abhaId, folderName, file });
  const pdfBase64 = await generatePrescriptionPDF(businessData);
  const input = buildPrescriptionInput(businessData);
  input.pdfBase64 = pdfBase64;
  const bundle = generatePrescriptionBundle(input);
  log("Built dedicated PrescriptionRecord ABDM bundle from text file", {
    abhaId,
    hiType: canonicalHiType,
    entryCount: bundle.entry?.length || 0
  });
  return bundle;
};

const generateDiagnosticReportBundle = async (context) =>
  buildWithRecordBuilder({ ...context, recordType: "Diagnostic Report" });

const generateOPConsultationBundle = async (context) =>
  buildWithRecordBuilder({ ...context, recordType: "OP Consultation" });

const generateDischargeSummaryBundle = async (context) =>
  buildWithRecordBuilder({ ...context, recordType: "Discharge Summary" });

const generateImmunizationRecordBundle = async (context) =>
  buildWithRecordBuilder({ ...context, recordType: "Immunization" });

const generateHealthDocumentRecordBundle = async (context) =>
  buildWithRecordBuilder({ ...context, recordType: "Health Document" });

const generateWellnessRecordBundle = async (context) =>
  buildWithRecordBuilder({ ...context, recordType: "Wellness" });

const generateInvoiceRecordBundle = async (context) =>
  buildWithRecordBuilder({ ...context, recordType: "Invoice" });

const FILE_BUNDLE_GENERATORS = {
  DiagnosticReport: generateDiagnosticReportBundle,
  Prescription: generatePrescriptionRecordBundle,
  OPConsultation: generateOPConsultationBundle,
  DischargeSummary: generateDischargeSummaryBundle,
  ImmunizationRecord: generateImmunizationRecordBundle,
  HealthDocumentRecord: generateHealthDocumentRecordBundle,
  WellnessRecord: generateWellnessRecordBundle,
  Invoice: generateInvoiceRecordBundle
};

// ---------------------------------------------------------------------------
// Per-resource FHIR skeleton builders
// ---------------------------------------------------------------------------

const generateTextContent = (hiType, patientRef, careContextRef, textContent) => {
  if (textContent) return textContent;
  return `Health Information Record
---------------------------
HI Type: ${hiType}
Patient Reference: ${patientRef}
Care Context Reference: ${careContextRef}
Generated On: ${nowIso()}

This is a plain text record containing the required details for this ${hiType}. 
All clinical data and summaries for this care context are represented in this text file.`;
};

const generateBase64TextPayload = (hiType, patientRef, careContextRef, textContent) => {
  return Buffer.from(generateTextContent(hiType, patientRef, careContextRef, textContent)).toString("base64");
};

const buildPatientResource = ({ patientId, patientName, resourceId }) => ({
  resourceType: "Patient",
  id: resourceId,
  identifier: [
    {
      type: {
        coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "MR" }],
      },
      value: patientId,
    },
  ],
  name: patientName
    ? [{ text: patientName }]
    : undefined,
});

const buildDiagnosticReport = ({ resourceId, patientRef, careContextRef, dateRange, textContent }) => ({
  resourceType: "DiagnosticReport",
  id: resourceId,
  status: "final",
  code: {
    coding: [
      {
        system: "http://loinc.org",
        code: "11502-2",
        display: "Laboratory report",
      },
    ],
    text: "Diagnostic Report",
  },
  subject: { reference: `Patient/${patientRef}` },
  effectiveDateTime: dateRange?.from || nowIso(),
  issued: nowIso(),
  identifier: [{ value: careContextRef }],
  conclusion: "Diagnostic Report generated by HIP for ABDM M2 data transfer",
  presentedForm: [
    {
      contentType: "text/plain",
      title: "Diagnostic Report Data",
      data: generateBase64TextPayload("DiagnosticReport", patientRef, careContextRef, textContent),
    }
  ]
});

const buildMedicationRequest = ({ resourceId, patientRef, careContextRef, dateRange }) => ({
  resourceType: "MedicationRequest",
  id: resourceId,
  status: "active",
  intent: "order",
  medicationCodeableConcept: {
    coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "unknown" }],
    text: "Prescription",
  },
  subject: { reference: `Patient/${patientRef}` },
  authoredOn: dateRange?.from || nowIso(),
  identifier: [{ value: careContextRef }],
});

const buildComposition = ({ resourceId, patientRef, careContextRef, hiType, dateRange, textContent }) => ({
  resourceType: "Composition",
  id: resourceId,
  status: "final",
  type: {
    coding: [
      {
        system: "http://loinc.org",
        code: hiType === "DischargeSummary" ? "18842-5" : "11488-4",
        display: hiType === "DischargeSummary" ? "Discharge summary" : "Consultation note",
      },
    ],
    text: hiType,
  },
  subject: { reference: `Patient/${patientRef}` },
  date: dateRange?.from || nowIso(),
  title: hiType,
  identifier: { value: careContextRef },
  author: [{ display: "HIP System" }],
  section: [
    {
      title: "Clinical Notes",
      text: {
        status: "generated",
        div: `<div xmlns=\"http://www.w3.org/1999/xhtml\"><pre>${generateTextContent(hiType, patientRef, careContextRef, textContent)}</pre></div>`
      }
    }
  ],
});

const buildImmunization = ({ resourceId, patientRef, careContextRef, dateRange, textContent }) => ({
  resourceType: "Immunization",
  id: resourceId,
  status: "completed",
  vaccineCode: {
    coding: [
      {
        system: "http://hl7.org/fhir/sid/cvx",
        code: "unknown",
        display: "Immunization Record",
      },
    ],
    text: "Immunization Record",
  },
  patient: { reference: `Patient/${patientRef}` },
  occurrenceDateTime: dateRange?.from || nowIso(),
  identifier: [{ value: careContextRef }],
  note: [
    {
      text: generateTextContent("ImmunizationRecord", patientRef, careContextRef, textContent),
    },
  ],
});

const buildDocumentReference = ({ resourceId, patientRef, careContextRef, dateRange, textContent }) => ({
  resourceType: "DocumentReference",
  id: resourceId,
  status: "current",
  type: {
    coding: [{ system: "http://loinc.org", code: "34112-3", display: "Hospital note" }],
    text: "Health Document Record",
  },
  subject: { reference: `Patient/${patientRef}` },
  date: dateRange?.from || nowIso(),
  identifier: [{ value: careContextRef }],
  content: [
    {
      attachment: {
        contentType: "text/plain",
        title: "Health Document Record",
        data: generateBase64TextPayload("HealthDocumentRecord", patientRef, careContextRef, textContent),
      },
    },
  ],
});

const buildObservation = ({ resourceId, patientRef, careContextRef, dateRange }) => ({
  resourceType: "Observation",
  id: resourceId,
  status: "final",
  code: {
    coding: [{ system: "http://loinc.org", code: "74728-7", display: "Vital signs, weight, height, head circumference, oxygen saturation & BMI panel" }],
    text: "Wellness Record",
  },
  subject: { reference: `Patient/${patientRef}` },
  effectiveDateTime: dateRange?.from || nowIso(),
  identifier: [{ value: careContextRef }],
});

const buildInvoice = ({ resourceId, patientRef, careContextRef, dateRange }) => ({
  resourceType: "Invoice",
  id: resourceId,
  status: "issued",
  subject: { reference: `Patient/${patientRef}` },
  date: dateRange?.from || nowIso(),
  identifier: [{ value: careContextRef }],
  totalNet: { value: 0, currency: "INR" },
  totalGross: { value: 0, currency: "INR" },
});

// Dispatch to the correct builder based on normalised hiType
const buildFhirResource = ({ hiType, resourceId, patientRef, careContextRef, dateRange, textContent }) => {
  const canonical = normalizeHiType(hiType);
  switch (canonical) {
    case "DiagnosticReport":
      return buildDiagnosticReport({ resourceId, patientRef, careContextRef, dateRange, textContent });
    case "Prescription":
      return buildMedicationRequest({ resourceId, patientRef, careContextRef, dateRange, textContent });
    case "OPConsultation":
    case "DischargeSummary":
      return buildComposition({ resourceId, patientRef, careContextRef, hiType: canonical, dateRange, textContent });
    case "ImmunizationRecord":
      return buildImmunization({ resourceId, patientRef, careContextRef, dateRange, textContent });
    case "HealthDocumentRecord":
      return buildDocumentReference({ resourceId, patientRef, careContextRef, dateRange, textContent });
    case "Invoice":
      return buildInvoice({ resourceId, patientRef, careContextRef, dateRange });
    case "WellnessRecord":
      return buildObservation({ resourceId, patientRef, careContextRef, dateRange, textContent });
    default:
      // Unknown type — produce a minimal DocumentReference so we never silently drop it
      log("Unknown HI type — mapping to DocumentReference", { hiType, canonical });
      return buildDocumentReference({ resourceId, patientRef, careContextRef, dateRange, textContent });
  }
};

// ---------------------------------------------------------------------------
// Main bundle builder
// ---------------------------------------------------------------------------

/**
 * buildBundle(transaction)
 *
 * Returns a FHIR R4 Bundle object, or throws with a descriptive message if
 * it cannot be built.
 *
 * @param {object} transaction - full M2 transaction from the store
 * @returns {{ bundle: object, resourceCount: number, hiTypes: string[] }}
 */
const buildBundle = (transaction) => {
  const startedAt = Date.now();
  log("Entering Bundle Generator", { transactionId: transaction.id });

  // ── 1. Resolve patient array ──────────────────────────────────────────────
  const patients = Array.isArray(transaction.patient) ? transaction.patient : [];
  log("Patient array resolved", {
    transactionId: transaction.id,
    patientCount: patients.length,
    patients: patients.map((p) => ({
      referenceNumber: p.referenceNumber,
      hiType: p.hiType,
      careContextCount: Array.isArray(p.careContexts) ? p.careContexts.length : 0,
    })),
  });

  // ── 2. Resolve consented HI types ─────────────────────────────────────────
  const consentedHiTypes = Array.isArray(transaction.hiTypes) && transaction.hiTypes.length > 0
    ? transaction.hiTypes.map(normalizeHiType)
    : null; // null means "all types consented"

  log("Consented HI types resolved", {
    transactionId: transaction.id,
    consentedHiTypes: consentedHiTypes || ["ALL"],
  });

  // ── 3. Resolve date range from consent ────────────────────────────────────
  const dateRange = transaction.consentDetail?.permission?.dateRange ||
    transaction.permission?.dateRange ||
    null;

  // ── 4. Build Patient FHIR resource ───────────────────────────────────────
  const patientResourceId = randomUUID();
  const patientId = text(transaction.abhaAddress) || text(transaction.patientIds?.[0]) || "unknown-patient";
  const patientName = patients[0]?.referenceNumber || undefined;

  const patientResource = buildPatientResource({
    patientId,
    patientName,
    resourceId: patientResourceId,
  });

  const entries = [
    {
      fullUrl: `urn:uuid:${patientResourceId}`,
      resource: patientResource,
    },
  ];

  // ── 5. Build clinical resources for each patient entry × care context ────
  const selectedTypes = [];
  const rejectedTypes = [];
  let resourcesGenerated = 0;

  if (patients.length === 0) {
    log("Warning: patient array is empty — no clinical records can be generated", {
      transactionId: transaction.id,
      hiTypes: transaction.hiTypes,
      careContextReferences: transaction.careContextReferences,
    });
  }

  for (const patientEntry of patients) {
    const hiType = normalizeHiType(patientEntry.hiType);
    const careContexts = Array.isArray(patientEntry.careContexts)
      ? patientEntry.careContexts
      : [];

    // Check if this hiType is consented
    if (consentedHiTypes !== null && !consentedHiTypes.includes(hiType)) {
      rejectedTypes.push({ hiType, reason: "not in consented HI types" });
      log("HI type rejected — not in consent", {
        transactionId: transaction.id,
        hiType,
        consentedHiTypes,
      });
      continue;
    }

    selectedTypes.push(hiType);

    for (const careContext of careContexts) {
      const careContextRef = text(careContext.referenceNumber) || text(careContext.careContextReference);
      const resourceId = randomUUID();

      const resource = buildFhirResource({
        hiType,
        resourceId,
        patientRef: patientResourceId,
        careContextRef,
        dateRange,
      });

      entries.push({
        fullUrl: `urn:uuid:${resourceId}`,
        resource,
      });
      resourcesGenerated += 1;

      log("Resource generated", {
        transactionId: transaction.id,
        resourceType: resource.resourceType,
        resourceId,
        careContextRef,
        hiType,
      });
    }
  }

  // ── 6. If no clinical resources were generated, raise a clear error ───────
  if (resourcesGenerated === 0) {
    const reason = patients.length === 0
      ? "transaction.patient is empty — no health records were linked to this transaction"
      : `All patient HI types were rejected. Selected: [${selectedTypes.join(", ")}], Rejected: ${JSON.stringify(rejectedTypes)}`;

    log("Bundle generation failed", {
      transactionId: transaction.id,
      reason,
      patientCount: patients.length,
      consentedHiTypes,
    });

    throw new Error(`Bundle generation failed: ${reason}`);
  }

  // ── 7. Assemble the Bundle ────────────────────────────────────────────────
  const bundleId = randomUUID();
  const bundle = {
    resourceType: "Bundle",
    id: bundleId,
    type: "document",
    timestamp: nowIso(),
    identifier: {
      system: "https://ndhm.in/hiTypes",
      value: text(transaction.consentArtefactId) || text(transaction.consentId) || bundleId,
    },
    meta: {
      lastUpdated: nowIso(),
      profile: ["https://ndhm.in/fhir/StructureDefinition/HIBundle"],
    },
    entry: entries,
  };

  const durationMs = Date.now() - startedAt;

  log("Bundle Created", {
    transactionId: transaction.id,
    bundleId,
    entryCount: entries.length,
    resourcesGenerated,
    selectedTypes,
    rejectedTypes,
    durationMs,
  });

  // ── 8. Validate before returning ─────────────────────────────────────────
  if (bundle.resourceType !== "Bundle") {
    throw new Error("Bundle generation internal error: resourceType !== Bundle");
  }
  if (!Array.isArray(bundle.entry) || bundle.entry.length === 0) {
    throw new Error("Bundle generation internal error: bundle.entry is empty");
  }

  log("Bundle Validation Completed", {
    transactionId: transaction.id,
    bundleId,
    entryCount: bundle.entry.length,
    durationMs,
  });

  return {
    bundle,
    resourceCount: entries.length,
    hiTypes: selectedTypes,
    durationMs,
  };
};

const buildBundleFromFiles = async ({ abhaId, folderName, files }) => {
  const firstFile = Array.isArray(files) ? files[0] : null;
  if (!firstFile) {
    throw new Error("Cannot build bundle from files: at least one source text file is required.");
  }

  const canonicalHiType = normalizeHiType(firstFile?.hiType);

  // If the text file is actually a pre-built JSON bundle, return it directly
  if (firstFile.content && firstFile.content.trim().startsWith("{")) {
    try {
      const parsedJSON = JSON.parse(firstFile.content);
      if (parsedJSON.resourceType === "Bundle") {
        log("Detected pre-built JSON bundle; skipping text parsing", { canonicalHiType });
        return parsedJSON;
      }
    } catch (e) {
      // Not a valid JSON, continue to text parsing
    }
  }

  const generator = FILE_BUNDLE_GENERATORS[canonicalHiType] || generateHealthDocumentRecordBundle;
  return await generator({ abhaId, folderName, file: firstFile, canonicalHiType });
};

module.exports = { buildBundle, buildBundleFromFiles, normalizeHiType, HI_TYPE_TO_FHIR_RESOURCE };
