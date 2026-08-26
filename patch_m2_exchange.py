import re

with open('lib/screens/m2_data_exchange_screen.dart', 'r') as f:
    content = f.read()

# Add autoStartHiType property
pattern1 = r"""class M2DataExchangeScreen extends StatefulWidget \{
  const M2DataExchangeScreen\(\{super.key, required this.patientProfile\}\);

  final Map<String, dynamic> patientProfile;"""

replacement1 = r"""class M2DataExchangeScreen extends StatefulWidget {
  const M2DataExchangeScreen({super.key, required this.patientProfile, this.autoStartHiType});

  final Map<String, dynamic> patientProfile;
  final String? autoStartHiType;"""

content = re.sub(pattern1, replacement1, content)

with open('lib/screens/m2_data_exchange_screen.dart', 'w') as f:
    f.write(content)
