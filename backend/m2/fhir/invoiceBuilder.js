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
          value: params.invoiceTotalGross || params.invoiceTotal || 0,
          currency: "INR"
        },
        lineItem: []
      }
    };

    if (params.invoiceItems && Array.isArray(params.invoiceItems)) {
      params.invoiceItems.forEach((item, index) => {
        const chargeItemId = uuidv4();
        
        const chargeItem = {
          fullUrl: `urn:uuid:${chargeItemId}`,
          resource: {
            resourceType: "ChargeItem",
            id: chargeItemId,
            meta: {
              profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/ChargeItem"]
            },
            status: "billable",
            code: {
              coding: [
                {
                  system: "https://nrces.in/ndhm/fhir/r4/CodeSystem/ndhm-billing-codes",
                  code: "01",
                  display: item.name || "Consultation"
                }
              ],
              text: item.name || "Consultation"
            },
            productCodeableConcept: {
              coding: [
                {
                  system: "http://snomed.info/sct",
                  code: "X-0001",
                  display: item.name || "Consultation"
                }
              ],
              text: item.name || "Consultation"
            },
            subject: {
              reference: ids.patientId,
              display: params.patientName
            },
            quantity: {
              value: item.qty || 1
            }
          }
        };
        entries.push(chargeItem);

        invoice.resource.lineItem.push({
          sequence: index + 1,
          chargeItemReference: {
            reference: chargeItem.fullUrl,
            display: item.name || "Consultation"
          },
          priceComponent: [
            {
              type: "informational",
              code: {
                coding: [
                  {
                    system: "https://nrces.in/ndhm/fhir/r4/CodeSystem/ndhm-price-components",
                    code: "00",
                    display: "MRP"
                  }
                ]
              },
              factor: item.qty || 1,
              amount: {
                value: item.mrp || 0,
                currency: "INR"
              }
            },
            {
              type: "discount",
              code: {
                coding: [
                  {
                    system: "https://nrces.in/ndhm/fhir/r4/CodeSystem/ndhm-price-components",
                    code: "02",
                    display: "Discount"
                  }
                ]
              },
              amount: {
                value: item.discount || 0,
                currency: "INR"
              }
            },
            {
              type: "base",
              code: {
                coding: [
                  {
                    system: "https://nrces.in/ndhm/fhir/r4/CodeSystem/ndhm-price-components",
                    code: "01",
                    display: "Rate"
                  }
                ]
              },
              amount: {
                value: item.rate || 0,
                currency: "INR"
              }
            },
            {
              type: "tax",
              code: {
                coding: [
                  {
                    system: "https://nrces.in/ndhm/fhir/r4/CodeSystem/ndhm-price-components",
                    code: "03",
                    display: "CGST"
                  }
                ]
              },
              amount: {
                value: item.gstAmt ? item.gstAmt / 2 : 0,
                currency: "INR"
              }
            },
            {
              type: "tax",
              code: {
                coding: [
                  {
                    system: "https://nrces.in/ndhm/fhir/r4/CodeSystem/ndhm-price-components",
                    code: "04",
                    display: "SGST"
                  }
                ]
              },
              amount: {
                value: item.gstAmt ? item.gstAmt / 2 : 0,
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
