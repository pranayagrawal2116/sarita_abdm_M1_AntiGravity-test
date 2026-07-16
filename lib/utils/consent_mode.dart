enum ConsentMode {
  currentDefault,
  patientRefreshRaw,
  patientRefreshBearer,
  patientLoginRaw,
  patientLoginBearer,
  consentRefreshRaw,
  consentRefreshBearer,
}

extension ConsentModeX on ConsentMode {
  String get apiValue {
    switch (this) {
      case ConsentMode.currentDefault:
        return 'current_default';
      case ConsentMode.patientRefreshRaw:
        return 'patient_refresh_raw';
      case ConsentMode.patientRefreshBearer:
        return 'patient_refresh_bearer';
      case ConsentMode.patientLoginRaw:
        return 'patient_login_raw';
      case ConsentMode.patientLoginBearer:
        return 'patient_login_bearer';
      case ConsentMode.consentRefreshRaw:
        return 'consent_refresh_raw';
      case ConsentMode.consentRefreshBearer:
        return 'consent_refresh_bearer';
    }
  }

  String get label {
    switch (this) {
      case ConsentMode.currentDefault:
        return 'Consent Current';
      case ConsentMode.patientRefreshRaw:
        return 'Patient + Refresh Raw';
      case ConsentMode.patientRefreshBearer:
        return 'Patient + Refresh Bearer';
      case ConsentMode.patientLoginRaw:
        return 'Patient + Login Raw';
      case ConsentMode.patientLoginBearer:
        return 'Patient + Login Bearer';
      case ConsentMode.consentRefreshRaw:
        return 'Consent + Refresh Raw';
      case ConsentMode.consentRefreshBearer:
        return 'Consent + Refresh Bearer';
    }
  }
}
