import re

with open('lib/screens/hi_record_creation_screen.dart', 'r') as f:
    content = f.read()

pattern = r"""          if \(result\['ok'\] == true\) \{
            _showToast\(context, 'Data push was successful'\);
          \} else \{
            _showToast\(context, 'Data push failed: Please check the Patient Workspace logs.', isError: true\);
          \}
          Navigator.pop\(context\); // Return to home screen
        \}

        // Run M2 automated data transfer in the background without blocking the UI
        M2AutomatedWorkflowService.runAutomatedDataTransfer\(
          patientProfile: widget.patientProfile,
          hiType: widget.hiType,
          onProgress: \(message\) \{
            // Background progress updates
          \},
        \)\.catchError\(\(e\) \{
          print\('Background M2 automation failed: \$e'\);
        \}\);
      \} catch \(e\) \{"""

replacement = r"""          if (result['ok'] != true) {
            _showToast(context, 'Data push failed: Please check the Patient Workspace logs.', isError: true);
            Navigator.pop(context); // Return to home screen
            return;
          }
          
          _showToast(context, 'Data push was successful');
          
          // Show automation dialog
          showDialog(
            context: context,
            barrierDismissible: false,
            builder: (context) {
              return StatefulBuilder(
                builder: (context, setState) {
                  String status = 'Initializing M2 Data Transfer...';
                  bool isError = false;
                  bool isDone = false;
                  
                  if (!isDone) {
                    M2AutomatedWorkflowService.runAutomatedDataTransfer(
                      patientProfile: widget.patientProfile,
                      hiType: widget.hiType,
                      onProgress: (message) {
                        if (context.mounted) {
                          setState(() { status = message; });
                        }
                      },
                    ).then((_) {
                      if (context.mounted) {
                        setState(() {
                          status = 'M2 Data Transfer process completed successfully.';
                          isDone = true;
                        });
                      }
                    }).catchError((e) {
                      if (context.mounted) {
                        setState(() {
                          status = 'Automation failed: $e';
                          isError = true;
                          isDone = true;
                        });
                      }
                    });
                  }
                  
                  return AlertDialog(
                    title: const Text('M2 Data Transfer Workflow'),
                    content: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (!isDone) const CircularProgressIndicator(),
                        if (!isDone) const SizedBox(height: 16),
                        Text(status, textAlign: TextAlign.center, style: TextStyle(color: isError ? Colors.red : Colors.black)),
                      ],
                    ),
                    actions: [
                      if (isDone)
                        TextButton(
                          onPressed: () {
                            Navigator.pop(context); // close dialog
                            Navigator.pop(context); // return to home screen
                          },
                          child: const Text('Done'),
                        )
                    ],
                  );
                }
              );
            }
          );
        }
      } catch (e) {"""

content = re.sub(pattern, replacement, content)

with open('lib/screens/hi_record_creation_screen.dart', 'w') as f:
    f.write(content)
