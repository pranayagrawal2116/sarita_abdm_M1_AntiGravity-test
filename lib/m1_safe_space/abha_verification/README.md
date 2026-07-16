# ABHA Verification Safe Space

This safe space freezes the ABHA verification flow as a reference snapshot.

Purpose:
- preserve the currently working ABHA verification frontend and backend flow
- allow future work to read from this safe space without editing the protected originals
- require future changes to be made in a new working copy instead of these frozen references

Safe-space rule:
- do not edit the protected ABHA verification originals directly
- if a new requirement needs changes, copy the needed file or logic into a new working file first
- only promote the new flow into a safe space again after it is complete

Protected original runtime files:
- `/Users/pranay/Documents/Development/CodexWork/sarita_abdm_M1/lib/screens/abha_login_screen.dart`
- `/Users/pranay/Documents/Development/CodexWork/sarita_abdm_M1/lib/screens/patient_registration_screen.dart`
- `/Users/pranay/Documents/Development/CodexWork/sarita_abdm_M1/lib/screens/health_facility_qr_screen.dart`
- `/Users/pranay/Documents/Development/CodexWork/sarita_abdm_M1/lib/services/abha_api_service.dart`
- `/Users/pranay/Documents/Development/CodexWork/sarita_abdm_M1/lib/widgets/abha_card_preview_dialog.dart`
- `/Users/pranay/Documents/Development/CodexWork/sarita_abdm_M1/backend/controllers/abhaController.js`
- `/Users/pranay/Documents/Development/CodexWork/sarita_abdm_M1/backend/routes/abhaRoutes.js`

Snapshot note:
- files in this folder are stored as `.txt` reference snapshots on purpose
- they are not imported by the app and must remain runtime-disconnected
