import 'dart:convert';
import 'package:http/http.dart' as http;

class HiuApiService {
  static const String baseUrl = 'http://localhost:3000/api/m3/consent';

  Future<Map<String, dynamic>> initConsentRequest(Map<String, dynamic> payload) async {
    final response = await http.post(
      Uri.parse('$baseUrl/init'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
    );

    if (response.statusCode == 200 || response.statusCode == 202) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Failed to init consent request: ${response.statusCode} - ${response.body}');
    }
  }

  Future<List<dynamic>> fetchConsentRequests() async {
    final response = await http.get(
      Uri.parse('$baseUrl/requests'),
      headers: {'Content-Type': 'application/json'},
    );

    if (response.statusCode == 200) {
      final decoded = jsonDecode(response.body);
      return decoded['data'] ?? [];
    } else {
      throw Exception('Failed to fetch consent requests: ${response.statusCode} - ${response.body}');
    }
  }

  Future<void> requestHealthData(Map<String, dynamic> payload) async {
    final response = await http.post(
      Uri.parse('$baseUrl/data/request'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
    );

    if (response.statusCode != 200 && response.statusCode != 202) {
      throw Exception('Failed to request health data: ${response.statusCode} - ${response.body}');
    }
  }

  Future<List<dynamic>> fetchHealthDocuments(String hipId) async {
    final response = await http.get(
      Uri.parse('$baseUrl/documents?hipId=$hipId'),
      headers: {'Content-Type': 'application/json'},
    );

    if (response.statusCode == 200) {
      final decoded = jsonDecode(response.body);
      return decoded['data'] ?? [];
    } else {
      try {
        final decoded = jsonDecode(response.body);
        if (decoded['error'] != null) {
          throw Exception(decoded['error']);
        }
      } catch (_) {}
      throw Exception('Failed to fetch health documents: ${response.statusCode} - ${response.body}');
    }
  }
}

