const assert = require("assert");
const { generatePrescriptionBundle, validateBundle } = require("../m2/fhir/prescriptionRecordGenerator");

const validInput = {
  patient: {
    abhaAddress: "pranay_0120061@sbx",
    fullName: "Pranay Anup Agrawal",
    phone: "9510029575",
    gender: "male",
    birthDate: "2006-01-21"
  },
  practitioner: {
    name: "Sarita",
    hprId: ""
  },
  organization: {
    name: "Sarita Health Clinic",
    hfrId: "IN2410002480"
  },
  encounter: {
    internalId: "visit-001",
    startTime: new Date("2026-07-05T09:53:15.995Z")
  },
  medications: [
    {
      drugName: "Paracetamol 500mg Tablet",
      drugSnomedCode: "387517004",
      indicationText: "Fever",
      indicationSnomedCode: "386661006",
      dosage: { morning: 1, afternoon: 0, evening: 1 },
      route: "ORAL",
      foodTiming: "AFTER_FOOD",
      authoredOn: new Date("2026-07-05T09:53:15.995Z")
    }
  ]
};

const bundle = generatePrescriptionBundle(validInput);
validateBundle(bundle);

const composition = bundle.entry[0].resource;
assert.deepStrictEqual(composition.type, { text: "Prescription record" });
assert.strictEqual(composition.section[2].code, undefined);

const medicationRequest = bundle.entry.find((entry) => entry.resource.resourceType === "MedicationRequest").resource;
assert.ok(medicationRequest.reasonCode?.[0]?.coding?.[0]?.code);
assert.ok(medicationRequest.dosageInstruction?.[0]?.route?.coding?.[0]?.code);
assert.ok(medicationRequest.dosageInstruction?.[0]?.method?.coding?.[0]?.code);
assert.match(medicationRequest.dosageInstruction[0].text, /^Doses: \d+-\d+-\d+$/);

const encounter = bundle.entry.find((entry) => entry.resource.resourceType === "Encounter").resource;
assert.match(encounter.period.start, /Z$|\+00:00$/);

const practitioner = bundle.entry.find((entry) => entry.resource.resourceType === "Practitioner").resource;
assert.strictEqual(practitioner.identifier[0].value, "");

assert.throws(
  () => generatePrescriptionBundle({
    ...validInput,
    medications: [{ ...validInput.medications[0], indicationText: "" }]
  }),
  /indicationText is required/
);

const badBundle = JSON.parse(JSON.stringify(bundle));
badBundle.entry[0].resource.type = {
  coding: [{ system: "http://snomed.info/sct", code: "440545006", display: "Prescription record" }],
  text: "Prescription record"
};
assert.throws(() => validateBundle(badBundle), /Composition.type must be text-only/);

console.log("Prescription bundle verification passed");
