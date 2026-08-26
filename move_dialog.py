import re

with open('lib/screens/hi_record_creation_screen.dart', 'r') as f:
    content = f.read()

# Extract the class
match = re.search(r'class _M2AutomationDialog extends StatefulWidget \{.*\}\n\}$', content, re.DOTALL)
if match:
    dialog_code = match.group(0)
    
    # Remove from hi_record_creation_screen
    content = content.replace(dialog_code, '')
    with open('lib/screens/hi_record_creation_screen.dart', 'w') as f:
        f.write(content)
        
    # Append to m2_data_exchange_screen
    with open('lib/screens/m2_data_exchange_screen.dart', 'a') as f:
        f.write('\n\n' + dialog_code + '\n')
        
