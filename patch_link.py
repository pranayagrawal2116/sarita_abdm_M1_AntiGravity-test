import re

with open('lib/services/hip_linking_workflow_service.dart', 'r') as f:
    content = f.read()

content = content.replace("final tokenFile = _tokenFileForPatient(patientProfile);", "final tokenFilePath = _tokenFilePathForPatient(patientProfile);")
content = content.replace("'tokenFilePath': tokenFile.path,", "'tokenFilePath': tokenFilePath,")
content = content.replace("final savedToken = await _readSavedLinkToken(tokenFile);", "final savedToken = await _readSavedLinkToken(patientProfile);")
content = content.replace("tokenFile: tokenFile,", "patient: patientProfile,")
content = content.replace("run['tokenFilePath'] = tokenFile.path;", "run['tokenFilePath'] = tokenFilePath;")

# replace _tokenFileForPatient
content = re.sub(
r"""  static File _tokenFileForPatient\(Map<String, dynamic> patient\) \{
    final patientFolderName =
        '\$\{_sanitizePathSegment\(_tokenFolderAbhaId\(patient\)\)\}_\$\{_sanitizePathSegment\(_patientName\(patient\)\)\}';
    return File\(
      '\$\{_localRecordRoot\(\).path\}/\$patientFolderName/hip_link_token.txt',
    \);
  \}""",
r"""  static String _tokenFilePathForPatient(Map<String, dynamic> patient) {
    if (kIsWeb) return 'hip_link_token.txt';
    final patientFolderName =
        '${_sanitizePathSegment(_tokenFolderAbhaId(patient))}_${_sanitizePathSegment(_patientName(patient))}';
    return '${_localRecordRoot().path}/$patientFolderName/hip_link_token.txt';
  }""", content)

# replace _readSavedLinkToken
content = re.sub(
r"""  static Future<_SavedLinkToken\?> _readSavedLinkToken\(File tokenFile\) async \{
    if \(!await tokenFile.exists\(\)\) return null;
    final content = await tokenFile.readAsString\(\);""",
r"""  static Future<_SavedLinkToken?> _readSavedLinkToken(Map<String, dynamic> patient) async {
    final abhaId = _tokenFolderAbhaId(patient);
    final patientName = _patientName(patient);
    final path = _tokenFilePathForPatient(patient);
    final content = await readDraft(abhaId, patientName, path);
    if (content == null || content.isEmpty) return null;""", content)

# replace _saveLinkToken signature and body
content = re.sub(
r"""  static Future<void> _saveLinkToken\(\{
    required File tokenFile,
    required String token,
    required String abhaAddress,
    required String abhaNumber,
  \}\) async \{
    await tokenFile.parent.create\(recursive: true\);
    final now = DateTime.now\(\).toIso8601String\(\);
    await tokenFile.writeAsString\(
      \[
        'Saved At: \$now',
        'ABHA Address: \$abhaAddress',
        'ABHA Number: \$abhaNumber',
        'Link Token:',
        token,
        '',
      \].join\('\\n'\),
      flush: true,
    \);""",
r"""  static Future<void> _saveLinkToken({
    required Map<String, dynamic> patient,
    required String token,
    required String abhaAddress,
    required String abhaNumber,
  }) async {
    final now = DateTime.now().toIso8601String();
    final content = [
      'Saved At: $now',
      'ABHA Address: $abhaAddress',
      'ABHA Number: $abhaNumber',
      'Link Token:',
      token,
      '',
    ].join('\n');
    
    final abhaId = _tokenFolderAbhaId(patient);
    final patientName = _patientName(patient);
    final path = _tokenFilePathForPatient(patient);
    
    if (!kIsWeb) {
      final patientFolderName = '${_sanitizePathSegment(abhaId)}_${_sanitizePathSegment(patientName)}';
      final patientFolder = Directory('${_localRecordRoot().path}/$patientFolderName');
      await patientFolder.create(recursive: true);
    }
    
    await saveDraft(abhaId, patientName, path, content);""", content)

with open('lib/services/hip_linking_workflow_service.dart', 'w') as f:
    f.write(content)
