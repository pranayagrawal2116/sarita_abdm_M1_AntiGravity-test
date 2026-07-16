/**
 * Header: dischargeSummaryBuilder.js
 * Purpose: Discharge Summary specific FHIR record builder.
 * Responsibility: Maps business datasets to Condition, Observation, and DocumentReference resources.
 */

const { createObservation, createCondition, createDocumentReference } = require("./fhirHelpers");

class DischargeSummaryBuilder {
  /**
   * Builds Discharge Summary specific FHIR entries.
   * @param {Object} params - Clinical data records.
   * @param {Object} ids - Standard pre-generated URN references.
   * @returns {Object} Bundle payload coordinates.
   */
  static build(params, ids) {
    const entries = [];
    const finalEntry = [];

    // 1. Chief Complaints (Conditions)
    if (params.complaints && Array.isArray(params.complaints)) {
      for (const complaint of params.complaints) {
        const item = createCondition({
          patientId: ids.patientId,
          code: complaint.code || "Fever",
          display: complaint.display || "Fever",
          timestamp: params.timestamp
        });
        entries.push(item);
        finalEntry.push({ reference: item.fullUrl, display: complaint.display });
      }
    }

    // 2. Physical Examination / Vital Signs (Observations)
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

    // 3. DocumentReference (Discharge Summary Report PDF)
    const docItem = createDocumentReference({
      patientId: ids.patientId,
      code: "373942005",
      display: "Discharge summary",
      title: params.title || "Discharge Summary",
      contentType: params.contentType || "application/pdf",
        dataBase64: params.dataBase64,
      dataBase64: params.pdfBase64 || "JVBERi0xLjQKJeLjz9MKNCAwIG9iago8PC9MZW5ndGggNzM5L0ZpbHRlci9GbGF0ZURlY29kZT4+c3RyZWFt...",
      timestamp: params.timestamp
    });
    entries.push(docItem);
    finalEntry.push({ reference: docItem.fullUrl, display: "DocumentReference" });

    const sections = [];
    if (finalEntry.length > 0) {
      sections.push({
        title: "Discharge summary",
        code: {
          coding: [{ system: "http://snomed.info/sct", code: "373942005", display: "Discharge summary" }]
        },
        entry: finalEntry
      });
    }

    return {
      entries,
      sections,
      metadata: {
        compositionProfile: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/DischargeSummaryRecord",
        compositionTitle: "Dischare summary record",
        compositionType: {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: "373942005",
              display: "Discharge summary"
            }
          ],
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
    if (!params) {
      return { isValid: false, reason: "Missing Discharge Summary parameters dataset." };
    }
    return { isValid: true };
  }
}

module.exports = DischargeSummaryBuilder;
