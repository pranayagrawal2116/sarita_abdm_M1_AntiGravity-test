class HealthRecord {
  final String id;
  final String type;
  final String date;
  final String provider;
  final String content;

  HealthRecord({
    required this.id,
    required this.type,
    required this.date,
    required this.provider,
    required this.content,
  });

  factory HealthRecord.fromJson(Map<String, dynamic> json) {
    return HealthRecord(
      id: json['id'],
      type: json['type'],
      date: json['date'],
      provider: json['provider'],
      content: json['content'],
    );
  }
}
