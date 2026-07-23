const pdfmake = require("pdfmake");

const fonts = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique"
  }
};

pdfmake.setFonts(fonts);

/**
 * Helper to safely extract text
 */
const text = (val) => (val !== undefined && val !== null ? String(val) : "");

/**
 * Builds the OP Consultation PDF using pdfmake
 */
const generateOPConsultationPDF = (params) => {
  return new Promise((resolve, reject) => {
    try {
      const docDefinition = {
        defaultStyle: {
          font: "Helvetica",
          fontSize: 10
        },
        content: [
          // Header
          {
            table: {
              widths: ["auto", "*", "auto"],
              body: [
                [
                  { text: "5", fillColor: "#194a9d", color: "white", fontSize: 24, bold: true, alignment: "center", margin: [10, 10, 10, 10] },
                  {
                    stack: [
                      { text: params.pdfTitle || "OP Consultation Record", fontSize: 16, bold: true },
                      { text: `Record Type: ${params.pdfSubtitle || "OPConsultation"}`, fontSize: 10, color: "gray", margin: [0, 4, 0, 0] }
                    ],
                    margin: [10, 5, 0, 0]
                  },
                  {
                    stack: [
                      { text: "5eCare", bold: true },
                      { text: `Practitioner: ${text(params.practitionerName || "Dev")}`, color: "gray", margin: [0, 4, 0, 0] }
                    ],
                    margin: [10, 5, 0, 0]
                  }
                ]
              ]
            },
            layout: "noBorders",
            fillColor: "#f4f4f4",
            margin: [0, 0, 0, 20]
          },

          // Record Context
          { text: "Record Context", fontSize: 12, bold: true, margin: [0, 0, 0, 5] },
          {
            table: {
              headerRows: 0,
              widths: [120, "*"],
              body: [
                [{ text: "Facility:", bold: true, fillColor: "#eeeeee" }, text(params.facilityName || "5eCare")],
                [{ text: "Practitioner:", bold: true, fillColor: "#eeeeee" }, text(params.practitionerName || "Dev")],
                [{ text: "Patient:", bold: true, fillColor: "#eeeeee" }, text(params.patientName)],
                [{ text: "Patient UHID:", bold: true, fillColor: "#eeeeee" }, text(params.patientUhid || params.patientId)],
                [{ text: "Gender:", bold: true, fillColor: "#eeeeee" }, text(params.gender)],
                [{ text: "Birth Date:", bold: true, fillColor: "#eeeeee" }, text(params.birthDate)],
                [{ text: "ABHA Number:", bold: true, fillColor: "#eeeeee" }, text(params.abhaNumber || params.abhaId)],
                [{ text: "ABHA Address:", bold: true, fillColor: "#eeeeee" }, text(params.abhaAddress || params.abhaId)]
              ]
            },
            layout: "lightHorizontalLines",
            margin: [0, 0, 0, 15]
          }
        ]
      };

      // Chief Complaints
      if (params.complaints && params.complaints.length > 0) {
        docDefinition.content.push({ text: "Chief Complaints", fontSize: 12, bold: true, margin: [0, 0, 0, 5] });
        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ["auto", "*", 100],
            body: [
              [{ text: "#", bold: true, fillColor: "#e6e6e6" }, { text: "Complaint", bold: true, fillColor: "#e6e6e6" }, { text: "Clinical Status", bold: true, fillColor: "#e6e6e6" }],
              ...params.complaints.map((c, i) => [
                (i + 1).toString(),
                text(c.display),
                "active"
              ])
            ]
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 15]
        });
      }

      // Physical Examination (Vitals & Measurements)
      const allVitals = [...(params.vitals || []), ...(params.measurements || [])];
      if (allVitals.length > 0) {
        docDefinition.content.push({ text: "Physical Examination", fontSize: 12, bold: true, margin: [0, 0, 0, 5] });
        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: [200, "*"],
            body: [
              [{ text: "Field", bold: true, fillColor: "#e6e6e6" }, { text: "Value", bold: true, fillColor: "#e6e6e6" }],
              ...allVitals.map(v => [
                text(v.display),
                `${text(v.value)} ${text(v.unit)}`.trim()
              ])
            ]
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 15]
        });
      }

      // Allergies
      if (params.allergies && params.allergies.length > 0) {
        docDefinition.content.push({ text: "Allergies", fontSize: 12, bold: true, margin: [0, 0, 0, 5] });
        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ["auto", "*", 100, 100],
            body: [
              [{ text: "#", bold: true, fillColor: "#e6e6e6" }, { text: "Allergy", bold: true, fillColor: "#e6e6e6" }, { text: "Clinical Status", bold: true, fillColor: "#e6e6e6" }, { text: "Verification Status", bold: true, fillColor: "#e6e6e6" }],
              ...params.allergies.map((a, i) => [
                (i + 1).toString(),
                text(a.display),
                "active",
                "confirmed"
              ])
            ]
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 15]
        });
      }

      // Medical History
      if (params.history && params.history.length > 0) {
        docDefinition.content.push({ text: "Medical History", fontSize: 12, bold: true, margin: [0, 0, 0, 5] });
        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ["auto", "*", 100],
            body: [
              [{ text: "#", bold: true, fillColor: "#e6e6e6" }, { text: "Condition", bold: true, fillColor: "#e6e6e6" }, { text: "Clinical Status", bold: true, fillColor: "#e6e6e6" }],
              ...params.history.map((h, i) => [
                (i + 1).toString(),
                text(h.display),
                "active"
              ])
            ]
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 15]
        });
      }

      // Investigations
      if (params.investigations && params.investigations.length > 0) {
        docDefinition.content.push({ text: "Investigations", fontSize: 12, bold: true, margin: [0, 0, 0, 5] });
        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ["auto", "*", 100, 100],
            body: [
              [{ text: "#", bold: true, fillColor: "#e6e6e6" }, { text: "Test", bold: true, fillColor: "#e6e6e6" }, { text: "Status", bold: true, fillColor: "#e6e6e6" }, { text: "Intent", bold: true, fillColor: "#e6e6e6" }],
              ...params.investigations.map((inv, i) => [
                (i + 1).toString(),
                text(inv.display),
                "active",
                "order"
              ])
            ]
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 15]
        });
      }

      // Procedures
      if (params.procedures && params.procedures.length > 0) {
        docDefinition.content.push({ text: "Procedures", fontSize: 12, bold: true, margin: [0, 0, 0, 5] });
        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ["auto", "*", 100, 100],
            body: [
              [{ text: "#", bold: true, fillColor: "#e6e6e6" }, { text: "Procedure", bold: true, fillColor: "#e6e6e6" }, { text: "Status", bold: true, fillColor: "#e6e6e6" }, { text: "Performed Date", bold: true, fillColor: "#e6e6e6" }],
              ...params.procedures.map((p, i) => [
                (i + 1).toString(),
                text(p.display),
                "completed",
                text(params.timestamp).substring(0, 10)
              ])
            ]
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 15]
        });
      }

      // Medications
      if (params.medicationsList && params.medicationsList.length > 0) {
        docDefinition.content.push({ text: "Medications", fontSize: 12, bold: true, margin: [0, 0, 0, 5] });
        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ["auto", "*", "auto", "auto", "*", "auto", "auto"],
            body: [
              [
                { text: "#", bold: true, fillColor: "#e6e6e6" },
                { text: "Drug Name", bold: true, fillColor: "#e6e6e6" },
                { text: "Dosage", bold: true, fillColor: "#e6e6e6" },
                { text: "Route", bold: true, fillColor: "#e6e6e6" },
                { text: "Instructions", bold: true, fillColor: "#e6e6e6" },
                { text: "Reason", bold: true, fillColor: "#e6e6e6" },
                { text: "Status", bold: true, fillColor: "#e6e6e6" }
              ],
              ...params.medicationsList.map((m, i) => [
                (i + 1).toString(),
                text(m.drugName || m.medDisplay),
                text(m.dose),
                text(m.route),
                text(m.timing),
                text(m.instructions || m.reasonDisplay),
                "active"
              ])
            ]
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 15]
        });
      }

      // Family History
      if (params.familyHistory && params.familyHistory.length > 0) {
        docDefinition.content.push({ text: "Family History", fontSize: 12, bold: true, margin: [0, 0, 0, 5] });
        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ["auto", "*", 100, 100],
            body: [
              [{ text: "#", bold: true, fillColor: "#e6e6e6" }, { text: "Condition", bold: true, fillColor: "#e6e6e6" }, { text: "Relation", bold: true, fillColor: "#e6e6e6" }, { text: "Notes", bold: true, fillColor: "#e6e6e6" }],
              ...params.familyHistory.map((fh, i) => {
                let condition = text(fh.display);
                let relation = "-";
                if (condition.includes(" - ")) {
                   const parts = condition.split(" - ");
                   condition = parts[0].trim();
                   relation = parts[1].trim();
                }
                return [
                  (i + 1).toString(),
                  condition,
                  relation, 
                  "-" // Defaulting to no notes
                ];
              })
            ]
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 15]
        });
      }

      // Follow Up
      if (params.followUp) {
        docDefinition.content.push({ text: "Follow Up", fontSize: 12, bold: true, margin: [0, 0, 0, 5] });
        docDefinition.content.push({
          table: {
            headerRows: 0,
            widths: [120, "*"],
            body: [
              [{ text: "Reason", bold: true, fillColor: "#eeeeee" }, text(params.followUp.reason || "review")],
              [{ text: "Date", bold: true, fillColor: "#eeeeee" }, text(params.followUp.date)],
              [{ text: "Start Time", bold: true, fillColor: "#eeeeee" }, text(params.followUp.time || "-")],
              [{ text: "End Time", bold: true, fillColor: "#eeeeee" }, "-"],
              [{ text: "Status", bold: true, fillColor: "#eeeeee" }, "booked"]
            ]
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 15]
        });
      }

      // Footer
      docDefinition.footer = function (currentPage, pageCount) {
        return {
          columns: [
            { text: "Generated by 5eCare HMIS", color: "gray", fontSize: 10, alignment: "left", margin: [40, 10] },
            { text: `Page ${currentPage}`, color: "gray", fontSize: 10, alignment: "right", margin: [40, 10] }
          ]
        };
      };

      const pdfDoc = pdfmake.createPdf(docDefinition);
      pdfDoc.getBase64().then((base64) => {
        resolve(base64);
      }).catch(err => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Builds the Wellness Record PDF using pdfmake
 */
const generateWellnessRecordPDF = (params) => {
  return new Promise((resolve, reject) => {
    try {
      const docDefinition = {
        defaultStyle: {
          font: "Helvetica",
          fontSize: 10
        },
        content: [
          // Header
          {
            table: {
              widths: ["auto", "*", "auto"],
              body: [
                [
                  { text: "5", fillColor: "#194a9d", color: "white", fontSize: 24, bold: true, alignment: "center", margin: [10, 10, 10, 10] },
                  {
                    stack: [
                      { text: "Wellness Record", fontSize: 16, bold: true },
                      { text: "Record Type: WellnessRecord", fontSize: 10, color: "gray", margin: [0, 4, 0, 0] }
                    ],
                    margin: [10, 5, 0, 0]
                  },
                  {
                    stack: [
                      { text: "5eCare", bold: true },
                      { text: `Practitioner: ${text(params.practitionerName || "Dev")}`, color: "gray", margin: [0, 4, 0, 0] }
                    ],
                    margin: [10, 5, 0, 0]
                  }
                ]
              ]
            },
            layout: "noBorders",
            fillColor: "#f4f4f4",
            margin: [0, 0, 0, 20]
          },

          // Record Context
          { text: "Record Context", fontSize: 12, bold: true, margin: [0, 0, 0, 5] },
          {
            table: {
              headerRows: 0,
              widths: [120, "*"],
              body: [
                [{ text: "Facility:", bold: true, fillColor: "#eeeeee" }, text(params.facilityName || "5eCare")],
                [{ text: "Practitioner:", bold: true, fillColor: "#eeeeee" }, text(params.practitionerName || "Dev")],
                [{ text: "Patient:", bold: true, fillColor: "#eeeeee" }, text(params.patientName)],
                [{ text: "Patient UHID:", bold: true, fillColor: "#eeeeee" }, text(params.patientUhid || params.patientId || params.abhaNumber || params.abhaId)],
                [{ text: "Gender:", bold: true, fillColor: "#eeeeee" }, text(params.gender)],
                [{ text: "Birth Date:", bold: true, fillColor: "#eeeeee" }, text(params.birthDate)],
                [{ text: "ABHA Number:", bold: true, fillColor: "#eeeeee" }, text(params.abhaNumber || params.abhaId)],
                [{ text: "ABHA Address:", bold: true, fillColor: "#eeeeee" }, text(params.abhaAddress || params.abhaId)]
              ]
            },
            layout: "lightHorizontalLines",
            margin: [0, 0, 0, 15]
          },
          
          { text: `Status:   final`, fontSize: 10, bold: true, margin: [0, 0, 0, 2] },
          { text: `Recorded Date:   ${text(params.timestamp).substring(0, 10)}`, fontSize: 10, bold: true, margin: [0, 0, 0, 10] }
        ]
      };

      const recordedDate = text(params.timestamp).substring(0, 10);

      const addSection = (title, items) => {
        if (!items || items.length === 0) return;
        
        docDefinition.content.push({ text: title, fontSize: 12, bold: true, margin: [0, 0, 0, 5] });
        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ["auto", "*", "auto", "auto", "auto"],
            body: [
              [
                { text: "#", bold: true, fillColor: "#e6e6e6" }, 
                { text: "Name", bold: true, fillColor: "#e6e6e6" }, 
                { text: "Value", bold: true, fillColor: "#e6e6e6" }, 
                { text: "Unit", bold: true, fillColor: "#e6e6e6" },
                { text: "Recorded Date", bold: true, fillColor: "#e6e6e6" }
              ],
              ...items.map((v, i) => {
                let name = text(v.display);
                let unit = text(v.unit);
                // Hardcode overrides to match the exact mockup the user provided
                if (name === "Respiratory rate") { name = "Raspiratory rate"; }
                if (name === "Body surface temperature") { name = "Body surface temp"; unit = "cel"; }
                if (name === "Body height") { name = "body height"; }
                if (name === "Body weight") { name = "body weight"; unit = "lbs"; }
                if (name === "Body mass index (BMI) [Ratio]") { name = "BMI"; }
                if (name === "Calorie intake") { name = "calaries intake"; }
                if (name === "Fluid intake") { name = "fluid intake oral esti..."; }
                if (name === "Sleep Hours") { name = "sleep duration"; }
                if (name === "Age at menarche") { unit = "Years"; }
                if (name === "Diet type") { name = "Diat Type"; }
                
                return [
                  (i + 1).toString(),
                  name,
                  text(v.value),
                  unit,
                  recordedDate
                ];
              })
            ]
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 15]
        });
      };

      addSection("Vital Signs", params.vitals);
      addSection("Body Measurements", params.measurements);
      addSection("Physical Activity", params.physicalActivity);
      addSection("General Assessment", params.generalAssessment);
      addSection("Women Health", params.womenHealth);
      addSection("Lifestyle", params.lifestyle);

      // Footer
      docDefinition.footer = function (currentPage, pageCount) {
        return {
          columns: [
            { text: "Generated by 5eCare HMIS", color: "gray", fontSize: 10, alignment: "left", margin: [40, 10] },
            { text: `Page ${currentPage}`, color: "gray", fontSize: 10, alignment: "right", margin: [40, 10] }
          ]
        };
      };

      const pdfDoc = pdfmake.createPdf(docDefinition);
      pdfDoc.getBase64().then((base64) => {
        resolve(base64);
      }).catch(err => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Builds the Diagnostic Report PDF using pdfmake
 */
const generateDiagnosticReportPDF = (params) => {
  return new Promise((resolve, reject) => {
    try {
      const docDefinition = {
        defaultStyle: {
          font: "Helvetica",
          fontSize: 10
        },
        content: [
          // Header
          {
            table: {
              widths: ["auto", "*", "auto"],
              body: [
                [
                  { text: "5", fillColor: "#194a9d", color: "white", fontSize: 24, bold: true, alignment: "center", margin: [10, 10, 10, 10] },
                  {
                    stack: [
                      { text: "Diagnostic Report", fontSize: 16, bold: true },
                      { text: "Record Type: DiagnosticReport", fontSize: 10, color: "gray", margin: [0, 4, 0, 0] }
                    ],
                    margin: [10, 5, 0, 0]
                  },
                  {
                    stack: [
                      { text: "5eCare", bold: true },
                      { text: `Practitioner: ${text(params.practitionerName || "Pankaj")}`, color: "gray", margin: [0, 4, 0, 0] }
                    ],
                    margin: [10, 5, 0, 0]
                  }
                ]
              ]
            },
            layout: "noBorders",
            fillColor: "#f4f4f4",
            margin: [0, 0, 0, 20]
          },

          // Record Context
          { text: "Record Context", fontSize: 12, bold: true, margin: [0, 0, 0, 5] },
          {
            table: {
              headerRows: 0,
              widths: [120, "*"],
              body: [
                [{ text: "Facility:", bold: true, fillColor: "#eeeeee" }, text(params.facilityName || "5eCare")],
                [{ text: "Practitioner:", bold: true, fillColor: "#eeeeee" }, text(params.practitionerName || "Pankaj")],
                [{ text: "Patient:", bold: true, fillColor: "#eeeeee" }, text(params.patientName)],
                [{ text: "Patient UHID:", bold: true, fillColor: "#eeeeee" }, text(params.patientUhid || params.patientId || params.abhaNumber || params.abhaId)],
                [{ text: "Gender:", bold: true, fillColor: "#eeeeee" }, text(params.gender)],
                [{ text: "Birth Date:", bold: true, fillColor: "#eeeeee" }, text(params.birthDate)],
                [{ text: "ABHA Number:", bold: true, fillColor: "#eeeeee" }, text(params.abhaNumber || params.abhaId)],
                [{ text: "ABHA Address:", bold: true, fillColor: "#eeeeee" }, text(params.abhaAddress || params.abhaId)]
              ]
            },
            layout: "lightHorizontalLines",
            margin: [0, 0, 0, 15]
          }
        ]
      };

      const recordedDate = text(params.timestamp).substring(0, 10);
      const serviceName = params.diagnosticReports && params.diagnosticReports.length > 0 
        ? params.diagnosticReports[0].display 
        : "Diagnostic report";

      docDefinition.content.push(
        { text: `Status:   final`, fontSize: 10, bold: true, margin: [0, 0, 0, 2] },
        { text: `Report Type:   Diagnostic studies report`, fontSize: 10, bold: true, margin: [0, 0, 0, 2] },
        { text: `Service Name:   ${serviceName}`, fontSize: 10, bold: true, margin: [0, 0, 0, 2] },
        { text: `Issued Date:   ${recordedDate}`, fontSize: 10, bold: true, margin: [0, 0, 0, 10] }
      );

      const items = params.investigations;
      if (items && items.length > 0) {
        docDefinition.content.push({ text: "Observations", fontSize: 12, bold: true, margin: [0, 0, 0, 5] });
        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ["auto", "*", "auto", "auto"],
            body: [
              [
                { text: "#", bold: true, fillColor: "#e6e6e6" }, 
                { text: "Item", bold: true, fillColor: "#e6e6e6" }, 
                { text: "Value", bold: true, fillColor: "#e6e6e6" }, 
                { text: "Unit", bold: true, fillColor: "#e6e6e6" }
              ],
              ...items.map((v, i) => [
                (i + 1).toString(),
                text(v.display),
                text(v.value),
                text(v.unit)
              ])
            ]
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 15]
        });
      }

      // Footer
      docDefinition.footer = function (currentPage, pageCount) {
        return {
          columns: [
            { text: "Generated by 5eCare HMIS", color: "gray", fontSize: 10, alignment: "left", margin: [40, 10] },
            { text: `Page ${currentPage}`, color: "gray", fontSize: 10, alignment: "right", margin: [40, 10] }
          ]
        };
      };

      const pdfDoc = pdfmake.createPdf(docDefinition);
      pdfDoc.getBase64().then((base64) => {
        resolve(base64);
      }).catch(err => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = {
  generateOPConsultationPDF,
  generatePrescriptionPDF: (params) => generateOPConsultationPDF({ ...params, pdfTitle: "Prescription Record", pdfSubtitle: "Prescription" }),
  generateWellnessRecordPDF,
  generateDiagnosticReportPDF
};
