import re

with open('lib/screens/hi_record_creation_screen.dart', 'r') as f:
    content = f.read()

pattern = r"""          // Use Navigator\.push instead of pushReplacement to avoid stack issues
          Navigator\.pop\(context\); // Close HiRecordCreationScreen manually instead of pushReplacement
          Navigator\.push\(
            context,
            MaterialPageRoute\(
              builder: \(context\) => M2DataExchangeScreen\(
                patientProfile: widget\.patientProfile,
                autoStartHiType: widget\.hiType,
              \),
            \),
          \);"""

replacement = r"""          // Use a post frame callback to ensure the route is pushed correctly
          WidgetsBinding.instance.addPostFrameCallback((_) {
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(
                builder: (context) => M2DataExchangeScreen(
                  patientProfile: widget.patientProfile,
                  autoStartHiType: widget.hiType,
                ),
              ),
            );
          });"""

content = re.sub(pattern, replacement, content)

with open('lib/screens/hi_record_creation_screen.dart', 'w') as f:
    f.write(content)
