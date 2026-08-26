import re

with open('lib/screens/m2_data_exchange_screen.dart', 'r') as f:
    content = f.read()

pattern = r"""          TextButton\(
            onPressed: \(\) \{
              Navigator\.pop\(context\);
              Navigator\.pop\(context\);
            \},"""

replacement = r"""          TextButton(
            onPressed: () {
              Navigator.pop(context);
            },"""

content = re.sub(pattern, replacement, content)

with open('lib/screens/m2_data_exchange_screen.dart', 'w') as f:
    f.write(content)
