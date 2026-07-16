import 'package:flutter/material.dart';

String cleanApiMessage(Object error) {
  final raw = error.toString().trim();
  return raw
      .replaceFirst(RegExp(r'^Exception:\s*'), '')
      .replaceFirst(RegExp(r'^TimeoutException:\s*'), '')
      .trim();
}

Future<void> showApiErrorDialog(
  BuildContext context,
  Object error, {
  String title = 'API Request Failed',
}) {
  final message = cleanApiMessage(error);

  return showDialog<void>(
    context: context,
    builder: (_) => AlertDialog(
      title: Text(title),
      content: SelectableText(message.isEmpty ? error.toString() : message),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Close'),
        ),
      ],
    ),
  );
}
