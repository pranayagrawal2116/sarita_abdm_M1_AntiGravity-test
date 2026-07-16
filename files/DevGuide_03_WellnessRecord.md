# Developer Guide: Generating ABDM-Compliant Wellness Records

**Target profile:** `https://nrces.in/ndhm/fhir/r4/StructureDefinition/WellnessRecord`

Wellness Record is structurally the simplest clinical record type to generate — it has only one resource kind (`Observation`) beyond the standard actors. The engineering challenge here isn't resource variety, it's **picking the correct value-shape** for each data point. Get this wrong and the bundle looks fine to a human reviewer but fails downstream consumers expecting a specific `value[x]` field.

---

## 1. When your app should emit this record type

Self-reported or device-captured wellness/lifestyle data — fitness tracker syncs, periodic health check-ins, wellness app entries. Not tied to a clinical encounter in the same way a consultation is (though it still requires a Patient/Practitioner/Organization/Encounter wrapper).

---

## 2. Data you must have in hand before you start building

| Data | Required? |
|---|---|
| Patient ABHA address, demographics | Yes |
| Recording practitioner/facility (may be a wellness-app "system" practitioner, not a doctor) | Yes |
| Vitals: RR, HR, SpO2, temperature, BP (systolic+diastolic) | Include whichever were captured |
| Body measurements: height, weight, BMI | Optional |
| Physical activity: steps, calories burned, sleep duration | Optional |
| General assessment: glucose, body fat, fluid intake, calorie intake | Optional |
| Women's health: age at menarche, LMP date | Optional, gender-conditional — don't emit for male patients |
| Lifestyle: diet type, smoking status | Optional |

---

## 3. Build order

```
1. generateUUIDs()
2. buildPatient(patientData)
3. buildPractitioner(recorderData)
4. buildOrganization(facilityData)
5. buildEncounter(sessionData, patientRef)      -- class = "AMB"
6. buildWellnessObservations(allCapturedDataPoints, patientRef, practitionerRef)
     -- this is a dispatcher: for each data point, route to the correct
        value-shape builder based on its type (see §4)
7. renderWellnessPdf(all observations)
8. buildDocumentReference(pdfBytes, patientRef)
9. buildComposition(patientRef, encounterRef, practitionerRef, orgRef, section entries)
10. assembleBundle(...)
11. validateBundle(bundle)
12. return bundle
```

---

## 4. The core engineering problem: value-shape dispatch

Do not write one generic `buildObservation(code, value, unit)` function and stuff every data type through it. Instead, write a **typed dispatcher** so the compiler/type-checker forces you to pick the right shape:

```
function buildWellnessObservation(dataPoint, patientRef, practitionerRef):
  base = {
    resourceType: "Observation",
    id: uuid,
    status: "final",
    category: [...],   // vital-signs or survey, depending on section — see below
    code: { coding: [{ system: "http://loinc.org", code: dataPoint.loincCode, display: dataPoint.label }], text: dataPoint.label },
    subject: patientRef,
    effectiveDateTime: toUTC(dataPoint.recordedAt),
    performer: [practitionerRef]
  }

  switch dataPoint.kind:
    case "NUMERIC":
        return { ...base, valueQuantity: { value: dataPoint.value, unit: dataPoint.unit, system: "http://unitsofmeasure.org", code: dataPoint.ucumCode } }

    case "BLOOD_PRESSURE":
        return { ...base,
          code: BP_PANEL_CODE,   // LOINC 85354-9, fixed constant
          component: [
            buildBPComponent("Systolic blood pressure", "8480-6", dataPoint.systolic, "mm[Hg]"),
            buildBPComponent("Diastolic blood pressure", "8462-4", dataPoint.diastolic, "mm[Hg]")
          ]
        }
        // note: NO top-level value* field when component[] is used

    case "FREE_TEXT":
        return { ...base, valueString: dataPoint.text }

    case "CATEGORICAL":
        return { ...base, valueCodeableConcept: { coding: [{ system: "http://snomed.info/sct", code: dataPoint.snomedCode, display: dataPoint.label }], text: dataPoint.label } }

    default:
        throw Error(`Unhandled wellness data point kind: ${dataPoint.kind}`)
```

```
function buildBPComponent(label, loincCode, value, unit):
  return {
    code: { coding: [{ system: "http://loinc.org", code: loincCode, display: label }], text: label },
    valueQuantity: { value: value, unit: unit, system: "http://unitsofmeasure.org", code: unit },
    interpretation: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", code: interpretationCode(value, label), display: interpretationDisplay(value, label) }] }]
  }
```

**Field → kind mapping table (hardcode this, don't infer kind from the field's runtime JS type):**

| Field | kind | LOINC | UCUM unit |
|---|---|---|---|
| Respiratory rate | NUMERIC | 9279-1 | /min |
| Heart rate | NUMERIC | 8867-4 | /min |
| Oxygen saturation | NUMERIC | 2708-6 | % |
| Body temperature | NUMERIC | 8310-5 | Cel |
| Blood pressure (systolic+diastolic pair) | BLOOD_PRESSURE | 85354-9 (panel), 8480-6 / 8462-4 (components) | mm[Hg] |
| Body height | NUMERIC | 8302-2 | in → code `[in_i]` |
| Body weight | NUMERIC | 29463-7 | lbs → code `[lb_av]` |
| BMI | NUMERIC | 39156-5 | kg/m2 |
| Step count | NUMERIC | — | steps → code `{steps}` |
| Calories burned | NUMERIC | — | kcal |
| Sleep duration | NUMERIC | — | h |
| Blood glucose | NUMERIC | — | mg/dL |
| Body fat | NUMERIC | — | kg |
| Fluid intake | NUMERIC | — | L |
| Calorie intake | NUMERIC | — | kcal |
| Age at menarche | NUMERIC | — | years |
| LMP start date | FREE_TEXT | — | — (store as formatted string, e.g. `"22-Nov-2025 12:40 PM"`) |
| Diet type | CATEGORICAL | — | SNOMED, e.g. 765021002 "Vegetarian diet" |
| Smoking status | CATEGORICAL | — | SNOMED, e.g. 266919005 "Never smoked" |

Fill in your own LOINC codes for any not listed here by checking your terminology table — do not guess.

**Gender-conditional fields:** wrap Women's Health data points in a guard (`if patient.gender == "female"`) at the data-collection layer, before they ever reach the builder — don't rely on the builder to filter them out.

---

## 5. Composition section order

```
Patient Information, Vital Signs, Body Measurement, Physical Activity,
General Assessment, Women Health, Lifestyle, Document Reference
```

`Composition.type` is the plain form: `{ "text": "Wellness Record" }` — **no SNOMED coding**, unlike OP Consult/Discharge Summary. If your Composition builder is shared across record types, make the `type` field a parameter, not a hardcoded coded value, and pass in the plain-text form for this type.

Route each data point's generated Observation `urn:uuid:` into the section matching its category (Vital Signs vs Body Measurement vs Physical Activity vs General Assessment vs Women Health vs Lifestyle) based on the field mapping table above — build this routing as a static lookup, not inferred from the LOINC code at runtime.

---

## 6. Self-validation before submission

```
function validateWellnessBundle(bundle):
  run base checks: dangling refs, base64 PDF, ABHA present, Bundle.id prefix, meta.profile

  comp = bundle.entry[0].resource
  assert comp.type == { text: "Wellness Record" }   # exact match, no coding array

  observations = find_all_resources(bundle, "Observation")
  assert every Condition/Procedure/MedicationRequest/AllergyIntolerance/Immunization resource is ABSENT from this bundle
    # if any exist, the wrong builder pipeline was invoked

  for obs in observations:
      valueFields = keys(obs) intersected with ["valueQuantity","valueString","valueCodeableConcept","component"]
      assert len(valueFields) == 1   # exactly one value-shape per Observation, never zero, never mixed
      if "component" in obs:
          assert len(obs.component) == 2   # BP panel always systolic+diastolic
          assert obs.code.coding[0].code == "85354-9"
          for comp in obs.component:
              assert "valueQuantity" in comp

  return OK
```

---

## 7. Common implementation bugs to guard against

1. **Using `valueQuantity` for everything**, including free-text (LMP date) and categorical (diet type) fields — this is the most common bug for this record type because it's tempting to reuse one generic builder. Enforce the dispatcher pattern in §4.
2. **Blood pressure emitted with both a top-level `valueQuantity` AND `component[]`**, or with only one component instead of two.
3. **Coded `Composition.type`** copy-pasted from OP Consult/Discharge Summary instead of the plain-text form this record type requires.
4. **Leaking clinical resources** (Condition, MedicationRequest, etc.) into a Wellness bundle because a shared "add complaint" UI component was left enabled on the wellness-entry screen.
5. **Emitting Women's Health Observations for male patients** because the gender guard lives in the FHIR builder instead of the data-collection form, and some caller bypassed the form.
6. **Wrong UCUM codes for non-obvious units** — e.g. steps uses `{steps}` (curly braces are part of the code), inches use `[in_i]`, pounds use `[lb_av]`. Copy these from the mapping table in §4, don't derive them.

---

## 8. Suggested code structure

```
/fhir-builders
  /wellness
    dataPointTypes.ts         <- the field->kind/LOINC/UCUM mapping table as a typed constant
    buildWellnessObservation.ts  <- the dispatcher from §4
    buildBPComponent.ts
    buildComposition.ts       <- plain-text type, wellness-specific section order
    index.ts                  <- orchestrates §3, reuses shared Patient/Practitioner/Organization/
                                  Encounter/DocumentReference builders
  /shared
    codeTables.ts, timestamps.ts, uuid.ts, pdfRenderer.ts
```

Write one unit test per row of the field mapping table in §4, asserting the dispatcher produces the exact expected value-shape and codes for that field — this catches shape regressions immediately when someone adds a new wellness data point later.
