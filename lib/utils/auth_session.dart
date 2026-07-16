import 'app_runtime_store.dart';

class AuthSession {
  static String? m1PhrAuthToken;
  static String? m1PhrRefreshToken;
  static String? m1AbhaAddress;

  static String? m2PhrAuthToken;
  static String? m2PhrRefreshToken;
  static String? m2AbhaAddress;

  static bool get isM1LoggedIn =>
      m1PhrAuthToken != null && m1PhrAuthToken!.trim().isNotEmpty;

  static bool get isM2LoggedIn =>
      m2PhrAuthToken != null && m2PhrAuthToken!.trim().isNotEmpty;

  static String? get currentM2PhrAuthToken => m2PhrAuthToken;

  static String? get currentM2PhrRefreshToken => m2PhrRefreshToken;

  static String? get currentM2AbhaAddress => m2AbhaAddress;
  static void setM1Login({
    required String token,
    required String address,
    String? refreshToken,
  }) {
    m1PhrAuthToken = token;
    m1PhrRefreshToken = refreshToken;
    m1AbhaAddress = address;
    AppRuntimeStore.setValues({
      'session.m1.isLoggedIn': true,
      'session.m1.phrAuthToken': token,
      'session.m1.phrRefreshToken': refreshToken,
      'session.m1.abhaAddress': address,
    });
  }

  static void setM2Login({
    required String token,
    required String address,
    String? refreshToken,
  }) {
    m2PhrAuthToken = token;
    m2PhrRefreshToken = refreshToken;
    m2AbhaAddress = address;
    AppRuntimeStore.setValues({
      'session.m2.isLoggedIn': true,
      'session.m2.phrAuthToken': token,
      'session.m2.phrRefreshToken': refreshToken,
      'session.m2.abhaAddress': address,
    });
  }

  static void clearM1() {
    m1PhrAuthToken = null;
    m1PhrRefreshToken = null;
    m1AbhaAddress = null;
    AppRuntimeStore.setValues({
      'session.m1.isLoggedIn': false,
      'session.m1.phrAuthToken': null,
      'session.m1.phrRefreshToken': null,
      'session.m1.abhaAddress': null,
    });
  }

  static void clearM2() {
    m2PhrAuthToken = null;
    m2PhrRefreshToken = null;
    m2AbhaAddress = null;
    AppRuntimeStore.setValues({
      'session.m2.isLoggedIn': false,
      'session.m2.phrAuthToken': null,
      'session.m2.phrRefreshToken': null,
      'session.m2.abhaAddress': null,
    });
  }

  static void clearAll() {
    clearM1();
    clearM2();
  }
}
