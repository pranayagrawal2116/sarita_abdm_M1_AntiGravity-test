class ApiConfig {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://abdmapi.saritainfotech.com/api',
  );
  static const String abhaAddressDomain = "sbx";

  static String fullAbhaAddress(String localPart) {
    return "${localPart.trim()}@$abhaAddressDomain";
  }
}
