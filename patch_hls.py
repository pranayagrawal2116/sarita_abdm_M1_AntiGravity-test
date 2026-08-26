import re

with open('lib/services/hip_linking_workflow_service.dart', 'r') as f:
    content = f.read()

pattern1 = r"""  static dynamic _tokenFileForPatient\(Map<String, dynamic> patient\) \{
    if \(kIsWeb\) return null;
    final patientFolderName =
        '\$\{_sanitizePathSegment\(_tokenFolderAbhaId\(patient\)\)\}_\$\{_sanitizePathSegment\(_patientName\(patient\)\)\}';
    return File\(
      '\$\{_localRecordRoot\(\)\.path\}/\$patientFolderName/hip_link_token\.txt',
    \);
  \}"""

replacement1 = r"""  static dynamic _tokenFileForPatient(Map<String, dynamic> patient) {
    final patientFolderName =
        '${_sanitizePathSegment(_tokenFolderAbhaId(patient))}_${_sanitizePathSegment(_patientName(patient))}';
    if (kIsWeb) return '$patientFolderName/hip_link_token.txt';
    return File(
      '${_localRecordRoot().path}/$patientFolderName/hip_link_token.txt',
    );
  }"""

new_content = re.sub(pattern1, replacement1, content)

with open('lib/services/hip_linking_workflow_service.dart', 'w') as f:
    f.write(new_content)
