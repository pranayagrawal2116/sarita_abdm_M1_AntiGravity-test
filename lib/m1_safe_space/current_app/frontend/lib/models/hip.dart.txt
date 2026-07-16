class Hip {
  final String id;
  final String name;
  final String type;

  Hip({required this.id, required this.name, required this.type});

  factory Hip.fromJson(Map<String, dynamic> json) {
    return Hip(
      id: json['id'],
      name: json['name'],
      type: json['type'],
    );
  }
}
