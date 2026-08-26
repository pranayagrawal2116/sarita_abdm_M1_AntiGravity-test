import re

with open('lib/widgets/scan_share_qr_dialog.dart', 'r') as f:
    content = f.read()

pattern = r"""  static bool _hasSetupRun = false;

  static Future<void> prepareAndShow\(BuildContext context\) async \{
    final messenger = ScaffoldMessenger.of\(context\);

    try \{
      if \(!_hasSetupRun\) \{
        final setup = await HipSetupApiService.runScanShareSetup\(\);
        final ok = setup\['ok'\] == true;
        if \(!ok\) \{
          final canShowQr = _scanShareSetupCanContinue\(setup\);
          if \(!canShowQr\) \{
            throw Exception\(_scanShareSetupMessage\(setup\)\);
          \}
          if \(context.mounted\) \{
            messenger.showSnackBar\(
              SnackBar\(
                content: Text\(_scanShareSetupMessage\(setup\)\),
                duration: const Duration\(seconds: 6\),
              \),
            \);
          \}
        \}
        _hasSetupRun = true;
      \}
        if \(!canShowQr\) \{
          throw Exception\(_scanShareSetupMessage\(setup\)\);
        \}
        if \(context.mounted\) \{
          messenger.showSnackBar\(
            SnackBar\(
              content: Text\(_scanShareSetupMessage\(setup\)\),
              duration: const Duration\(seconds: 6\),
            \),
          \);
        \}
      \}

      if \(!context.mounted\) return;"""

replacement = r"""  static bool _hasSetupRun = false;

  static Future<void> prepareAndShow(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);

    try {
      if (!_hasSetupRun) {
        final setup = await HipSetupApiService.runScanShareSetup();
        final ok = setup['ok'] == true;
        if (!ok) {
          final canShowQr = _scanShareSetupCanContinue(setup);
          if (!canShowQr) {
            throw Exception(_scanShareSetupMessage(setup));
          }
          if (context.mounted) {
            messenger.showSnackBar(
              SnackBar(
                content: Text(_scanShareSetupMessage(setup)),
                duration: const Duration(seconds: 6),
              ),
            );
          }
        }
        _hasSetupRun = true;
      }

      if (!context.mounted) return;"""

content = re.sub(pattern, replacement, content)

with open('lib/widgets/scan_share_qr_dialog.dart', 'w') as f:
    f.write(content)
