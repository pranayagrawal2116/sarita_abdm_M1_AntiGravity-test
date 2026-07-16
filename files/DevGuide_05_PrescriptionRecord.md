# Developer Guide: Generating ABDM-Compliant Prescription Records

**Target profile:** `https://nrces.in/ndhm/fhir/r4/StructureDefinition/PrescriptionRecord`

---

## 1. When your app should emit this record type

Whenever a practitioner issues a standalone prescription — either as its own event, or extracted from a consultation as a separate ABDM artifact (note: OP Consult records also carry a Medications section internally; Prescription Record is the dedicated, shareable prescription document, typically what a patient hands to a pharmacy).

---

## 2. Data you must have in hand before you start building

| Data | Required? |
|---|---|
| Patient ABHA address, demographics | Yes |
| Prescribing practitioner + facility | Yes |
| One or more prescribed drugs, each with: SNOMED code, name, clinical indication, dosage schedule, route, food-timing | Yes, at least 1 drug |

---

## 3. Build order

```
1. generateUUIDs()
2. buildPatient(patientData)
3. buildPractitioner(doctorData)
4. buildOrganization(facilityData)
5. buildEncounter(visitData, patientRef)          -- class = "AMB"
6. buildMedicationRequests(drugList, patientRef, practitionerRef)
7. renderPrescriptionPdf(drugList)
8. buildBinary(pdfBytes)                          -- ⚠ NOT buildDocumentReference — see §4
9. buildComposition(patientRef, encounterRef, practitionerRef, orgRef, medicationRefs, binaryRef)
10. assembleBundle(...)
11. validateBundle(bundle)
12. return bundle
```

---

## 4. The one structural difference from every other record type: `Binary`, not `DocumentReference`

Every other record type in this system wraps its attached PDF in a `DocumentReference` resource (with `type`, `subject`, `content[0].attachment.{contentType, data, title, creation}`). **Prescription Record is the exception** — the attached PDF is a bare `Binary` resource:

```
function buildBinary(pdfBytes):
  return {
    resourceType: "Binary",
    id: uuid,
    meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Binary"] },
    contentType: "application/pdf",
    data: base64Encode(pdfBytes)
  }
```

Note what's **absent** compared to `DocumentReference`: no `subject`, no `title`, no `creation` timestamp, no `status`/`docStatus`. `Binary` is intentionally minimal — five fields only.

**If your codebase has one shared `attachPdf(pdfBytes, patientRef)` helper used across all six record-type generators, branch it explicitly:**

```
function attachPdf(recordType, pdfBytes, patientRef, title, creationTs):
  if recordType == "Prescription":
      return buildBinary(pdfBytes)
  else:
      return buildDocumentReference(pdfBytes, patientRef, title, creationTs)
```

Do not let this be an implicit default — write a unit test asserting the Prescription pipeline emits a `Binary` resourceType and every other pipeline emits `DocumentReference`.

The Composition's "Prescription Record" section references the `Binary` resource's `urn:uuid:` directly, the same way any other section references a resource.

---

## 5. buildMedicationRequests — field mapping (one call per drug)

```
function buildMedicationRequest(drug, patientRef, practitionerRef, authoredAtUtc):
  return {
    resourceType: "MedicationRequest",
    id: uuid,
    status: "active",
    intent: "order",
    medicationCodeableConcept: { coding: [{ system: "http://snomed.info/sct", code: drug.snomedCode, display: drug.name }], text: drug.name },
    subject: patientRef,
    authoredOn: authoredAtUtc,
    requester: practitionerRef,
    reasonCode: [{ coding: [{ system: "http://snomed.info/sct", code: drug.indicationSnomedCode, display: drug.indicationText }], text: drug.indicationText }],
    dosageInstruction: [{
      text: `Doses: ${drug.morning}-${drug.afternoon}-${drug.evening}`,
      route: { coding: [{ system: "http://snomed.info/sct", code: drug.routeSnomedCode, display: drug.routeText }], text: `Route: ${drug.routeText}` },
      method: { coding: [{ system: "http://snomed.info/sct", code: drug.foodTimingSnomedCode, display: drug.foodTimingText }], text: `Method: ${drug.foodTimingText}` }
    }]
  }
```

**Note the `"Route: "` / `"Method: "` text prefixes** on `route.text`/`method.text` — this record type's sample data includes these prefixes, whereas the OP Consult sample uses the bare display text without a prefix. If you're sharing a `buildMedicationRequest` function across record types, add a `textPrefix: boolean` (or similar) parameter rather than hardcoding one style — pick whichever your actual target validator expects, but don't assume the two record types are byte-identical here.

**Common SNOMED route/method codes seen in this record type:**
- Route: `26643006` "Oral"
- Method: `415621003` "Before Food", `421521009` "After Food"

`dosageInstruction[0].text` uses the shorthand `"Doses: M-A-E"` (morning-afternoon-evening, each 0 or 1, or a count) — build this as a formatted string from your structured dosage-schedule fields, don't let free-text dosage notes flow through unformatted.

---

## 6. Composition

```
Composition.type = { text: "Prescription record" }   // plain text, no SNOMED coding
Composition.title = "Prescription record"
```

Section order (fixed, only 3 sections — the shortest Composition of any record type with clinical content):
```
1. Patient Information  -> Patient
2. Medications           -> one entry per MedicationRequest
3. Prescription Record   -> the Binary resource (display: "Binary")
```

---

## 7. Self-validation before submission

```
function validatePrescriptionBundle(bundle):
  run base checks: dangling refs, ABHA present, Bundle.id prefix ("prescription record-"), meta.profile

  attachedResource = find_resource(bundle, "Binary")
  assert attachedResource is not null            # must exist
  assert find_resource(bundle, "DocumentReference") is null   # must NOT exist for this record type
  assert set(attachedResource.keys()) == {"resourceType","id","meta","contentType","data"}
  pdfBytes = base64_decode(attachedResource.data)
  assert pdfBytes starts with b"%PDF"

  medReqs = find_all_resources(bundle, "MedicationRequest")
  assert len(medReqs) >= 1
  for m in medReqs:
      assert m.reasonCode is non-empty            # clinical indication required
      assert m.dosageInstruction[0].text starts with "Doses: "

  comp = bundle.entry[0].resource
  assert comp.type == { text: "Prescription record" }
  assert len(comp.section) == 3

  encounter = find_resource(bundle, "Encounter")
  assert encounter.class.code == "AMB"

  return OK
```

---

## 8. Common implementation bugs to guard against

1. **Using `DocumentReference` instead of `Binary`** for the attached PDF — this is the defining structural quirk of this record type and the most likely bug if the generator was cloned from any other record-type pipeline.
2. **Binary resource carrying extra fields** (`subject`, `title`, `creation`, `status`) copied over from a `DocumentReference`-style attachment builder — strip these; `Binary` only has 5 fields.
3. **Missing `reasonCode`** on `MedicationRequest` — every prescribed drug needs a linked clinical indication, not just a drug name.
4. **Dosage text not normalized** to the `"Doses: X-X-X"` format — free-text dosage instructions typed by a doctor should be parsed/mapped into this structured shorthand before insertion, not passed through verbatim.
5. **Composition section count assumption breaking** — some implementations wrongly expect a "Document Reference" section title like the other 5 types; this type's third section is titled "Prescription Record", not "Document Reference".

---

## 9. Suggested code structure

```
/fhir-builders
  /prescription
    buildBinary.ts             <- distinct from shared buildDocumentReference.ts
    buildMedicationRequest.ts  <- with Route:/Method: text prefix behavior
    buildComposition.ts        <- 3-section template, "Prescription Record" as final section title
    index.ts                   <- orchestrates §3, reuses shared Patient/Practitioner/
                                   Organization/Encounter builders
  /shared
    codeTables.ts, timestamps.ts, uuid.ts, pdfRenderer.ts
```
