import re

with open('lib/screens/hi_record_creation_screen.dart', 'r') as f:
    content = f.read()

pattern = r"""    String fullPath = fileName;
    if \(!kIsWeb\) \{
      final appFolder = _localRecordRoot\(\);
      final patientFolderName =
          '\$\{_sanitizePathSegment\(abhaId\)\}_\$\{_sanitizePathSegment\(patientName\)\}';
      final patientFolder = Directory\('\$\{appFolder\.path\}/\$patientFolderName'\);
      await patientFolder\.create\(recursive: true\);
      fullPath = '\$\{patientFolder\.path\}/\$fileName';
    \}"""

replacement = r"""    final patientFolderName = '${_sanitizePathSegment(abhaId)}_${_sanitizePathSegment(patientName)}';
    String fullPath;
    if (!kIsWeb) {
      final appFolder = _localRecordRoot();
      final patientFolder = Directory('${appFolder.path}/$patientFolderName');
      await patientFolder.create(recursive: true);
      fullPath = '${patientFolder.path}/$fileName';
    } else {
      fullPath = '$patientFolderName/$fileName';
    }"""

new_content = re.sub(pattern, replacement, content)

with open('lib/screens/hi_record_creation_screen.dart', 'w') as f:
    f.write(new_content)
