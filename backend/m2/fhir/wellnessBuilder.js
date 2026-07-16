/**
 * Header: wellnessBuilder.js
 * Purpose: Wellness specific FHIR record builder.
 * Responsibility: Maps business datasets to Observation and DocumentReference resources.
 */

const { createObservation, createDocumentReference } = require("./fhirHelpers");

class WellnessBuilder {
  /**
   * Builds Wellness specific FHIR entries.
   * @param {Object} params - Clinical data records.
   * @param {Object} ids - Standard pre-generated URN references.
   * @returns {Object} Bundle payload coordinates.
   */
  static build(params, ids) {
    const entries = [];
    const finalEntry = [];

    // 1. Vital Signs (Observations)
    if (params.vitals && Array.isArray(params.vitals)) {
      for (const vital of params.vitals) {
        const item = createObservation({
          patientId: ids.patientId,
          code: vital.code || "8867-4",
          display: vital.display || "Heart rate",
          value: vital.value || 72,
          unit: vital.unit || "/min",
          system: "http://loinc.org",
          timestamp: params.timestamp
        });
        entries.push(item);
        finalEntry.push({ reference: item.fullUrl, display: vital.display });
      }
    }

    // 2. Body Measurements (Observations)
    if (params.measurements && Array.isArray(params.measurements)) {
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
        finalEntry.push({ reference: item.fullUrl, display: measure.display });
      }
    }

    // 3. Physical Activity (Observations)
    if (params.physicalActivity && Array.isArray(params.physicalActivity)) {
      for (const activity of params.physicalActivity) {
        const item = createObservation({
          patientId: ids.patientId,
          code: activity.code || "8982-1",
          display: activity.display || "Physical activity",
          value: activity.value || "Normal",
          system: "http://loinc.org",
          timestamp: params.timestamp
        });
        entries.push(item);
        finalEntry.push({ reference: item.fullUrl, display: activity.display });
      }
    }

    // 4. Document Reference (if document details provided)
    if (params.dataBase64 || params.pdfBase64) {
      const docItem = createDocumentReference({
        patientId: ids.patientId,
        title: "Wellness Document",
        contentType: params.contentType || "application/pdf",
        dataBase64: params.dataBase64,
        pdfBase64: params.pdfBase64,
        typeText: "Wellness Record",
        timestamp: params.timestamp
      });
      entries.push(docItem);
      finalEntry.push({ reference: docItem.fullUrl, display: "DocumentReference" });
    }

    const sections = [];
    if (finalEntry.length > 0) {
      sections.push({
        title: "Physical findings of general status",
        code: {
          coding: [{ system: "http://snomed.info/sct", code: "425044008", display: "Physical findings of general status" }]
        },
        entry: finalEntry
      });
    }

    return {
      entries,
      sections,
      metadata: {
        compositionProfile: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/WellnessRecord",
        compositionTitle: "Wellness Record",
        compositionType: {
          text: "Wellness Record"
        },
        bundleProfile: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"
      }
    };
  }

  /**
   * Validates mandatory elements for Wellness record.
   * @param {Object} params - Clinical data records.
   * @returns {Object} Validation report.
   */
  static validate(params) {
    if (!params) {
      return { isValid: false, reason: "Missing Wellness parameters dataset." };
    }
    return { isValid: true };
  }
}

module.exports = WellnessBuilder;
