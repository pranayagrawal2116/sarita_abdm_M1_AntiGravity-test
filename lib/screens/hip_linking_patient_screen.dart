import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';

import '../config/hospital_config.dart';
import '../services/hip_linking_api_service.dart';
import '../utils/registered_users_store.dart';
import '../widgets/desktop_workspace.dart';

class HipLinkingPatientScreen extends StatefulWidget {
  const HipLinkingPatientScreen({super.key});

  @override
  State<HipLinkingPatientScreen> createState() =>
      _HipLinkingPatientScreenState();
}

class _HipLinkingPatientScreenState extends State<HipLinkingPatientScreen> {
  final _patientReferenceController = TextEditingController();
  final _patientDisplayController = TextEditingController();
  final _careContextReferenceController = TextEditingController();
  final _careContextDisplayController = TextEditingController();
  final _linkTokenController = TextEditingController();

  Map<String, dynamic>? _selectedPatient;
  String _selectedHiType = 'Prescription';
  String _lastAction = 'No HIP linking API call yet';
  String _lastResponse = '{}';
  bool _callingApi = false;
  String _activeAction = '';
  String _requestId = '';
  String _linkedAbhaAddress = '';

  @override
  void dispose() {
    _patientReferenceController.dispose();
    _patientDisplayController.dispose();
    _careContextReferenceController.dispose();
    _careContextDisplayController.dispose();
    _linkTokenController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final patients = RegisteredUsersStore.users();

    return Scaffold(
      appBar: AppBar(title: const Text('HIP Linking')),
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFF4FBFF), Color(0xFFF4FBF6), Colors.white],
          ),
        ),
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            DesktopPageIntro(
              eyebrow: 'HIP Linking',
              title: 'Select a registered patient and link their care context.',
              description:
                  'Choose one patient from the current app registry. The ABHA number, ABHA address, name, gender, and year of birth are used to generate the ABDM link token before linking the care context.',
              pills: const [
                'Registered patients',
                'Generate link token',
                'Link care context',
                'Notify ABDM',
              ],
            ),
            const SizedBox(height: 18),
            if (patients.isEmpty)
              _emptyState()
            else
              LayoutBuilder(
                builder: (context, constraints) {
                  final compact = constraints.maxWidth < 1050;
                  final patientList = _patientList(patients);
                  final workflow = _workflowPanel();
                  if (compact) {
                    return Column(
                      children: [
                        patientList,
                        const SizedBox(height: 16),
                        workflow,
                      ],
                    );
                  }
                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(flex: 5, child: patientList),
                      const SizedBox(width: 16),
                      Expanded(flex: 4, child: workflow),
                    ],
                  );
                },
              ),
          ],
        ),
      ),
    );
  }

  Widget _emptyState() {
    return DesktopSurface(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'No registered patients are available yet. Register a patient first, then come back to HIP Linking.',
          style: TextStyle(
            color: Colors.blueGrey.shade700,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  Widget _patientList(List<Map<String, dynamic>> patients) {
    return DesktopSurface(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Registered Patients',
              style: TextStyle(
                color: Color(0xFF17324A),
                fontSize: 22,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 12),
            ...patients.map(_patientTile),
          ],
        ),
      ),
    );
  }

  Widget _patientTile(Map<String, dynamic> patient) {
    final selected = _patientKey(patient) == _patientKey(_selectedPatient);
    final name = _text(patient['name']);
    final abhaAddress = _text(patient['AbhaAddress']);
    final abhaNumber = _text(patient['AbhaNumber']);
    final mobile = _text(patient['mobile']);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: selected ? const Color(0xFFEAF9F0) : const Color(0xFFFAFCFE),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: selected ? const Color(0xFF71D99A) : const Color(0xFFD9E7F2),
          width: selected ? 1.5 : 1,
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: ListTile(
          onTap: () => _selectPatient(patient),
          leading: CircleAvatar(
            backgroundColor: selected
                ? const Color(0xFF2F8F5B)
                : const Color(0xFFEAF6FF),
            foregroundColor: selected ? Colors.white : const Color(0xFF1B5E8C),
            child: const Icon(Icons.person_rounded),
          ),
          title: Text(
            name.isEmpty ? 'Unnamed patient' : name,
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
          subtitle: Text(
            [
              if (abhaAddress.isNotEmpty) abhaAddress,
              if (abhaNumber.isNotEmpty) abhaNumber,
              if (mobile.isNotEmpty) mobile,
            ].join(' • '),
          ),
          trailing: selected
              ? const Icon(Icons.check_circle_rounded, color: Color(0xFF2F8F5B))
              : const Icon(Icons.chevron_right_rounded),
        ),
      ),
    );
  }

  Widget _workflowPanel() {
    final patient = _selectedPatient;
    return DesktopSurface(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'HIP Linking API Calls',
              style: TextStyle(
                color: Color(0xFF17324A),
                fontSize: 22,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              patient == null
                  ? 'Select a patient to prepare the ABDM payload.'
                  : 'Selected: ${_text(patient['name'])}',
              style: const TextStyle(color: Color(0xFF5F7280)),
            ),
            const SizedBox(height: 16),
            _readOnlyValue('HIP ID', HospitalConfig.hipId),
            _readOnlyValue('ABHA Number', _text(patient?['AbhaNumber'])),
            _readOnlyValue('ABHA Address', _text(patient?['AbhaAddress'])),
            const SizedBox(height: 10),
            _field(_linkTokenController, 'Link Token', readOnly: false),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: _selectedHiType,
              decoration: const InputDecoration(
                labelText: 'HI Type',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(
                  value: 'Prescription',
                  child: Text('Prescription'),
                ),
                DropdownMenuItem(
                  value: 'DiagnosticReport',
                  child: Text('DiagnosticReport'),
                ),
                DropdownMenuItem(
                  value: 'OPConsultation',
                  child: Text('OPConsultation'),
                ),
                DropdownMenuItem(
                  value: 'DischargeSummary',
                  child: Text('DischargeSummary'),
                ),
                DropdownMenuItem(
                  value: 'HealthDocumentRecord',
                  child: Text('HealthDocumentRecord'),
                ),
                DropdownMenuItem(
                  value: 'WellnessRecord',
                  child: Text('WellnessRecord'),
                ),
              ],
              onChanged: (value) {
                if (value == null) return;
                setState(() => _selectedHiType = value);
              },
            ),
            const SizedBox(height: 10),
            _field(_patientReferenceController, 'Patient Reference Number'),
            const SizedBox(height: 10),
            _field(_patientDisplayController, 'Patient Display'),
            const SizedBox(height: 10),
            _field(
              _careContextReferenceController,
              'Care Context Reference Number',
            ),
            const SizedBox(height: 10),
            _field(_careContextDisplayController, 'Care Context Display'),
            const SizedBox(height: 16),
            _actionButton(
              '1. Generate Link Token',
              enabled: patient != null,
              onTap: _generateLinkToken,
            ),
            const SizedBox(height: 10),
            _actionButton(
              '2. Check Token Callback',
              enabled: _requestId.isNotEmpty,
              onTap: _checkTokenCallback,
              outlined: true,
            ),
            const SizedBox(height: 10),
            _actionButton(
              '3. Link Care Context & Auto-Notify',
              enabled: patient != null && _linkTokenController.text.isNotEmpty,
              onTap: _linkCareContext,
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFE8F5E9),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFC8E6C9)),
              ),
              child: const Row(
                children: [
                  Icon(Icons.check_circle_outline, color: Color(0xFF2E7D32), size: 20),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Automated Flow: ABDM Care Context Notify & Patient SMS are triggered automatically upon linking.',
                      style: TextStyle(
                        fontSize: 12,
                        color: Color(0xFF1B5E20),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            Text(
              _lastAction,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF6F8FA),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFD7E4F0)),
              ),
              child: SelectableText(
                _lastResponse,
                style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _readOnlyValue(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          border: OutlineInputBorder(),
        ),
        child: Text(value.isEmpty ? '-' : value),
      ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    bool readOnly = false,
  }) {
    return TextField(
      controller: controller,
      readOnly: readOnly,
      onChanged: (_) => setState(() {}),
      decoration: InputDecoration(
        labelText: label,
        border: OutlineInputBorder(),
      ),
    );
  }

  Widget _actionButton(
    String label, {
    required bool enabled,
    required Future<void> Function() onTap,
    bool outlined = false,
  }) {
    final busy = _callingApi && _activeAction == label;
    final child = Text(busy ? 'Calling...' : label);
    final onPressed = enabled && !_callingApi
        ? () async {
            setState(() {
              _callingApi = true;
              _activeAction = label;
            });
            try {
              await onTap();
            } catch (error) {
              _showResponse(label, {
                'ok': false,
                'error': error.toString().replaceFirst('Exception: ', ''),
              });
            } finally {
              if (mounted) {
                setState(() {
                  _callingApi = false;
                  _activeAction = '';
                });
              }
            }
          }
        : null;

    return SizedBox(
      height: 48,
      child: outlined
          ? OutlinedButton(onPressed: onPressed, child: child)
          : ElevatedButton(onPressed: onPressed, child: child),
    );
  }

  void _selectPatient(Map<String, dynamic> patient) {
    final next = Map<String, dynamic>.from(patient);
    setState(() {
      _selectedPatient = next;
      _requestId = '';
      _linkedAbhaAddress = '';
      _linkTokenController.clear();
      _patientReferenceController.text = _defaultPatientReference(next);
      _patientDisplayController.text =
          'OPD Visit - ${_text(next['name']).isEmpty ? 'Patient' : _text(next['name'])}';
      _careContextReferenceController.text = _newCareContextReference();
      _careContextDisplayController.text =
          'Prescription - ${DateTime.now().year}';
    });
  }

  Future<void> _generateLinkToken() async {
    final patient = _requirePatient();
    final response = await HipLinkingApiService.generateToken(
      _patientPayload(patient),
    );
    _requestId = _text(response['requestId']);
    _showResponse('Generate Link Token', response);
  }

  Future<void> _checkTokenCallback() async {
    final response = await HipLinkingApiService.fetchTokenCallback(_requestId);
    final token = _extractLinkToken(response);
    final abhaAddress = _extractCallbackAbhaAddress(response);
    if (token.isNotEmpty) {
      _linkTokenController.text = token;
    }
    if (abhaAddress.isNotEmpty) {
      _linkedAbhaAddress = abhaAddress;
    }
    _showResponse('Check Token Callback', response);
  }

  Future<void> _linkCareContext() async {
    final patient = _requirePatient();
    final abhaAddress = _resolvedAbhaAddress(patient);
    final abhaNumber = _normalizedAbhaNumber(patient);
    final linkToken = _required(_linkTokenController, 'Link Token');
    final patientReference = _required(
      _patientReferenceController,
      'Patient Reference Number',
    );
    final careContextRef = _required(
      _careContextReferenceController,
      'Care Context Reference Number',
    );
    final mobile = _text(patient['mobile']).replaceAll(RegExp(r'\D'), '').trim();

    // Step 1: Link Care Context
    final linkResponse = await HipLinkingApiService.linkCareContext({
      'hipId': HospitalConfig.hipId,
      'linkToken': linkToken,
      'abhaNumber': abhaNumber,
      'abhaAddress': abhaAddress,
      'AbhaNumber': abhaNumber,
      'AbhaAddress': abhaAddress,
      'patient': [_careContextPayload()],
    });

    final linkOk = linkResponse['ok'] == true ||
        linkResponse['statusCode'] == 200 ||
        linkResponse['statusCode'] == 202;

    if (!linkOk) {
      _showResponse('Link Care Context (Failed)', linkResponse);
      return;
    }

    final combinedResults = <String, dynamic>{
      '1_linkCareContext': linkResponse,
    };

    // Step 2: Automatically Notify ABDM Care Context
    try {
      final notifyResponse = await HipLinkingApiService.notifyContext({
        'hipId': HospitalConfig.hipId,
        'linkToken': linkToken,
        'mobile': mobile,
        'phoneNo': mobile,
        'notification': {
          'patient': {
            'id': abhaAddress,
            'mobile': mobile,
            'phoneNo': mobile,
          },
          'careContext': {
            'patientReference': patientReference,
            'careContextReference': careContextRef,
          },
          'hiTypes': [_selectedHiType],
          'date': DateTime.now().toUtc().toIso8601String(),
          'hip': {'id': HospitalConfig.hipId},
        },
      });
      combinedResults['2_notifyContext'] = notifyResponse;
    } catch (e) {
      combinedResults['2_notifyContext'] = {'ok': false, 'error': e.toString()};
    }

    // Step 3: Automatically Send SMS Notification (Deep Link)
    if (mobile.isNotEmpty) {
      try {
        final smsResponse = await HipLinkingApiService.notifySms({
          'hipId': HospitalConfig.hipId,
          'hipName': HospitalConfig.hospitalName,
          'phoneNo': mobile,
        });
        combinedResults['3_smsNotify'] = smsResponse;
      } catch (e) {
        combinedResults['3_smsNotify'] = {'ok': false, 'error': e.toString()};
      }
    } else {
      combinedResults['3_smsNotify'] = {
        'skipped': true,
        'reason': 'Patient mobile number not available for SMS notification',
      };
    }

    _showResponse('Link Care Context & Auto-Notify (Completed)', combinedResults);
  }

  Map<String, dynamic> _patientPayload(Map<String, dynamic> patient) {
    final year = _yearFromPatient(patient);
    return {
      'hipId': HospitalConfig.hipId,
      'AbhaNumber': _normalizedAbhaNumber(patient),
      'AbhaAddress': _resolvedAbhaAddress(patient),
      'name': _text(patient['name']),
      'gender': _genderForApi(_text(patient['gender'])),
      'yearOfBirth': year,
    };
  }

  String _defaultPatientReference(Map<String, dynamic> patient) {
    final name = _text(patient['name']);
    if (name.isNotEmpty) {
      return name;
    }
    final uhid = _text(patient['uhid']);
    if (uhid.isNotEmpty) {
      return uhid;
    }
    return _resolvedAbhaAddress(patient);
  }

  String _newCareContextReference() {
    final random = Random();
    String hex(int length) => List.generate(
          length,
          (_) => random.nextInt(16).toRadixString(16),
        ).join();
    return '${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}';
  }

  String _resolvedAbhaAddress(Map<String, dynamic> patient) {
    final linked = _linkedAbhaAddress.trim().toLowerCase();
    if (linked.isNotEmpty) {
      return linked;
    }
    return _text(patient['AbhaAddress']).toLowerCase();
  }

  String _normalizedAbhaNumber(Map<String, dynamic> patient) {
    return _text(patient['AbhaNumber']).replaceAll(RegExp(r'\D'), '');
  }

  Map<String, dynamic> _careContextPayload() {
    return {
      'referenceNumber': _required(
        _patientReferenceController,
        'Patient Reference Number',
      ),
      'display': _required(_patientDisplayController, 'Patient Display'),
      'careContexts': [
        {
          'referenceNumber': _required(
            _careContextReferenceController,
            'Care Context Reference Number',
          ),
          'display': _required(
            _careContextDisplayController,
            'Care Context Display',
          ),
        },
      ],
      'hiType': _selectedHiType,
      'count': 1,
    };
  }

  Map<String, dynamic> _requirePatient() {
    final patient = _selectedPatient;
    if (patient == null) {
      throw Exception('Select a patient first');
    }
    return patient;
  }

  String _required(TextEditingController controller, String label) {
    final value = controller.text.trim();
    if (value.isEmpty) {
      throw Exception('$label is required');
    }
    return value;
  }

  String _text(Object? value) => value?.toString().trim() ?? '';

  String _patientKey(Map<String, dynamic>? patient) {
    if (patient == null) return '';
    return [
      _text(patient['AbhaAddress']).toLowerCase(),
      _text(patient['AbhaNumber']),
      _text(patient['mobile']),
    ].where((part) => part.isNotEmpty).join('|');
  }

  String _genderForApi(String value) {
    final normalized = value.trim().toLowerCase();
    if (normalized == 'male') return 'M';
    if (normalized == 'female') return 'F';
    if (normalized == 'other') return 'O';
    return value.isEmpty ? 'M' : value;
  }

  int _yearFromPatient(Map<String, dynamic> patient) {
    final year = int.tryParse(_text(patient['yearOfBirth']));
    if (year != null) return year;
    final dob = _text(patient['dob']);
    final match = RegExp(r'(\d{4})').firstMatch(dob);
    if (match != null) {
      return int.tryParse(match.group(1)!) ?? DateTime.now().year;
    }
    return DateTime.now().year;
  }

  String _extractLinkToken(Map<String, dynamic> response) {
    final direct = _text(response['linkToken']);
    if (direct.isNotEmpty) return direct;
    final payload = response['payload'];
    if (payload is Map) {
      return _text(payload['linkToken']).isNotEmpty
          ? _text(payload['linkToken'])
          : _text(payload['linkingToken']);
    }
    return '';
  }

  String _extractCallbackAbhaAddress(Map<String, dynamic> response) {
    final direct = _text(response['abhaAddress']);
    if (direct.isNotEmpty) return direct.toLowerCase();
    final payload = response['payload'];
    if (payload is Map) {
      final fromPayload = _text(payload['abhaAddress']).isNotEmpty
          ? _text(payload['abhaAddress'])
          : _text(payload['AbhaAddress']);
      if (fromPayload.isNotEmpty) {
        return fromPayload.toLowerCase();
      }
    }
    return '';
  }

  void _showResponse(String action, Map<String, dynamic> response) {
    setState(() {
      _lastAction = action;
      _lastResponse = const JsonEncoder.withIndent('  ').convert(response);
    });
  }
}
