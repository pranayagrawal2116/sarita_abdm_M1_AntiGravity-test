import re

with open('lib/screens/hi_record_creation_screen.dart', 'r') as f:
    content = f.read()

pattern = r"""                  if \(!isDone\) \{
                    M2AutomatedWorkflowService\.runAutomatedDataTransfer\(
                      patientProfile: widget\.patientProfile,
                      hiType: widget\.hiType,
                      onProgress: \(message\) \{
                        if \(context\.mounted\) \{
                          setState\(\(\) \{ status = message; \}\);
                        \}
                      \},
                    \)\.then\(\(_\) \{
                      if \(context\.mounted\) \{
                        setState\(\(\) \{
                          status = 'M2 Data Transfer process completed successfully\.';
                          isDone = true;
                        \}\);
                      \}
                    \}\)\.catchError\(\(e\) \{
                      if \(context\.mounted\) \{
                        setState\(\(\) \{
                          status = 'Automation failed: \$e';
                          isError = true;
                          isDone = true;
                        \}\);
                      \}
                    \}\);
                  \}"""

replacement = r"""                  // Fix: Moved execution outside builder, handled via a single variable check
                  """

content = re.sub(pattern, replacement, content)

# Instead of StatefulBuilder hack, I will just rewrite the whole showDialog part
pattern2 = r"""          // Show automation dialog
          showDialog\(
            context: context,
            barrierDismissible: false,
            builder: \(context\) \{
              return StatefulBuilder\(
                builder: \(context, setState\) \{
                  String status = 'Initializing M2 Data Transfer\.\.\.';
                  bool isError = false;
                  bool isDone = false;
                  
                  // Fix: Moved execution outside builder, handled via a single variable check
                  
                  
                  return AlertDialog\(
                    title: const Text\('M2 Data Transfer Workflow'\),
                    content: Column\(
                      mainAxisSize: MainAxisSize.min,
                      children: \[
                        if \(!isDone\) const CircularProgressIndicator\(\),
                        if \(!isDone\) const SizedBox\(height: 16\),
                        Text\(status, textAlign: TextAlign.center, style: TextStyle\(color: isError \? Colors.red : Colors.black\)\),
                      \],
                    \),
                    actions: \[
                      if \(isDone\)
                        TextButton\(
                          onPressed: \(\) \{
                            Navigator.pop\(context\); // close dialog
                            Navigator.pop\(context\); // return to home screen
                          \},
                          child: const Text\('Done'\),
                        \)
                    \],
                  \);
                \}
              \);
            \}
          \);"""

replacement2 = r"""          // Show automation dialog
          showDialog(
            context: context,
            barrierDismissible: false,
            builder: (context) {
              return _M2AutomationDialog(
                patientProfile: widget.patientProfile,
                hiType: widget.hiType,
              );
            }
          );"""

content = re.sub(pattern2, replacement2, content)

with open('lib/screens/hi_record_creation_screen.dart', 'w') as f:
    f.write(content)
