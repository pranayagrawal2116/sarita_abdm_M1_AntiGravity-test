# Developer Guide: Generating ABDM-Compliant Health Document Records

**Target profile:** `https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle` (Bundle-level) — note the Composition-level profile is a *different* URL, `HealthDocumentRecord`. See §4.

---

## 1. When your app should emit this record type

This is your **catch-all / fallback generator**. Emit a Health Document Record whenever you need to attach an arbitrary PDF/scan to a patient's ABDM timeline that doesn't fit one of the other five structured categories — e.g. an uploaded paper record, a scanned third-party lab report, an insurance document, or any file your app can't (or doesn't need to) decompose into structured clinical resources.

This should be the generator your app falls back to when a user uploads a file and clicks "attach to health record" without going through a structured consultation/prescription/etc. flow.

---

## 2. Data you must have in hand before you start building

This is the shortest data requirement of any record type:

| Data | Required? |
|---|---|
| Patient ABHA address, demographics | Yes |
| Uploading practitioner/facility (may be a generic "system" actor if patient self-uploads) | Yes |
| The document itself (PDF bytes, or converted to PDF if uploaded as image/other format) | Yes |

No clinical data collection is needed — this is the whole point of this record type.

---

## 3. Build order

```
1. generateUUIDs()
2. buildPatient(patientData)
3. buildPractitioner(uploaderData)
4. buildOrganization(facilityData)
5. buildEncounter(uploadSessionData, patientRef)   -- class = "AMB"
6. ensurePdf(uploadedFile)                          -- convert to PDF if not already (see §5)
7. buildDocumentReference(pdfBytes, patientRef)
8. buildComposition(patientRef, encounterRef, practitionerRef, orgRef, documentReferenceRef)
9. assembleBundle(...)
10. validateBundle(bundle)
11. return bundle
```

No clinical resource builders are needed at all — resist the temptation to add an Observation/Condition "just in case" the upload contains extractable clinical data. If you later want to extract structured data from an uploaded document (e.g. OCR a lab report into Observations), that becomes a **different** record type (OP Consult, Discharge Summary, etc.) — don't bolt clinical resources onto a Health Document Record.

---

## 4. The dual-profile gotcha

This is the only record type where the Bundle-level and Composition-level `meta.profile` values use **different URL patterns**:

```
Bundle.meta.profile        = ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"]
Composition.meta.profile   = ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/HealthDocumentRecord"]
```

Every other record type in this system uses the **same** profile name at both levels (e.g. OP Consult uses `OPConsultRecord` for both). If your profile-URL logic is a single function like `profileFor(recordType)` reused at both the Bundle and Composition construction sites, this record type needs a special case:

```
function bundleProfileFor(recordType):
  if recordType == "HealthDocument": return ".../DocumentBundle"
  else: return `.../${recordType}Record`

function compositionProfileFor(recordType):
  return `.../${recordType}Record`   // same rule for all 6 types, including HealthDocument
```

Write a unit test asserting these two functions diverge specifically (and only) for `"HealthDocument"`.

Also note the `Bundle.id` prefix drops the word "record": `"health document-<uuid>"`, not `"health document record-<uuid>"` — every other record type's `Bundle.id` prefix includes "record" (e.g. `"prescription record-"`, `"wellness record-"`). Hardcode this prefix as a lookup table entry, don't derive it programmatically from the record type name.

---

## 5. Attachment handling

```
function ensurePdf(uploadedFile):
  if uploadedFile.mimeType == "application/pdf":
      return uploadedFile.bytes
  else:
      return convertToPdf(uploadedFile)   // e.g. image -> PDF via your PDF library; reject unsupported types explicitly
```

```
function buildDocumentReference(pdfBytes, patientRef, creationTs):
  return {
    resourceType: "DocumentReference",
    id: uuid,
    meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentReference"] },
    status: "current",
    docStatus: "final",
    type: { text: "Health Document Record" },
    subject: patientRef,
    content: [{
      attachment: {
        contentType: "application/pdf",
        language: "en-IN",
        data: base64Encode(pdfBytes),
        title: "Health Document Record",
        creation: toUTC(creationTs)
      }
    }]
  }
```

This record type uses `DocumentReference`, not `Binary` — don't reuse the Prescription pipeline's `buildBinary` for this type; they're different for a reason (see the Prescription developer guide for that distinction).

**Validate the source file before conversion:** reject empty files, files over your configured size limit, and any MIME type you can't confidently convert to a legible PDF — a corrupted attachment fails silently downstream rather than at generation time, which is much harder to debug.

---

## 6. Composition

```
Composition.type = { text: "Health Document Record" }   // plain text, no SNOMED coding
Composition.title = "Health Document Record"
```

Section order (fixed, only 2 sections — the shortest of any record type):
```
1. Patient Information -> Patient
2. Document Reference  -> the DocumentReference resource
```

---

## 7. Self-validation before submission

```
function validateHealthDocumentBundle(bundle):
  run base checks: dangling refs, ABHA present

  assert bundle.id starts with "health document-"     # no trailing "record"
  assert bundle.meta.profile[0] == ".../DocumentBundle"

  comp = bundle.entry[0].resource
  assert comp.meta.profile[0] == ".../HealthDocumentRecord"   # different from Bundle-level profile
  assert comp.type == { text: "Health Document Record" }
  assert len(comp.section) == 2

  clinicalResourceTypes = ["Condition","Observation","Procedure","MedicationRequest",
                            "AllergyIntolerance","Immunization","DiagnosticReport","CarePlan","Appointment"]
  for rt in clinicalResourceTypes:
      assert find_resource(bundle, rt) is null   # this record type must carry ZERO clinical resources

  docRef = find_resource(bundle, "DocumentReference")
  pdfBytes = base64_decode(docRef.content[0].attachment.data)
  assert pdfBytes starts with b"%PDF"

  return OK
```

---

## 8. Common implementation bugs to guard against

1. **Bundle and Composition profile URLs set to the same value** — a shared `profileFor(recordType)` helper reused blindly at both call sites is the most likely cause. This record type needs the split logic in §4.
2. **`Bundle.id` prefixed with `"health document record-"`** (matching the other 5 types' pattern) instead of the correct `"health document-"`.
3. **Clinical resources leaking in** because a generic "attach file" flow was accidentally routed through a consultation-builder pipeline instead of this dedicated minimal one.
4. **Using `Binary` instead of `DocumentReference`** — the opposite mistake from Prescription Record; make sure your attachment-type branch (§4 of the Prescription guide) routes `"HealthDocument"` to `DocumentReference`.
5. **Skipping file-type validation** before conversion, resulting in a `DocumentReference.content[0].attachment.data` that doesn't actually decode to a valid PDF.

---

## 9. Suggested code structure

```
/fhir-builders
  /health-document
    ensurePdf.ts
    buildComposition.ts    <- 2-section template, dual-profile logic
    index.ts                <- orchestrates §3, reuses shared Patient/Practitioner/
                               Organization/Encounter/DocumentReference builders
  /shared
    profileUrls.ts          <- bundleProfileFor() / compositionProfileFor() split from §4
    codeTables.ts, timestamps.ts, uuid.ts, pdfRenderer.ts
```

Because this is your fallback/catch-all path, make sure it's wired as the **default** in your record-type router (i.e., "I don't know what structured type this is" → Health Document Record), rather than one of the six being equally likely to be selected by mistake for structured data that should go through a proper clinical pipeline.
