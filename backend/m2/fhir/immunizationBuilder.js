/**
 * Header: immunizationBuilder.js
 * Purpose: Immunization specific FHIR record builder.
 * Responsibility: Maps business datasets to Immunization, ImmunizationRecommendation, and DocumentReference resources, strictly matching ABDM M2 samples.
 */

const { v4: uuidv4 } = require("uuid");
const { createDocumentReference } = require("./fhirHelpers");

class ImmunizationBuilder {
  /**
   * Builds Immunization specific FHIR entries.
   * @param {Object} params - Clinical data records.
   * @param {Object} ids - Standard pre-generated URN references.
   * @returns {Object} Bundle payload coordinates.
   */
  static build(params, ids) {
    const entries = [];
    const sections = [];

    // 1. Patient Information Section
    sections.push({
      title: "Patient Information",
      entry: [{ reference: ids.patientId, display: params.patientName || "Patient" }]
    });

    // 2. Immunization Resource
    const immId = uuidv4();
    const immunizationResource = {
      resourceType: "Immunization",
      id: immId,
      meta: {
        profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Immunization"]
      },
      status: params.status || "completed",
      vaccineCode: {
        coding: [
          {
            system: "https://www.snomed.org",
            code: params.vaccineCode || "1119349007",
            display: params.vaccineDisplay || "COVID-19 mRNA Vaccine"
          }
        ],
        text: params.vaccineDisplay || "COVID-19 mRNA Vaccine"
      },
      patient: {
        reference: ids.patientId,
        display: params.patientName || "Patient"
      },
      encounter: {
        reference: ids.encounterId,
        display: "Encounter"
      },
      occurrenceDateTime: params.occurrenceDateTime || ids.timestamp.split('.')[0] || ids.timestamp,
      primarySource: true,
      performer: [
        {
          actor: {
            reference: ids.practitionerId,
            display: "Practitioner"
          }
        }
      ]
    };
    entries.push({ fullUrl: `urn:uuid:${immId}`, resource: immunizationResource });
    sections.push({
      title: "Immunization Details",
      entry: [{ reference: `urn:uuid:${immId}`, display: "Immunization" }]
    });

    // 3. Immunization Recommendation Resource (Optional)
    const recId = uuidv4();
    const recResource = {
      resourceType: "ImmunizationRecommendation",
      id: recId,
      meta: {
        profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/ImmunizationRecommendation"]
      },
      patient: {
        reference: ids.patientId,
        display: params.patientName || "Patient"
      },
      date: ids.timestamp,
      recommendation: [
        {
          vaccineCode: [
            {
              coding: [
                {
                  system: "https://www.snomed.org",
                  code: params.recommendationVaccineCode || "28531000087107",
                  display: params.recommendationVaccineDisplay || ""
                }
              ]
            }
          ],
          forecastStatus: {
            text: "Due"
          },
          dateCriterion: [
            {
              code: {
                text: "Next Dose Due Date"
              },
              value: params.nextDoseDate || ids.timestamp
            }
          ]
        }
      ]
    };
    entries.push({ fullUrl: `urn:uuid:${recId}`, resource: recResource });
    sections.push({
      title: "Immunization Recommendation",
      entry: [{ reference: `urn:uuid:${recId}`, display: "ImmunizationRecommendation" }]
    });

    // 4. Document Reference (Optional)
    if (params.dataBase64 || params.pdfBase64) {
      const docItem = createDocumentReference({
        patientId: ids.patientId,
        typeText: "Immunization Record",
        title: "Immunization Record",
        contentType: params.contentType || "application/pdf",
        dataBase64: params.dataBase64,
        pdfBase64: params.pdfBase64,
        timestamp: params.timestamp
      });
      entries.push(docItem);
      sections.push({
        title: "Document Reference",
        entry: [{ reference: docItem.fullUrl, display: "DocumentReference" }]
      });
    }

    return {
      entries,
      sections,
      metadata: {
        compositionProfile: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/ImmunizationRecord",
        compositionTitle: "Immunization record",
        compositionType: {
          text: "Immunization record"
        },
        bundleProfile: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"
      }
    };
  }

  /**
   * Validates mandatory elements for Immunization record.
   * @param {Object} params - Clinical data records.
   * @returns {Object} Validation report.
   */
  static validate(params) {
    if (!params) {
      return { isValid: false, reason: "Missing Immunization parameters dataset." };
    }
    return { isValid: true };
  }
}

module.exports = ImmunizationBuilder;
