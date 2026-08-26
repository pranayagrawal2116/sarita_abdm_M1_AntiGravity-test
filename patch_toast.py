import re

with open('lib/screens/hi_record_creation_screen.dart', 'r') as f:
    content = f.read()

pattern = r"""      try \{
        await HipLinkingWorkflowService.runRecordLinking\(
          patientProfile: widget.patientProfile,
          selectedHiType: widget.hiType,
          formattedRecordText: _buildCareContextDisplay\(\),
        \);

        if \(mounted\) \{
          Navigator.pop\(context\); // Close loading dialog
          _showToast\(context, 'Data push was successful'\);
          Navigator.pop\(context\); // Return to home screen
        \}"""

replacement = r"""      try {
        final result = await HipLinkingWorkflowService.runRecordLinking(
          patientProfile: widget.patientProfile,
          selectedHiType: widget.hiType,
          formattedRecordText: _buildCareContextDisplay(),
        );

        if (mounted) {
          Navigator.pop(context); // Close loading dialog
          if (result['ok'] == true) {
            _showToast(context, 'Data push was successful');
          } else {
            _showToast(context, 'Data push failed: Please check the Patient Workspace logs.', isError: true);
          }
          Navigator.pop(context); // Return to home screen
        }"""

content = re.sub(pattern, replacement, content)

with open('lib/screens/hi_record_creation_screen.dart', 'w') as f:
    f.write(content)
