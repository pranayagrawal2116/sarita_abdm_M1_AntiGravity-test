# ABHA Enrolment Via Aadhaar Safe Space

This safe space stores frozen reference snapshots for the M1 parent flow:
- ABHA enrolment via Aadhaar

Current frozen sub-flow:
- Aadhaar-linked mobile registration path
- Full ABHA registration frontend snapshot
- Full ABHA registration backend snapshot

Reference snapshots stored here:
- `frozen_aadhaar_linked_mobile_flow.dart.txt`
- `frozen_flow_models.dart.txt`
- `safe_space_manifest.dart.txt`
- `abha_registration_protection_manifest.dart.txt`

Workflow policy:
- Runtime code should not import from this folder unless you explicitly decide to promote safe-space code back into active use.
- New changes must be made in a working copy outside this folder.
- Once a new Aadhaar enrolment sub-flow is complete, it can be added here as another frozen snapshot.
- This folder is excluded from Dart analysis because the snapshots are stored for reference, not execution.

Protected runtime originals for ABHA registration:
- `lib/screens/create_abha_screen.dart`
- `lib/screens/create_abha_address_screen.dart`
- `lib/services/abha_api_service.dart`
- `backend/controllers/abhaController.js`
- `backend/routes/abhaRoutes.js`
