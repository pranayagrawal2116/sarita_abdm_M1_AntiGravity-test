import re

with open('lib/services/hip_linking_workflow_service.dart', 'r') as f:
    content = f.read()

pattern = r"""            if \(status == 'FAILED'\) \{
              final errorMsg = response\['error'\]\?\.toString\(\) \?\? 'ABDM rejected the link token request.';"""

replacement = r"""            if (status == 'FAILED') {
              String errorMsg = 'ABDM rejected the link token request.';
              final errObj = response['error'];
              if (errObj is Map) {
                errorMsg = errObj['message']?.toString() ?? errObj.toString();
              } else if (errObj != null) {
                errorMsg = errObj.toString();
              }"""

content = re.sub(pattern, replacement, content)

with open('lib/services/hip_linking_workflow_service.dart', 'w') as f:
    f.write(content)
