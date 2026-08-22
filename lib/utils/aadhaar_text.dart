import 'package:flutter/widgets.dart';

String normalizeAadhaarDigits(String value, {String previousRaw = ''}) {
  if (!value.contains('X') && !value.contains('x')) {
    final digitsOnlyValue = value.replaceAll(RegExp(r'\D'), '');
    if (digitsOnlyValue.length <= 12) {
      return digitsOnlyValue;
    }
    return digitsOnlyValue.substring(0, 12);
  }

  int xCount = value.replaceAll(RegExp(r'[^Xx]'), '').length;
  String visibleDigits = value.replaceAll(RegExp(r'\D'), '');
  
  int keepCount = xCount > previousRaw.length ? previousRaw.length : xCount;
  String newHidden = previousRaw.substring(0, keepCount);
  
  String merged = newHidden + visibleDigits;
  if (merged.length <= 12) {
    return merged;
  }
  return merged.substring(0, 12);
}

String formatAadhaarDigits(String digits) {
  if (digits.isEmpty) {
    return '';
  }

  final chunks = <String>[];
  for (var index = 0; index < digits.length; index += 4) {
    final chunkEnd = (index + 4 < digits.length) ? index + 4 : digits.length;
    chunks.add(digits.substring(index, chunkEnd));
  }
  return chunks.join(' ');
}

String maskAadhaarDigits(String digits) {
  if (digits.isEmpty) {
    return '';
  }

  final hiddenDigitsCount = (digits.length < 8) ? digits.length : 8;
  final visibleDigits = (digits.length > 8) ? digits.substring(8) : '';
  final maskedDigits = ('X' * hiddenDigitsCount) + visibleDigits;
  return formatAadhaarDigits(maskedDigits);
}

String buildAadhaarDisplayValue({
  required String digits,
  required bool showFullValue,
}) {
  if (showFullValue) {
    return formatAadhaarDigits(digits);
  }
  return maskAadhaarDigits(digits);
}

TextEditingValue buildAadhaarEditingValue({
  required String digits,
  required bool showFullValue,
}) {
  final displayValue = buildAadhaarDisplayValue(
    digits: digits,
    showFullValue: showFullValue,
  );
  return TextEditingValue(
    text: displayValue,
    selection: TextSelection.collapsed(offset: displayValue.length),
  );
}
