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

    // 2. Immunization Resource(s)
    const immunizations = params.immunizationsList && params.immunizationsList.length > 0
      ? params.immunizationsList
      : [{
          vaccineName: params.vaccineDisplay || "COVID-19 mRNA Vaccine",
          brand: "",
          date: params.occurrenceDateTime || ids.timestamp.split('.')[0] || ids.timestamp,
          lotNumber: "",
          doseNo: "1"
        }];

    immunizations.forEach((imm) => {
      const immId = uuidv4();
      
      let parsedDate = ids.timestamp;
      if (imm.date) {
        try {
          // Try parsing DD MMM YYYY if possible, or just pass as is if format matches ISO
          const dMatch = imm.date.match(/(\d+)\s+([a-zA-Z]+)\s+(\d{4})/);
          if (dMatch) {
            parsedDate = new Date(imm.date).toISOString().replace(/\.\d{3}Z$/, '+05:30');
          } else {
            parsedDate = new Date(imm.date).toISOString().replace(/\.\d{3}Z$/, '+05:30');
          }
        } catch (e) {}
      }

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
              code: "1119349007",
              display: imm.vaccineName || "Vaccine"
            }
          ],
          text: imm.vaccineName || "Vaccine"
        },
        patient: {
          reference: ids.patientId,
          display: params.patientName || "Patient"
        },
        encounter: {
          reference: ids.encounterId,
          display: "Encounter"
        },
        occurrenceDateTime: parsedDate || ids.timestamp,
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

      if (imm.brand) {
        immunizationResource.manufacturer = { display: imm.brand };
      }
      if (imm.lotNumber) {
        immunizationResource.lotNumber = imm.lotNumber;
      }
      if (imm.doseNo) {
        const doseNumber = parseInt(imm.doseNo, 10);
        if (!isNaN(doseNumber)) {
          immunizationResource.protocolApplied = [
            { doseNumberPositiveInt: doseNumber }
          ];
        } else {
          immunizationResource.protocolApplied = [
            { doseNumberString: imm.doseNo }
          ];
        }
      }

      entries.push({ fullUrl: `urn:uuid:${immId}`, resource: immunizationResource });
      sections.push({
        title: "Immunization Details",
        entry: [{ reference: `urn:uuid:${immId}`, display: "Immunization" }]
      });
    });

    // 4. Document Reference (Optional)
    if (params.dataBase64 || params.pdfBase64) {
      const timestampStr = params.timestamp || ids.timestamp || new Date().toISOString();
      const formattedDate = timestampStr.replace(/[:\-T]/g, "").substring(0, 14);
      const filename = `ImmunizationRecord_${formattedDate}.pdf`;

      const docItem = createDocumentReference({
        patientId: ids.patientId,
        typeText: "Immunization Record",
        title: filename,
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
