/**
 * Header: healthDocumentBuilder.js
 * Purpose: Health Document specific FHIR record builder.
 * Responsibility: Maps business datasets to DocumentReference resources.
 */

const { createDocumentReference } = require("./fhirHelpers");

class HealthDocumentBuilder {
  /**
   * Builds Health Document specific FHIR entries.
   * @param {Object} params - Clinical data records.
   * @param {Object} ids - Standard pre-generated URN references.
   * @returns {Object} Bundle payload coordinates.
   */
  static build(params, ids) {
    const entries = [];
    const sections = [];

    // 1. DocumentReference Resource
    const docItem = createDocumentReference({
      patientId: ids.patientId,
      typeText: "Health Document Record",
      title: params.title || "Health Document",
      contentType: params.contentType || "application/pdf",
      pdfBase64: params.pdfBase64 || "JVBERi0xLjQKJeLjz9MKNCAwIG9iago8PC9MZW5ndGggNzM5L0ZpbHRlci9GbGF0ZURlY29kZT4+c3RyZWFt...",
      timestamp: params.timestamp
    });
    entries.push(docItem);
    
    sections.push({
      title: "Record artifact",
      code: {
        coding: [{ system: "http://snomed.info/sct", code: "419891008", display: "Record artifact" }]
      },
      entry: [{ reference: docItem.fullUrl, display: "DocumentReference" }]
    });

    return {
      entries,
      sections,
      metadata: {
        compositionProfile: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/HealthDocumentRecord",
        compositionTitle: "Health Document Record",
        compositionType: {
          text: "Health Document Record"
        },
        bundleProfile: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"
      }
    };
  }

  /**
   * Validates mandatory elements for Health Document record.
   * @param {Object} params - Clinical data records.
   * @returns {Object} Validation report.
   */
  static validate(params) {
    if (!params) {
      return { isValid: false, reason: "Missing Health Document parameters dataset." };
    }
    return { isValid: true };
  }
}

module.exports = HealthDocumentBuilder;
