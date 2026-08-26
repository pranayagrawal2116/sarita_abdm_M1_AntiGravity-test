import sys

def add_io(filename):
    with open(filename, 'r') as f:
        content = f.read()
    if "import 'dart:io';" not in content:
        content = content.replace("import 'dart:convert';", "import 'dart:io';\nimport 'dart:convert';")
        with open(filename, 'w') as f:
            f.write(content)

add_io('lib/screens/hi_record_creation_screen.dart')
add_io('lib/services/hip_linking_workflow_service.dart')
add_io('lib/screens/abha_home_screen.dart')
