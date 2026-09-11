const fs = require('fs');

let content = fs.readFileSync('lib/screens/hi_record_creation_screen.dart', 'utf-8');

if (!content.includes("import '../services/m2_automated_workflow_service.dart';")) {
  content = content.replace(
    "import '../services/hip_linking_workflow_service.dart';",
    "import '../services/hip_linking_workflow_service.dart';\nimport '../services/m2_automated_workflow_service.dart';"
  );
}

const targetBlock = `        if (mounted) {
          Navigator.pop(context); // Close loading dialog
          if (result['status'] != 'completed') {
            _showToast(
              context,
              'HIP linking could not be completed. Please try again.',
              isError: true,
            );
            return;
          }

          await showDialog<void>(
            context: context,
            barrierDismissible: false,
            builder: (dialogContext) => AlertDialog(
              title: const Text('HIP Linking Complete'),
              content: const Text(
                'The health record has been linked successfully.',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text('Continue'),
                ),
              ],
            ),
          );
          if (mounted) {
            Navigator.of(context).pop(); // Return to the patient workspace.
          }
        }`;

const replacementBlock = `        if (mounted) {
          Navigator.pop(context); // Close loading dialog
          if (result['status'] != 'completed') {
            _showToast(
              context,
              'HIP linking could not be completed. Please try again.',
              isError: true,
            );
            return;
          }

          // Show progress dialog for Automated Transfer
          final ValueNotifier<String> progressNotifier = ValueNotifier<String>('HIP linking completed. Starting Automated Data Transfer...');
          showDialog<void>(
            context: context,
            barrierDismissible: false,
            builder: (dialogContext) => AlertDialog(
              title: const Text('Automated Data Transfer'),
              content: ValueListenableBuilder<String>(
                valueListenable: progressNotifier,
                builder: (context, value, child) {
                  return Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const CircularProgressIndicator(),
                      const SizedBox(height: 16),
                      Text(value, textAlign: TextAlign.center),
                    ],
                  );
                },
              ),
            ),
          );

          try {
            await M2AutomatedWorkflowService.runAutomatedDataTransfer(
              patientProfile: widget.patientProfile,
              hiType: widget.hiType,
              onProgress: (message) {
                progressNotifier.value = message;
              },
            );

            if (mounted) {
              Navigator.pop(context); // Close automated transfer progress dialog

              await showDialog<void>(
                context: context,
                barrierDismissible: false,
                builder: (dialogContext) => AlertDialog(
                  title: const Text('Workflow Complete'),
                  content: const Text(
                    'HIP Linking and Automated Data Transfer have both completed successfully.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.of(dialogContext).pop(),
                      child: const Text('Continue'),
                    ),
                  ],
                ),
              );
              if (mounted) {
                Navigator.of(context).pop(); // Return to the patient workspace.
              }
            }
          } catch (e) {
            if (mounted) {
              Navigator.pop(context); // Close transfer progress dialog
              _showErrorToast(context, 'Automated Transfer failed: $e');
              
              // Fallback dialog so they know Linking succeeded but transfer failed
              await showDialog<void>(
                context: context,
                barrierDismissible: false,
                builder: (dialogContext) => AlertDialog(
                  title: const Text('HIP Linking Complete (Transfer Failed)'),
                  content: Text(
                    'The health record was linked successfully, but automated transfer failed:\\n\\n$e',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.of(dialogContext).pop(),
                      child: const Text('Continue'),
                    ),
                  ],
                ),
              );
              if (mounted) {
                Navigator.of(context).pop(); // Return to the patient workspace.
              }
            }
          }
        }`;

if (content.includes(targetBlock)) {
  content = content.replace(targetBlock, replacementBlock);
  fs.writeFileSync('lib/screens/hi_record_creation_screen.dart', content);
  console.log("Successfully patched hi_record_creation_screen.dart");
} else {
  console.log("Target block not found");
}
