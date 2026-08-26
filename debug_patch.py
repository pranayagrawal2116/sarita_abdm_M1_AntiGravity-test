import re

with open('lib/screens/hi_record_creation_screen.dart', 'r') as f:
    content = f.read()

pattern = r"""          if \(result\['status'\] != 'completed'\) \{
            _showToast\(context, 'Data push failed: Please check the Patient Workspace logs.', isError: true\);
            Navigator.pop\(context\); // Return to home screen
            return;
          \}"""

replacement = r"""          if (result['status'] != 'completed') {
            _showToast(context, 'Data push failed: status was ' + result['status'].toString(), isError: true);
            Navigator.pop(context); // Return to home screen
            return;
          }"""

content = re.sub(pattern, replacement, content)

with open('lib/screens/hi_record_creation_screen.dart', 'w') as f:
    f.write(content)
