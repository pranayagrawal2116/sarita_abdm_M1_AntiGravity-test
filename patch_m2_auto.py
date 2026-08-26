import re

with open('lib/screens/m2_data_exchange_screen.dart', 'r') as f:
    content = f.read()

pattern = r"""  void initState\(\) \{
    super\.initState\(\);
    _initializeTokenManager\(\);
    _loadConsentInbox\(\);
    _loadTransferHistory\(\);
  \}"""

replacement = r"""  void initState() {
    super.initState();
    _initializeTokenManager();
    _loadConsentInbox();
    _loadTransferHistory();
    
    if (widget.autoStartHiType != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _startAutomatedTransfer(widget.autoStartHiType!);
      });
    }
  }

  void _startAutomatedTransfer(String hiType) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return _M2AutomationDialog(
          patientProfile: widget.patientProfile,
          hiType: hiType,
        );
      }
    ).then((_) {
      _loadConsentInbox();
      _loadTransferHistory();
    });
  }"""

content = re.sub(pattern, replacement, content)

with open('lib/screens/m2_data_exchange_screen.dart', 'w') as f:
    f.write(content)
