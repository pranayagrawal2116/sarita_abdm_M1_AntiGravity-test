import 'draft_helper_stub.dart'
    if (dart.library.io) 'draft_helper_io.dart'
    if (dart.library.html) 'draft_helper_web.dart';

Future<String> saveDraft(String abhaId, String patientName, String fileName, String content, {bool isLocalDraft = false}) async {
  return await saveDraftImpl(abhaId, patientName, fileName, content, isLocalDraft: isLocalDraft);
}

Future<String?> readDraft(String abhaId, String patientName, String fileName) async {
  return await readDraftImpl(abhaId, patientName, fileName);
}
