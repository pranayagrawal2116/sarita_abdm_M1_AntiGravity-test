void main() {
  String _humanizeKey(String key) {
    return key
        .replaceAll(RegExp(r'(?=[A-Z])'), ' ')
        .split(' ')
        .where((part) => part.isNotEmpty)
        .map((part) => part[0].toUpperCase() + part.substring(1))
        .join(' ');
  }
  
  String _valueText(Object? value) {
    if (value == null) return '-';
    if (value is String && value.trim().isEmpty) return '-';
    return value.toString();
  }

  String _textForValue(Object? value, int indent) {
    final prefix = '  ' * indent;
    if (value is Map) {
      if (value.isEmpty) return '$prefix-\n';
      final buffer = StringBuffer();
      for (final entry in value.entries) {
        final key = _humanizeKey(entry.key.toString());
        if (entry.value is Map || entry.value is List) {
          buffer.writeln('$prefix$key:');
          buffer.write(_textForValue(entry.value, indent + 1));
        } else {
          buffer.writeln('$prefix$key: ${_valueText(entry.value)}');
        }
      }
      return buffer.toString();
    }

    if (value is List) {
      if (value.isEmpty) return '$prefix-\n';
      final buffer = StringBuffer();
      for (var i = 0; i < value.length; i++) {
        if (value[i] is Map || value[i] is List) {
          buffer.writeln('$prefix- Item ${i + 1}:');
          buffer.write(_textForValue(value[i], indent + 1));
        } else {
          buffer.writeln('$prefix- ${_valueText(value[i])}');
        }
      }
      return buffer.toString();
    }
    return '$prefix$value\n';
  }

  final data = {
    'medications': [
      {
        'name': 'Dolo',
        'dose': '1-0-1'
      },
      {
        'name': 'Para',
        'dose': '1-0-1'
      }
    ],
    'draftMedication': {
      'name': '',
      'dose': ''
    }
  };

  print(_textForValue(data, 0));
}
