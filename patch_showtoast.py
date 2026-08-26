import re

with open('lib/screens/hi_record_creation_screen.dart', 'r') as f:
    content = f.read()

pattern = r"""void _showToast\(BuildContext context, String message\) \{
  final overlayState = Overlay.of\(context\);
  late OverlayEntry overlayEntry;
  overlayEntry = OverlayEntry\(
    builder: \(context\) => _SlideToast\(
      message: message,
      isError: false,
      onDismiss: \(\) => overlayEntry.remove\(\),
    \),
  \);"""

replacement = r"""void _showToast(BuildContext context, String message, {bool isError = false}) {
  final overlayState = Overlay.of(context);
  late OverlayEntry overlayEntry;
  overlayEntry = OverlayEntry(
    builder: (context) => _SlideToast(
      message: message,
      isError: isError,
      onDismiss: () => overlayEntry.remove(),
    ),
  );"""

content = re.sub(pattern, replacement, content)

with open('lib/screens/hi_record_creation_screen.dart', 'w') as f:
    f.write(content)
