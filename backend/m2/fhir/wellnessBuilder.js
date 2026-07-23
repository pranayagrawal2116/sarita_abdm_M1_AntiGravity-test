/**
 * Header: wellnessBuilder.js
 * Purpose: Wellness specific FHIR record builder.
 * Responsibility: Maps business datasets to Observation and DocumentReference resources.
 */

const { createDocumentReference } = require("./fhirHelpers");
const { v4: uuidv4 } = require("uuid");

const DATA_POINT_MAPPING = {
  // Vitals
  "Respiratory rate": { kind: "NUMERIC", loinc: "9279-1", unit: "/min", category: "vital-signs", categoryDisplay: "Vital Signs" },
  "Heart rate": { kind: "NUMERIC", loinc: "8867-4", unit: "/min", category: "vital-signs", categoryDisplay: "Vital Signs" },
  "Oxygen saturation in Arterial blood": { kind: "NUMERIC", loinc: "2708-6", unit: "%", category: "vital-signs", categoryDisplay: "Vital Signs" },
  "Body surface temperature": { kind: "NUMERIC", loinc: "8310-5", unit: "Cel", category: "vital-signs", categoryDisplay: "Vital Signs" },
  "Systolic blood pressure": { kind: "NUMERIC", loinc: "8480-6", unit: "mm[Hg]", category: "vital-signs", categoryDisplay: "Vital Signs" },
  "Diastolic blood pressure": { kind: "NUMERIC", loinc: "8462-4", unit: "mm[Hg]", category: "vital-signs", categoryDisplay: "Vital Signs" },
  
  // Measurements
  "Body height": { kind: "NUMERIC", loinc: "8302-2", unit: "cm", category: "survey", categoryDisplay: "Survey" },
  "Body weight": { kind: "NUMERIC", loinc: "29463-7", unit: "kg", category: "survey", categoryDisplay: "Survey" },
  "Body mass index (BMI) [Ratio]": { kind: "NUMERIC", loinc: "39156-5", unit: "kg/m2", category: "survey", categoryDisplay: "Survey" },

  // Physical Activity
  "Step Count": { kind: "NUMERIC", loinc: "55423-8", unit: "{steps}", category: "activity", categoryDisplay: "Activity" },
  "Calories Burned": { kind: "NUMERIC", loinc: "41981-2", unit: "kcal", category: "activity", categoryDisplay: "Activity" },
  "Sleep Hours": { kind: "NUMERIC", loinc: "248263006", unit: "h", category: "activity", categoryDisplay: "Activity" },

  // General Assessment
  "Calorie intake": { kind: "NUMERIC", loinc: "8981-3", unit: "kcal", category: "survey", categoryDisplay: "Survey" },
  "Fluid intake": { kind: "NUMERIC", loinc: "8982-1", unit: "L", category: "survey", categoryDisplay: "Survey" },

  // Women Health
  "Age at menarche": { kind: "NUMERIC", loinc: "42798-8", unit: "a", category: "survey", categoryDisplay: "Survey" },
  "Last menstrual period start date": { kind: "FREE_TEXT", loinc: "8665-2", category: "survey", categoryDisplay: "Survey" },

  // Lifestyle
  "Diet type": { kind: "CATEGORICAL", loinc: "8983-9", category: "survey", categoryDisplay: "Survey" },
  "Smoking status": { kind: "CATEGORICAL", loinc: "72166-2", category: "survey", categoryDisplay: "Survey" }
};

const getSnomedForDiet = (diet) => {
  const d = diet.toLowerCase();
  if (d.includes("veg")) return { code: "765021002", display: "Vegetarian diet" };
  if (d.includes("vegan")) return { code: "300488009", display: "Vegan diet" };
  return { code: "765021002", display: "Vegetarian diet" };
};

const getSnomedForSmoking = (smoking) => {
  const s = smoking.toLowerCase();
  if (s.includes("never")) return { code: "266919005", display: "Never smoked" };
  if (s.includes("former")) return { code: "8517006", display: "Former smoker" };
  return { code: "77176002", display: "Smoker" };
};

class WellnessBuilder {

  static buildWellnessObservation(dataPoint, patientRef, timestamp) {
    const id = uuidv4();
    const mapInfo = DATA_POINT_MAPPING[dataPoint.display] || { kind: "FREE_TEXT", loinc: dataPoint.code || "8982-1", category: "survey", categoryDisplay: "Survey" };
    
    const base = {
      resourceType: "Observation",
      id,
      meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Observation"] },
      status: "final",
      category: [{
        coding: [{
          system: "http://terminology.hl7.org/CodeSystem/observation-category",
          code: mapInfo.category,
          display: mapInfo.categoryDisplay
        }]
      }],
      code: { 
        coding: [{ system: "http://loinc.org", code: mapInfo.loinc, display: dataPoint.display }], 
        text: dataPoint.display 
      },
      subject: { reference: patientRef },
      effectiveDateTime: timestamp
    };

    switch (mapInfo.kind) {
      case "NUMERIC":
        base.valueQuantity = {
          value: Number(dataPoint.value),
          unit: mapInfo.unit || dataPoint.unit || "unit",
          system: "http://unitsofmeasure.org",
          code: mapInfo.unit || dataPoint.unit || "unit"
        };
        break;
      case "FREE_TEXT":
        base.valueString = String(dataPoint.value);
        break;
      case "CATEGORICAL":
        let snomed = { code: "22253000", display: dataPoint.value };
        if (dataPoint.display === "Diet type") snomed = getSnomedForDiet(dataPoint.value);
        if (dataPoint.display === "Smoking status") snomed = getSnomedForSmoking(dataPoint.value);
        
        base.valueCodeableConcept = { 
          coding: [{ system: "http://snomed.info/sct", code: snomed.code, display: snomed.display }], 
          text: dataPoint.value 
        };
        break;
      default:
        base.valueString = String(dataPoint.value);
    }
    
    return { fullUrl: `urn:uuid:${id}`, resource: base };
  }

  static build(params, ids) {
    const entries = [];
    const sections = [];
    const patientRef = ids.patientId;
    const timestamp = params.timestamp;

    const processCategory = (title, dataList) => {
      if (!dataList || dataList.length === 0) return;
      const finalEntry = [];
      for (const dp of dataList) {
        const item = this.buildWellnessObservation(dp, patientRef, timestamp);
        entries.push(item);
        finalEntry.push({ reference: item.fullUrl, display: dp.display });
      }
      if (finalEntry.length > 0) {
        sections.push({
          title: title,
          code: {
            coding: [{ system: "http://snomed.info/sct", code: "425044008", display: "Physical findings of general status" }]
          },
          entry: finalEntry
        });
      }
    };

    // Build the sections in the exact order
    processCategory("Vital Signs", params.vitals);
    processCategory("Body Measurement", params.measurements);
    processCategory("Physical Activity", params.physicalActivity);
    processCategory("General Assessment", params.generalAssessment);
    processCategory("Women Health", params.womenHealth);
    processCategory("Lifestyle", params.lifestyle);

    // Document Reference
    if (params.dataBase64 || params.pdfBase64) {
      const docItem = createDocumentReference({
        patientId: ids.patientId,
        title: "Wellness Document",
        contentType: params.contentType || "application/pdf",
        dataBase64: params.dataBase64,
        pdfBase64: params.pdfBase64,
        typeText: "Wellness Record",
        timestamp: params.timestamp
      });
      entries.push(docItem);
      sections.push({
        title: "Document Reference",
        code: {
          coding: [{ system: "http://snomed.info/sct", code: "371530004", display: "Clinical consultation report" }]
        },
        entry: [{ reference: docItem.fullUrl, display: "DocumentReference" }]
      });
    }

    return {
      entries,
      sections,
      metadata: {
        compositionProfile: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/WellnessRecord",
        compositionTitle: "Wellness Record",
        compositionType: {
          text: "Wellness Record"
        },
        bundleProfile: "https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"
      }
    };
  }

  static validate(params) {
    if (!params) {
      return { isValid: false, reason: "Missing Wellness parameters dataset." };
    }
    return { isValid: true };
  }
}

module.exports = WellnessBuilder;
