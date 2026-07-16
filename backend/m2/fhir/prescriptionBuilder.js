/**
 * Header: prescriptionBuilder.js
 * Purpose: Prescription specific FHIR record builder.
 * Responsibility: Maps business datasets to MedicationRequest and Binary resources.
 */

const { createMedicationRequest, createDocumentReference } = require("./fhirHelpers");

class PrescriptionBuilder {
  /**
   * Builds Prescription specific FHIR entries.
   * @param {Object} params - Clinical data records.
   * @param {Object} ids - Standard pre-generated URN references.
   * @returns {Object} Bundle payload coordinates.
   */
  static build(params, ids) {
    const entries = [];
    const sections = [];

    const finalEntry = [];

    // 1. Medications (MedicationRequests)
    if (params.medications && Array.isArray(params.medications)) {
      for (const med of params.medications) {
        const item = createMedicationRequest({
          patientId: ids.patientId,
          practitionerId: ids.practitionerId,
          medCode: med.medCode,
          medDisplay: med.medDisplay,
          instructionText: med.instructionText,
          timestamp: params.timestamp
        });
        entries.push(item);
        finalEntry.push({ reference: item.fullUrl, display: med.medDisplay });
      }
    }

    if (params.dataBase64 || params.pdfBase64) {
      const docItem = createDocumentReference({
        patientId: ids.patientId,
        typeText: "Prescription Record",
        title: "Prescription Record",
        contentType: params.contentType || "application/pdf",
        dataBase64: params.dataBase64,
        pdfBase64: params.pdfBase64,
        timestamp: params.timestamp
      });
      entries.push(docItem);
      finalEntry.push({ reference: docItem.fullUrl, display: "DocumentReference" });
    }

    if (finalEntry.length > 0) {
      sections.push({
        title: "Prescription record",
        code: {
          coding: [{ system: "http://snomed.info/sct", code: "440545006", display: "Prescription record" }]
        },
        entry: finalEntry
      });
    }

    return {
      entries,
      sections,
      metadata: {
        compositionProfile: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/PrescriptionRecord",
        compositionTitle: "Prescription record",
        compositionType: {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: "440545006",
              display: "Prescription record"
            }
          ],
          text: "Prescription record"
        },
        bundleProfile: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"
      }
    };
  }

  /**
   * Validates mandatory elements for Prescription record.
   * @param {Object} params - Clinical data records.
   * @returns {Object} Validation report.
   */
  static validate(params) {
    if (!params) {
      return { isValid: false, reason: "Missing Prescription parameters dataset." };
    }
    if (!params.medications || !Array.isArray(params.medications) || params.medications.length === 0) {
      return { isValid: false, reason: "Prescription must contain at least one medication request." };
    }
    return { isValid: true };
  }
}

module.exports = PrescriptionBuilder;
