/**
 * Header: opConsultationBuilder.js
 * Purpose: OP Consultation specific FHIR record builder.
 * Responsibility: Maps business datasets to Condition, Observation, AllergyIntolerance, and MedicationRequest resources.
 */

const { v4: uuidv4 } = require("uuid");
const { createObservation, createCondition, createMedicationRequest } = require("./fhirHelpers");

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

    // 7. Medications (MedicationRequests)
    const meds = params.medications || params.treatments || [];
    if (meds.length > 0) {
      const sectionEntries = [];
      for (const med of meds) {
        const item = createMedicationRequest({
          patientId: ids.patientId,
          practitionerId: ids.practitionerId,
          medCode: med.medCode || med.drugSnomedCode || "Pantoprazole",
          medDisplay: med.medDisplay || med.drugName || "Pantoprazole 40 mg Tablet",
          reasonCode: med.reasonCode || med.indicationSnomedCode,
          reasonDisplay: med.reasonDisplay || med.indicationText,
          instructionText: med.instructionText || med.instructions,
          timestamp: params.timestamp
        });
        entries.push(item);
        sectionEntries.push({ reference: item.fullUrl, display: med.medDisplay || med.drugName });
      }
      if (sectionEntries.length > 0) sections.push({ title: "Medications", entry: sectionEntries });
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
