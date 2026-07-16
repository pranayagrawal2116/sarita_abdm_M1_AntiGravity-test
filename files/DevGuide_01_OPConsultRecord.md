# Developer Guide: Generating ABDM-Compliant OP Consultation Records

**Target profile:** `https://nrces.in/ndhm/fhir/r4/StructureDefinition/OPConsultRecord`

This guide tells you how to *build* the generator function for this record type — not just what the output should look like, but the order of operations, what data to collect first, how to manage internal references, and how to self-check before you hand the bundle to the ABDM gateway.

---

## 1. When your app should emit this record type

Any time a doctor completes an outpatient (walk-in, non-admitted) visit and records complaints, vitals, exam findings, diagnoses, or prescribes medication — without the patient being admitted.

---

## 2. Data you must have in hand before you start building

Collect this from your application's own DB *before* you touch any FHIR code — if any required field is missing, stop and surface a form-validation error to the user rather than emitting a bundle with placeholder/null data:

| Data | Source in your app | Required? |
|---|---|---|
| Patient full name, gender, DOB, phone | Patient profile | Yes |
| Patient's linked ABHA address (`xxx@sbx` / `xxx@abdm`) | ABHA linkage record | Yes — reject generation if patient has no linked ABHA |
| Treating doctor name + HPR ID | Practitioner profile | Yes (HPR ID may be empty string if not yet issued, but the key must exist) |
| Facility name + HFR ID | Facility config | Yes |
| Encounter start time | Visit/appointment record | Yes |
| Chief complaint(s) | Consultation form | At least 1 |
| Vitals (RR, HR, SpO2, Temp, BP) | Consultation form | Include whichever were captured — omit unmeasured ones, don't fake zeros |
| Body measurements (height, weight, BMI) | Consultation form | Optional but include if captured |
| Allergies | Patient history | Optional |
| Medical/family history | Patient history | Optional |
| Investigations (lab values entered inline) | Consultation form | Optional |
| Procedures performed | Consultation form | Optional |
| Medications prescribed | Prescription form | Optional |
| Follow-up appointment | Scheduling module | Optional |

**Terminology lookups your app needs available offline/cached:** SNOMED CT codes for common complaints/conditions/procedures/drugs, LOINC codes for vitals/labs, UCUM codes for units. Ship a local code table — do not call an external terminology server synchronously during document generation (latency + availability risk).

---

## 3. Build order (this is the actual algorithm)

Write your generator as a pipeline of pure functions, executed in this order:

```
1. generateUUIDs()              -> allocate a UUID for every resource you'll create up front
2. buildPatient(patientData)
3. buildPractitioner(doctorData)
4. buildOrganization(facilityData)
5. buildEncounter(visitData, patientRef)
6. buildConditions(complaints, history, familyHistory, patientRef, encounterRef)
7. buildObservations(vitals, bodyMeasurements, investigations, patientRef, practitionerRef)
8. buildAllergyIntolerances(allergies, patientRef, encounterRef)
9. buildProcedures(procedures, patientRef, encounterRef, practitionerRef, orgRef)
10. buildMedicationRequests(medications, patientRef, practitionerRef)
11. buildAppointment(followUp, patientRef)          -> optional
12. renderConsultationPdf(all of the above)         -> generate a human-readable PDF summary
13. buildDocumentReference(pdfBytes, patientRef)
14. buildComposition(patientRef, encounterRef, practitionerRef, orgRef, all section references)
15. assembleBundle(composition first, then every resource in creation order, DocumentReference last)
16. validateBundle(bundle)                          -> see §7
17. return bundle
```

**Why UUIDs first (step 1):** every downstream resource needs to reference other resources by `urn:uuid:`. If you generate UUIDs lazily/inline you'll end up with mismatched references. Allocate a UUID map at the start:

```
uuids = {
  patient: uuid(), practitioner: uuid(), organization: uuid(), encounter: uuid(),
  chiefComplaintConditions: [...complaints.map(() => uuid())],
  vitalObservations: [...vitals.map(() => uuid())],
  ...
  documentReference: uuid()
}
```

Then every `buildX()` function takes the relevant UUIDs as arguments rather than generating its own — this makes reference wiring mechanical and testable.

---

## 4. Reference-wiring rules (the #1 source of rejected bundles)

- Every `{ "reference": "urn:uuid:<id>" }` you write **must** match a `fullUrl` of some `entry[]` item in the same bundle. Write a unit test that walks the whole bundle, collects every `fullUrl`, then collects every `reference` string, and asserts the second set is a subset of the first. Run this test on every bundle before submission — not just in CI.
- `Composition.section[].entry[].display` should be the actual clinical label (drug name, complaint text), not a generic string like `"Observation"` — copy the `text`/`display` value straight from the resource you just built so it can never drift out of sync.
- `fullUrl` format: `"urn:uuid:<the same uuid used in reference/id>"`.

---

## 5. Function-by-function field mapping

### buildPatient
| Your field | FHIR path |
|---|---|
| patient.abhaAddress | `identifier[0].value` (system `https://healthid.ndhm.gov.in`) |
| patient.fullName | `name[0].text` |
| patient.phone | `telecom[0].value` (system `phone`, use `home`) |
| patient.gender | `gender` |
| patient.dob | `birthDate` (YYYY-MM-DD) |

### buildEncounter
| Your field | FHIR path |
|---|---|
| visit.internalId | `identifier[0].value` |
| — | `class.code = "AMB"` (hardcode for OP Consult) |
| visit.startTimeUtc | `period.start` |

### buildConditions (one call per complaint/history item, differentiated by category)
| Your field | FHIR path |
|---|---|
| complaint.snomedCode, complaint.text | `code.coding[0]`, `code.text` |
| "Chief Complaint" / "Medical History" / "Family History" | `category[0].text` |
| complaint.recordedAtUtc | `recordedDate` |
Always set `clinicalStatus = active`, `verificationStatus = confirmed` unless your UI captures a different status (then map it through, don't hardcode blindly).

### buildObservations
| Your field | FHIR path |
|---|---|
| vital.loincCode, vital.label | `code.coding[0]`, `code.text` |
| vital.value, vital.unit, vital.ucumCode | `valueQuantity.{value,unit,code}` |
| vital.measuredAtUtc | `effectiveDateTime` |
- **Special case: blood pressure.** If your form captures systolic+diastolic together, build ONE Observation with `component[]` (two entries: systolic LOINC `8480-6`, diastolic LOINC `8462-4`), each with its own `valueQuantity` and an `interpretation` coding (`H`/`N`/`L`) computed from your normal-range rules. Do not emit BP as two separate Observations.
- Use `category.coding.code = "vital-signs"` for vitals/body measurements; use `"laboratory"` for investigations, dropping the `ObservationVitalSigns` profile URL for those.

### buildAllergyIntolerances
Map allergy.snomedCode/text → `code`; hardcode `clinicalStatus=active`, `verificationStatus=confirmed` unless captured otherwise.

### buildProcedures
Map procedure.snomedCode/text → `code`; `status="completed"`; `performer[0].actor`=practitioner ref, `performer[0].onBehalfOf`=organization ref.

### buildMedicationRequests (one call per drug)
| Your field | FHIR path |
|---|---|
| drug.snomedCode, drug.name | `medicationCodeableConcept` |
| indication.snomedCode, indication.text | `reasonCode[0]` |
| dosage.schedule (e.g. "1-0-1") | `dosageInstruction[0].text` |
| dosage.route | `dosageInstruction[0].route` |
| dosage.foodTiming | `dosageInstruction[0].method` |

### buildAppointment (optional — only if follow-up was scheduled)
Map scheduling data to `start`/`end` (IST), `participant[0].actor`=patient ref with `status="accepted"`.

### buildComposition
Assemble `section[]` in this fixed order — hardcode the order in your template, don't derive it dynamically from which sections have data (empty sections should simply be omitted, not reordered):
```
Patient Information, Chief Complaints, Vital Signs, Body Measurement,
Allergies, Medical History, Investigations, Procedures, Medications,
Family History, Appointments, Document Reference
```
`Composition.type` is SNOMED-coded: `{ system: http://snomed.info/sct, code: "371530004", display: "Clinical consultation report" }`.

---

## 6. Timestamp handling

Write two small helpers and use them consistently — do not hand-format dates inline:

```
toIST(date)  -> ISO8601 string with "+05:30" offset   // use for Bundle.lastUpdated, Bundle.timestamp, Composition.date, Appointment.start/end
toUTC(date)  -> ISO8601 string with "+00:00" offset    // use for Encounter.period.start, Observation.effectiveDateTime,
                                                        // Condition.recordedDate, Procedure.performedDateTime,
                                                        // MedicationRequest.authoredOn, DocumentReference.attachment.creation
```
Mixing these up doesn't always fail schema validation but will fail downstream ABDM consumers that expect the convention — keep it consistent with the reference samples.

---

## 7. Self-validation before submission (implement as a function, call it every time)

```
function validateBundle(bundle):
  assert bundle.resourceType == "Bundle"
  assert bundle.type == "document"
  assert bundle.entry[0].resource.resourceType == "Composition"
  assert bundle.meta.profile includes OPConsultRecord profile URL

  fullUrls = set(e.fullUrl for e in bundle.entry)
  for every reference string found anywhere in the bundle (recursively walk the JSON):
      assert reference in fullUrls   # no dangling references

  comp = bundle.entry[0].resource
  assert comp.title == "OpConsult record"
  assert comp.type.coding[0].code == "371530004"
  assert len(comp.section) matches number of non-empty sections you built
  for each section: assert section.entry is non-empty and each entry.display is non-blank

  patient = find_resource(bundle, "Patient")
  assert patient.identifier[0].value matches ABHA address pattern (contains "@")

  docRef = find_resource(bundle, "DocumentReference")
  pdfBytes = base64_decode(docRef.content[0].attachment.data)
  assert pdfBytes starts with b"%PDF"

  encounter = find_resource(bundle, "Encounter")
  assert encounter.class.code == "AMB"

  return OK
```

Run this on every generated bundle in a pre-submit hook, and also as a unit test against a fixed set of sample inputs in CI, so a future refactor can't silently reintroduce a dangling reference or wrong profile URL.

---

## 8. Common implementation bugs to guard against

1. **Dangling reference** — a `urn:uuid:` used in a `reference` field that has no matching `fullUrl`. Usually caused by generating a resource's ID in two different places (e.g. once when building the resource, again when building the section entry) instead of reading from the shared UUID map.
2. **Wrong Encounter class** — copy-pasting the Discharge Summary generator (`IMP`) into the OP Consult path. Hardcode `AMB` at the call site, don't parameterize it away for this record type.
3. **Section order drift** — building sections by iterating a dynamic list of "whatever data exists" instead of a fixed template order. Always emit sections in the canonical order in §5, skipping empty ones — never reorder.
4. **Blood pressure emitted as two Observations** instead of one Observation with two `component[]` entries — breaks the panel semantics.
5. **Empty `display` fields** in section entries — happens when the UI-facing label wasn't threaded through to the FHIR builder. Always derive `display` from the same variable used for `code.text`, never a separate hardcoded string.
6. **Base64 PDF corruption** — using a text-mode encoding of the PDF (line-ending translation) instead of raw binary base64. Always read the PDF file/bytes in binary mode before encoding.
7. **Mismatched timestamp offsets** — using UTC where IST is expected in Bundle/Composition-level fields, or vice versa inside clinical resources.

---

## 9. Suggested code structure

```
/fhir-builders
  /op-consult
    buildPatient.ts
    buildPractitioner.ts
    buildOrganization.ts
    buildEncounter.ts
    buildConditions.ts
    buildObservations.ts
    buildAllergies.ts
    buildProcedures.ts
    buildMedicationRequests.ts
    buildAppointment.ts
    buildDocumentReference.ts
    buildComposition.ts
    assembleBundle.ts
    validateBundle.ts
    index.ts        <- orchestrates the pipeline in §3, exported as generateOPConsultBundle(input)
  /shared
    codeTables.ts    <- SNOMED/LOINC/UCUM lookups
    timestamps.ts    <- toIST(), toUTC()
    uuid.ts
    pdfRenderer.ts
```

Keep each `buildX` function pure (input data + refs → resource object, no side effects) so you can unit-test them individually against the field-mapping tables in §5, then test the full pipeline against §7's validator.
