/**
 * Header: dischargeSummaryBuilder.js
 * Purpose: Discharge Summary specific FHIR record builder.
 * Responsibility: Maps business datasets to Condition, Observation, CarePlan and DocumentReference resources.
 */

const {
  createObservation,
  createCondition,
  createDocumentReference,
  createProcedure,
  createMedicationRequest,
  createAppointment,
  formatAppointmentTime,
  addMinutesToTime
} = require("./fhirHelpers");
const { v4: uuidv4 } = require("uuid");

class DischargeSummaryBuilder {
  static build(params, ids) {
    const entries = [];
    const sections = [];

    // 1. Chief Complaints
    if (params.complaints && params.complaints.length > 0) {
      const secEntries = [];
      for (const complaint of params.complaints) {
        const item = createCondition({
          patientId: ids.patientId,
          code: complaint.code || "Fever",
          display: complaint.display || "Fever",
          timestamp: params.timestamp
        });
        entries.push(item);
        secEntries.push({ reference: item.fullUrl, display: complaint.display });
      }
      sections.push({ title: "Chief Complaints", entry: secEntries });
    }

    // 2. Physical Examination (Vitals and Measurements)
    const physExams = [...(params.vitals || []), ...(params.measurements || []), ...(params.generalAssessment || [])];
    if (physExams.length > 0) {
      const secEntries = [];
      for (const obs of physExams) {
        const item = createObservation({
          patientId: ids.patientId,
          code: obs.code || "8867-4",
          display: obs.display,
          value: obs.value,
          unit: obs.unit,
          system: "http://loinc.org",
          timestamp: params.timestamp
        });
        entries.push(item);
        secEntries.push({ reference: item.fullUrl, display: obs.display });
      }
      sections.push({ title: "Physical Examination", entry: secEntries });
    }

    // 3. Allergies
    if (params.allergies && params.allergies.length > 0) {
      const secEntries = [];
      for (const allergy of params.allergies) {
        const allergyId = uuidv4();
        const item = {
          fullUrl: `urn:uuid:${allergyId}`,
          resource: {
            resourceType: "AllergyIntolerance",
            id: allergyId,
            clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", code: "active", display: "Active" }] },
            verificationStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification", code: "confirmed", display: "Confirmed" }] },
            code: { text: allergy.display },
            patient: { reference: ids.patientId },
            recordedDate: params.timestamp
          }
        };
        entries.push(item);
        secEntries.push({ reference: item.fullUrl, display: allergy.display });
      }
      sections.push({ title: "Allergies", entry: secEntries });
    }

    // 4. Medical History
    if (params.history && params.history.length > 0) {
      const secEntries = [];
      for (const hist of params.history) {
        const item = createCondition({
          patientId: ids.patientId,
          display: hist.display,
          timestamp: params.timestamp
        });
        entries.push(item);
        secEntries.push({ reference: item.fullUrl, display: hist.display });
      }
      sections.push({ title: "Medical History", entry: secEntries });
    }
    
    // 5. Discharge Diagnosis
    // Assuming Discharge Diagnosis maps to diagnosticReports conclusion or fallback to complaints
    const diagnoses = params.dischargeDiagnosis || params.diagnosticReports || params.complaints || [];
    if (diagnoses.length > 0) {
      const secEntries = [];
      for (const diag of diagnoses) {
        const item = createCondition({
          patientId: ids.patientId,
          display: diag.conclusion || diag.display || "Diagnosis",
          timestamp: params.timestamp
        });
        entries.push(item);
        secEntries.push({ reference: item.fullUrl, display: diag.conclusion || diag.display || "Diagnosis" });
      }
      sections.push({ title: "Discharge Diagnosis", entry: secEntries });
    }

    // 6. Investigations
    if (params.investigations && params.investigations.length > 0) {
      const secEntries = [];
      for (const inv of params.investigations) {
        const item = createObservation({
          patientId: ids.patientId,
          code: inv.code || "718-7",
          display: inv.display,
          value: inv.value || "",
          unit: inv.unit || "",
          timestamp: params.timestamp
        });
        entries.push(item);
        secEntries.push({ reference: item.fullUrl, display: inv.display });
      }
      sections.push({ title: "Investigations", entry: secEntries });
    }

    // 7. Procedures
    if (params.procedures && params.procedures.length > 0) {
      const secEntries = [];
      for (const proc of params.procedures) {
        const item = createProcedure({
          patientId: ids.patientId,
          display: proc.display,
          timestamp: params.timestamp
        });
        entries.push(item);
        secEntries.push({ reference: item.fullUrl, display: proc.display });
      }
      sections.push({ title: "Procedures", entry: secEntries });
    }

    // 8. Medications
    const meds = params.medicationsList || params.medications || [];
    if (meds.length > 0) {
      const secEntries = [];
      for (const med of meds) {
        const item = createMedicationRequest({
          patientId: ids.patientId,
          practitionerId: ids.practitionerId,
          medCode: med.medCode || med.drugSnomedCode || "387517004",
          medDisplay: med.medDisplay || med.drugName || "Medication",
          reasonCode: med.reasonCode || med.indicationSnomedCode,
          reasonDisplay: med.reasonDisplay || med.indicationText || med.instructions,
          instructionText: med.dose || med.instructionText || "As directed",
          routeText: med.route,
          timingText: med.timing || med.foodTiming,
          timestamp: params.timestamp
        });
        entries.push(item);
        secEntries.push({ reference: item.fullUrl, display: med.medDisplay || med.drugName || "Medication" });
      }
      sections.push({ title: "Medications", entry: secEntries });
    }

    // 9. Family History
    if (params.familyHistory && params.familyHistory.length > 0) {
      const secEntries = [];
      for (const fh of params.familyHistory) {
        const item = createCondition({
          patientId: ids.patientId,
          display: fh.display,
          timestamp: params.timestamp
        });
        entries.push(item);
        secEntries.push({ reference: item.fullUrl, display: fh.display });
      }
      sections.push({ title: "Family History", entry: secEntries });
    }

    // 10. Care Plan
    if (params.carePlan) {
      const secEntries = [];
      const cpId = uuidv4();
      const cpItem = {
        fullUrl: `urn:uuid:${cpId}`,
        resource: {
          resourceType: "CarePlan",
          id: cpId,
          status: "active",
          intent: "plan",
          title: params.carePlan.title || "Discharge Care Plan",
          description: params.carePlan.description || "As directed",
          subject: { reference: ids.patientId }
        }
      };
      entries.push(cpItem);
      secEntries.push({ reference: cpItem.fullUrl, display: "Care Plan" });
      
      if (params.followUp) {
        const startTimeStr = params.followUp.startTime || params.followUp.time || "13:00";
        const fallbackEnd = addMinutesToTime(startTimeStr, 15) || "13:15";
        const endTimeStr = params.followUp.endTime || fallbackEnd;
        const startIso = formatAppointmentTime(params.followUp.date, startTimeStr, "13:00") || params.timestamp;
        const endIso = formatAppointmentTime(params.followUp.date, endTimeStr, fallbackEnd) || startIso;

        const aptItem = createAppointment({
          patientId: ids.patientId,
          practitionerId: ids.practitionerId,
          reason: params.followUp.reason || "Review",
          start: startIso,
          end: endIso,
          timestamp: startIso
        });
        entries.push(aptItem);
        secEntries.push({ reference: aptItem.fullUrl, display: "Follow Up Appointment" });
      }
      
      sections.push({ title: "Care Plan", entry: secEntries });
    }

    // 11. Document Reference
    if (params.dataBase64 || params.pdfBase64) {
      const secEntries = [];
      const docItem = createDocumentReference({
        patientId: ids.patientId,
        code: "373942005",
        display: "Discharge summary",
        title: params.title || "Discharge Summary",
        contentType: params.contentType || "application/pdf",
        dataBase64: params.dataBase64,
        pdfBase64: params.pdfBase64,
        timestamp: params.timestamp,
        typeText: "Discharge summary record"
      });
      entries.push(docItem);
      secEntries.push({ reference: docItem.fullUrl, display: "DocumentReference" });
      sections.push({ title: "Document Reference", entry: secEntries });
    }

    // If no sections, provide a default
    if (sections.length === 0) {
       sections.push({
         title: "Discharge summary",
         code: { coding: [{ system: "http://snomed.info/sct", code: "373942005", display: "Discharge summary" }] },
         entry: []
       });
    }

    return {
      entries,
      sections,
      metadata: {
        compositionProfile: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/DischargeSummaryRecord",
        compositionTitle: "Discharge summary record",
        compositionType: {
          coding: [{ system: "http://snomed.info/sct", code: "373942005", display: "Discharge summary" }],
          text: "Discharge summary"
        },
        bundleProfile: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"
      }
    };
  }

  /**
   * Validates mandatory elements for Discharge Summary record.
   * @param {Object} params - Clinical data records.
   * @returns {Object} Validation report.
   */
  static validate(params) {
    const errors = [];
    if (!params.patientName) errors.push("Patient name is missing.");
    if (!params.timestamp) errors.push("Encounter date/time is missing.");
    
    // ABDM strictly requires at least one condition or diagnosis for Discharge Summary
    const hasComplaint = params.complaints && params.complaints.length > 0;
    const hasHistory = params.history && params.history.length > 0;
    const hasDiagnosis = params.dischargeDiagnosis && params.dischargeDiagnosis.length > 0;
    const hasDiagnosticReports = params.diagnosticReports && params.diagnosticReports.length > 0;

    if (!hasComplaint && !hasHistory && !hasDiagnosis && !hasDiagnosticReports) {
      errors.push("At least one Chief Complaint, Medical History, or Diagnosis is required for Discharge Summary");
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = DischargeSummaryBuilder;
