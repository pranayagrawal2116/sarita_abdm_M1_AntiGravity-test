class ConsentRequest {
  final String id;
  final String requester;
  final String purpose;
  final List<String> dataTypes;
  final String expiry;
  final String status;
  final Map<String, dynamic> raw;

  ConsentRequest({
    required this.id,
    required this.requester,
    required this.purpose,
    required this.dataTypes,
    required this.expiry,
    required this.status,
    required this.raw,
  });

  static String _readString(Map<String, dynamic> json, List<List<String>> paths) {
    for (final path in paths) {
      dynamic current = json;
      for (final key in path) {
        if (current is Map<String, dynamic>) {
          current = current[key];
        } else {
          current = null;
          break;
        }
      }

      final value = current?.toString().trim() ?? '';
      if (value.isNotEmpty) return value;
    }

    return '';
  }

  static String _extractIdFromMap(Map<String, dynamic> json) {
    final directId = _readString(json, [
      ['id'],
      ['requestId'],
      ['consentRequestId'],
      ['consentId'],
      ['response', 'requestId'],
      ['notification', 'consentRequestId'],
      ['notification', 'requestId'],
      ['request', 'id'],
      ['request', 'requestId'],
      ['request', 'consentRequestId'],
      ['request', 'consentId'],
      ['request', 'response', 'requestId'],
      ['request', 'notification', 'consentRequestId'],
      ['request', 'notification', 'requestId'],
      ['consentRequest', 'id'],
      ['consentRequest', 'requestId'],
      ['consentRequest', 'consentRequestId'],
      ['consent', 'requestId'],
      ['consent', 'consentRequestId'],
      ['consent', 'id'],
      ['consentDetail', 'requestId'],
      ['consentDetail', 'consentRequestId'],
      ['consentDetail', 'consentId'],
    ]);
    if (directId.isNotEmpty) return directId;

    for (final value in json.values) {
      if (value is Map<String, dynamic>) {
        final nested = _extractIdFromMap(value);
        if (nested.isNotEmpty) return nested;
      } else if (value is List) {
        for (final item in value) {
          if (item is Map<String, dynamic>) {
            final nested = _extractIdFromMap(item);
            if (nested.isNotEmpty) return nested;
          }
        }
      }
    }

    final nestedRaw = json['raw'];
    if (nestedRaw is Map<String, dynamic>) {
      return _extractIdFromMap(nestedRaw);
    }

    return '';
  }

  String get effectiveId {
    if (id.trim().isNotEmpty) return id.trim();
    return _extractIdFromMap(raw);
  }

  factory ConsentRequest.fromJson(Map<String, dynamic> json) {
    final rawDataTypes = json['dataTypes'];
    final dataTypes = rawDataTypes is List
        ? rawDataTypes
            .where((item) => item != null)
            .map((item) => item.toString())
            .where((item) => item.trim().isNotEmpty)
            .toList()
        : <String>[];
    final raw = (json['raw'] is Map<String, dynamic>)
        ? Map<String, dynamic>.from(json['raw'] as Map<String, dynamic>)
        : Map<String, dynamic>.from(json);
    final id = _extractIdFromMap({
      ...json,
      'raw': raw,
    });
    final requester = _readString(json, [
      ['requester'],
      ['raw', 'requester', 'name'],
      ['raw', 'hiu', 'name'],
      ['raw', 'hip', 'name'],
      ['raw', 'consentDetail', 'requester', 'name'],
      ['raw', 'consentDetail', 'hiu', 'name'],
      ['raw', 'consentDetail', 'hip', 'name'],
      ['raw', 'consent', 'requester', 'name'],
      ['raw', 'consent', 'hiu', 'name'],
      ['raw', 'consent', 'hip', 'name'],
      ['raw', 'notification', 'consentDetail', 'requester', 'name'],
      ['raw', 'notification', 'consentDetail', 'hiu', 'name'],
      ['raw', 'notification', 'consentDetail', 'hip', 'name'],
    ]);
    final purpose = _readString(json, [
      ['purpose'],
      ['raw', 'purpose', 'text'],
      ['raw', 'purpose', 'code'],
      ['raw', 'consentDetail', 'purpose', 'text'],
      ['raw', 'consentDetail', 'purpose', 'code'],
      ['raw', 'consent', 'purpose', 'text'],
      ['raw', 'consent', 'purpose', 'code'],
      ['raw', 'notification', 'consentDetail', 'purpose', 'text'],
      ['raw', 'notification', 'consentDetail', 'purpose', 'code'],
    ]);
    final expiry = _readString(json, [
      ['expiry'],
      ['raw', 'permission', 'dateRange', 'to'],
      ['raw', 'permission', 'dataEraseAt'],
      ['raw', 'consentDetail', 'permission', 'dateRange', 'to'],
      ['raw', 'consentDetail', 'permission', 'dataEraseAt'],
      ['raw', 'consent', 'permission', 'dateRange', 'to'],
      ['raw', 'consent', 'permission', 'dataEraseAt'],
      ['raw', 'notification', 'consentDetail', 'permission', 'dateRange', 'to'],
      ['raw', 'notification', 'consentDetail', 'permission', 'dataEraseAt'],
      ['raw', 'lastUpdated'],
      ['raw', 'consentDetail', 'lastUpdated'],
      ['raw', 'consent', 'lastUpdated'],
      ['raw', 'notification', 'consentDetail', 'lastUpdated'],
    ]);

    return ConsentRequest(
      id: id,
      requester: requester.isNotEmpty ? requester : 'Unknown requester',
      purpose: purpose.isNotEmpty ? purpose : 'Unknown purpose',
      dataTypes: dataTypes,
      expiry: expiry,
      status: json['status']?.toString() ?? 'UNKNOWN',
      raw: raw,
    );
  }
}
