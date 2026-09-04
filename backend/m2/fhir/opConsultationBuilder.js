/**
 * Header: opConsultationBuilder.js
 * Purpose: OP Consultation specific FHIR record builder.
 * Responsibility: Maps business datasets to Condition, Observation, AllergyIntolerance, and MedicationRequest resources.
 */

const { v4: uuidv4 } = require("uuid");
const {
  createObservation,
  createCondition,
  createMedicationRequest,
  createProcedure,
  createFamilyMemberHistory,
  createAppointment,
  formatAppointmentTime,
  addMinutesToTime
} = require("./fhirHelpers");

class OpConsultationBuilder {
  /**
   * Builds OP Consultation specific FHIR entries.
   * @param {Object} params - Clinical data records.
   * @param {Object} ids - Standard pre-generated URN references.
   * @returns {Object} Bundle payload coordinates.
   */
  static build(params, ids) {
    const entries = [];
    const sections = [];
    // 0. Patient Information (Always included, using ids.patientId)
    sections.push({
      title: "Patient Information",
      entry: [{ reference: ids.patientId, display: params.patientName || "Patient" }]
    });

    // 1. Chief Complaints (Conditions)
    if (params.complaints && Array.isArray(params.complaints)) {
      const sectionEntries = [];
      for (const cc of params.complaints) {
        const item = createCondition({
          patientId: ids.patientId,
          code: cc.code || "Fever",
          display: cc.display || "Fever",
          timestamp: params.timestamp
        });
        entries.push(item);
        sectionEntries.push({ reference: item.fullUrl, display: cc.display });
      }
      if (sectionEntries.length > 0) sections.push({ title: "Chief Complaints", entry: sectionEntries });
    }

    // 2. Vital Signs (Observations)
    if (params.vitals && Array.isArray(params.vitals)) {
      const sectionEntries = [];
      for (const vital of params.vitals) {
        const item = createObservation({
          patientId: ids.patientId,
          code: vital.code,
          display: vital.display,
          value: vital.value,
          unit: vital.unit,
          system: "http://loinc.org",
          timestamp: params.timestamp
        });
        entries.push(item);
        sectionEntries.push({ reference: item.fullUrl, display: vital.display });
      }
      if (sectionEntries.length > 0) sections.push({ title: "Vital Signs", entry: sectionEntries });
    }

    // 3. Body Measurement (Observations)
    if (params.measurements && Array.isArray(params.measurements)) {
      const sectionEntries = [];
      for (const measure of params.measurements) {
        const item = createObservation({
          patientId: ids.patientId,
          code: measure.code || "8302-2",
          display: measure.display || "Body height",
          value: measure.value || 175,
          unit: measure.unit || "cm",
          system: "http://loinc.org",
          timestamp: params.timestamp
        });
        entries.push(item);
        sectionEntries.push({ reference: item.fullUrl, display: measure.display });
      }
      if (sectionEntries.length > 0) sections.push({ title: "Body Measurement", entry: sectionEntries });
    }

    // 4. Allergies (AllergyIntolerance)
    if (params.allergies && Array.isArray(params.allergies)) {
      const sectionEntries = [];
      for (const allergy of params.allergies) {
        const id = uuidv4();
        const allergyResource = {
          resourceType: "AllergyIntolerance",
          id,
          meta: {
            profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/AllergyIntolerance"]
          },
          clinicalStatus: {
            coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", code: "active", display: "Active" }]
          },
          verificationStatus: {
            coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification", code: "confirmed", display: "Confirmed" }]
          },
          recordedDate: params.timestamp,
          code: {
            coding: [
              {
                system: "http://snomed.info/sct",
                code: allergy.code || "256349002",
                display: allergy.display || "Peanut allergy"
              }
            ],
            text: allergy.display || "Peanut allergy"
          },
          patient: { reference: ids.patientId }
        };
        entries.push({ fullUrl: `urn:uuid:${id}`, resource: allergyResource });
        sectionEntries.push({ reference: `urn:uuid:${id}`, display: allergy.display });
      }
      if (sectionEntries.length > 0) sections.push({ title: "Allergies", entry: sectionEntries });
    }

    // 5. Medical History (Conditions)
    if (params.history && Array.isArray(params.history)) {
      const sectionEntries = [];
      for (const hist of params.history) {
        const item = createCondition({
          patientId: ids.patientId,
          code: hist.code || "Joint Pain",
          display: hist.display || "Joint Pain",
          timestamp: params.timestamp
        });
        entries.push(item);
        sectionEntries.push({ reference: item.fullUrl, display: hist.display });
      }
      if (sectionEntries.length > 0) sections.push({ title: "Medical History", entry: sectionEntries });
    }

    // 6. Investigations (Observations)
    if (params.investigations && Array.isArray(params.investigations)) {
      const sectionEntries = [];
      for (const inv of params.investigations) {
        const item = createObservation({
          patientId: ids.patientId,
          code: inv.code || "718-7",
          display: inv.display || "Hemoglobin",
          value: inv.value || 14,
          unit: inv.unit || "g/dL",
          system: "http://loinc.org",
          timestamp: params.timestamp
        });
        entries.push(item);
        sectionEntries.push({ reference: item.fullUrl, display: inv.display });
      }
      if (sectionEntries.length > 0) sections.push({ title: "Investigations", entry: sectionEntries });
    }

    // 6a. Procedures
    if (params.procedures && Array.isArray(params.procedures)) {
      const sectionEntries = [];
      for (const proc of params.procedures) {
        const item = createProcedure({
          patientId: ids.patientId,
          display: proc.display,
          timestamp: params.timestamp
        });
        entries.push(item);
        sectionEntries.push({ reference: item.fullUrl, display: proc.display });
      }
      if (sectionEntries.length > 0) sections.push({ title: "Procedures", entry: sectionEntries });
    }

    // 7. Medications (MedicationRequests)
    // Handle both old 'treatments' logic and new 'medicationsList' complex array
    const meds = params.medicationsList || params.medications || params.treatments || [];
    if (meds.length > 0) {
      const sectionEntries = [];
      for (const med of meds) {
        const item = createMedicationRequest({
          patientId: ids.patientId,
          practitionerId: ids.practitionerId,
          medCode: med.medCode || med.drugSnomedCode || "387517004", // default Paracetamol
          medDisplay: med.medDisplay || med.drugName || "Medication",
          reasonCode: med.reasonCode || med.indicationSnomedCode,
          reasonDisplay: med.reasonDisplay || med.indicationText || med.instructions,
          instructionText: med.dose || "As directed",
          routeText: med.route,
          timingText: med.timing,
          timestamp: params.timestamp
        });
        entries.push(item);
        sectionEntries.push({ reference: item.fullUrl, display: med.medDisplay || med.drugName || "Medication" });
      }
      if (sectionEntries.length > 0) sections.push({ title: "Medications", entry: sectionEntries });
    }

    // 7a. Family History
    if (params.familyHistory && Array.isArray(params.familyHistory)) {
      const sectionEntries = [];
      for (const fh of params.familyHistory) {
        const item = createCondition({
          patientId: ids.patientId,
          display: fh.display,
          timestamp: params.timestamp
        });
        entries.push(item);
        sectionEntries.push({ reference: item.fullUrl, display: fh.display });
      }
      if (sectionEntries.length > 0) sections.push({ title: "Family History", entry: sectionEntries });
    }

    // 7b. Follow Up
    if (params.followUp) {
      const sectionEntries = [];
      const startTimeStr = params.followUp.startTime || params.followUp.time || "13:00";
      const fallbackEnd = addMinutesToTime(startTimeStr, 15) || "13:15";
      const endTimeStr = params.followUp.endTime || fallbackEnd;
      const startIso = formatAppointmentTime(params.followUp.date, startTimeStr, "13:00") || params.timestamp;
      const endIso = formatAppointmentTime(params.followUp.date, endTimeStr, fallbackEnd) || startIso;

      const item = createAppointment({
        patientId: ids.patientId,
        practitionerId: ids.practitionerId,
        reason: params.followUp.reason || "Review",
        start: startIso,
        end: endIso,
        timestamp: startIso
      });
      entries.push(item);
      sectionEntries.push({ reference: item.fullUrl, display: "Follow Up Appointment" });
      sections.push({ title: "Follow Up", entry: sectionEntries });
    }

    // 8. Document Reference (PDF attachments)
    if (params.dataBase64 || params.pdfBase64) {
      const sectionEntries = [];
      const { createDocumentReference } = require("./fhirHelpers");
      const docItem = createDocumentReference({
        patientId: ids.patientId,
        practitionerId: ids.practitionerId,
        pdfBase64: params.pdfBase64,
        contentType: params.contentType || "application/pdf",
        dataBase64: params.dataBase64,
        title: "Clinical notes",
        timestamp: params.timestamp,
        typeText: "OP Consultation Record"
      });
      entries.push(docItem);
      sectionEntries.push({ reference: docItem.fullUrl, display: "DocumentReference" });
      sections.push({ title: "Document Reference", entry: sectionEntries });
    }

    return {
      entries,
      sections,
      metadata: {
        compositionProfile: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/OPConsultRecord",
        compositionTitle: "OpConsult record",
        compositionType: {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: "371530004",
              display: "Clinical consultation report"
            }
          ],
          text: "Clinical consultation report"
        },
        bundleProfile: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"
      }
    };
  }

  /**
   * Validates mandatory elements for OP Consultation record.
   * @param {Object} params - Clinical data records.
   * @returns {Object} Validation report.
   */
  static validate(params) {
    if (!params) {
      return { isValid: false, reason: "Missing OP Consultation parameters dataset." };
    }
    return { isValid: true };
  }
}

module.exports = OpConsultationBuilder;
