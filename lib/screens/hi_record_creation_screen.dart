import 'dart:io';

import 'package:flutter/material.dart';
import '../services/hip_linking_workflow_service.dart';

double _maxNum(double a, double b) => a > b ? a : b;

// Form Types supported
// 1. OP Consultation Record
// 2. Prescription Record
// 3. Wellness Record
// 4. Diagnostic Report
// 5. Immunization Record
// 6. Invoice Record
// 7. Discharge Summary

class HiRecordCreationScreen extends StatefulWidget {
  final String hiType;
  final Map<String, dynamic> patientProfile;

  const HiRecordCreationScreen({
    super.key,
    required this.hiType,
    required this.patientProfile,
  });

  @override
  State<HiRecordCreationScreen> createState() => _HiRecordCreationScreenState();
}

class _HiRecordCreationScreenState extends State<HiRecordCreationScreen> {
  final _formKey = GlobalKey<FormState>();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text('New ${widget.hiType}'),
        elevation: 0,
        backgroundColor: theme.scaffoldBackgroundColor,
        foregroundColor: const Color(0xFF212121),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _PatientInfoCard(patientProfile: widget.patientProfile),
              const SizedBox(height: 24),
              Form(key: _formKey, child: _buildHIForm(widget.hiType)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHIForm(String type) {
    switch (type) {
      case 'OP Consultation Record':
        return _OpConsultationForm(onSaved: _handleSave, onLink: _handleLink);
      case 'Prescription Record':
        return _PrescriptionForm(onSaved: _handleSave, onLink: _handleLink);
      case 'Wellness Record':
        return _WellnessForm(onSaved: _handleSave, onLink: _handleLink);
      case 'Diagnostic Report':
        return _DiagnosticReportForm(onSaved: _handleSave, onLink: _handleLink);
      case 'Immunization Record':
        return _ImmunizationForm(onSaved: _handleSave, onLink: _handleLink);
      case 'Invoice Record':
        return _InvoiceForm(onSaved: _handleSave, onLink: _handleLink);
      case 'Discharge Summary':
        return _DischargeSummaryForm(onSaved: _handleSave, onLink: _handleLink);
      default:
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Text('Form for "$type" is under development.'),
          ),
        );
    }
  }

  Future<void> _handleSave(Map<String, dynamic> data) async {
    if (_formKey.currentState?.validate() ?? false) {
      try {
        final file = await _saveLocalDoc(data);
        if (!mounted) return;
        _showToast(context, 'Local draft saved: ${file.path}');
        Navigator.pop(context);
      } catch (error) {
        if (!mounted) return;
        _showErrorToast(context, 'Could not save local draft: $error');
      }
    } else {
      _showErrorToast(context, 'Please fix the validation errors in the form.');
    }
  }

  void _handleLink(Map<String, dynamic> data) async {
    if (_formKey.currentState?.validate() ?? false) {
      File? savedFile;
      try {
        savedFile = await _saveLocalDoc(data);
      } catch (error) {
        if (!mounted) return;
        _showErrorToast(context, 'Could not save local draft: $error');
        return;
      }

      if (!mounted) return;
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => const Center(
          child: Card(
            child: Padding(
              padding: EdgeInsets.all(32.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text(
                    'Running HIP linking API sequence...',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'Waiting for ABDM approval and polling the callback every 3 seconds.',
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ),
      );

      await HipLinkingWorkflowService.runRecordLinking(
        patientProfile: widget.patientProfile,
        selectedHiType: widget.hiType,
        formattedRecordText: _buildCareContextDisplay(),
      );

      if (mounted) {
        Navigator.pop(context); // Close loading dialog
        _showToast(
          context,
          'HIP linking sequence completed. Local draft: ${savedFile.path}',
        );
        Navigator.pop(context); // Return to home screen
      }
    } else {
      _showErrorToast(context, 'Please fix the validation errors in the form.');
    }
  }

  Future<File> _saveLocalDoc(Map<String, dynamic> recordData) async {
    final patient = widget.patientProfile;
    final patientName = _firstText([
      patient['name'],
      patient['fullName'],
      patient['patientName'],
      'patient',
    ]);
    final abhaId = _firstText([
      patient['AbhaAddress'],
      patient['preferredAbhaAddress'],
      patient['healthId'],
      patient['healthIdNumber'],
      patient['AbhaNumber'],
      patient['abhaNumber'],
      patient['uhid'],
      'unknown_abha',
    ]);
    final patientNumber = _firstText([
      patient['healthIdNumber'],
      patient['AbhaNumber'],
      patient['abhaNumber'],
      patient['uhid'],
      patient['mobile'],
      'unknown_patient',
    ]);

    final appFolder = _localRecordRoot();
    final patientFolderName =
        '${_sanitizePathSegment(abhaId)}_${_sanitizePathSegment(patientName)}';
    final patientFolder = Directory('${appFolder.path}/$patientFolderName');
    await patientFolder.create(recursive: true);

    final fileName =
        '${_sanitizePathSegment(widget.hiType)}_${_sanitizePathSegment(patientNumber)}.txt';
    final file = File('${patientFolder.path}/$fileName');
    await file.writeAsString(_buildTextDocument(recordData), flush: true);
    return file;
  }

  String _buildTextDocument(Map<String, dynamic> recordData) {
    final patient = widget.patientProfile;
    final savedAt = DateTime.now().toLocal().toString().split('.').first;
    final buffer = StringBuffer()
      ..writeln('Health Information Record')
      ..writeln('=========================')
      ..writeln('Type: ${widget.hiType}')
      ..writeln('Saved At: $savedAt')
      ..writeln()
      ..writeln('--- Patient Details ---');

    final patientRows = <String, Object?>{
      'Name': _firstText([patient['name'], patient['fullName']]),
      'ABHA Address': _firstText([
        patient['AbhaAddress'],
        patient['preferredAbhaAddress'],
        patient['healthId'],
      ]),
      'ABHA Number': _firstText([
        patient['healthIdNumber'],
        patient['AbhaNumber'],
        patient['abhaNumber'],
      ]),
      'Mobile': patient['mobile'],
      'Gender': patient['gender'],
      'DOB / YOB': _firstText([patient['dob'], patient['yearOfBirth']]),
      'UHID': patient['uhid'],
    };
    
    for (final entry in patientRows.entries) {
      buffer.writeln('${entry.key}: ${_valueText(entry.value)}');
    }

    buffer
      ..writeln()
      ..writeln('--- Record Data ---')
      ..writeln()
      ..write(_textForValue(recordData, 0));
    return buffer.toString();
  }

  String _buildCareContextDisplay() {
    final now = DateTime.now().toLocal();
    final timestamp = [
      now.year.toString().padLeft(4, '0'),
      now.month.toString().padLeft(2, '0'),
      now.day.toString().padLeft(2, '0'),
      now.hour.toString().padLeft(2, '0'),
      now.minute.toString().padLeft(2, '0'),
      now.second.toString().padLeft(2, '0'),
    ].join('-');
    return _singleLineHyphenText('${widget.hiType}-$timestamp');
  }
}

Directory _localRecordRoot() {
  final current = Directory.current;
  if (File('${current.path}/pubspec.yaml').existsSync()) {
    return current;
  }

  var directory = File(Platform.resolvedExecutable).parent;
  while (directory.parent.path != directory.path) {
    if (directory.path.endsWith('.app')) {
      return directory.parent;
    }
    directory = directory.parent;
  }

  return current;
}

String _firstText(Iterable<Object?> values) {
  for (final value in values) {
    final text = value?.toString().trim() ?? '';
    if (text.isNotEmpty && text.toLowerCase() != 'null') {
      return text;
    }
  }
  return '';
}

String _sanitizePathSegment(String value) {
  final normalized = value.trim().replaceAll(RegExp(r'\s+'), '_');
  final cleaned = normalized.replaceAll(RegExp(r'[^A-Za-z0-9._@-]'), '_');
  final compact = cleaned.replaceAll(RegExp(r'_+'), '_');
  return compact.isEmpty ? 'unknown' : compact;
}

String _valueText(Object? value) {
  if (value == null) return '';
  final text = value.toString().trim();
  return text.isEmpty ? '-' : text;
}

String _singleLineHyphenText(String value) {
  final cleaned = value
      .replaceAll(RegExp(r'[^A-Za-z0-9-]+'), '-')
      .replaceAll(RegExp(r'-+'), '-')
      .replaceAll(RegExp(r'^-+|-+$'), '');
  return cleaned.isEmpty ? 'Health-Record' : cleaned;
}

String _humanizeKey(String key) {
  final spaced = key
      .replaceAll('_', ' ')
      .replaceAllMapped(RegExp(r'([a-z0-9])([A-Z])'), (m) => '${m[1]} ${m[2]}');
  return spaced
      .split(' ')
      .where((part) => part.isNotEmpty)
      .map((part) => part[0].toUpperCase() + part.substring(1))
      .join(' ');
}

String _textForValue(Object? value, int indent) {
  final prefix = '  ' * indent;
  if (value is Map) {
    if (value.isEmpty) return '$prefix-\n';
    final buffer = StringBuffer();
    for (final entry in value.entries) {
      final key = _humanizeKey(entry.key.toString());
      if (entry.value is Map || entry.value is List) {
        buffer.writeln('$prefix$key:');
        buffer.write(_textForValue(entry.value, indent + 1));
      } else {
        buffer.writeln('$prefix$key: ${_valueText(entry.value)}');
      }
    }
    return buffer.toString();
  }

  if (value is List) {
    if (value.isEmpty) return '$prefix-\n';
    final buffer = StringBuffer();
    for (var i = 0; i < value.length; i++) {
      if (value[i] is Map || value[i] is List) {
        buffer.writeln('$prefix- Item ${i + 1}:');
        buffer.write(_textForValue(value[i], indent + 1));
      } else {
        buffer.writeln('$prefix- ${_valueText(value[i])}');
      }
    }
    return buffer.toString();
  }

  return '$prefix$value\n';
}

// Custom animated sliding top toast
void _showToast(BuildContext context, String message) {
  final overlayState = Overlay.of(context);
  late OverlayEntry overlayEntry;
  overlayEntry = OverlayEntry(
    builder: (context) => _SlideToast(
      message: message,
      isError: false,
      onDismiss: () => overlayEntry.remove(),
    ),
  );
  overlayState.insert(overlayEntry);
}

void _showErrorToast(BuildContext context, String message) {
  final overlayState = Overlay.of(context);
  late OverlayEntry overlayEntry;
  overlayEntry = OverlayEntry(
    builder: (context) => _SlideToast(
      message: message,
      isError: true,
      onDismiss: () => overlayEntry.remove(),
    ),
  );
  overlayState.insert(overlayEntry);
}

class _SlideToast extends StatefulWidget {
  final String message;
  final bool isError;
  final VoidCallback onDismiss;

  const _SlideToast({
    required this.message,
    required this.isError,
    required this.onDismiss,
  });

  @override
  State<_SlideToast> createState() => _SlideToastState();
}

class _SlideToastState extends State<_SlideToast>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<Offset> _offsetAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 400),
      vsync: this,
    );

    _offsetAnimation = Tween<Offset>(
      begin: const Offset(0.0, -1.5),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOutBack));

    _controller.forward();

    // Auto dismiss after 3 seconds
    Future.delayed(const Duration(milliseconds: 3500), () {
      if (mounted) {
        _controller.reverse().then((_) {
          widget.onDismiss();
        });
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    return Positioned(
      top: mediaQuery.padding.top + 12,
      left: 16,
      right: 16,
      child: SlideTransition(
        position: _offsetAnimation,
        child: Material(
          color: Colors.transparent,
          child: Center(
            child: Container(
              constraints: const BoxConstraints(maxWidth: 600),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
              decoration: BoxDecoration(
                color: widget.isError
                    ? const Color(0xFFFAFAFA)
                    : const Color(0xFFFAFAFA),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: widget.isError
                      ? const Color(0xFFD32F2F)
                      : const Color(0xFF00A86B),
                  width: 1.5,
                ),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x0C0D47A1),
                    offset: Offset(0, 4),
                    blurRadius: 16,
                  ),
                ],
              ),
              child: Row(
                children: [
                  Icon(
                    widget.isError
                        ? Icons.error_outline
                        : Icons.check_circle_outline_rounded,
                    color: widget.isError
                        ? const Color(0xFFD32F2F)
                        : const Color(0xFF00A86B),
                    size: 24,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      widget.message,
                      style: TextStyle(
                        color: widget.isError
                            ? const Color(0xFFD32F2F)
                            : const Color(0xFF00A86B),
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// Beautiful Patient Info Banner
class _PatientInfoCard extends StatelessWidget {
  final Map<String, dynamic> patientProfile;

  const _PatientInfoCard({required this.patientProfile});

  @override
  Widget build(BuildContext context) {
    final name =
        patientProfile['name']?.toString() ??
        patientProfile['fullName']?.toString() ??
        'SAURAV KUMAR';
    final mobile = patientProfile['mobile']?.toString() ?? '8298540343';
    final abhaAddress =
        patientProfile['preferredAbhaAddress']?.toString() ??
        patientProfile['AbhaAddress']?.toString() ??
        'saurav_50505@sbx';
    final rawAbhaNumber =
        patientProfile['healthIdNumber']?.toString() ??
        patientProfile['AbhaNumber']?.toString() ??
        '91-5054-2836-2451';
    final gender = patientProfile['gender']?.toString() ?? 'Male';
    final yob = patientProfile['yearOfBirth']?.toString() ?? '2000';
    final dob = patientProfile['dob']?.toString() ?? '2000-11-05';
    final uhid = patientProfile['uhid']?.toString() ?? 'PRN00058';

    // Mask helper
    String formatAbhaNumber(String val) {
      if (val.contains('-') || val.length < 14) return val;
      return '${val.substring(0, 2)}-${val.substring(2, 6)}-${val.substring(6, 10)}-${val.substring(10)}';
    }

    final cleanAbhaNumber = formatAbhaNumber(rawAbhaNumber);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20.0),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final isDesktop = constraints.maxWidth > 750;
            final avatarWidget = CircleAvatar(
              radius: 28,
              backgroundColor: const Color(0xFFE3F2FD),
              child: Text(
                name.isNotEmpty ? name[0].toUpperCase() : 'P',
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF1976D2),
                ),
              ),
            );

            final nameAndAddressWidget = Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF212121),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  abhaAddress,
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xFF212121),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'ABHA: $cleanAbhaNumber',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF1976D2),
                  ),
                ),
              ],
            );

            final gridDetails = Wrap(
              spacing: 24,
              runSpacing: 12,
              children: [
                _buildDetailItem('Gender', gender),
                _buildDetailItem('DOB / YOB', dob.isNotEmpty ? dob : yob),
                _buildDetailItem('Mobile', mobile),
                _buildDetailItem('UHID', uhid),
              ],
            );

            if (isDesktop) {
              return Row(
                children: [
                  avatarWidget,
                  const SizedBox(width: 20),
                  Expanded(flex: 4, child: nameAndAddressWidget),
                  const SizedBox(
                    height: 50,
                    child: VerticalDivider(color: Color(0xFFE3F2FD), width: 40),
                  ),
                  Expanded(flex: 6, child: gridDetails),
                ],
              );
            } else {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      avatarWidget,
                      const SizedBox(width: 16),
                      Expanded(child: nameAndAddressWidget),
                    ],
                  ),
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16.0),
                    child: Divider(color: Color(0xFFE3F2FD)),
                  ),
                  gridDetails,
                ],
              );
            }
          },
        ),
      ),
    );
  }

  Widget _buildDetailItem(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label.toUpperCase(),
          style: const TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w800,
            color: Color(0xFF212121),
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: Color(0xFF212121),
          ),
        ),
      ],
    );
  }
}

// ----------------------------------------------------
// 1. OP Consultation Record Form
// ----------------------------------------------------
class _OpConsultationForm extends StatefulWidget {
  final Function(Map<String, dynamic>) onSaved;
  final Function(Map<String, dynamic>) onLink;

  const _OpConsultationForm({required this.onSaved, required this.onLink});

  @override
  State<_OpConsultationForm> createState() => _OpConsultationFormState();
}

class _OpConsultationFormState extends State<_OpConsultationForm> {
  final _tempController = TextEditingController();
  final _heightController = TextEditingController();
  final _weightController = TextEditingController();
  final _bmiController = TextEditingController();
  final _respRateController = TextEditingController();
  final _heartRateController = TextEditingController();
  final _spo2Controller = TextEditingController();
  final _bpSysController = TextEditingController();
  final _bpDiaController = TextEditingController();

  final List<String> _complaints = [];
  final List<String> _allergies = [];
  final List<String> _medicalHistory = [];
  final List<String> _investigations = [];
  final List<String> _procedures = [];
  final List<String> _familyHistory = [];
  final List<Map<String, String>> _medications = [];

  final _complaintInput = TextEditingController();
  final _allergyInput = TextEditingController();
  final _historyInput = TextEditingController();
  final _investigationInput = TextEditingController();
  final _procedureInput = TextEditingController();
  final _familyHistoryInput = TextEditingController();
  
  // Follow Up
  final _followUpReasonController = TextEditingController();
  final _followUpDateController = TextEditingController();
  final _followUpTimeController = TextEditingController();

  // Medication Form
  final _medNameController = TextEditingController();
  final _dosePatternController = TextEditingController();
  String _selectedRoute = 'Oral';
  String _selectedTiming = 'After Food';
  final _instructionsController = TextEditingController();

  final List<String> _routes = ['Oral', 'Intravenous', 'Intramuscular', 'Subcutaneous', 'Topical', 'Inhalation', 'Ophthalmic', 'Nasal'];
  final List<String> _timings = ['Before Food', 'After Food', 'With Food', 'Empty Stomach', 'As Needed', 'At Bedtime'];

  void _addMedication() {
    final name = _medNameController.text.trim();
    final dose = _dosePatternController.text.trim();
    if (name.isEmpty || dose.isEmpty) return;
    setState(() {
      _medications.add({
        'name': name,
        'dose': dose,
        'route': _selectedRoute,
        'timing': _selectedTiming,
        'instructions': _instructionsController.text.trim(),
      });
      _medNameController.clear();
      _dosePatternController.clear();
      _instructionsController.clear();
    });
  }

  @override
  void initState() {
    super.initState();
    _heightController.addListener(_calculateBmi);
    _weightController.addListener(_calculateBmi);
    
    final now = DateTime.now();
    _followUpDateController.text = "${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}";
    _followUpTimeController.text = "${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}";
  }

  @override
  void dispose() {
    _tempController.dispose();
    _heightController.dispose();
    _weightController.dispose();
    _bmiController.dispose();
    _respRateController.dispose();
    _heartRateController.dispose();
    _spo2Controller.dispose();
    _bpSysController.dispose();
    _bpDiaController.dispose();
    
    _complaintInput.dispose();
    _allergyInput.dispose();
    _historyInput.dispose();
    _investigationInput.dispose();
    _procedureInput.dispose();
    _familyHistoryInput.dispose();
    
    _followUpReasonController.dispose();
    _followUpDateController.dispose();
    _followUpTimeController.dispose();
    
    _medNameController.dispose();
    _dosePatternController.dispose();
    _instructionsController.dispose();
    super.dispose();
  }

  void _calculateBmi() {
    final h = double.tryParse(_heightController.text);
    final w = double.tryParse(_weightController.text);
    if (h != null && w != null && h > 0) {
      final bmi = w / ((h / 100) * (h / 100));
      _bmiController.text = bmi.toStringAsFixed(1);
    } else {
      _bmiController.text = '';
    }
  }

  void _autoFill() {
    setState(() {
      _complaints.clear();
      _complaints.add('Cold');

      _bpSysController.text = '110';
      _bpDiaController.text = '80';
      _heartRateController.text = '110';
      _respRateController.text = '38';
      _spo2Controller.text = '99';
      _tempController.text = '99';

      _heightController.text = '170';
      _weightController.text = '90';
      _calculateBmi();

      _allergies.clear();
      _allergies.add('Dust');

      _medicalHistory.clear();
      _medicalHistory.add('Diabetes');

      _investigations.clear();
      _investigations.add('CBC');

      _procedures.clear();
      _procedures.add('Test');

      _medications.clear();
      _medications.add({
        'name': 'Dolo',
        'dose': '1-0-1',
        'route': 'Oral',
        'timing': 'After Food',
        'instructions': 'Fever',
      });

      _familyHistory.clear();
      _familyHistory.add('Diabetes');

      final now = DateTime.now();
      _followUpReasonController.text = 'Review';
      _followUpDateController.text = "${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}";
      _followUpTimeController.text = "${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}";
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Align(
          alignment: Alignment.centerRight,
          child: ElevatedButton.icon(
            onPressed: _autoFill,
            icon: const Icon(Icons.flash_on),
            label: const Text('Auto Fill'),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFFDE047), foregroundColor: const Color(0xFF1E293B)),
          ),
        ),
        const SizedBox(height: 12),
        _buildSectionTitle('Physical Examination (Vitals)'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final isWide = constraints.maxWidth > 550;
                final row1 = [
                  _buildFormTextColumn(
                    'Temperature (°F)',
                    TextFormField(
                      controller: _tempController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(hintText: 'e.g. 98.6'),
                    ),
                  ),
                  _buildFormTextColumn(
                    'Height (cm)',
                    TextFormField(
                      controller: _heightController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(hintText: 'e.g. 170'),
                    ),
                  ),
                  _buildFormTextColumn(
                    'Weight (kg)',
                    TextFormField(
                      controller: _weightController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(hintText: 'e.g. 70'),
                    ),
                  ),
                  _buildFormTextColumn(
                    'BMI (auto)',
                    TextFormField(
                      controller: _bmiController,
                      readOnly: true,
                      enabled: false,
                      decoration: InputDecoration(
                        hintText: '--',
                        fillColor: Colors.grey.shade100,
                      ),
                    ),
                  ),
                ];

                final row2 = [
                  _buildFormTextColumn(
                    'BP Systolic',
                    TextFormField(
                      controller: _bpSysController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(hintText: 'e.g. 120'),
                    ),
                  ),
                  _buildFormTextColumn(
                    'BP Diastolic',
                    TextFormField(
                      controller: _bpDiaController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(hintText: 'e.g. 80'),
                    ),
                  ),
                  _buildFormTextColumn(
                    'Resp Rate (/min)',
                    TextFormField(
                      controller: _respRateController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(hintText: 'e.g. 18'),
                    ),
                  ),
                  _buildFormTextColumn(
                    'Heart Rate (/min)',
                    TextFormField(
                      controller: _heartRateController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(hintText: 'e.g. 72'),
                    ),
                  ),
                ];
                
                final row3 = [
                  _buildFormTextColumn(
                    'SpO2 (%)',
                    TextFormField(
                      controller: _spo2Controller,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(hintText: 'e.g. 98'),
                    ),
                  ),
                  _buildFormTextColumn('', const SizedBox.shrink()),
                  _buildFormTextColumn('', const SizedBox.shrink()),
                  _buildFormTextColumn('', const SizedBox.shrink()),
                ];

                if (isWide) {
                  return Column(
                    children: [
                      Row(
                        children: row1.map((f) => Expanded(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 8.0), child: f))).toList(),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: row2.map((f) => Expanded(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 8.0), child: f))).toList(),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: row3.map((f) => Expanded(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 8.0), child: f))).toList(),
                      ),
                    ],
                  );
                } else {
                  return Column(children: [...row1, ...row2, ...row3]);
                }
              },
            ),
          ),
        ),
        const SizedBox(height: 20),
        _buildListManagerCard(
          'Chief Complaints',
          _complaints,
          _complaintInput,
          'Enter complaint...',
        ),
        const SizedBox(height: 20),
        _buildListManagerCard(
          'Allergies',
          _allergies,
          _allergyInput,
          'Enter allergy...',
        ),
        const SizedBox(height: 20),
        _buildListManagerCard(
          'Medical History',
          _medicalHistory,
          _historyInput,
          'Enter medical history...',
        ),
        const SizedBox(height: 20),
        _buildListManagerCard(
          'Investigation Advice',
          _investigations,
          _investigationInput,
          'Enter investigation...',
        ),
        const SizedBox(height: 20),
        _buildListManagerCard(
          'Procedures',
          _procedures,
          _procedureInput,
          'Enter procedure...',
        ),
        const SizedBox(height: 20),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('Medications', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                const SizedBox(height: 16),
                if (_medications.isNotEmpty)
                  ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _medications.length,
                    separatorBuilder: (_, __) => const Divider(),
                    itemBuilder: (context, index) {
                      final m = _medications[index];
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text('${m['name']} (${m['dose']})', style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text('${m['route']} | ${m['timing']}\n${m['instructions']}'),
                        trailing: IconButton(
                          icon: const Icon(Icons.delete, color: Colors.red),
                          onPressed: () => setState(() => _medications.removeAt(index)),
                        ),
                      );
                    },
                  ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    SizedBox(
                      width: 200,
                      child: TextFormField(
                        controller: _medNameController,
                        decoration: const InputDecoration(labelText: 'Drug Name', hintText: 'e.g. Paracetamol'),
                      ),
                    ),
                    SizedBox(
                      width: 120,
                      child: TextFormField(
                        controller: _dosePatternController,
                        decoration: const InputDecoration(labelText: 'Dose', hintText: 'e.g. 1-0-1'),
                      ),
                    ),
                    SizedBox(
                      width: 150,
                      child: DropdownButtonFormField<String>(
                        value: _selectedRoute,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Route'),
                        items: _routes.map((r) => DropdownMenuItem(value: r, child: Text(r))).toList(),
                        onChanged: (v) => setState(() => _selectedRoute = v!),
                      ),
                    ),
                    SizedBox(
                      width: 150,
                      child: DropdownButtonFormField<String>(
                        value: _selectedTiming,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Timing'),
                        items: _timings.map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
                        onChanged: (v) => setState(() => _selectedTiming = v!),
                      ),
                    ),
                    SizedBox(
                      width: 200,
                      child: TextFormField(
                        controller: _instructionsController,
                        decoration: const InputDecoration(labelText: 'Instructions', hintText: 'e.g. After Food'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Align(
                  alignment: Alignment.centerRight,
                  child: ElevatedButton.icon(
                    onPressed: _addMedication,
                    icon: const Icon(Icons.add),
                    label: const Text('Add Medication'),
                    style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFE3F2FD), foregroundColor: const Color(0xFF1976D2)),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        _buildListManagerCard(
          'Family History',
          _familyHistory,
          _familyHistoryInput,
          'Enter family history (e.g. Diabetes - Father)...',
        ),
        const SizedBox(height: 20),
        _buildSectionTitle('Follow Up'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _followUpReasonController,
                    decoration: const InputDecoration(labelText: 'Reason for Follow Up', hintText: 'e.g. Review'),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: TextFormField(
                    controller: _followUpDateController,
                    decoration: const InputDecoration(labelText: 'Date', hintText: 'YYYY-MM-DD'),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: TextFormField(
                    controller: _followUpTimeController,
                    decoration: const InputDecoration(labelText: 'Time', hintText: 'HH:MM'),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 32),
        _buildFormActionButtons(
          onSave: () => widget.onSaved(_collectData()),
          onLink: () => widget.onLink(_collectData()),
        ),
      ],
    );
  }

  Map<String, dynamic> _collectData() {
    return {
      'vitals': {
        'temperature': _tempController.text,
        'height': _heightController.text,
        'weight': _weightController.text,
        'bmi': _bmiController.text,
        'bpSystolic': _bpSysController.text,
        'bpDiastolic': _bpDiaController.text,
        'respRate': _respRateController.text,
        'heartRate': _heartRateController.text,
        'spO2': _spo2Controller.text,
      },
      'chiefComplaints': _complaints,
      'draftChiefComplaints': _complaintInput.text,
      'allergies': _allergies,
      'draftAllergy': _allergyInput.text,
      'medicalHistory': _medicalHistory,
      'draftMedicalHistory': _historyInput.text,
      'investigationAdvice': _investigations,
      'draftInvestigationAdvice': _investigationInput.text,
      'procedures': _procedures,
      'draftProcedure': _procedureInput.text,
      'medications': _medications,
      'familyHistory': _familyHistory,
      'draftFamilyHistory': _familyHistoryInput.text,
      'followUp': {
        'reason': _followUpReasonController.text,
        'date': _followUpDateController.text,
        'time': _followUpTimeController.text,
      }
    };
  }
}

// ----------------------------------------------------
// 2. Prescription Record Form
// ----------------------------------------------------
class _PrescriptionForm extends StatefulWidget {
  final Function(Map<String, dynamic>) onSaved;
  final Function(Map<String, dynamic>) onLink;

  const _PrescriptionForm({required this.onSaved, required this.onLink});

  @override
  State<_PrescriptionForm> createState() => _PrescriptionFormState();
}

class _PrescriptionFormState extends State<_PrescriptionForm> {
  final List<Map<String, String>> _medications = [];

  final _medNameController = TextEditingController();
  final _dosePatternController = TextEditingController();
  String _selectedRoute = 'Oral';
  String _selectedTiming = 'After Food';
  final _instructionsController = TextEditingController();

  final List<String> _routes = [
    'Oral',
    'Intravenous',
    'Intramuscular',
    'Subcutaneous',
    'Topical',
    'Inhalation',
    'Ophthalmic',
    'Nasal',
  ];

  final List<String> _timings = [
    'Before Food',
    'After Food',
    'With Food',
    'Empty Stomach',
    'As Needed',
    'At Bedtime',
  ];

  void _addMedication() {
    final name = _medNameController.text.trim();
    final dose = _dosePatternController.text.trim();
    if (name.isEmpty || dose.isEmpty) return;

    setState(() {
      _medications.add({
        'name': name,
        'dose': dose,
        'route': _selectedRoute,
        'timing': _selectedTiming,
        'instructions': _instructionsController.text.trim(),
      });
      _medNameController.clear();
      _dosePatternController.clear();
      _instructionsController.clear();
    });
  }

  @override
  void dispose() {
    _medNameController.dispose();
    _dosePatternController.dispose();
    _instructionsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildSectionTitle('Add Medication'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                LayoutBuilder(
                  builder: (context, constraints) {
                    final isWide = constraints.maxWidth > 550;
                    final row1 = [
                      _buildFormTextColumn(
                        'Medicine Name (SNOMED / Free Text)',
                        TextFormField(
                          controller: _medNameController,
                          decoration: const InputDecoration(
                            hintText: 'e.g. Paracetamol 500mg',
                          ),
                        ),
                      ),
                      _buildFormTextColumn(
                        'Dose Pattern',
                        TextFormField(
                          controller: _dosePatternController,
                          decoration: const InputDecoration(
                            hintText: 'e.g. 1-0-1',
                          ),
                        ),
                      ),
                    ];
                    if (isWide) {
                      return Row(
                        children: row1
                            .map(
                              (f) => Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8.0,
                                  ),
                                  child: f,
                                ),
                              ),
                            )
                            .toList(),
                      );
                    } else {
                      return Column(children: row1);
                    }
                  },
                ),
                const SizedBox(height: 12),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final isWide = constraints.maxWidth > 550;
                    final row2 = [
                      _buildFormTextColumn(
                        'Route',
                        DropdownButtonFormField<String>(
                          initialValue: _selectedRoute,
                          items: _routes
                              .map(
                                (r) =>
                                    DropdownMenuItem(value: r, child: Text(r)),
                              )
                              .toList(),
                          onChanged: (val) =>
                              setState(() => _selectedRoute = val!),
                        ),
                      ),
                      _buildFormTextColumn(
                        'Timing / Method',
                        DropdownButtonFormField<String>(
                          initialValue: _selectedTiming,
                          items: _timings
                              .map(
                                (t) =>
                                    DropdownMenuItem(value: t, child: Text(t)),
                              )
                              .toList(),
                          onChanged: (val) =>
                              setState(() => _selectedTiming = val!),
                        ),
                      ),
                    ];
                    if (isWide) {
                      return Row(
                        children: row2
                            .map(
                              (f) => Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8.0,
                                  ),
                                  child: f,
                                ),
                              ),
                            )
                            .toList(),
                      );
                    } else {
                      return Column(children: row2);
                    }
                  },
                ),
                const SizedBox(height: 12),
                _buildFormTextColumn(
                  'Special Instructions / Reason',
                  TextFormField(
                    controller: _instructionsController,
                    decoration: const InputDecoration(
                      hintText: 'e.g. For fever & body ache',
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Align(
                  alignment: Alignment.centerRight,
                  child: ElevatedButton.icon(
                    onPressed: _addMedication,
                    icon: const Icon(Icons.add),
                    label: const Text('Add Medication'),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),
        _buildSectionTitle('Medication Table'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: _medications.isEmpty
                ? const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 24.0),
                      child: Text(
                        'No medications added yet.',
                        style: TextStyle(
                          color: Color(0xFF212121),
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ),
                  )
                : ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _medications.length,
                    separatorBuilder: (context, index) =>
                        const Divider(color: Color(0xFFE3F2FD)),
                    itemBuilder: (context, index) {
                      final med = _medications[index];
                      return Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  med['name']!,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFF212121),
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Dose: ${med['dose']} | Route: ${med['route']} | Timing: ${med['timing']}',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    color: Color(0xFF212121),
                                  ),
                                ),
                                if (med['instructions']!.isNotEmpty) ...[
                                  const SizedBox(height: 2),
                                  Text(
                                    'Instructions: ${med['instructions']}',
                                    style: const TextStyle(
                                      fontSize: 13,
                                      fontStyle: FontStyle.italic,
                                      color: Color(0xFF212121),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          IconButton(
                            icon: const Icon(
                              Icons.delete_outline,
                              color: Color(0xFFD32F2F),
                            ),
                            onPressed: () =>
                                setState(() => _medications.removeAt(index)),
                          ),
                        ],
                      );
                    },
                  ),
          ),
        ),
        const SizedBox(height: 32),
        _buildFormActionButtons(
          onSave: () => widget.onSaved(_collectData()),
          onLink: () => widget.onLink(_collectData()),
        ),
      ],
    );
  }

  Map<String, dynamic> _collectData() {
    return {
      'medications': _medications,
      'draftMedication': {
        'name': _medNameController.text,
        'dose': _dosePatternController.text,
        'route': _selectedRoute,
        'timing': _selectedTiming,
        'instructions': _instructionsController.text,
      },
    };
  }
}

// ----------------------------------------------------
// 3. Wellness Record Form
// ----------------------------------------------------
class _WellnessForm extends StatefulWidget {
  final Function(Map<String, dynamic>) onSaved;
  final Function(Map<String, dynamic>) onLink;

  const _WellnessForm({required this.onSaved, required this.onLink});

  @override
  State<_WellnessForm> createState() => _WellnessFormState();
}

class _WellnessFormState extends State<_WellnessForm> {
  String _smoking = 'Never smoked';
  String _diet = 'Vegetarian';
  final _sleepHours = TextEditingController();
  final _calories = TextEditingController();
  final _steps = TextEditingController();

  bool _enableWomenHealth = false;
  final _menarcheAge = TextEditingController();
  final _lmdController = TextEditingController();

  final List<String> _smokingOptions = [
    'Never smoked',
    'Former smoker',
    'Current smoker',
  ];

  final List<String> _dietOptions = [
    'Vegetarian',
    'Non-vegetarian',
    'Vegan',
    'Eggetarian',
    'Other',
  ];

  @override
  void dispose() {
    _sleepHours.dispose();
    _calories.dispose();
    _steps.dispose();
    _menarcheAge.dispose();
    _lmdController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildSectionTitle('Lifestyle'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final isWide = constraints.maxWidth > 550;
                final fields = [
                  _buildFormTextColumn(
                    'Smoking Status',
                    DropdownButtonFormField<String>(
                      initialValue: _smoking,
                      items: _smokingOptions
                          .map(
                            (s) => DropdownMenuItem(value: s, child: Text(s)),
                          )
                          .toList(),
                      onChanged: (val) => setState(() => _smoking = val!),
                    ),
                  ),
                  _buildFormTextColumn(
                    'Dietary Habit',
                    DropdownButtonFormField<String>(
                      initialValue: _diet,
                      items: _dietOptions
                          .map(
                            (d) => DropdownMenuItem(value: d, child: Text(d)),
                          )
                          .toList(),
                      onChanged: (val) => setState(() => _diet = val!),
                    ),
                  ),
                ];
                if (isWide) {
                  return Row(
                    children: fields
                        .map(
                          (f) => Expanded(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8.0,
                              ),
                              child: f,
                            ),
                          ),
                        )
                        .toList(),
                  );
                } else {
                  return Column(children: fields);
                }
              },
            ),
          ),
        ),
        const SizedBox(height: 20),
        _buildSectionTitle('Physical Activity'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final isWide = constraints.maxWidth > 550;
                final fields = [
                  _buildFormTextColumn(
                    'Sleep Duration (hours)',
                    TextFormField(
                      controller: _sleepHours,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(hintText: 'e.g. 8'),
                    ),
                  ),
                  _buildFormTextColumn(
                    'Calories Burned (kcal)',
                    TextFormField(
                      controller: _calories,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(hintText: 'e.g. 450'),
                    ),
                  ),
                  _buildFormTextColumn(
                    'Step Count',
                    TextFormField(
                      controller: _steps,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(hintText: 'e.g. 10000'),
                    ),
                  ),
                ];
                if (isWide) {
                  return Row(
                    children: fields
                        .map(
                          (f) => Expanded(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8.0,
                              ),
                              child: f,
                            ),
                          ),
                        )
                        .toList(),
                  );
                } else {
                  return Column(children: fields);
                }
              },
            ),
          ),
        ),
        const SizedBox(height: 20),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Women Health Data',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    Switch(
                      value: _enableWomenHealth,
                      onChanged: (val) =>
                          setState(() => _enableWomenHealth = val),
                    ),
                  ],
                ),
                if (_enableWomenHealth) ...[
                  const SizedBox(height: 16),
                  LayoutBuilder(
                    builder: (context, constraints) {
                      final isWide = constraints.maxWidth > 550;
                      final fields = [
                        _buildFormTextColumn(
                          'Age at Menarche',
                          TextFormField(
                            controller: _menarcheAge,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              hintText: 'e.g. 13',
                            ),
                          ),
                        ),
                        _buildFormTextColumn(
                          'Last Menstrual Date',
                          TextFormField(
                            controller: _lmdController,
                            readOnly: true,
                            decoration: const InputDecoration(
                              hintText: 'Select Date',
                              suffixIcon: Icon(Icons.calendar_today_outlined),
                            ),
                            onTap: () async {
                              final d = await showDatePicker(
                                context: context,
                                initialDate: DateTime.now(),
                                firstDate: DateTime(1900),
                                lastDate: DateTime.now(),
                              );
                              if (d != null) {
                                _lmdController.text =
                                    '${d.day.toString().padLeft(2, '0')}-${d.month.toString().padLeft(2, '0')}-${d.year}';
                              }
                            },
                          ),
                        ),
                      ];
                      if (isWide) {
                        return Row(
                          children: fields
                              .map(
                                (f) => Expanded(
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8.0,
                                    ),
                                    child: f,
                                  ),
                                ),
                              )
                              .toList(),
                        );
                      } else {
                        return Column(children: fields);
                      }
                    },
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 32),
        _buildFormActionButtons(
          onSave: () => widget.onSaved(_collectData()),
          onLink: () => widget.onLink(_collectData()),
        ),
      ],
    );
  }

  Map<String, dynamic> _collectData() {
    return {
      'lifestyle': {'smoking': _smoking, 'diet': _diet},
      'physicalActivity': {
        'sleepHours': _sleepHours.text,
        'caloriesBurned': _calories.text,
        'stepCount': _steps.text,
      },
      'womenHealth': _enableWomenHealth
          ? {
              'ageAtMenarche': _menarcheAge.text,
              'lastMenstrualDate': _lmdController.text,
            }
          : null,
    };
  }
}

// ----------------------------------------------------
// 4. Diagnostic Report Form
// ----------------------------------------------------
class _DiagnosticReportForm extends StatefulWidget {
  final Function(Map<String, dynamic>) onSaved;
  final Function(Map<String, dynamic>) onLink;

  const _DiagnosticReportForm({required this.onSaved, required this.onLink});

  @override
  State<_DiagnosticReportForm> createState() => _DiagnosticReportFormState();
}

class _DiagnosticReportFormState extends State<_DiagnosticReportForm> {
  final List<_LabReportData> _labReports = [];

  void _addLabReport() {
    setState(() {
      _labReports.add(_LabReportData());
    });
  }

  @override
  void initState() {
    super.initState();
    _addLabReport(); // Add initial lab report
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildSectionTitle('Lab Reports (DiagnosticReportLab)'),
        ..._labReports.asMap().entries.map((entry) {
          final idx = entry.key;
          final report = entry.value;
          return Padding(
            padding: const EdgeInsets.only(bottom: 20.0),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(20.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: _buildFormTextColumn(
                            'Lab Report Name',
                            TextFormField(
                              controller: report.nameController,
                              decoration: const InputDecoration(
                                hintText: 'e.g. Complete Blood Count',
                              ),
                            ),
                          ),
                        ),
                        if (_labReports.length > 1) ...[
                          const SizedBox(width: 8),
                          IconButton(
                            icon: const Icon(
                              Icons.delete_outline,
                              color: Color(0xFFD32F2F),
                            ),
                            onPressed: () =>
                                setState(() => _labReports.removeAt(idx)),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'Observation Results',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                        color: Color(0xFF212121),
                      ),
                    ),
                    const SizedBox(height: 8),
                    _buildObservationsTable(report),
                    const SizedBox(height: 12),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        onPressed: () => setState(
                          () => report.observations.add(_ObservationData()),
                        ),
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Add Observation'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }),
        OutlinedButton.icon(
          onPressed: _addLabReport,
          icon: const Icon(Icons.add),
          label: const Text('Add Another Lab Report'),
        ),
        const SizedBox(height: 32),
        _buildFormActionButtons(
          onSave: () => widget.onSaved(_collectData()),
          onLink: () => widget.onLink(_collectData()),
        ),
      ],
    );
  }

  Widget _buildObservationsTable(_LabReportData report) {
    return Column(
      children: [
        // Header Row
        Container(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
          decoration: const BoxDecoration(
            color: Color(0xFFE3F2FD),
            borderRadius: BorderRadius.vertical(top: Radius.circular(8)),
          ),
          child: const Row(
            children: [
              Expanded(
                flex: 4,
                child: Text(
                  'Test Name / Display',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                ),
              ),
              SizedBox(width: 8),
              Expanded(
                flex: 3,
                child: Text(
                  'Value',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                ),
              ),
              SizedBox(width: 8),
              Expanded(
                flex: 3,
                child: Text(
                  'Unit',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                ),
              ),
              SizedBox(width: 40),
            ],
          ),
        ),
        // Observations Lists
        ...report.observations.asMap().entries.map((entry) {
          final idx = entry.key;
          final obs = entry.value;
          return Container(
            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 12),
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
            ),
            child: Row(
              children: [
                Expanded(
                  flex: 4,
                  child: TextFormField(
                    controller: obs.testNameController,
                    decoration: const InputDecoration(
                      contentPadding: EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 10,
                      ),
                      hintText: 'WBC',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 3,
                  child: TextFormField(
                    controller: obs.valueController,
                    decoration: const InputDecoration(
                      contentPadding: EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 10,
                      ),
                      hintText: '6000',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 3,
                  child: TextFormField(
                    controller: obs.unitController,
                    decoration: const InputDecoration(
                      contentPadding: EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 10,
                      ),
                      hintText: '10^3/µL',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 32,
                  child: report.observations.length > 1
                      ? IconButton(
                          icon: const Icon(
                            Icons.close,
                            color: Color(0xFFD32F2F),
                            size: 18,
                          ),
                          onPressed: () =>
                              setState(() => report.observations.removeAt(idx)),
                        )
                      : const SizedBox.shrink(),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  Map<String, dynamic> _collectData() {
    return {
      'labReports': _labReports.map((r) {
        return {
          'reportName': r.nameController.text,
          'observations': r.observations.map((o) {
            return {
              'testName': o.testNameController.text,
              'value': o.valueController.text,
              'unit': o.unitController.text,
            };
          }).toList(),
        };
      }).toList(),
    };
  }
}

class _LabReportData {
  final nameController = TextEditingController();
  final List<_ObservationData> observations = [_ObservationData()];
}

class _ObservationData {
  final testNameController = TextEditingController();
  final valueController = TextEditingController();
  final unitController = TextEditingController();
}

// ----------------------------------------------------
// 5. Immunization Record Form
// ----------------------------------------------------
class _ImmunizationForm extends StatefulWidget {
  final Function(Map<String, dynamic>) onSaved;
  final Function(Map<String, dynamic>) onLink;

  const _ImmunizationForm({required this.onSaved, required this.onLink});

  @override
  State<_ImmunizationForm> createState() => _ImmunizationFormState();
}

class _ImmunizationFormState extends State<_ImmunizationForm> {
  final List<Map<String, String>> _entries = [];

  final _vaccineName = TextEditingController();
  final _brandName = TextEditingController();
  final _lotNumber = TextEditingController();
  final _doseNo = TextEditingController();
  final _occurrenceDate = TextEditingController();

  void _addEntry() {
    final v = _vaccineName.text.trim();
    final b = _brandName.text.trim();
    final d = _occurrenceDate.text.trim();
    if (v.isEmpty || b.isEmpty || d.isEmpty) return;

    setState(() {
      _entries.add({
        'vaccineName': v,
        'brand': b,
        'date': d,
        'lotNumber': _lotNumber.text.trim(),
        'doseNo': _doseNo.text.trim(),
      });
      _vaccineName.clear();
      _brandName.clear();
      _lotNumber.clear();
      _doseNo.clear();
      _occurrenceDate.clear();
    });
  }

  @override
  void dispose() {
    _vaccineName.dispose();
    _brandName.dispose();
    _lotNumber.dispose();
    _doseNo.dispose();
    _occurrenceDate.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildSectionTitle('Add Immunization Entry'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                LayoutBuilder(
                  builder: (context, constraints) {
                    final isWide = constraints.maxWidth > 550;
                    final row1 = [
                      _buildFormTextColumn(
                        'Vaccine Name *',
                        TextFormField(
                          controller: _vaccineName,
                          decoration: const InputDecoration(
                            hintText: 'e.g. Hepatitis B',
                          ),
                        ),
                      ),
                      _buildFormTextColumn(
                        'Brand *',
                        TextFormField(
                          controller: _brandName,
                          decoration: const InputDecoration(
                            hintText: 'e.g. Engerix-B',
                          ),
                        ),
                      ),
                    ];
                    if (isWide) {
                      return Row(
                        children: row1
                            .map(
                              (f) => Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8.0,
                                  ),
                                  child: f,
                                ),
                              ),
                            )
                            .toList(),
                      );
                    } else {
                      return Column(children: row1);
                    }
                  },
                ),
                const SizedBox(height: 12),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final isWide = constraints.maxWidth > 550;
                    final row2 = [
                      _buildFormTextColumn(
                        'Occurrence Date *',
                        TextFormField(
                          controller: _occurrenceDate,
                          readOnly: true,
                          decoration: const InputDecoration(
                            hintText: 'dd-mm-yyyy',
                            suffixIcon: Icon(Icons.calendar_today_outlined),
                          ),
                          onTap: () async {
                            final date = await showDatePicker(
                              context: context,
                              initialDate: DateTime.now(),
                              firstDate: DateTime(1950),
                              lastDate: DateTime.now(),
                            );
                            if (date != null) {
                              _occurrenceDate.text =
                                  '${date.day.toString().padLeft(2, '0')}-${date.month.toString().padLeft(2, '0')}-${date.year}';
                            }
                          },
                        ),
                      ),
                      _buildFormTextColumn(
                        'Lot Number',
                        TextFormField(
                          controller: _lotNumber,
                          decoration: const InputDecoration(
                            hintText: 'e.g. LOT12345',
                          ),
                        ),
                      ),
                      _buildFormTextColumn(
                        'Dose No.',
                        TextFormField(
                          controller: _doseNo,
                          decoration: const InputDecoration(
                            hintText: 'e.g. 1st Dose',
                          ),
                        ),
                      ),
                    ];
                    if (isWide) {
                      return Row(
                        children: row2
                            .map(
                              (f) => Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6.0,
                                  ),
                                  child: f,
                                ),
                              ),
                            )
                            .toList(),
                      );
                    } else {
                      return Column(children: row2);
                    }
                  },
                ),
                const SizedBox(height: 16),
                Align(
                  alignment: Alignment.centerRight,
                  child: ElevatedButton.icon(
                    onPressed: _addEntry,
                    icon: const Icon(Icons.add),
                    label: const Text('Add Entry'),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),
        _buildSectionTitle('Immunization Table'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: _entries.isEmpty
                ? const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 24.0),
                      child: Text(
                        'No entries added yet.',
                        style: TextStyle(
                          color: Color(0xFF212121),
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ),
                  )
                : ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _entries.length,
                    separatorBuilder: (context, index) =>
                        const Divider(color: Color(0xFFE3F2FD)),
                    itemBuilder: (context, index) {
                      final item = _entries[index];
                      return Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  item['vaccineName']!,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFF212121),
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Brand: ${item['brand']} | Date: ${item['date']}',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    color: Color(0xFF212121),
                                  ),
                                ),
                                if (item['lotNumber']!.isNotEmpty ||
                                    item['doseNo']!.isNotEmpty) ...[
                                  const SizedBox(height: 2),
                                  Text(
                                    'Lot: ${item['lotNumber']!.isEmpty ? '--' : item['lotNumber']} | Dose: ${item['doseNo']!.isEmpty ? '--' : item['doseNo']}',
                                    style: const TextStyle(
                                      fontSize: 13,
                                      color: Color(0xFF212121),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          IconButton(
                            icon: const Icon(
                              Icons.delete_outline,
                              color: Color(0xFFD32F2F),
                            ),
                            onPressed: () =>
                                setState(() => _entries.removeAt(index)),
                          ),
                        ],
                      );
                    },
                  ),
          ),
        ),
        const SizedBox(height: 32),
        _buildFormActionButtons(
          onSave: () => widget.onSaved(_collectData()),
          onLink: () => widget.onLink(_collectData()),
        ),
      ],
    );
  }

  Map<String, dynamic> _collectData() {
    return {
      'entries': _entries,
      'draftEntry': {
        'vaccineName': _vaccineName.text,
        'brand': _brandName.text,
        'date': _occurrenceDate.text,
        'lotNumber': _lotNumber.text,
        'doseNo': _doseNo.text,
      },
    };
  }
}

// ----------------------------------------------------
// 6. Invoice Record Form
// ----------------------------------------------------
class _InvoiceForm extends StatefulWidget {
  final Function(Map<String, dynamic>) onSaved;
  final Function(Map<String, dynamic>) onLink;

  const _InvoiceForm({required this.onSaved, required this.onLink});

  @override
  State<_InvoiceForm> createState() => _InvoiceFormState();
}

class _InvoiceFormState extends State<_InvoiceForm> {
  final _dateController = TextEditingController();
  final _invoiceNo = TextEditingController();
  String _payType = 'Cash';

  final List<Map<String, dynamic>> _items = [];

  final _itemName = TextEditingController();
  String _selectedType = 'Consultation';
  final _mrp = TextEditingController();
  final _discount = TextEditingController();
  final _rate = TextEditingController();
  final _qty = TextEditingController();
  final _gst = TextEditingController();

  final List<String> _types = [
    'Consultation',
    'Investigation',
    'Pharmacy',
    'Room Rent',
    'Procedure',
    'Other',
  ];

  final List<String> _payTypes = [
    'Cash',
    'Credit Card',
    'Debit Card',
    'UPI',
    'Insurance',
  ];

  @override
  void initState() {
    super.initState();
    _mrp.addListener(_updateRate);
    _discount.addListener(_updateRate);
    _dateController.text = _todayStr();
  }

  String _todayStr() {
    final d = DateTime.now();
    return '${d.day.toString().padLeft(2, '0')}-${d.month.toString().padLeft(2, '0')}-${d.year}';
  }

  void _updateRate() {
    final m = double.tryParse(_mrp.text) ?? 0.0;
    final d = double.tryParse(_discount.text) ?? 0.0;
    final r = _maxNum(0.0, m - d);
    _rate.text = r.toStringAsFixed(2);
  }

  void _addItem() {
    final name = _itemName.text.trim();
    final mVal = double.tryParse(_mrp.text) ?? 0.0;
    final dVal = double.tryParse(_discount.text) ?? 0.0;
    final rVal = _maxNum(0.0, mVal - dVal);
    final qVal = int.tryParse(_qty.text) ?? 0;
    final gVal = double.tryParse(_gst.text) ?? 0.0;

    if (name.isEmpty || qVal <= 0) return;

    // GST amount: rate * qty * (gst% / 100)
    final gstAmt = rVal * qVal * (gVal / 100);
    final total = (rVal * qVal) + gstAmt;

    setState(() {
      _items.add({
        'name': name,
        'type': _selectedType,
        'mrp': mVal,
        'discount': dVal,
        'rate': rVal,
        'qty': qVal,
        'gstPct': gVal,
        'gstAmt': gstAmt,
        'total': total,
      });

      _itemName.clear();
      _mrp.clear();
      _discount.clear();
      _rate.clear();
      _qty.clear();
      _gst.clear();
    });
  }

  // Aggregate values
  int get _totalQty =>
      _items.fold(0, (sum, item) => sum + (item['qty'] as int));
  double get _totalGst =>
      _items.fold(0.0, (sum, item) => sum + (item['gstAmt'] as double));
  double get _totalAmount =>
      _items.fold(0.0, (sum, item) => sum + (item['total'] as double));

  @override
  void dispose() {
    _dateController.dispose();
    _invoiceNo.dispose();
    _itemName.dispose();
    _mrp.dispose();
    _discount.dispose();
    _rate.dispose();
    _qty.dispose();
    _gst.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildSectionTitle('Invoice Header'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final isWide = constraints.maxWidth > 550;
                final fields = [
                  _buildFormTextColumn(
                    'Invoice Date *',
                    TextFormField(
                      controller: _dateController,
                      readOnly: true,
                      decoration: const InputDecoration(
                        suffixIcon: Icon(Icons.calendar_today_outlined),
                      ),
                      onTap: () async {
                        final date = await showDatePicker(
                          context: context,
                          initialDate: DateTime.now(),
                          firstDate: DateTime(2000),
                          lastDate: DateTime.now(),
                        );
                        if (date != null) {
                          _dateController.text =
                              '${date.day.toString().padLeft(2, '0')}-${date.month.toString().padLeft(2, '0')}-${date.year}';
                        }
                      },
                    ),
                  ),
                  _buildFormTextColumn(
                    'Invoice No *',
                    TextFormField(
                      controller: _invoiceNo,
                      decoration: const InputDecoration(
                        hintText: 'INV-2026-001',
                      ),
                    ),
                  ),
                  _buildFormTextColumn(
                    'Payment Mode',
                    DropdownButtonFormField<String>(
                      initialValue: _payType,
                      items: _payTypes
                          .map(
                            (t) => DropdownMenuItem(value: t, child: Text(t)),
                          )
                          .toList(),
                      onChanged: (val) => setState(() => _payType = val!),
                    ),
                  ),
                ];
                if (isWide) {
                  return Row(
                    children: fields
                        .map(
                          (f) => Expanded(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8.0,
                              ),
                              child: f,
                            ),
                          ),
                        )
                        .toList(),
                  );
                } else {
                  return Column(children: fields);
                }
              },
            ),
          ),
        ),
        const SizedBox(height: 20),
        _buildSectionTitle('Add Item Details'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                LayoutBuilder(
                  builder: (context, constraints) {
                    final isWide = constraints.maxWidth > 550;
                    final row1 = [
                      _buildFormTextColumn(
                        'Item Name',
                        TextFormField(
                          controller: _itemName,
                          decoration: const InputDecoration(
                            hintText: 'e.g. Consultation Charge',
                          ),
                        ),
                      ),
                      _buildFormTextColumn(
                        'Type',
                        DropdownButtonFormField<String>(
                          initialValue: _selectedType,
                          items: _types
                              .map(
                                (t) =>
                                    DropdownMenuItem(value: t, child: Text(t)),
                              )
                              .toList(),
                          onChanged: (val) =>
                              setState(() => _selectedType = val!),
                        ),
                      ),
                    ];
                    if (isWide) {
                      return Row(
                        children: row1
                            .map(
                              (f) => Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8.0,
                                  ),
                                  child: f,
                                ),
                              ),
                            )
                            .toList(),
                      );
                    } else {
                      return Column(children: row1);
                    }
                  },
                ),
                const SizedBox(height: 12),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final isWide = constraints.maxWidth > 550;
                    final row2 = [
                      _buildFormTextColumn(
                        'MRP',
                        TextFormField(
                          controller: _mrp,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: const InputDecoration(hintText: '500'),
                        ),
                      ),
                      _buildFormTextColumn(
                        'Discount',
                        TextFormField(
                          controller: _discount,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: const InputDecoration(hintText: '50'),
                        ),
                      ),
                      _buildFormTextColumn(
                        'Rate (auto)',
                        TextFormField(
                          controller: _rate,
                          readOnly: true,
                          enabled: false,
                          decoration: InputDecoration(
                            hintText: '450',
                            fillColor: Colors.grey.shade100,
                          ),
                        ),
                      ),
                    ];
                    if (isWide) {
                      return Row(
                        children: row2
                            .map(
                              (f) => Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6.0,
                                  ),
                                  child: f,
                                ),
                              ),
                            )
                            .toList(),
                      );
                    } else {
                      return Column(children: row2);
                    }
                  },
                ),
                const SizedBox(height: 12),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final isWide = constraints.maxWidth > 550;
                    final row3 = [
                      _buildFormTextColumn(
                        'Quantity',
                        TextFormField(
                          controller: _qty,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(hintText: '1'),
                        ),
                      ),
                      _buildFormTextColumn(
                        'GST %',
                        TextFormField(
                          controller: _gst,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: const InputDecoration(hintText: '18'),
                        ),
                      ),
                    ];
                    if (isWide) {
                      return Row(
                        children: row3
                            .map(
                              (f) => Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8.0,
                                  ),
                                  child: f,
                                ),
                              ),
                            )
                            .toList(),
                      );
                    } else {
                      return Column(children: row3);
                    }
                  },
                ),
                const SizedBox(height: 16),
                Align(
                  alignment: Alignment.centerRight,
                  child: ElevatedButton.icon(
                    onPressed: _addItem,
                    icon: const Icon(Icons.add),
                    label: const Text('Add Item to Table'),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),
        _buildSectionTitle('Items Table'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: _items.isEmpty
                ? const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 24.0),
                      child: Text(
                        'No items added to the invoice yet.',
                        style: TextStyle(
                          color: Color(0xFF212121),
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: DataTable(
                          columnSpacing: 20,
                          horizontalMargin: 8,
                          columns: const [
                            DataColumn(label: Text('Item Name')),
                            DataColumn(label: Text('Type')),
                            DataColumn(label: Text('Rate')),
                            DataColumn(label: Text('Qty')),
                            DataColumn(label: Text('GST%')),
                            DataColumn(label: Text('Total')),
                            DataColumn(label: Text('Remove')),
                          ],
                          rows: _items.asMap().entries.map((entry) {
                            final idx = entry.key;
                            final val = entry.value;
                            return DataRow(
                              cells: [
                                DataCell(Text(val['name'])),
                                DataCell(Text(val['type'])),
                                DataCell(
                                  Text('₹${val['rate'].toStringAsFixed(2)}'),
                                ),
                                DataCell(Text('${val['qty']}')),
                                DataCell(Text('${val['gstPct']}%')),
                                DataCell(
                                  Text('₹${val['total'].toStringAsFixed(2)}'),
                                ),
                                DataCell(
                                  IconButton(
                                    icon: const Icon(
                                      Icons.close,
                                      color: Color(0xFFD32F2F),
                                      size: 18,
                                    ),
                                    onPressed: () =>
                                        setState(() => _items.removeAt(idx)),
                                  ),
                                ),
                              ],
                            );
                          }).toList(),
                        ),
                      ),
                      const SizedBox(height: 20),
                      const Divider(color: Color(0xFFE3F2FD), thickness: 1.5),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              _buildSummaryRow('Total Qty:', '$_totalQty'),
                              const SizedBox(height: 4),
                              _buildSummaryRow(
                                'Total GST:',
                                '₹${_totalGst.toStringAsFixed(2)}',
                              ),
                              const SizedBox(height: 8),
                              _buildSummaryRow(
                                'Grand Total:',
                                '₹${_totalAmount.toStringAsFixed(2)}',
                                isBold: true,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
          ),
        ),
        const SizedBox(height: 32),
        _buildFormActionButtons(
          onSave: () => widget.onSaved(_collectData()),
          onLink: () => widget.onLink(_collectData()),
        ),
      ],
    );
  }

  Widget _buildSummaryRow(String label, String val, {bool isBold = false}) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: TextStyle(
            color: const Color(0xFF212121),
            fontSize: isBold ? 15 : 13,
            fontWeight: isBold ? FontWeight.w800 : FontWeight.normal,
          ),
        ),
        const SizedBox(width: 16),
        Text(
          val,
          style: TextStyle(
            color: const Color(0xFF212121),
            fontSize: isBold ? 17 : 14,
            fontWeight: isBold ? FontWeight.w900 : FontWeight.w700,
          ),
        ),
      ],
    );
  }

  Map<String, dynamic> _collectData() {
    return {
      'header': {
        'date': _dateController.text,
        'invoiceNo': _invoiceNo.text,
        'paymentType': _payType,
      },
      'items': _items,
      'draftItem': {
        'name': _itemName.text,
        'type': _selectedType,
        'mrp': _mrp.text,
        'discount': _discount.text,
        'rate': _rate.text,
        'quantity': _qty.text,
        'gstPercent': _gst.text,
      },
      'summary': {
        'totalQty': _totalQty,
        'totalGst': _totalGst,
        'grandTotal': _totalAmount,
      },
    };
  }
}

// ----------------------------------------------------
// 7. Discharge Summary Form
// ----------------------------------------------------
class _DischargeSummaryForm extends StatefulWidget {
  final Function(Map<String, dynamic>) onSaved;
  final Function(Map<String, dynamic>) onLink;

  const _DischargeSummaryForm({required this.onSaved, required this.onLink});

  @override
  State<_DischargeSummaryForm> createState() => _DischargeSummaryFormState();
}

class _DischargeSummaryFormState extends State<_DischargeSummaryForm> {
  // Chief Complaints
  final List<String> _complaints = [];
  final _complaintInput = TextEditingController();

  // Vitals
  final _systolicController = TextEditingController();
  final _diastolicController = TextEditingController();
  final _heartRateController = TextEditingController();
  final _respRateController = TextEditingController();
  final _spo2Controller = TextEditingController();
  final _tempController = TextEditingController();
  final _heightController = TextEditingController();
  final _weightController = TextEditingController();
  final _bmiController = TextEditingController();

  // Allergies
  final List<String> _allergies = [];
  final _allergyInput = TextEditingController();

  // Medical History
  final List<String> _history = [];
  final _historyInput = TextEditingController();

  // Lab Reports (Diagnostic Reports)
  final List<_LabReportData> _labReports = [];

  // Procedure Performed
  final List<String> _procedures = [];
  final _procedureInput = TextEditingController();

  // Medications Advice
  final List<Map<String, String>> _medications = [];
  final _medNameController = TextEditingController();
  final _dosePatternController = TextEditingController();
  String _selectedRoute = 'Oral';
  String _selectedTiming = 'After Food';
  final _instructionsController = TextEditingController();

  // Care Plan
  final _carePlanTitle = TextEditingController();
  final _carePlanDesc = TextEditingController();
  final _followUpDate = TextEditingController();
  final _followUpTime = TextEditingController();
  final _followUpReason = TextEditingController();

  // Family History
  final List<Map<String, String>> _familyHistory = [];
  final _famCondition = TextEditingController();
  String _famRelationship = 'Father';
  final _famNotes = TextEditingController();

  final List<String> _relationships = [
    'Father',
    'Mother',
    'Brother',
    'Sister',
    'Grandfather',
    'Grandmother',
    'Uncle',
    'Aunt',
  ];

  @override
  void initState() {
    super.initState();
    _heightController.addListener(_calculateBmi);
    _weightController.addListener(_calculateBmi);
  }

  void _calculateBmi() {
    final h = double.tryParse(_heightController.text);
    final w = double.tryParse(_weightController.text);
    if (h != null && w != null && h > 0) {
      final bmi = w / ((h / 100) * (h / 100));
      _bmiController.text = bmi.toStringAsFixed(1);
    } else {
      _bmiController.text = '';
    }
  }

  void _addMedication() {
    final name = _medNameController.text.trim();
    final dose = _dosePatternController.text.trim();
    if (name.isEmpty || dose.isEmpty) return;

    setState(() {
      _medications.add({
        'name': name,
        'dose': dose,
        'route': _selectedRoute,
        'timing': _selectedTiming,
        'instructions': _instructionsController.text.trim(),
      });
      _medNameController.clear();
      _dosePatternController.clear();
      _instructionsController.clear();
    });
  }

  void _addFamilyHistory() {
    final cond = _famCondition.text.trim();
    if (cond.isEmpty) return;

    setState(() {
      _familyHistory.add({
        'condition': cond,
        'relationship': _famRelationship,
        'notes': _famNotes.text.trim(),
      });
      _famCondition.clear();
      _famNotes.clear();
    });
  }

  @override
  void dispose() {
    _complaintInput.dispose();
    _systolicController.dispose();
    _diastolicController.dispose();
    _heartRateController.dispose();
    _respRateController.dispose();
    _spo2Controller.dispose();
    _tempController.dispose();
    _heightController.dispose();
    _weightController.dispose();
    _bmiController.dispose();
    _allergyInput.dispose();
    _historyInput.dispose();
    _procedureInput.dispose();
    _medNameController.dispose();
    _dosePatternController.dispose();
    _instructionsController.dispose();
    _carePlanTitle.dispose();
    _carePlanDesc.dispose();
    _followUpDate.dispose();
    _followUpTime.dispose();
    _followUpReason.dispose();
    _famCondition.dispose();
    _famNotes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildListManagerCard(
          'Chief Complaints',
          _complaints,
          _complaintInput,
          'Add chief complaint...',
        ),
        const SizedBox(height: 20),
        _buildSectionTitle('Physical Examination (Vitals)'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: Column(
              children: [
                LayoutBuilder(
                  builder: (context, constraints) {
                    final isWide = constraints.maxWidth > 550;
                    final fields = [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Blood Pressure (mmHg)',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 13,
                              color: Color(0xFF212121),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: TextFormField(
                                  controller: _systolicController,
                                  keyboardType: TextInputType.number,
                                  decoration: const InputDecoration(
                                    hintText: 'Sys',
                                  ),
                                ),
                              ),
                              const Padding(
                                padding: EdgeInsets.symmetric(horizontal: 8.0),
                                child: Text(
                                  '/',
                                  style: TextStyle(
                                    fontSize: 20,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                              Expanded(
                                child: TextFormField(
                                  controller: _diastolicController,
                                  keyboardType: TextInputType.number,
                                  decoration: const InputDecoration(
                                    hintText: 'Dia',
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                      _buildFormTextColumn(
                        'Heart Rate (bpm)',
                        TextFormField(
                          controller: _heartRateController,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(
                            hintText: 'e.g. 72',
                          ),
                        ),
                      ),
                    ];
                    if (isWide) {
                      return Row(
                        children: fields
                            .map(
                              (f) => Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8.0,
                                  ),
                                  child: f,
                                ),
                              ),
                            )
                            .toList(),
                      );
                    } else {
                      return Column(children: fields);
                    }
                  },
                ),
                const SizedBox(height: 12),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final isWide = constraints.maxWidth > 550;
                    final fields = [
                      _buildFormTextColumn(
                        'Respiratory Rate',
                        TextFormField(
                          controller: _respRateController,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(
                            hintText: 'e.g. 18',
                          ),
                        ),
                      ),
                      _buildFormTextColumn(
                        'Oxygen Saturation (%)',
                        TextFormField(
                          controller: _spo2Controller,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(
                            hintText: 'e.g. 98',
                          ),
                        ),
                      ),
                      _buildFormTextColumn(
                        'Temperature (°F)',
                        TextFormField(
                          controller: _tempController,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: const InputDecoration(
                            hintText: 'e.g. 98.6',
                          ),
                        ),
                      ),
                    ];
                    if (isWide) {
                      return Row(
                        children: fields
                            .map(
                              (f) => Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6.0,
                                  ),
                                  child: f,
                                ),
                              ),
                            )
                            .toList(),
                      );
                    } else {
                      return Column(children: fields);
                    }
                  },
                ),
                const SizedBox(height: 12),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final isWide = constraints.maxWidth > 550;
                    final fields = [
                      _buildFormTextColumn(
                        'Height (cm)',
                        TextFormField(
                          controller: _heightController,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: const InputDecoration(
                            hintText: 'e.g. 170',
                          ),
                        ),
                      ),
                      _buildFormTextColumn(
                        'Weight (kg)',
                        TextFormField(
                          controller: _weightController,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: const InputDecoration(
                            hintText: 'e.g. 70',
                          ),
                        ),
                      ),
                      _buildFormTextColumn(
                        'BMI (auto)',
                        TextFormField(
                          controller: _bmiController,
                          readOnly: true,
                          enabled: false,
                          decoration: InputDecoration(
                            hintText: '--',
                            fillColor: Colors.grey.shade100,
                          ),
                        ),
                      ),
                    ];
                    if (isWide) {
                      return Row(
                        children: fields
                            .map(
                              (f) => Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6.0,
                                  ),
                                  child: f,
                                ),
                              ),
                            )
                            .toList(),
                      );
                    } else {
                      return Column(children: fields);
                    }
                  },
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        _buildListManagerCard(
          'Allergies',
          _allergies,
          _allergyInput,
          'Add allergy...',
        ),
        const SizedBox(height: 20),
        _buildListManagerCard(
          'Medical History',
          _history,
          _historyInput,
          'Add medical history...',
        ),
        const SizedBox(height: 20),
        _buildListManagerCard(
          'Procedure Performed',
          _procedures,
          _procedureInput,
          'Add procedure...',
        ),
        const SizedBox(height: 20),

        // Nested Lab Reports
        _buildSectionTitle('Diagnostic/Lab Reports'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _labReports.isEmpty
                    ? const Padding(
                        padding: EdgeInsets.symmetric(vertical: 16.0),
                        child: Text(
                          'No lab reports added yet.',
                          style: TextStyle(
                            color: Color(0xFF212121),
                            fontStyle: FontStyle.italic,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      )
                    : Column(
                        children: _labReports.asMap().entries.map((entry) {
                          final reportIdx = entry.key;
                          final report = entry.value;
                          return Card(
                            color: const Color(0xFFFBFCFD),
                            margin: const EdgeInsets.only(bottom: 16),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: const BorderSide(color: Color(0xFFE3F2FD)),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(16.0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Row(
                                    children: [
                                      Expanded(
                                        child: TextFormField(
                                          controller: report.nameController,
                                          decoration: const InputDecoration(
                                            labelText: 'Lab Report / Test Name',
                                            hintText: 'e.g. Blood Sugar',
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      IconButton(
                                        icon: const Icon(
                                          Icons.delete_outline,
                                          color: Color(0xFFD32F2F),
                                        ),
                                        onPressed: () => setState(
                                          () => _labReports.removeAt(reportIdx),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 12),
                                  // Nested Observation headers
                                  Container(
                                    padding: const EdgeInsets.all(8),
                                    color: const Color(0xFFE3F2FD),
                                    child: const Row(
                                      children: [
                                        Expanded(
                                          flex: 4,
                                          child: Text(
                                            'Test',
                                            style: TextStyle(
                                              fontWeight: FontWeight.bold,
                                              fontSize: 11,
                                            ),
                                          ),
                                        ),
                                        SizedBox(width: 6),
                                        Expanded(
                                          flex: 3,
                                          child: Text(
                                            'Val',
                                            style: TextStyle(
                                              fontWeight: FontWeight.bold,
                                              fontSize: 11,
                                            ),
                                          ),
                                        ),
                                        SizedBox(width: 6),
                                        Expanded(
                                          flex: 3,
                                          child: Text(
                                            'Unit',
                                            style: TextStyle(
                                              fontWeight: FontWeight.bold,
                                              fontSize: 11,
                                            ),
                                          ),
                                        ),
                                        SizedBox(width: 24),
                                      ],
                                    ),
                                  ),
                                  ...report.observations.asMap().entries.map((
                                    obsEntry,
                                  ) {
                                    final obsIdx = obsEntry.key;
                                    final obs = obsEntry.value;
                                    return Padding(
                                      padding: const EdgeInsets.symmetric(
                                        vertical: 4.0,
                                      ),
                                      child: Row(
                                        children: [
                                          Expanded(
                                            flex: 4,
                                            child: TextFormField(
                                              controller:
                                                  obs.testNameController,
                                              decoration: const InputDecoration(
                                                contentPadding: EdgeInsets.all(
                                                  8,
                                                ),
                                                hintText: 'Fasting',
                                              ),
                                            ),
                                          ),
                                          const SizedBox(width: 6),
                                          Expanded(
                                            flex: 3,
                                            child: TextFormField(
                                              controller: obs.valueController,
                                              decoration: const InputDecoration(
                                                contentPadding: EdgeInsets.all(
                                                  8,
                                                ),
                                                hintText: '110',
                                              ),
                                            ),
                                          ),
                                          const SizedBox(width: 6),
                                          Expanded(
                                            flex: 3,
                                            child: TextFormField(
                                              controller: obs.unitController,
                                              decoration: const InputDecoration(
                                                contentPadding: EdgeInsets.all(
                                                  8,
                                                ),
                                                hintText: 'mg/dL',
                                              ),
                                            ),
                                          ),
                                          IconButton(
                                            icon: const Icon(
                                              Icons.close,
                                              size: 16,
                                              color: Color(0xFFD32F2F),
                                            ),
                                            onPressed: () => setState(
                                              () => report.observations
                                                  .removeAt(obsIdx),
                                            ),
                                          ),
                                        ],
                                      ),
                                    );
                                  }),
                                  Align(
                                    alignment: Alignment.centerLeft,
                                    child: TextButton.icon(
                                      onPressed: () => setState(
                                        () => report.observations.add(
                                          _ObservationData(),
                                        ),
                                      ),
                                      icon: const Icon(Icons.add, size: 14),
                                      label: const Text(
                                        'Add Observation',
                                        style: TextStyle(fontSize: 12),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                OutlinedButton.icon(
                  onPressed: () =>
                      setState(() => _labReports.add(_LabReportData())),
                  icon: const Icon(Icons.add),
                  label: const Text('Add Diagnostic Report'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),

        // Medications Advice
        _buildSectionTitle('Medication Advice'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                LayoutBuilder(
                  builder: (context, constraints) {
                    final isWide = constraints.maxWidth > 550;
                    final row1 = [
                      _buildFormTextColumn(
                        'Medicine Name',
                        TextFormField(
                          controller: _medNameController,
                          decoration: const InputDecoration(
                            hintText: 'e.g. Aspirin 75mg',
                          ),
                        ),
                      ),
                      _buildFormTextColumn(
                        'Dose Pattern',
                        TextFormField(
                          controller: _dosePatternController,
                          decoration: const InputDecoration(
                            hintText: 'e.g. 0-1-0',
                          ),
                        ),
                      ),
                    ];
                    if (isWide) {
                      return Row(
                        children: row1
                            .map(
                              (f) => Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8.0,
                                  ),
                                  child: f,
                                ),
                              ),
                            )
                            .toList(),
                      );
                    } else {
                      return Column(children: row1);
                    }
                  },
                ),
                const SizedBox(height: 12),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final isWide = constraints.maxWidth > 550;
                    final row2 = [
                      _buildFormTextColumn(
                        'Route',
                        DropdownButtonFormField<String>(
                          initialValue: _selectedRoute,
                          items: const [
                            DropdownMenuItem(
                              value: 'Oral',
                              child: Text('Oral'),
                            ),
                            DropdownMenuItem(
                              value: 'IV',
                              child: Text('Intravenous (IV)'),
                            ),
                            DropdownMenuItem(
                              value: 'Subcutaneous',
                              child: Text('Subcutaneous'),
                            ),
                          ],
                          onChanged: (val) =>
                              setState(() => _selectedRoute = val!),
                        ),
                      ),
                      _buildFormTextColumn(
                        'Timing',
                        DropdownButtonFormField<String>(
                          initialValue: _selectedTiming,
                          items: const [
                            DropdownMenuItem(
                              value: 'Before Food',
                              child: Text('Before Food'),
                            ),
                            DropdownMenuItem(
                              value: 'After Food',
                              child: Text('After Food'),
                            ),
                            DropdownMenuItem(
                              value: 'With Food',
                              child: Text('With Food'),
                            ),
                          ],
                          onChanged: (val) =>
                              setState(() => _selectedTiming = val!),
                        ),
                      ),
                    ];
                    if (isWide) {
                      return Row(
                        children: row2
                            .map(
                              (f) => Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8.0,
                                  ),
                                  child: f,
                                ),
                              ),
                            )
                            .toList(),
                      );
                    } else {
                      return Column(children: row2);
                    }
                  },
                ),
                const SizedBox(height: 12),
                _buildFormTextColumn(
                  'Special Instructions',
                  TextFormField(
                    controller: _instructionsController,
                    decoration: const InputDecoration(
                      hintText: 'Take with full glass of water',
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Align(
                  alignment: Alignment.centerRight,
                  child: ElevatedButton.icon(
                    onPressed: _addMedication,
                    icon: const Icon(Icons.add),
                    label: const Text('Add Medicine'),
                  ),
                ),
                if (_medications.isNotEmpty) ...[
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12.0),
                    child: Divider(color: Color(0xFFE3F2FD)),
                  ),
                  ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _medications.length,
                    separatorBuilder: (context, index) =>
                        const Divider(color: Color(0xFFE3F2FD)),
                    itemBuilder: (context, index) {
                      final med = _medications[index];
                      return Row(
                        children: [
                          Expanded(
                            child: Text(
                              '${med['name']} (${med['dose']}) - ${med['route']} / ${med['timing']}',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 13,
                                color: Color(0xFF212121),
                              ),
                            ),
                          ),
                          IconButton(
                            icon: const Icon(
                              Icons.close,
                              size: 16,
                              color: Color(0xFFD32F2F),
                            ),
                            onPressed: () =>
                                setState(() => _medications.removeAt(index)),
                          ),
                        ],
                      );
                    },
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),

        // Care Plan
        _buildSectionTitle('Care Plan'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildFormTextColumn(
                  'Care Plan Title',
                  TextFormField(
                    controller: _carePlanTitle,
                    decoration: const InputDecoration(
                      hintText: 'e.g. Post-Op Recovery Care Plan',
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                _buildFormTextColumn(
                  'Description',
                  TextFormField(
                    controller: _carePlanDesc,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      hintText: 'Describe details of plan...',
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final isWide = constraints.maxWidth > 550;
                    final fields = [
                      _buildFormTextColumn(
                        'Follow Up Date',
                        TextFormField(
                          controller: _followUpDate,
                          readOnly: true,
                          decoration: const InputDecoration(
                            hintText: 'Select Date',
                            suffixIcon: Icon(Icons.calendar_today_outlined),
                          ),
                          onTap: () async {
                            final d = await showDatePicker(
                              context: context,
                              initialDate: DateTime.now().add(
                                const Duration(days: 7),
                              ),
                              firstDate: DateTime.now(),
                              lastDate: DateTime.now().add(
                                const Duration(days: 365),
                              ),
                            );
                            if (d != null) {
                              _followUpDate.text =
                                  '${d.day.toString().padLeft(2, '0')}-${d.month.toString().padLeft(2, '0')}-${d.year}';
                            }
                          },
                        ),
                      ),
                      _buildFormTextColumn(
                        'Start Time',
                        TextFormField(
                          controller: _followUpTime,
                          readOnly: true,
                          decoration: const InputDecoration(
                            hintText: 'Select Time',
                            suffixIcon: Icon(Icons.access_time),
                          ),
                          onTap: () async {
                            final t = await showTimePicker(
                              context: context,
                              initialTime: TimeOfDay.now(),
                            );
                            if (t != null) {
                              _followUpTime.text =
                                  '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
                            }
                          },
                        ),
                      ),
                    ];
                    if (isWide) {
                      return Row(
                        children: fields
                            .map(
                              (f) => Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8.0,
                                  ),
                                  child: f,
                                ),
                              ),
                            )
                            .toList(),
                      );
                    } else {
                      return Column(children: fields);
                    }
                  },
                ),
                const SizedBox(height: 12),
                _buildFormTextColumn(
                  'Follow-Up Reason',
                  TextFormField(
                    controller: _followUpReason,
                    decoration: const InputDecoration(
                      hintText: 'Reason for visit',
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),

        // Family History
        _buildSectionTitle('Family History'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                LayoutBuilder(
                  builder: (context, constraints) {
                    final isWide = constraints.maxWidth > 550;
                    final row1 = [
                      _buildFormTextColumn(
                        'Condition',
                        TextFormField(
                          controller: _famCondition,
                          decoration: const InputDecoration(
                            hintText: 'e.g. Diabetes, Hypertension',
                          ),
                        ),
                      ),
                      _buildFormTextColumn(
                        'Relationship',
                        DropdownButtonFormField<String>(
                          initialValue: _famRelationship,
                          items: _relationships
                              .map(
                                (r) =>
                                    DropdownMenuItem(value: r, child: Text(r)),
                              )
                              .toList(),
                          onChanged: (val) =>
                              setState(() => _famRelationship = val!),
                        ),
                      ),
                    ];
                    if (isWide) {
                      return Row(
                        children: row1
                            .map(
                              (f) => Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8.0,
                                  ),
                                  child: f,
                                ),
                              ),
                            )
                            .toList(),
                      );
                    } else {
                      return Column(children: row1);
                    }
                  },
                ),
                const SizedBox(height: 12),
                _buildFormTextColumn(
                  'Notes / Duration',
                  TextFormField(
                    controller: _famNotes,
                    decoration: const InputDecoration(
                      hintText: 'e.g. Diagnosed at age 50',
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Align(
                  alignment: Alignment.centerRight,
                  child: ElevatedButton.icon(
                    onPressed: _addFamilyHistory,
                    icon: const Icon(Icons.add),
                    label: const Text('Add Family History'),
                  ),
                ),
                if (_familyHistory.isNotEmpty) ...[
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12.0),
                    child: Divider(color: Color(0xFFE3F2FD)),
                  ),
                  ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _familyHistory.length,
                    separatorBuilder: (context, index) =>
                        const Divider(color: Color(0xFFE3F2FD)),
                    itemBuilder: (context, index) {
                      final item = _familyHistory[index];
                      return Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '${item['condition']} (${item['relationship']})',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13,
                                    color: Color(0xFF212121),
                                  ),
                                ),
                                if (item['notes']!.isNotEmpty)
                                  Text(
                                    'Notes: ${item['notes']}',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: Color(0xFF212121),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          IconButton(
                            icon: const Icon(
                              Icons.close,
                              size: 16,
                              color: Color(0xFFD32F2F),
                            ),
                            onPressed: () =>
                                setState(() => _familyHistory.removeAt(index)),
                          ),
                        ],
                      );
                    },
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 32),
        _buildFormActionButtons(
          onSave: () => widget.onSaved(_collectData()),
          onLink: () => widget.onLink(_collectData()),
        ),
      ],
    );
  }

  Map<String, dynamic> _collectData() {
    return {
      'chiefComplaints': _complaints,
      'draftChiefComplaint': _complaintInput.text,
      'vitals': {
        'bpSystolic': _systolicController.text,
        'bpDiastolic': _diastolicController.text,
        'heartRate': _heartRateController.text,
        'respRate': _respRateController.text,
        'spo2': _spo2Controller.text,
        'temp': _tempController.text,
        'height': _heightController.text,
        'weight': _weightController.text,
        'bmi': _bmiController.text,
      },
      'allergies': _allergies,
      'draftAllergy': _allergyInput.text,
      'medicalHistory': _history,
      'draftMedicalHistory': _historyInput.text,
      'labReports': _labReports.map((r) {
        return {
          'reportName': r.nameController.text,
          'observations': r.observations.map((o) {
            return {
              'testName': o.testNameController.text,
              'value': o.valueController.text,
              'unit': o.unitController.text,
            };
          }).toList(),
        };
      }).toList(),
      'procedures': _procedures,
      'draftProcedure': _procedureInput.text,
      'medications': _medications,
      'draftMedication': {
        'name': _medNameController.text,
        'dose': _dosePatternController.text,
        'route': _selectedRoute,
        'timing': _selectedTiming,
        'instructions': _instructionsController.text,
      },
      'carePlan': {
        'title': _carePlanTitle.text,
        'description': _carePlanDesc.text,
        'followUpDate': _followUpDate.text,
        'followUpTime': _followUpTime.text,
        'reason': _followUpReason.text,
      },
      'familyHistory': _familyHistory,
      'draftFamilyHistory': {
        'condition': _famCondition.text,
        'relationship': _famRelationship,
        'notes': _famNotes.text,
      },
    };
  }
}

// ----------------------------------------------------
// Shareable UI Helper Widgets
// ----------------------------------------------------

Widget _buildSectionTitle(String title) {
  return Padding(
    padding: const EdgeInsets.only(top: 8.0, bottom: 10.0, left: 4.0),
    child: Text(
      title,
      style: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w800,
        color: Color(0xFF1976D2),
        letterSpacing: -0.2,
      ),
    ),
  );
}

Widget _buildFormTextColumn(String label, Widget child) {
  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    mainAxisSize: MainAxisSize.min,
    children: [
      Text(
        label,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: Color(0xFF212121),
        ),
      ),
      const SizedBox(height: 8),
      child,
    ],
  );
}

// Helper to build a card that manages a dynamic string list (e.g. Allergies, History)
Widget _buildListManagerCard(
  String title,
  List<String> items,
  TextEditingController controller,
  String hint,
) {
  return StatefulBuilder(
    builder: (context, setState) {
      void addItem() {
        final val = controller.text.trim();
        if (val.isNotEmpty) {
          setState(() {
            items.add(val);
            controller.clear();
          });
        }
      }

      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildSectionTitle(title),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: controller,
                          decoration: InputDecoration(hintText: hint),
                          onFieldSubmitted: (_) => addItem(),
                        ),
                      ),
                      const SizedBox(width: 12),
                      SizedBox(
                        height: 54,
                        child: ElevatedButton(
                          onPressed: addItem,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF1976D2),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                            ),
                          ),
                          child: const Icon(Icons.add, color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                  if (items.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: items.asMap().entries.map((entry) {
                        final idx = entry.key;
                        final text = entry.value;
                        return Chip(
                          label: Text(text),
                          labelStyle: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF212121),
                          ),
                          backgroundColor: const Color(0xFFF4F6F9),
                          side: const BorderSide(color: Color(0xFFE3F2FD)),
                          deleteIcon: const Icon(
                            Icons.close,
                            size: 16,
                            color: Color(0xFF212121),
                          ),
                          onDeleted: () {
                            setState(() {
                              items.removeAt(idx);
                            });
                          },
                        );
                      }).toList(),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      );
    },
  );
}

// Action Buttons: Save and Link to ABDM
Widget _buildFormActionButtons({
  required VoidCallback onSave,
  required VoidCallback onLink,
}) {
  return LayoutBuilder(
    builder: (context, constraints) {
      final isWide = constraints.maxWidth > 450;
      final buttons = [
        OutlinedButton(
          onPressed: onSave,
          child: const Text('Save Local Draft'),
        ),
        const SizedBox(width: 16, height: 12),
        ElevatedButton(
          onPressed: onLink,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF00A86B),
          ),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.link, size: 18, color: Colors.white),
              SizedBox(width: 8),
              Text('Link to ABDM'),
            ],
          ),
        ),
      ];

      if (isWide) {
        return Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: buttons
              .map((b) => b is SizedBox ? b : Expanded(child: b))
              .toList(),
        );
      } else {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: buttons
              .map((b) => b is SizedBox ? const SizedBox(height: 12) : b)
              .toList(),
        );
      }
    },
  );
}
