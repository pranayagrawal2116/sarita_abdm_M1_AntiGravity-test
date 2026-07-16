class ApiConfig {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000/api',
  );
  static const String abhaAddressDomain = "sbx";

  static String fullAbhaAddress(String localPart) {
    return "${localPart.trim()}@$abhaAddressDomain";
  }
}
