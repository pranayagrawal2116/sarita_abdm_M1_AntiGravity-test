import 'dart:convert';
// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;

Future<String> saveAbhaCardImpl(String fileName, String extension, String base64Data) async {
  final bytes = base64Decode(base64Data);
  final blob = html.Blob([bytes], _mimeTypeForExtension(extension));
  final url = html.Url.createObjectUrlFromBlob(blob);
  
  // Open preview in new tab
  html.window.open(url, '_blank');
  
  // Also trigger download
  final safeName = fileName.contains('.') ? fileName : '$fileName.$extension';
  html.AnchorElement(href: url)
    ..setAttribute('download', safeName)
    ..click();
    
  html.Url.revokeObjectUrl(url);
  return 'Downloaded to browser';
}

String _mimeTypeForExtension(String extension) {
  switch (extension) {
    case 'pdf': return 'application/pdf';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'json': return 'application/json';
    default: return 'application/octet-stream';
  }
}
