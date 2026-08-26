import 'download_helper_stub.dart'
    if (dart.library.io) 'download_helper_io.dart'
    if (dart.library.html) 'download_helper_web.dart';

Future<String> saveAbhaCard(String fileName, String extension, String base64Data) async {
  return await saveAbhaCardImpl(fileName, extension, base64Data);
}
