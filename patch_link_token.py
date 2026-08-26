import re

with open('lib/services/hip_linking_workflow_service.dart', 'r') as f:
    content = f.read()

pattern = r"""    if \(tokenFile is File\) \{
      await tokenFile.parent.create\(recursive: true\);
      await tokenFile.writeAsString\(content\);
    \}"""

replacement = r"""    if (tokenFile is File) {
      await tokenFile.parent.create(recursive: true);
      await tokenFile.writeAsString(content);
      
      // Sync to remote backend so the server has a copy of the token file
      try {
        final patientFolderName = tokenFile.parent.path.split(Platform.pathSeparator).last;
        final baseName = tokenFile.uri.pathSegments.last;
        await http.post(
          Uri.parse('${ApiConfig.baseUrl}/files/write'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'filePath': '$patientFolderName/$baseName', 'content': content}),
        );
      } catch (e) {}
    }"""

content = re.sub(pattern, replacement, content)

with open('lib/services/hip_linking_workflow_service.dart', 'w') as f:
    f.write(content)
