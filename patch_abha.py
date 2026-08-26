import re

with open('lib/screens/abha_home_screen.dart', 'r') as f:
    content = f.read()

# Add import
if "import '../utils/download_helper.dart';" not in content:
    content = content.replace("import '../utils/registered_users_store.dart';", "import '../utils/registered_users_store.dart';\nimport '../utils/download_helper.dart';")

# Replace logic
pattern = r"""      final bytes = base64Decode\(encoded\);
      final extension = _fileExtensionForContentType\(contentType\);
      final safeName = fileName\.contains\('\.'\)
          \? fileName
          : '\$fileName\.\$extension';
      final file = File\('\$\{Directory\.systemTemp\.path\}/\$safeName'\);

      await file\.writeAsBytes\(bytes, flush: true\);

      if \(Platform\.isMacOS\) \{
        await Process\.run\('open', \[file\.path\]\);
      \}

      if \(!mounted\) return;
      messenger\.showSnackBar\(
        SnackBar\(content: Text\('ABHA card saved to \$\{file\.path\}'\)\),
      \);"""

replacement = r"""      final extension = _fileExtensionForContentType(contentType);
      final safeName = fileName.contains('.')
          ? fileName
          : '$fileName.$extension';
          
      final savedMessage = await saveAbhaCard(safeName, extension, encoded);

      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(content: Text(savedMessage)),
      );"""

content = re.sub(pattern, replacement, content)

with open('lib/screens/abha_home_screen.dart', 'w') as f:
    f.write(content)
