# Developer Guide: Generating ABDM-Compliant Discharge Summary Records

**Target profile:** `https://nrces.in/ndhm/fhir/r4/StructureDefinition/DischargeSummaryRecord`

This guide tells you how to build the generator for this record type. Discharge Summary shares most of its machinery with OP Consultation — if you've already built that generator, reuse its `buildPatient`/`buildPractitioner`/`buildOrganization`/`buildCondition`/`buildObservation`/`buildProcedure`/`buildMedicationRequest`/`buildAppointment` functions as-is. This guide focuses on what's *different*.

---

## 1. When your app should emit this record type

When an admitted (inpatient) patient is being discharged — never for an outpatient/walk-in visit (use the OP Consult generator for that).

---

## 2. Data you must have in hand before you start building

Everything listed for OP Consult (§2 of that guide), **plus**:

| Data | Source in your app | Required? |
|---|---|---|
| Admission + discharge timestamps | Inpatient module | Yes |
| Lab panel results (e.g. CBC: WBC, Platelets, MCV, MCH, MCHC, RDW) | Lab module | Optional, but if present must go through `DiagnosticReport`, not loose Observations |
| Discharge care plan description | Discharge form | Yes |
| Follow-up appointment (referenced from care plan) | Scheduling module | Recommended — CarePlan.activity references it |

---

## 3. Build order

```
1. generateUUIDs()
2. buildPatient(patientData)                         -- reuse from OP Consult
3. buildPractitioner(doctorData)                      -- reuse
4. buildOrganization(facilityData)                    -- reuse
5. buildEncounter(admissionData, patientRef)           -- ⚠ class.code = "IMP", not "AMB"
6. buildConditions(complaints, history, familyHistory) -- reuse
7. buildObservations(vitals + bodyMeasurements)        -- ⚠ merge into ONE "Physical Examination" section, don't split
8. buildLabObservations(labResultValues)               -- new: individual Observations for each lab analyte
9. buildDiagnosticReport(labPanel, labObservationRefs) -- new: see §4
10. buildAllergyIntolerances(allergies)                -- reuse
11. buildProcedures(procedures)                        -- reuse
12. buildMedicationRequests(dischargeMedications)      -- reuse
13. buildAppointment(followUp)                         -- reuse, but keep its ref for CarePlan
14. buildCarePlan(dischargePlanText, appointmentRef)   -- new: see §4
15. renderDischargeSummaryPdf(all of the above)
16. buildDocumentReference(pdfBytes, patientRef)        -- reuse
17. buildComposition(...)                               -- new section list, see §5
18. assembleBundle(...)
19. validateBundle(bundle)                              -- extend OP Consult's validator, see §7
20. return bundle
```

---

## 4. New resource builders needed for this type

### buildDiagnosticReport
Takes: a named lab panel (e.g. "Complete Blood Count"), its LOINC panel code, and the list of already-built lab Observation refs.

```
function buildDiagnosticReport(panelLoinc, resultObservationRefs, patientRef, encounterRef, practitionerRef, orgRef, issuedAtUtc):
  return {
    resourceType: "DiagnosticReport",
    id: uuid,
    status: "final",
    code: { coding: [{ system: "http://loinc.org", code: panelLoinc }] },
    subject: patientRef,
    encounter: encounterRef,
    effectiveDateTime: issuedAtUtc,
    issued: issuedAtUtc,
    performer: [practitionerRef, orgRef],
    result: resultObservationRefs.map(ref => ({ reference: ref.uuidRef, display: ref.label }))
  }
```
**Implementation note:** build the individual lab Observations (WBC, Platelet Count, MCV, MCH, MCHC, RDW — each its own `Observation` resource with LOINC `code` and `valueQuantity`) *before* calling `buildDiagnosticReport`, so you have their `urn:uuid:` refs ready to pass in. The DiagnosticReport itself carries no values, only references — a common bug is putting `valueQuantity` directly on the DiagnosticReport, which is wrong.

### buildCarePlan
```
function buildCarePlan(description, appointmentRef):
  return {
    resourceType: "CarePlan",
    id: uuid,
    status: "active",
    intent: "plan",
    category: [{ coding: [{ system: "http://snomed.info/sct", code: "734163000", display: "Discharge care plan" }], text: "Discharge care plan" }],
    title: "Discharge care plan",
    description: description,
    activity: [{ outcomeReference: [appointmentRef] }]
  }
```
**Implementation note:** build the follow-up `Appointment` *first* if one exists, then wire its ref into `CarePlan.activity[].outcomeReference`. If there's no follow-up appointment in your data, decide up front whether your target validator requires `activity[]` to be non-empty — if so, still create a minimal Appointment placeholder rather than omitting the field.

---

## 5. Composition section order (differs from OP Consult)

```
Patient Information, Chief Complaints, Physical Examination, Allergies,
Medical History, <Lab Panel Name>, Procedures, Medications, Family History,
Care Plan, Document Reference
```

Key differences from OP Consult's section list:
- **"Vital Signs" and "Body Measurement" are merged into a single "Physical Examination" section.** Do not reuse the OP Consult section-splitting logic unmodified — merge the two Observation lists into one section entry array.
- **No separate "Investigations" section** — lab results live under the named panel section (e.g. "Complete Blood Count"), pointing at the `DiagnosticReport`, not individual Observations.
- **No "Appointments" section** — the follow-up appointment is referenced indirectly through `CarePlan`, not listed as its own top-level section.
- **New "Care Plan" section** before Document Reference.

`Composition.type`: SNOMED-coded `{ code: "373942005", display: "Discharge summary" }`.
`Composition.title`: `"Discharge summary record"`.

---

## 6. Encounter builder — the critical one-line difference

```
function buildEncounter(admissionData, patientRef):
  return {
    ...,
    class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "IMP", display: "inpatient encounter" },  // ⚠ NOT "AMB"
    period: { start: toUTC(admissionData.admittedAtUtc) }
  }
```
If your codebase shares a single `buildEncounter(data, patientRef, encounterClass)` function across record types, make `encounterClass` a required parameter with no default — a default of `"AMB"` is exactly how this bug slips into a Discharge Summary generator.

---

## 7. Self-validation before submission

Extend the OP Consult validator (`validateBundle`) with these additional assertions:

```
function validateDischargeSummaryBundle(bundle):
  run all base checks from OP Consult's validateBundle()   # dangling refs, base64 PDF, ABHA present, etc.

  encounter = find_resource(bundle, "Encounter")
  assert encounter.class.code == "IMP"          # the #1 type-specific bug

  comp = bundle.entry[0].resource
  assert comp.title == "Discharge summary record"
  assert comp.type.coding[0].code == "373942005"
  assert "Physical Examination" in section titles   # not split into Vital Signs/Body Measurement
  assert "Care Plan" in section titles

  diagReport = find_resource(bundle, "DiagnosticReport")
  if diagReport exists:
      assert diagReport.result is non-empty
      for each result ref: assert it resolves to an Observation resource with a valueQuantity
      assert diagReport has no direct valueQuantity field itself

  carePlan = find_resource(bundle, "CarePlan")
  assert carePlan.category[0].coding[0].code == "734163000"
  assert carePlan.activity[0].outcomeReference resolves to a real Appointment resource in the bundle

  return OK
```

---

## 8. Common implementation bugs to guard against

1. **`Encounter.class` defaults to `AMB`** because the generator was cloned from OP Consult and the class parameter wasn't overridden. This is the single most common bug for this record type — write the assertion in §7 as a blocking check, not a warning.
2. **Vitals and body measurements kept as two sections** (copy-pasted from OP Consult) instead of merged into "Physical Examination".
3. **DiagnosticReport carrying inline values** instead of `result[]` references to standalone Observations.
4. **CarePlan.activity[].outcomeReference pointing to a UUID that was never actually built** as an Appointment resource — happens when the follow-up appointment is optional in the UI but CarePlan generation isn't guarded against its absence.
5. **Missing "Investigations" section leaking through** — if your shared section-builder still emits an "Investigations" section by default, explicitly disable it for this record type.
6. **Reusing the OP Consult Composition.title/type constants** instead of the Discharge-specific ones.

---

## 9. Suggested code structure

```
/fhir-builders
  /discharge-summary
    buildEncounter.ts        <- overrides class="IMP"
    buildLabObservations.ts  <- new
    buildDiagnosticReport.ts <- new
    buildCarePlan.ts         <- new
    buildComposition.ts      <- new section list
    index.ts                 <- orchestrates §3, reuses /op-consult/{buildPatient,buildPractitioner,
                                 buildOrganization,buildConditions,buildObservations,buildAllergies,
                                 buildProcedures,buildMedicationRequests,buildAppointment,
                                 buildDocumentReference}.ts, imports assembleBundle + shared validators
  /op-consult
    ...  (shared builders live here or in /shared if used by 3+ record types)
  /shared
    codeTables.ts, timestamps.ts, uuid.ts, pdfRenderer.ts
```

Factor the truly shared builders (Patient, Practitioner, Organization, Condition, Observation, AllergyIntolerance, Procedure, MedicationRequest, Appointment, DocumentReference) into `/shared` once you're building a third record type that needs them, rather than duplicating per record-type folders.
