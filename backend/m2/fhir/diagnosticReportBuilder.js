/**
 * Header: diagnosticReportBuilder.js
 * Purpose: Diagnostic Report specific FHIR record builder.
 * Responsibility: Maps investigation data to Observation, DiagnosticReport, and Binary resources.
 */

const { createObservation, createDocumentReference } = require("./fhirHelpers");
const { v4: uuidv4 } = require("uuid");

class DiagnosticReportBuilder {
  static build(params, ids) {
    const entries = [];
    const sections = [];
    const resultRefs = [];

    const investigations = Array.isArray(params.investigations) && params.investigations.length > 0
      ? params.investigations
      : [{ code: "718-7", display: "Hemoglobin", value: "Recorded", unit: "" }];

    for (const item of investigations) {
      const observation = createObservation({
        patientId: ids.patientId,
        code: item.code || "718-7",
        display: item.display || "Laboratory result",
        value: item.value || "Recorded",
        unit: item.unit || "",
        system: "http://loinc.org",
        timestamp: params.timestamp
      });
      entries.push(observation);
      resultRefs.push({ reference: observation.fullUrl, display: item.display || "Laboratory result" });
    }

    const report = Array.isArray(params.diagnosticReports) && params.diagnosticReports.length > 0
      ? params.diagnosticReports[0]
      : { code: "11502-2", display: "Laboratory report", conclusion: "Diagnostic report generated for ABDM transfer" };

    const diagnosticReportId = uuidv4();
    const diagnosticReport = {
      fullUrl: `urn:uuid:${diagnosticReportId}`,
      resource: {
        resourceType: "DiagnosticReport",
        id: diagnosticReportId,
        meta: {
          profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/DiagnosticReportLab"]
        },
        status: "final",
        category: [
          {
            coding: [
              {
                system: "http://snomed.info/sct",
                code: "708196005",
                display: "Hematology service"
              }
            ]
          }
        ],
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: report.code || "11502-2",
              display: report.display || "Laboratory report"
            }
          ],
          text: report.display || "Diagnostic report"
        },
        subject: {
          reference: ids.patientId,
          display: params.patientName
        },
        encounter: {
          reference: ids.encounterId
        },
        performer: [
          {
            reference: ids.organizationId,
            display: params.facilityName
          }
        ],
        resultsInterpreter: [
          {
            reference: ids.practitionerId,
            display: params.doctorName
          }
        ],
        effectiveDateTime: params.timestamp,
        issued: params.timestamp,
        result: resultRefs.map((ref) => ({ reference: ref.reference, display: ref.display })),
        conclusion: report.conclusion || "Diagnostic report generated for ABDM transfer"
      }
    };
    entries.push(diagnosticReport);

    const finalEntry = [];
    finalEntry.push({ reference: diagnosticReport.fullUrl, display: report.display || "Diagnostic report" });
    if (resultRefs.length > 0) {
      finalEntry.push(...resultRefs);
    }

    if (params.dataBase64 || params.pdfBase64) {
      const docItem = createDocumentReference({
        patientId: ids.patientId,
        typeText: "Diagnostic Report Record",
        title: "Diagnostic Report Record",
        contentType: params.contentType || "application/pdf",
        dataBase64: params.dataBase64,
        pdfBase64: params.pdfBase64,
        timestamp: params.timestamp
      });
      entries.push(docItem);
      finalEntry.push({ reference: docItem.fullUrl, display: "DocumentReference" });
    }

    sections.push({
      title: report.display || "Hematology report",
      code: {
        coding: [
          {
            system: "http://snomed.info/sct",
            code: "4321000179101",
            display: "Hematology report"
          }
        ]
      },
      entry: finalEntry
    });

    return {
      entries,
      sections,
      metadata: {
        compositionProfile: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/DiagnosticReportRecord",
        compositionTitle: "Diagnostic report",
        compositionType: {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: "721981007",
              display: "Diagnostic studies report"
            }
          ],
          text: "Diagnostic Report- Lab"
        },
        bundleProfile: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"
      }
    };
  }

  static validate(params) {
    if (!params) {
      return { isValid: false, reason: "Missing Diagnostic Report parameters dataset." };
    }
    return { isValid: true };
  }
}

module.exports = DiagnosticReportBuilder;
