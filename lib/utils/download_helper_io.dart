import 'dart:convert';
import 'dart:io';

Future<String> saveAbhaCardImpl(String fileName, String extension, String base64Data) async {
  final bytes = base64Decode(base64Data);
  final safeName = fileName.contains('.') ? fileName : '$fileName.$extension';
  final file = File('${Directory.systemTemp.path}/$safeName');
  await file.writeAsBytes(bytes, flush: true);

  if (Platform.isMacOS) {
    await Process.run('open', [file.path]);
  }

  return file.path;
}
