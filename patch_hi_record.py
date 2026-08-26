import re

with open('lib/screens/hi_record_creation_screen.dart', 'r') as f:
    content = f.read()

pattern = r"""          _showToast\(context, 'Data push was successful'\);
          
          // Show automation dialog
          showDialog\(
            context: context,
            barrierDismissible: false,
            builder: \(context\) \{
              return _M2AutomationDialog\(
                patientProfile: widget.patientProfile,
                hiType: widget.hiType,
              \);
            \}
          \);"""

replacement = r"""          _showToast(context, 'HIP Linking successful. Starting M2 Data Transfer...');
          
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (context) => M2DataExchangeScreen(
                patientProfile: widget.patientProfile,
                autoStartHiType: widget.hiType,
              ),
            ),
          );"""

content = re.sub(pattern, replacement, content)

with open('lib/screens/hi_record_creation_screen.dart', 'w') as f:
    f.write(content)
