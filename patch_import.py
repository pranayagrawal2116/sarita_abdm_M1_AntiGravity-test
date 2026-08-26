import re

with open('lib/services/hip_linking_workflow_service.dart', 'r') as f:
    content = f.read()

if "import '../utils/draft_helper.dart';" not in content:
    content = content.replace("import '../utils/app_runtime_store.dart';", "import '../utils/app_runtime_store.dart';\nimport '../utils/draft_helper.dart';")
    
    with open('lib/services/hip_linking_workflow_service.dart', 'w') as f:
        f.write(content)
