import 'dart:convert';

class HospitalConfig {
  static const String hospitalName = 'Sarita Health Care';
  static const String hospitalShortName = 'Sarita';
  static const String hospitalLegalName = 'SaritaInfotech';
  static const String requesterName = 'Sarita ABDM App';
  static const String hipId = 'IN2410002480';
  static const String hiuId = hipId;
  static const String scanShareHospitalName = 'Yashfeen Group of Hospitals';
  static const String scanShareHipId = 'IN2410002480';
  static const String scanShareCounterLabel = 'Counter: 1';
  static const String scanShareQrAssetPath =
      'assets/scan_share/yashfeen_scan_share_qr_only.png';

  static String get appTitle => '$hospitalName ABDM';
  static String get workspaceName => '$hospitalShortName workspace';

  static Map<String, dynamic> get facilityQrPayload => {
    'hipId': hipId,
    'providerId': hipId,
    'facilityId': hipId,
    'facilityName': hospitalName,
  };

  static String get facilityQrRaw => jsonEncode(facilityQrPayload);

  static Uri get facilityQrImageUrl => Uri.https(
    'api.qrserver.com',
    '/v1/create-qr-code/',
    {'size': '260x260', 'data': facilityQrRaw},
  );
}
