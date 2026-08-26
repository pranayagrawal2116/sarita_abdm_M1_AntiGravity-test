import re

with open('lib/utils/draft_helper_web.dart', 'r') as f:
    content = f.read()

pattern = r"""        'fileName': fileName,"""

replacement = r"""        'fileName': fileName.contains('/') ? fileName.split('/').last : fileName,"""

content = re.sub(pattern, replacement, content)

with open('lib/utils/draft_helper_web.dart', 'w') as f:
    f.write(content)
