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
 * Helper to format timestamp as Date and Time (YYYY-MM-DD HH:MM)
 */
const formatDate = (val) => {
  if (!val) return "";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val).substring(0, 16).replace("T", " ");

    // Convert to IST (+05:30) for PDF display
    const istOffset = 5.5 * 60 * 60 * 1000;
    const local = new Date(d.getTime() + istOffset);

    const yyyy = local.getUTCFullYear();
    const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(local.getUTCDate()).padStart(2, '0');
    const hh = String(local.getUTCHours()).padStart(2, '0');
    const min = String(local.getUTCMinutes()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  } catch (e) {
    const s = String(val);
    return s.length >= 16 ? s.substring(0, 16).replace("T", " ") : s;
  }
};

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
                formatDate(params.timestamp)
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
                { text: "Timing", bold: true, fillColor: "#e6e6e6" },
                { text: "Instructions", bold: true, fillColor: "#e6e6e6" },
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
        const { addMinutesToTime } = require("./fhirHelpers");
        const sTime = text(params.followUp.startTime || params.followUp.time || "13:00");
        const eTime = (params.followUp.endTime && params.followUp.endTime !== "-")
          ? text(params.followUp.endTime)
          : text(addMinutesToTime(sTime, 15) || "13:15");
        docDefinition.content.push({ text: "Follow Up", fontSize: 12, bold: true, margin: [0, 0, 0, 5] });
        docDefinition.content.push({
          table: {
            headerRows: 0,
            widths: [120, "*"],
            body: [
              [{ text: "Reason", bold: true, fillColor: "#eeeeee" }, text(params.followUp.reason || "Review")],
              [{ text: "Date", bold: true, fillColor: "#eeeeee" }, text(params.followUp.date)],
              [{ text: "Start Time", bold: true, fillColor: "#eeeeee" }, sTime],
              [{ text: "End Time", bold: true, fillColor: "#eeeeee" }, eTime],
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
            { text: "Generated by Sarita Health Care ", color: "gray", fontSize: 10, alignment: "left", margin: [40, 10] },
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
          { text: `Recorded Date:   ${formatDate(params.timestamp)}`, fontSize: 10, bold: true, margin: [0, 0, 0, 10] }
        ]
      };

      const recordedDate = formatDate(params.timestamp);

      const addSection = (title, items) => {
        if (!items || items.length === 0) return;

        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ["*", "auto", "auto", "auto"],
            body: [
              [
                { text: title, bold: true, fillColor: "#e6e6e6" },
                { text: "Value", bold: true, fillColor: "#e6e6e6" },
                { text: "Unit", bold: true, fillColor: "#e6e6e6" },
                { text: "Recorded Date", bold: true, fillColor: "#e6e6e6" }
              ],
              ...items.map((v) => {
                let name = text(v.display);
                let unit = text(v.unit);

                // Clean name mappings and proper units
                if (name === "Respiratory rate") { name = "Respiratory Rate"; unit = unit || "/min"; }
                if (name === "Heart rate") { name = "Heart Rate"; unit = unit || "/min"; }
                if (name === "Body surface temperature") { name = "Body Surface Temp"; unit = unit || "°C"; }
                if (name === "Oxygen saturation in Arterial blood") { name = "SpO2"; unit = unit || "%"; }
                if (name === "Systolic blood pressure") { name = "Systolic BP"; unit = unit || "mmHg"; }
                if (name === "Diastolic blood pressure") { name = "Diastolic BP"; unit = unit || "mmHg"; }

                if (name === "Body height") { name = "Body Height"; unit = unit || "cm"; }
                if (name === "Body weight") { name = "Body Weight"; unit = unit || "kg"; }
                if (name === "Body mass index (BMI) [Ratio]") { name = "BMI"; unit = unit || "kg/m2"; }

                if (name === "Sleep Hours") { name = "Sleep Duration"; unit = unit || "h"; }
                if (name === "Calories Burned") { name = "Calories Burned"; unit = unit || "kcal"; }
                if (name === "Step Count") { name = "Step Count"; unit = "steps"; }

                if (name === "Calorie intake") { name = "Calories Intake"; unit = unit || "kcal"; }
                if (name === "Fluid intake") { name = "Fluid Intake"; unit = unit || "L"; }

                if (name === "Age at menarche") { name = "Age at Menarche"; unit = unit || "years"; }
                if (name === "Last menstrual period start date") { name = "Last Menstrual Date"; }

                if (name === "Smoking status") { name = "Smoking Status"; }
                if (name === "Diet type") { name = "Diet Type"; }

                return [
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
            { text: "Generated by Sarita Health Care ", color: "gray", fontSize: 10, alignment: "left", margin: [40, 10] },
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

      const recordedDate = formatDate(params.timestamp);
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
            { text: "Generated by Sarita Health Care ", color: "gray", fontSize: 10, alignment: "left", margin: [40, 10] },
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
 * Builds the Immunization Record PDF using pdfmake
 */
const generateImmunizationRecordPDF = (params) => {
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
                      { text: "Immunization Record", fontSize: 16, bold: true },
                      { text: "Record Type: ImmunizationRecord", fontSize: 10, color: "gray", margin: [0, 4, 0, 0] }
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
            margin: [0, 0, 0, 20]
          },

          // Immunizations Details
          { text: [{ text: "Status:   ", bold: true }, "final"], margin: [0, 0, 0, 5] },
          { text: "Immunizations", fontSize: 12, bold: true, margin: [0, 0, 0, 5] },
          {
            table: {
              headerRows: 1,
              widths: ["auto", "auto", "auto", "auto", "auto", "*", "auto"],
              body: [
                [
                  { text: "#", bold: true, fillColor: "#eeeeee" },
                  { text: "Vaccine", bold: true, fillColor: "#eeeeee" },
                  { text: "Occurrence Date", bold: true, fillColor: "#eeeeee" },
                  { text: "Lot Number", bold: true, fillColor: "#eeeeee" },
                  { text: "Dose Number", bold: true, fillColor: "#eeeeee" },
                  { text: "Manufacturer", bold: true, fillColor: "#eeeeee" },
                  { text: "Status", bold: true, fillColor: "#eeeeee" }
                ],
                ...(params.immunizationsList && params.immunizationsList.length > 0
                  ? params.immunizationsList.map((imm, idx) => [
                    text(idx + 1),
                    text(imm.vaccineName),
                    formatDate(imm.date),
                    text(imm.lotNumber),
                    text(imm.doseNo),
                    text(imm.brand),
                    text("completed")
                  ])
                  : [
                    [
                      text(1),
                      text(params.vaccineDisplay || "COVID-19 mRNA Vaccine"),
                      formatDate(params.occurrenceDateTime || params.timestamp),
                      text(params.lotNumber || ""),
                      text(params.doseNo || "1"),
                      text(params.brand || ""),
                      text("completed")
                    ]
                  ])
              ]
            },
            layout: "lightHorizontalLines",
            margin: [0, 0, 0, 20]
          }
        ],
        styles: {
          header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
          subheader: { fontSize: 14, bold: true, margin: [0, 10, 0, 5] }
        },
        footer: function (currentPage, pageCount) {
          return [
            { canvas: [{ type: "line", x1: 40, y1: 0, x2: 555, y2: 0, lineWidth: 1, lineColor: "#cccccc" }] },
            {
              columns: [
                { text: "Generated by Sarita Health Care ", color: "gray", fontSize: 10, alignment: "left", margin: [40, 10] },
                { text: `Page ${currentPage}`, color: "gray", fontSize: 10, alignment: "right", margin: [40, 10] }
              ]
            }
          ]
        }
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
 * Builds the Discharge Summary Record PDF using pdfmake
 */
const generateDischargeSummaryPDF = (params) => {
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
                  { text: "S", fillColor: "#0b5c71", color: "white", fontSize: 24, bold: true, alignment: "center", margin: [10, 10, 10, 10] },
                  {
                    stack: [
                      { text: "Discharge Summary Record", fontSize: 16, bold: true },
                      { text: "Record Type: DischargeSummary", fontSize: 10, color: "gray", margin: [0, 4, 0, 0] }
                    ],
                    margin: [10, 5, 0, 0]
                  },
                  {
                    stack: [
                      { text: text(params.facilityName || "Sarita Health Care"), bold: true },
                      { text: `Practitioner: ${text(params.doctorName || params.practitionerName || "Dr. Sarita")}`, color: "gray", margin: [0, 4, 0, 0] }
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
                [{ text: "Facility:", bold: true, fillColor: "#eeeeee" }, text(params.facilityName || "Sarita Health Care")],
                [{ text: "Practitioner:", bold: true, fillColor: "#eeeeee" }, text(params.doctorName || params.practitionerName || "Dr. Sarita")],
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

      const recordedDate = formatDate(params.timestamp);

      docDefinition.content.push(
        { text: `Status:   final`, fontSize: 10, bold: true, margin: [0, 0, 0, 2] },
        { text: `Admission Date:   ${recordedDate}`, fontSize: 10, bold: true, margin: [0, 0, 0, 2] },
        { text: `Discharge Date:   ${recordedDate}`, fontSize: 10, bold: true, margin: [0, 0, 0, 10] }
      );

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
              ...allVitals.map(v => {
                let name = text(v.display);
                if (name === "Systolic blood pressure") name = "Blood Pressure Systolic";
                if (name === "Diastolic blood pressure") name = "Blood Pressure Diastolic";
                if (name === "Body height") name = "Height";
                if (name === "Body weight") name = "Weight";
                if (name === "Body mass index (BMI) [Ratio]") name = "Bmi";
                if (name === "Body surface temperature") name = "Temperature";
                if (name === "Oxygen saturation in Arterial blood") name = "Oxygen Saturation";
                const valStr = `${text(v.value)} ${text(v.unit || "")}`.trim();
                return [
                  name,
                  valStr
                ];
              })
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

      // Family History
      if (params.familyHistory && params.familyHistory.length > 0) {
        docDefinition.content.push({ text: "Family History", fontSize: 12, bold: true, margin: [0, 0, 0, 5] });
        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ["auto", "*", 100, 100],
            body: [
              [{ text: "#", bold: true, fillColor: "#e6e6e6" }, { text: "Condition", bold: true, fillColor: "#e6e6e6" }, { text: "Relation", bold: true, fillColor: "#e6e6e6" }, { text: "Notes", bold: true, fillColor: "#e6e6e6" }],
              ...params.familyHistory.map((h, i) => {
                let condition = text(h.condition);
                let relation = text(h.relationship);
                let notes = text(h.notes);
                if (!condition) {
                  const parts = text(h.display).split(" - ");
                  condition = parts[0] || "-";
                  relation = parts.length > 1 ? parts[1] : (relation || "-");
                  notes = parts.length > 2 ? parts[2] : (notes || "-");
                }
                return [
                  (i + 1).toString(),
                  condition || "-",
                  relation || "-",
                  notes || "-"
                ];
              })
            ]
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 15]
        });
      }

      // Page Break for Page 2
      // docDefinition.content.push({ text: "", pageBreak: "before" });

      // Procedures
      if (params.procedures && params.procedures.length > 0) {
        docDefinition.content.push({ text: "Procedures", fontSize: 12, bold: true, margin: [0, 0, 0, 5], pageBreak: "before" });
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
                recordedDate
              ])
            ]
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 15]
        });
      }

      // Investigations
      if (params.investigations && params.investigations.length > 0) {
        docDefinition.content.push({ text: "Investigations", fontSize: 12, bold: true, margin: [0, 0, 0, 5], pageBreak: (params.procedures && params.procedures.length > 0) ? undefined : "before" });
        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ["auto", "*", "auto", "auto", "auto", "auto"],
            body: [
              [{ text: "#", bold: true, fillColor: "#e6e6e6" }, { text: "Test", bold: true, fillColor: "#e6e6e6" }, { text: "Value", bold: true, fillColor: "#e6e6e6" }, { text: "Unit", bold: true, fillColor: "#e6e6e6" }, { text: "Status", bold: true, fillColor: "#e6e6e6" }, { text: "Intent", bold: true, fillColor: "#e6e6e6" }],
              ...params.investigations.map((inv, i) => {
                let name = text(inv.display);
                if (name === "Hemoglobin [Mass/volume] in Blood") name = "Hemoglobin";
                return [
                  (i + 1).toString(),
                  name,
                  text(inv.value) || "Recorded",
                  text(inv.unit),
                  "active",
                  "order"
                ];
              })
            ]
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 15]
        });
      }

      // Discharge Diagnosis
      const diagnoses = params.dischargeDiagnosis || params.diagnosticReports || params.complaints || [];
      if (diagnoses.length > 0) {
        docDefinition.content.push({ text: "Discharge Diagnosis", fontSize: 12, bold: true, margin: [0, 0, 0, 5] });
        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ["auto", "*", 100],
            body: [
              [{ text: "#", bold: true, fillColor: "#e6e6e6" }, { text: "Condition", bold: true, fillColor: "#e6e6e6" }, { text: "Clinical Status", bold: true, fillColor: "#e6e6e6" }],
              ...diagnoses.map((d, i) => [
                (i + 1).toString(),
                text(d.conclusion || d.display || "Diagnosis"),
                "active"
              ])
            ]
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 15]
        });
      }

      // Medications At Discharge
      if (params.medicationsList && params.medicationsList.length > 0) {
        docDefinition.content.push({ text: "Medications At Discharge", fontSize: 12, bold: true, margin: [0, 0, 0, 5] });
        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ["auto", "*", "auto", "auto", "auto", "*", "auto"],
            body: [
              [
                { text: "#", bold: true, fillColor: "#e6e6e6" },
                { text: "Drug Name", bold: true, fillColor: "#e6e6e6" },
                { text: "Dosage", bold: true, fillColor: "#e6e6e6" },
                { text: "Route", bold: true, fillColor: "#e6e6e6" },
                { text: "Timing", bold: true, fillColor: "#e6e6e6" },
                { text: "Instructions", bold: true, fillColor: "#e6e6e6" },
                { text: "Status", bold: true, fillColor: "#e6e6e6" }
              ],
              ...params.medicationsList.map((m, i) => [
                (i + 1).toString(),
                text(m.drugName || m.medDisplay),
                text(m.dose || "1-1-1"),
                text(m.route || "Oral"),
                text(m.timing || "After Food"),
                text(m.instructions || "-"),
                "active"
              ])
            ]
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 15]
        });
      }

      // Care Plan
      if (params.carePlan) {
        docDefinition.content.push({ text: "Care Plan", fontSize: 12, bold: true, margin: [0, 0, 0, 5] });
        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ["auto", 150, "*"],
            body: [
              [
                { text: "#", bold: true, fillColor: "#e6e6e6" },
                { text: "Plan Title", bold: true, fillColor: "#e6e6e6" },
                { text: "Instructions / Details", bold: true, fillColor: "#e6e6e6" }
              ],
              [
                "1",
                text(params.carePlan.title || "Discharge Care Plan"),
                text(params.carePlan.description || "Follow up as directed")
              ]
            ]
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 15]
        });
      }

      // Follow Up
      if (params.followUp) {
        const { addMinutesToTime } = require("./fhirHelpers");
        const sTime = text(params.followUp.startTime || params.followUp.time || "13:00");
        const eTime = (params.followUp.endTime && params.followUp.endTime !== "-")
          ? text(params.followUp.endTime)
          : text(addMinutesToTime(sTime, 15) || "13:15");
        docDefinition.content.push({ text: "Follow Up", fontSize: 12, bold: true, margin: [0, 0, 0, 5] });
        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ["auto", "*", 100, 80, 80, 80],
            body: [
              [
                { text: "#", bold: true, fillColor: "#e6e6e6" },
                { text: "Reason", bold: true, fillColor: "#e6e6e6" },
                { text: "Date", bold: true, fillColor: "#e6e6e6" },
                { text: "Start Time", bold: true, fillColor: "#e6e6e6" },
                { text: "End Time", bold: true, fillColor: "#e6e6e6" },
                { text: "Status", bold: true, fillColor: "#e6e6e6" }
              ],
              [
                "1",
                text(params.followUp.reason || "Review"),
                text(params.followUp.date || "-"),
                sTime,
                eTime,
                "booked"
              ]
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
            { text: "Generated by Sarita Health Care ", color: "gray", fontSize: 10, alignment: "left", margin: [40, 10] },
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
 * Builds the Prescription Record PDF using pdfmake
 */
const generatePrescriptionPDF = (params) => {
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
                      { text: "Prescription Record", fontSize: 16, bold: true },
                      { text: "Record Type: Prescription", fontSize: 10, color: "gray", margin: [0, 4, 0, 0] }
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
                [{ text: "ABHA Address:", bold: true, fillColor: "#eeeeee" }, text(params.abhaAddress || params.abhaId)],
                [{ text: "Occurrence Date and Time:", bold: true, fillColor: "#eeeeee" }, formatDate(params.timestamp || new Date().toISOString())]
              ]
            },
            layout: "lightHorizontalLines",
            margin: [0, 0, 0, 15]
          }
        ]
      };

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

      // Footer
      docDefinition.footer = function (currentPage, pageCount) {
        return {
          columns: [
            { text: "Generated by Sarita Health Care ", color: "gray", fontSize: 10, alignment: "left", margin: [40, 10] },
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
  generatePrescriptionPDF,
  generateWellnessRecordPDF,
  generateDiagnosticReportPDF,
  generateDischargeSummaryPDF,
  generateImmunizationRecordPDF
};
