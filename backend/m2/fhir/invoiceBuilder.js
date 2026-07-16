/**
 * Header: invoiceBuilder.js
 * Purpose: Invoice specific FHIR record builder.
 * Responsibility: Maps business datasets to Invoice and DocumentReference resources.
 */

const { createDocumentReference } = require("./fhirHelpers");
const { v4: uuidv4 } = require("uuid");

class InvoiceBuilder {
  /**
   * Builds Invoice specific FHIR entries.
   * @param {Object} params - Clinical data records.
   * @param {Object} ids - Standard pre-generated URN references.
   * @returns {Object} Bundle payload coordinates.
   */
  static build(params, ids) {
    const entries = [];
    const finalEntry = [];

    // 1. Invoice Resource
    const invoiceId = uuidv4();
    const invoice = {
      fullUrl: `urn:uuid:${invoiceId}`,
      resource: {
        resourceType: "Invoice",
        id: invoiceId,
        meta: {
          profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Invoice"]
        },
        status: "issued",
        subject: {
          reference: ids.patientId,
          display: params.patientName
        },
        date: params.timestamp,
        identifier: [
          { value: ids.encounterId } // Or actual invoice number if available
        ],
        totalNet: {
          value: params.invoiceTotal || 0,
          currency: "INR"
        },
        totalGross: {
          value: params.invoiceTotal || 0,
          currency: "INR"
        },
        lineItem: []
      }
    };

    if (params.invoiceItems && Array.isArray(params.invoiceItems)) {
      params.invoiceItems.forEach((item, index) => {
        invoice.resource.lineItem.push({
          sequence: index + 1,
          chargeItemCodeableConcept: {
            text: item.name || "Consultation"
          },
          priceComponent: [
            {
              type: "base",
              amount: {
                value: item.total || 0,
                currency: "INR"
              }
            }
          ]
        });
      });
    }

    entries.push(invoice);
    finalEntry.push({ reference: invoice.fullUrl, display: "Invoice" });

    // 2. Document Reference (if document details provided)
    if (params.dataBase64 || params.pdfBase64) {
      const docItem = createDocumentReference({
        patientId: ids.patientId,
        title: params.title || "Invoice Document",
        contentType: params.contentType || "application/pdf",
        dataBase64: params.dataBase64,
        pdfBase64: params.pdfBase64,
        typeText: "Invoice Record",
        timestamp: params.timestamp
      });
      entries.push(docItem);
      finalEntry.push({ reference: docItem.fullUrl, display: "DocumentReference" });
    }

    const sections = [];
    if (finalEntry.length > 0) {
      sections.push({
        title: "Invoice Details",
        code: {
          coding: [{ system: "http://snomed.info/sct", code: "419891008", display: "Record artifact" }]
        },
        entry: finalEntry
      });
    }

    return {
      entries,
      sections,
      metadata: {
        compositionProfile: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/InvoiceRecord",
        compositionTitle: "Invoice Record",
        compositionType: {
          text: "Invoice Record"
        },
        bundleProfile: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"
      }
    };
  }

  /**
   * Validates mandatory elements for Invoice record.
   * @param {Object} params - Clinical data records.
   * @returns {Object} Validation report.
   */
  static validate(params) {
    if (!params) {
      return { isValid: false, reason: "Missing Invoice parameters dataset." };
    }
    return { isValid: true };
  }
}

module.exports = InvoiceBuilder;
