# Developer Guide: Generating ABDM-Compliant Immunization Records

**Target profile:** `https://nrces.in/ndhm/fhir/r4/StructureDefinition/ImmunizationRecord`

---

## 1. When your app should emit this record type

Whenever a vaccine dose is administered, or when you want to record the immunization forecast/due-date for the patient's next dose (typically emitted together, as one bundle per administration event).

---

## 2. Data you must have in hand before you start building

| Data | Required? |
|---|---|
| Patient ABHA address, demographics | Yes |
| Administering practitioner + facility | Yes |
| Vaccine given: SNOMED code, name, manufacturer, lot number, dose number in series | Yes |
| Date/time administered | Yes |
| Next dose forecast: vaccine code (if known), due date, forecast status | Optional but recommended — include even if only the due date is known |

---

## 3. Build order

```
1. generateUUIDs()
2. buildPatient(patientData)
3. buildPractitioner(administeringStaffData)
4. buildOrganization(facilityData)
5. buildEncounter(sessionData, patientRef)        -- class = "AMB"
6. buildImmunization(vaccineData, patientRef, encounterRef, practitionerRef)
7. buildImmunizationRecommendation(forecastData, patientRef)
8. renderImmunizationCertificatePdf(vaccineData, forecastData)
9. buildDocumentReference(pdfBytes, patientRef)
10. buildComposition(patientRef, encounterRef, practitionerRef, orgRef, section entries)
11. assembleBundle(...)
12. validateBundle(bundle)
13. return bundle
```

---

## 4. buildImmunization — field mapping

```
function buildImmunization(vaccineData, patientRef, encounterRef, practitionerRef):
  return {
    resourceType: "Immunization",
    id: uuid,
    status: "completed",
    vaccineCode: {
      coding: [{ system: "https://www.snomed.org", code: vaccineData.snomedCode, display: vaccineData.name }],  // ⚠ note the system URL — see below
      text: vaccineData.name
    },
    patient: patientRef,
    encounter: encounterRef,
    occurrenceDateTime: toLocal(vaccineData.administeredAt),   // see timestamp note below
    primarySource: true,
    manufacturer: { display: vaccineData.manufacturer },
    lotNumber: vaccineData.lotNumber,
    performer: [{ actor: practitionerRef }],
    protocolApplied: [{ doseNumberPositiveInt: vaccineData.doseNumber }]
  }
```

**⚠ Coding system gotcha:** the reference implementation uses `https://www.snomed.org` for `vaccineCode.coding[0].system` on the `Immunization` resource — this is a different URL from the standard `http://snomed.info/sct` used for SNOMED codes on every other resource type (Condition, Procedure, MedicationRequest, etc.) across all six record types. If your code has a single shared `SNOMED_SYSTEM` constant, do not reuse it here — hardcode this one exception explicitly (or add a second constant, `SNOMED_SYSTEM_IMMUNIZATION`) so a future global find-and-replace doesn't silently break it.

**Timestamp note:** `occurrenceDateTime` in the reference sample is written without an explicit UTC offset (a "local" naive datetime string, matching the IST wall-clock time). Match this convention rather than converting to UTC — if your date library forces an offset, use `+05:30` here to stay consistent with how the sample data reads.

`protocolApplied[].doseNumberPositiveInt` must be a plain positive integer (1, 2, 3…), not a string.

---

## 5. buildImmunizationRecommendation — field mapping

```
function buildImmunizationRecommendation(forecastData, patientRef):
  return {
    resourceType: "ImmunizationRecommendation",
    id: uuid,
    patient: patientRef,
    recommendation: [{
      vaccineCode: [{ coding: [{ system: "https://www.snomed.org", code: forecastData.nextVaccineSnomedCode || "", display: forecastData.nextVaccineName || "" }] }],
      forecastStatus: { text: forecastData.status },   // "Due" | "Overdue" | "Not Due" | "Complete"
      dateCriterion: [{ code: { text: "Next Dose Due Date" }, value: toIST(forecastData.dueDate) }],
      description: forecastData.description || "",
      series: forecastData.seriesName || ""
    }]
  }
```

**Critical: even when your forecast engine has no data for `description`/`series`/vaccine display text, still emit the keys with empty-string values — do not omit them from the object.** The reference implementation always includes these keys. If your serializer drops empty strings (some do via `undefined` coalescing), explicitly set them to `""` rather than leaving them `undefined`, or add a post-processing step that fills in required-but-empty keys before serialization.

---

## 6. Composition

```
Composition.type = { text: "Immunization record" }   // plain text, no SNOMED coding
Composition.title = "Immunization record"
```

Section order (fixed):
```
Patient Information, Immunization Details, Immunization Recommendation, Document Reference
```

---

## 7. Self-validation before submission

```
function validateImmunizationBundle(bundle):
  run base checks: dangling refs, base64 PDF, ABHA present, Bundle.id prefix, meta.profile

  imm = find_resource(bundle, "Immunization")
  assert imm.status == "completed"
  assert imm.vaccineCode.coding[0].system == "https://www.snomed.org"   # not the usual snomed.info/sct
  assert typeof imm.protocolApplied[0].doseNumberPositiveInt == "integer"
  assert imm.lotNumber is non-empty
  assert imm.manufacturer.display is non-empty

  rec = find_resource(bundle, "ImmunizationRecommendation")
  r0 = rec.recommendation[0]
  for key in ["vaccineCode", "forecastStatus", "dateCriterion", "description", "series"]:
      assert key in r0   # keys must exist even if value is empty string

  comp = bundle.entry[0].resource
  assert comp.type == { text: "Immunization record" }

  encounter = find_resource(bundle, "Encounter")
  assert encounter.class.code == "AMB"

  return OK
```

---

## 8. Common implementation bugs to guard against

1. **Using `http://snomed.info/sct` instead of `https://www.snomed.org`** for `Immunization.vaccineCode` and `ImmunizationRecommendation.recommendation[].vaccineCode` — this is the single most distinctive quirk of this record type; a shared SNOMED-system constant will silently produce the wrong URL here unless explicitly overridden.
2. **Dropping optional-but-required keys** (`description`, `series`, forecast vaccine display) when the forecast engine has no value — serialize them as empty strings, never omit the key.
3. **`doseNumberPositiveInt` sent as a string** (`"2"` instead of `2`) — check your ORM/form layer isn't coercing numeric form inputs to strings before they reach the builder.
4. **Missing `ImmunizationRecommendation`** entirely when no forecast is available — build a minimal one anyway (with `forecastStatus.text` reflecting "Unknown"/"Not Due" and empty strings for the rest) rather than omitting the section, since the Composition template expects it.
5. **`occurrenceDateTime` converted to UTC** when the reference convention expects a local/IST-implied timestamp — inconsistent with the sample data.

---

## 9. Suggested code structure

```
/fhir-builders
  /immunization
    buildImmunization.ts
    buildImmunizationRecommendation.ts
    buildComposition.ts
    index.ts          <- orchestrates §3, reuses shared Patient/Practitioner/Organization/
                          Encounter/DocumentReference builders
  /shared
    codeTables.ts      <- keep SNOMED_SYSTEM = "http://snomed.info/sct" AND
                          SNOMED_SYSTEM_IMMUNIZATION = "https://www.snomed.org" as distinct constants
    timestamps.ts, uuid.ts, pdfRenderer.ts
```
