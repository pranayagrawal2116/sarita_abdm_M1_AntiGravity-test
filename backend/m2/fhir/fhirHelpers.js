/**
 * Header: fhirHelpers.js
 * Purpose: Shared helpers to construct standardized FHIR R4 resources for ABDM.
 * Responsibility: Format timestamps and structure Observation, Condition, DocumentReference, MedicationRequest, and Binary.
 */

const { v4: uuidv4 } = require("uuid");

const formatTimestamp = (dateInput) => {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) return formatTimestamp();
  const istMs = d.getTime() + (5.5 * 60 * 60 * 1000);
  const ist = new Date(istMs).toISOString().replace("Z", "");
  return `${ist}+05:30`;
};

const createObservation = ({
  id = uuidv4(),
  patientId,
  code,
  display,
  value,
  unit,
  system = "http://loinc.org",
  timestamp = formatTimestamp(),
  components = null
}) => {
  const resource = {
    resourceType: "Observation",
    id,
    meta: {
      profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Observation"]
    },
    status: "final",
    code: {
      coding: [
        {
          system,
          code,
          display
        }
      ],
      text: display
    },
    subject: {
      reference: patientId
    },
    effectiveDateTime: timestamp
  };

  if (components) {
    resource.component = components;
  } else if (value !== undefined) {
    if (typeof value === "number") {
      resource.valueQuantity = {
        value,
        unit,
        system: "http://unitsofmeasure.org",
        code: unit
      };
    } else {
      resource.valueString = String(value);
    }
  }

  return {
    fullUrl: `urn:uuid:${id}`,
    resource
  };
};

const createCondition = ({
  id = uuidv4(),
  patientId,
  code,
  display,
  status = "active",
  system = "http://snomed.info/sct",
  timestamp = formatTimestamp()
}) => {
  return {
    fullUrl: `urn:uuid:${id}`,
    resource: {
      resourceType: "Condition",
      id,
      meta: {
        profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Condition"]
      },
      clinicalStatus: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
            code: status,
            display: status
          }
        ]
      },
      code: {
        coding: [
          {
            system,
            code,
            display
          }
        ],
        text: display
      },
      subject: {
        reference: patientId
      },
      recordedDate: timestamp
    }
  };
};

const createDocumentReference = ({
  id = uuidv4(),
  patientId,
  code = "419891008",
  display = "Record record",
  title = "Health Document",
  contentType = "application/pdf",
  dataBase64,
  pdfBase64,
  typeText,
  timestamp = formatTimestamp()
}) => {
  const fileData = dataBase64 || pdfBase64 || "JVBERi0xLjQK...";
  const typeField = typeText 
    ? { text: typeText } 
    : { coding: [{ system: "http://snomed.info/sct", code, display }], text: display };

  return {
    fullUrl: `urn:uuid:${id}`,
    resource: {
      resourceType: "DocumentReference",
      id,
      meta: {
        profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentReference"]
      },
      status: "current",
      docStatus: "final",
      type: typeField,
      subject: {
        reference: patientId
      },
      date: timestamp,
      content: [
        {
          attachment: {
            contentType,
            language: "en-IN",
            data: fileData,
            title,
            creation: timestamp
          }
        }
      ]
    }
  };
};

const createMedicationRequest = ({
  id = uuidv4(),
  patientId,
  practitionerId,
  medCode,
  medDisplay,
  reasonCode,
  reasonDisplay,
  instructionText = "As directed",
  routeText,
  timingText,
  timestamp = formatTimestamp()
}) => {
  const resource = {
    resourceType: "MedicationRequest",
    id,
    meta: {
      profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/MedicationRequest"]
    },
    status: "active",
    intent: "order",
    medicationCodeableConcept: {
      coding: [
        {
          system: "http://snomed.info/sct",
          code: medCode,
          display: medDisplay
        }
      ],
      text: medDisplay
    },
    subject: {
      reference: patientId
    },
    authoredOn: timestamp,
    requester: {
      reference: practitionerId
    },
    dosageInstruction: []
  };

  const dosage = { text: instructionText };
  if (routeText) {
    dosage.route = { text: routeText };
  }
  if (timingText) {
    dosage.method = { text: timingText };
  }
  resource.dosageInstruction.push(dosage);

  if (reasonCode || reasonDisplay) {
    const rc = { text: reasonDisplay || reasonCode || "Condition" };
    if (reasonCode) {
      rc.coding = [{ system: "http://snomed.info/sct", code: reasonCode, display: reasonDisplay || reasonCode }];
    }
    resource.reasonCode = [rc];
  }

  return {
    fullUrl: `urn:uuid:${id}`,
    resource
  };
};

const createBinary = ({
  id = uuidv4(),
  contentType = "application/pdf",
  dataBase64 = "JVBERi0xLjQK..."
}) => {
  return {
    fullUrl: `urn:uuid:${id}`,
    resource: {
      resourceType: "Binary",
      id,
      meta: {
        profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Binary"]
      },
      contentType,
      data: dataBase64
    }
  };
};

const createProcedure = ({
  id = uuidv4(),
  patientId,
  display,
  status = "completed",
  timestamp = formatTimestamp()
}) => {
  return {
    fullUrl: `urn:uuid:${id}`,
    resource: {
      resourceType: "Procedure",
      id,
      meta: {
        profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Procedure"]
      },
      status,
      code: {
        text: display
      },
      subject: { reference: patientId },
      performedDateTime: timestamp
    }
  };
};

const createFamilyMemberHistory = ({
  id = uuidv4(),
  patientId,
  display,
  status = "completed"
}) => {
  return {
    fullUrl: `urn:uuid:${id}`,
    resource: {
      resourceType: "FamilyMemberHistory",
      id,
      meta: {
        profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/FamilyMemberHistory"]
      },
      status,
      patient: { reference: patientId },
      relationship: { text: "Family member" },
      condition: [
        {
          code: { text: display }
        }
      ]
    }
  };
};

const createAppointment = ({
  id = uuidv4(),
  patientId,
  practitionerId,
  reason,
  status = "booked",
  start,
  end,
  timestamp = formatTimestamp()
}) => {
  return {
    fullUrl: `urn:uuid:${id}`,
    resource: {
      resourceType: "Appointment",
      id,
      meta: {
        profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Appointment"]
      },
      status,
      description: reason,
      participant: [
        { actor: { reference: patientId }, status: "accepted" },
        { actor: { reference: practitionerId }, status: "accepted" }
      ],
      start: start || timestamp,
      end: end || start || timestamp
    }
  };
};

const formatAppointmentTime = (dateStr, timeStr, defaultTime = "13:00") => {
  if (!dateStr) return null;
  const cleanDate = String(dateStr).trim();
  let cleanTime = (timeStr && String(timeStr).trim() !== "-") ? String(timeStr).trim() : defaultTime;
  if (/^\d{1,2}:\d{2}$/.test(cleanTime)) {
    const parts = cleanTime.split(":");
    cleanTime = `${parts[0].padStart(2, '0')}:${parts[1]}:00`;
  } else if (/^\d{1,2}:\d{2}:\d{2}$/.test(cleanTime)) {
    const parts = cleanTime.split(":");
    cleanTime = `${parts[0].padStart(2, '0')}:${parts[1]}:${parts[2]}`;
  } else {
    cleanTime = defaultTime.length === 5 ? `${defaultTime}:00` : defaultTime;
  }
  return `${cleanDate}T${cleanTime}+05:30`;
};

const addMinutesToTime = (timeStr, minsToAdd = 15) => {
  if (!timeStr || !/^\d{1,2}:\d{2}/.test(String(timeStr).trim())) return null;
  const parts = String(timeStr).trim().split(":");
  let h = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10) + minsToAdd;
  h = (h + Math.floor(m / 60)) % 24;
  m = m % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

module.exports = {
  formatTimestamp,
  formatAppointmentTime,
  addMinutesToTime,
  createObservation,
  createCondition,
  createDocumentReference,
  createMedicationRequest,
  createBinary,
  createProcedure,
  createFamilyMemberHistory,
  createAppointment
};
