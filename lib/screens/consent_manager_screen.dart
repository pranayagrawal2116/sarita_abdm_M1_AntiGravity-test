import 'dart:convert';

import 'package:flutter/material.dart';

import '../config/hospital_config.dart';
import '../services/consent_manager_api_service.dart';
import '../utils/auth_session.dart';
import '../widgets/api_feedback_dialogs.dart';
import '../widgets/desktop_workspace.dart';

class ConsentManagerScreen extends StatefulWidget {
  const ConsentManagerScreen({super.key});

  @override
  State<ConsentManagerScreen> createState() => _ConsentManagerScreenState();
}

class _ConsentManagerScreenState extends State<ConsentManagerScreen> {
  final _patientIdController = TextEditingController();
  final _hiuIdController = TextEditingController();
  final _requesterNameController = TextEditingController();
  final _requesterValueController = TextEditingController();
  final _purposeCodeController = TextEditingController();
  final _purposeTextController = TextEditingController();
  final _hiTypesController = TextEditingController();
  final _dateFromController = TextEditingController();
  final _dateToController = TextEditingController();
  final _dataEraseAtController = TextEditingController();
  final _requestIdController = TextEditingController();
  final _consentIdController = TextEditingController();
  final _consentStatusController = TextEditingController();
  final _dataRequestIdController = TextEditingController();
  final _transactionIdController = TextEditingController();
  final _entriesCountController = TextEditingController();
  final _dataPushUrlController = TextEditingController();

  bool _callingApi = false;
  String _activeAction = '';
  String _callbackBase = '';
  String _callbackInitUrl = '';
  String _callbackStatusUrl = '';
  String _callbackOnRequestUrl = '';
  String _callbackNotifyUrl = '';
  String _lastAction = 'No consent-manager call yet';
  String _lastResponse = '{}';

  @override
  void initState() {
    super.initState();
    final now = DateTime.now().toUtc();
    final from = DateTime.utc(now.year - 2, 1, 1);
    final to = DateTime.utc(now.year + 1, 1, 1);
    final eraseAt = DateTime.utc(now.year + 1, 12, 31);

    _patientIdController.text = AuthSession.currentM2AbhaAddress ?? '';
    _requesterNameController.text = HospitalConfig.requesterName;
    _requesterValueController.text = '12345';
    _purposeCodeController.text = 'CAREMGT';
    _purposeTextController.text = 'Care Management';
    _hiTypesController.text = 'OPConsultation, Prescription';
    _dateFromController.text = from.toIso8601String();
    _dateToController.text = to.toIso8601String();
    _dataEraseAtController.text = eraseAt.toIso8601String();
    _loadConfig();
  }

  @override
  void dispose() {
    _patientIdController.dispose();
    _hiuIdController.dispose();
    _requesterNameController.dispose();
    _requesterValueController.dispose();
    _purposeCodeController.dispose();
    _purposeTextController.dispose();
    _hiTypesController.dispose();
    _dateFromController.dispose();
    _dateToController.dispose();
    _dataEraseAtController.dispose();
    _requestIdController.dispose();
    _consentIdController.dispose();
    _consentStatusController.dispose();
    _dataRequestIdController.dispose();
    _transactionIdController.dispose();
    _entriesCountController.dispose();
    _dataPushUrlController.dispose();
    super.dispose();
  }

  bool get _canInitConsent =>
      _patientIdController.text.trim().isNotEmpty &&
      _hiuIdController.text.trim().isNotEmpty &&
      _requesterNameController.text.trim().isNotEmpty &&
      _purposeCodeController.text.trim().isNotEmpty &&
      _purposeTextController.text.trim().isNotEmpty &&
      !_callingApi;

  bool get _canCheckOnInit =>
      _requestIdController.text.trim().isNotEmpty && !_callingApi;

  bool get _canCheckOnStatus =>
      _consentIdController.text.trim().isNotEmpty && !_callingApi;

  bool get _canRequestData =>
      _consentIdController.text.trim().isNotEmpty &&
      _consentStatusController.text.trim().toUpperCase() == 'GRANTED' &&
      !_callingApi;

  bool get _canCheckOnRequest =>
      _dataRequestIdController.text.trim().isNotEmpty && !_callingApi;

  bool get _canCheckNotify =>
      _transactionIdController.text.trim().isNotEmpty && !_callingApi;

  Future<void> _loadConfig() async {
    try {
      final config = await ConsentManagerApiService.fetchCallbackConfig();
      final callbacks = Map<String, dynamic>.from(
        config['callbacks'] as Map? ?? {},
      );
      final setupDefaults = Map<String, dynamic>.from(
        config['setupDefaults'] as Map? ?? {},
      );

      if (!mounted) return;
      setState(() {
        _callbackBase = config['publicBaseUrl']?.toString() ?? '';
        _callbackInitUrl = callbacks['consentRequestOnInit']?.toString() ?? '';
        _callbackStatusUrl =
            callbacks['consentRequestOnStatus']?.toString() ?? '';
        _callbackOnRequestUrl =
            callbacks['healthInformationOnRequest']?.toString() ?? '';
        _callbackNotifyUrl =
            callbacks['healthInformationNotifyManager']?.toString() ?? '';
        _dataPushUrlController.text = _callbackNotifyUrl;
        if (_hiuIdController.text.trim().isEmpty) {
          _hiuIdController.text = setupDefaults['hiuId']?.toString() ?? '';
        }
      });
    } catch (e) {
      if (!mounted) return;
      await showApiErrorDialog(
        context,
        e,
        title: 'Consent Manager Setup Failed',
      );
    }
  }

  List<String> get _hiTypes => _hiTypesController.text
      .split(',')
      .map((item) => item.trim())
      .where((item) => item.isNotEmpty)
      .toList();

  Future<void> _runAction(
    String label,
    String action,
    Future<Map<String, dynamic>> Function() call,
  ) async {
    setState(() {
      _callingApi = true;
      _activeAction = label;
      _lastAction = action;
    });

    try {
      final response = await call();
      if (!mounted) return;
      setState(() {
        _lastResponse = const JsonEncoder.withIndent('  ').convert(response);
      });
      _hydrateFromResponse(action, response);
    } catch (e) {
      if (!mounted) return;
      await showApiErrorDialog(context, e);
    } finally {
      if (mounted) {
        setState(() {
          _callingApi = false;
          _activeAction = '';
        });
      }
    }
  }

  void _hydrateFromResponse(String action, Map<String, dynamic> response) {
    final requestId = response['requestId']?.toString().trim() ?? '';
    if (requestId.isNotEmpty) {
      if (action.contains('health-information')) {
        _dataRequestIdController.text = requestId;
      } else {
        _requestIdController.text = requestId;
      }
    }

    final consentId =
        response['consentId']?.toString().trim() ??
        ((response['payload'] as Map?)?['consentId']?.toString().trim() ?? '');
    if (consentId.isNotEmpty) {
      _consentIdController.text = consentId;
    }

    final status = response['status']?.toString().trim() ?? '';
    if (status.isNotEmpty) {
      _consentStatusController.text = status;
    }

    final transactionId = response['transactionId']?.toString().trim() ?? '';
    if (transactionId.isNotEmpty) {
      _transactionIdController.text = transactionId;
    }

    final entriesCount = response['entriesCount'];
    if (entriesCount != null) {
      _entriesCountController.text = entriesCount.toString();
    }
  }

  Future<void> _initConsentRequest() async {
    await _runAction(
      '1) Create Consent Request',
      'POST /m2/consents/manager/init',
      () => ConsentManagerApiService.initConsentRequest({
        'requestId': _requestIdController.text.trim(),
        'timestamp': DateTime.now().toUtc().toIso8601String(),
        'consent': {
          'purpose': {
            'code': _purposeCodeController.text.trim(),
            'text': _purposeTextController.text.trim(),
          },
          'patient': {'id': _patientIdController.text.trim()},
          'hiu': {'id': _hiuIdController.text.trim()},
          'requester': {
            'name': _requesterNameController.text.trim(),
            'identifier': {
              'type': 'REGNO',
              'value': _requesterValueController.text.trim(),
            },
          },
          'hiTypes': _hiTypes,
          'permission': {
            'accessMode': 'VIEW',
            'dateRange': {
              'from': _dateFromController.text.trim(),
              'to': _dateToController.text.trim(),
            },
            'dataEraseAt': _dataEraseAtController.text.trim(),
            'frequency': {'unit': 'HOUR', 'value': 1, 'repeats': 0},
          },
        },
      }),
    );
  }

  Future<void> _checkOnInit() async {
    await _runAction(
      '2) Check On-Init Callback',
      'GET /m2/consents/manager/callbacks/on-init/:requestId',
      () => ConsentManagerApiService.fetchOnInitCallback(
        _requestIdController.text.trim(),
      ),
    );
  }

  Future<void> _checkOnStatus() async {
    await _runAction(
      '3) Check On-Status Callback',
      'GET /m2/consents/manager/callbacks/on-status/:consentId',
      () => ConsentManagerApiService.fetchOnStatusCallback(
        _consentIdController.text.trim(),
      ),
    );
  }

  Future<void> _requestHealthInformation() async {
    await _runAction(
      '4) Request Health Data',
      'POST /m2/consents/manager/health-information/request',
      () => ConsentManagerApiService.requestHealthInformation({
        'requestId': _dataRequestIdController.text.trim(),
        'timestamp': DateTime.now().toUtc().toIso8601String(),
        'hiRequest': {
          'consent': {'id': _consentIdController.text.trim()},
          'dateRange': {
            'from': _dateFromController.text.trim(),
            'to': _dateToController.text.trim(),
          },
          'dataPushUrl': _dataPushUrlController.text.trim(),
        },
      }),
    );
  }

  Future<void> _checkOnRequest() async {
    await _runAction(
      '5) Check On-Request Callback',
      'GET /m2/consents/manager/callbacks/health-information/on-request/:requestId',
      () => ConsentManagerApiService.fetchOnRequestCallback(
        _dataRequestIdController.text.trim(),
      ),
    );
  }

  Future<void> _checkNotify() async {
    await _runAction(
      '6) Check Notify Callback',
      'GET /m2/consents/manager/callbacks/health-information/notify/:transactionId',
      () => ConsentManagerApiService.fetchNotifyCallback(
        _transactionIdController.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final desktop = MediaQuery.of(context).size.width >= 1180;

    final formColumn = Column(
      children: [
        _sectionCard(
          title: 'Step 1: Create Consent Request',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _field(
                _patientIdController,
                'Patient ABHA Address',
                source:
                    'Auto-filled from logged-in PHR session when available.',
              ),
              const SizedBox(height: 10),
              _field(
                _hiuIdController,
                'HIU ID',
                source: 'From ABDM onboarding or backend env.',
              ),
              const SizedBox(height: 10),
              _field(
                _requesterNameController,
                'Requester Name',
                source: 'Name shown to user in the consent flow.',
              ),
              const SizedBox(height: 10),
              _field(
                _requesterValueController,
                'Requester Identifier Value',
                source: 'REGNO value for requester identification.',
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _field(
                      _purposeCodeController,
                      'Purpose Code',
                      source: 'Usually CAREMGT for this flow.',
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _field(
                      _purposeTextController,
                      'Purpose Text',
                      source: 'Visible purpose text shown in consent.',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              _field(
                _hiTypesController,
                'HI Types (comma separated)',
                source:
                    'For example OPConsultation, Prescription as shown in your flow.',
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _field(
                      _dateFromController,
                      'Date From',
                      source: 'Permission date range start.',
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _field(
                      _dateToController,
                      'Date To',
                      source: 'Permission date range end.',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              _field(
                _dataEraseAtController,
                'Data Erase At',
                source: 'Permission data erase timestamp.',
              ),
              const SizedBox(height: 10),
              _field(
                _requestIdController,
                'Consent Request ID',
                source: 'Auto-filled after consent init if left blank.',
              ),
              const SizedBox(height: 12),
              _button(
                '1) Create Consent Request',
                _canInitConsent ? _initConsentRequest : null,
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        _sectionCard(
          title: 'Step 2: Callback Monitoring',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _readonlyField(
                _consentIdController,
                'Consent ID',
                source: 'Comes from on-init callback.',
              ),
              const SizedBox(height: 10),
              _readonlyField(
                _consentStatusController,
                'Consent Status',
                source:
                    'Comes from on-status callback. Proceed only on GRANTED.',
              ),
              const SizedBox(height: 12),
              _button(
                '2) Check On-Init Callback',
                _canCheckOnInit ? _checkOnInit : null,
                outlined: true,
              ),
              const SizedBox(height: 8),
              _button(
                '3) Check On-Status Callback',
                _canCheckOnStatus ? _checkOnStatus : null,
                outlined: true,
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        _sectionCard(
          title: 'Step 3: Request Health Data',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _field(
                _dataPushUrlController,
                'Data Push URL',
                source: 'Auto-filled from backend callback config.',
              ),
              const SizedBox(height: 10),
              _field(
                _dataRequestIdController,
                'Health Data Request ID',
                source: 'Auto-filled after request if left blank.',
              ),
              const SizedBox(height: 12),
              _button(
                '4) Request Health Data',
                _canRequestData ? _requestHealthInformation : null,
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        _sectionCard(
          title: 'Step 4: Data Callbacks',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _readonlyField(
                _transactionIdController,
                'Transaction ID',
                source: 'Comes from on-request callback.',
              ),
              const SizedBox(height: 10),
              _readonlyField(
                _entriesCountController,
                'Entries Count',
                source: 'Comes from notify callback payload.',
              ),
              const SizedBox(height: 12),
              _button(
                '5) Check On-Request Callback',
                _canCheckOnRequest ? _checkOnRequest : null,
                outlined: true,
              ),
              const SizedBox(height: 8),
              _button(
                '6) Check Notify Callback',
                _canCheckNotify ? _checkNotify : null,
                outlined: true,
              ),
            ],
          ),
        ),
      ],
    );

    final sideColumn = Column(
      children: [
        _sectionCard(
          title: 'Readiness',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                AuthSession.isM2LoggedIn
                    ? 'M2 PHR session: Available'
                    : 'M2 PHR session: Missing',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: AuthSession.isM2LoggedIn
                      ? Colors.green.shade700
                      : Colors.red.shade700,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Gateway access token is generated and reused in the backend for this consent-manager flow. The frontend does not create multiple tokens.',
                style: TextStyle(fontSize: 12, color: Colors.black54),
              ),
              const SizedBox(height: 12),
              SelectableText(
                _callbackBase.isEmpty
                    ? 'Public callback base not loaded'
                    : 'Public callback base: $_callbackBase',
                style: const TextStyle(fontSize: 12),
              ),
              const SizedBox(height: 8),
              SelectableText(
                _callbackInitUrl.isEmpty
                    ? 'On-init URL not loaded'
                    : 'On-init: $_callbackInitUrl',
                style: const TextStyle(fontSize: 12),
              ),
              const SizedBox(height: 6),
              SelectableText(
                _callbackStatusUrl.isEmpty
                    ? 'On-status URL not loaded'
                    : 'On-status: $_callbackStatusUrl',
                style: const TextStyle(fontSize: 12),
              ),
              const SizedBox(height: 6),
              SelectableText(
                _callbackOnRequestUrl.isEmpty
                    ? 'On-request URL not loaded'
                    : 'On-request: $_callbackOnRequestUrl',
                style: const TextStyle(fontSize: 12),
              ),
              const SizedBox(height: 6),
              SelectableText(
                _callbackNotifyUrl.isEmpty
                    ? 'Notify URL not loaded'
                    : 'Notify: $_callbackNotifyUrl',
                style: const TextStyle(fontSize: 12),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        _sectionCard(
          title: 'Runtime',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _callingApi ? 'Running: $_activeAction' : 'Idle',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 10),
              Text('Last action: $_lastAction'),
              const SizedBox(height: 12),
              SelectableText(_lastResponse),
            ],
          ),
        ),
      ],
    );

    return Scaffold(
      appBar: AppBar(title: const Text('Consent Manager (M2)')),
      body: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1320),
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const DesktopPageIntro(
                eyebrow: 'Consent Manager',
                title:
                    'Run the ABDM consent lifecycle in order with one backend token path.',
                description:
                    'This screen follows the flow you shared: create consent request, watch on-init and on-status callbacks, request health data, then monitor on-request and notify.',
                pills: [
                  'Single token path',
                  'Consent init',
                  'Callback monitor',
                  'Health data request',
                ],
              ),
              if (desktop)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(flex: 3, child: formColumn),
                    const SizedBox(width: 16),
                    Expanded(flex: 2, child: sideColumn),
                  ],
                )
              else ...[
                sideColumn,
                const SizedBox(height: 16),
                formColumn,
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _sectionCard({required String title, required Widget child}) {
    return DesktopSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    required String source,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Data source: $source',
          style: const TextStyle(fontSize: 12, color: Colors.black54),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: label),
        ),
      ],
    );
  }

  Widget _readonlyField(
    TextEditingController controller,
    String label, {
    required String source,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Auto-filled from API',
          style: TextStyle(
            fontSize: 12,
            color: Color(0xFF1B70C9),
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Data source: $source',
          style: const TextStyle(fontSize: 12, color: Colors.black54),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          readOnly: true,
          decoration: InputDecoration(
            labelText: label,
            fillColor: const Color(0xFFF3F7FB),
          ),
        ),
      ],
    );
  }

  Widget _button(String label, VoidCallback? onTap, {bool outlined = false}) {
    final child = SizedBox(
      width: double.infinity,
      height: 48,
      child: outlined
          ? OutlinedButton(onPressed: onTap, child: _buttonLabel(label))
          : ElevatedButton(onPressed: onTap, child: _buttonLabel(label)),
    );
    return child;
  }

  Widget _buttonLabel(String label) {
    final isActive = _callingApi && _activeAction == label;
    if (!isActive) {
      return Text(label);
    }

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: const [
        SizedBox(
          width: 18,
          height: 18,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        SizedBox(width: 10),
        Text('Calling...'),
      ],
    );
  }
}
