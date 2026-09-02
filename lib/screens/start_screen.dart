// ignore_for_file: unused_element

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:sarita_abdm/screens/Abha_home_screen.dart';
import 'package:sarita_abdm/screens/Abha_login_screen.dart';
import 'package:sarita_abdm/screens/basic_patient_registration_screen.dart';
import 'package:sarita_abdm/screens/create_Abha_screen.dart';
import 'package:sarita_abdm/config/hospital_config.dart';
import 'package:sarita_abdm/services/scan_share_api_service.dart';
import 'package:sarita_abdm/widgets/abha_card_preview_dialog.dart';
import 'package:sarita_abdm/widgets/patient_profile_details_dialog.dart';
import 'package:sarita_abdm/widgets/scan_share_qr_dialog.dart';

import '../utils/app_runtime_store.dart';
import '../utils/registered_users_store.dart';
import '../m3/screens/hiu_module_screen.dart';

class StartScreen extends StatefulWidget {
  const StartScreen({super.key});

  @override
  State<StartScreen> createState() => _StartScreenState();
}

class _StartScreenState extends State<StartScreen> {
  final Map<String, String> _selectedAddressByUserId = <String, String>{};
  final Map<String, String> _selectedProfileKeyByUserId = <String, String>{};
  final TextEditingController _searchCtrl = TextEditingController();
  List<Map<String, dynamic>> _scanShareQueue = const <Map<String, dynamic>>[];
  Timer? _scanSharePollTimer;
  bool _scanShareLoading = false;
  bool _preparingScanShareQr = false;
  String? _scanShareError;

  @override
  void initState() {
    super.initState();
    _refreshScanShareQueue();
    _scanSharePollTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => _refreshScanShareQueue(silent: true),
    );
  }

  @override
  void dispose() {
    _scanSharePollTimer?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(HospitalConfig.appTitle)),
      body: ValueListenableBuilder<int>(
        valueListenable: AppRuntimeStore.revision,
        builder: (context, value, child) {
          final users = RegisteredUsersStore.users();
          final filteredUsers = _filteredUsers(users);

          return Container(
            width: double.infinity,
            height: double.infinity,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color(0xFFF4FBFF),
                  Color(0xFFF4FBF6),
                  Color(0xFFFFFFFF),
                ],
              ),
            ),
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 22, 24, 24),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1600),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _heroHeader(context, users.length),
                      const SizedBox(height: 22),
                      _searchStrip(filteredUsers.length),
                      const SizedBox(height: 18),
                      _scanShareQueuePanel(context),
                      const SizedBox(height: 18),
                      _patientsTableShell(context, filteredUsers),
                      const SizedBox(height: 22),
                      const Text(
                        'Current workspace opens after you select a patient to work on.',
                        style: TextStyle(
                          color: Color(0xFF48625C),
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _heroHeader(BuildContext context, int totalUsers) {
    return Container(
      padding: const EdgeInsets.fromLTRB(28, 28, 28, 28),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(32),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFEAF6FF), Color(0xFFEAF9F0), Color(0xFFFFFFFF)],
        ),
        border: Border.all(color: const Color(0xFFD7E4F0)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x120E2233),
            blurRadius: 28,
            offset: Offset(0, 16),
          ),
        ],
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < 1080;
          final left = Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.86),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: const Color(0xFFD7E4F0)),
                ),
                child: Text(
                  'Patient Selection',
                  style: const TextStyle(
                    color: Color(0xFF1B5E8C),
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.2,
                  ),
                ),
              ),
              const SizedBox(height: 22),
              RichText(
                text: TextSpan(
                  style: TextStyle(
                    fontSize: 42,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -1.3,
                    height: 1.05,
                  ),
                  children: [
                    TextSpan(
                      text: '${HospitalConfig.hospitalShortName} ',
                      style: TextStyle(color: Color(0xFF1B5E8C)),
                    ),
                    TextSpan(
                      text: HospitalConfig.hospitalName.replaceFirst(
                        '${HospitalConfig.hospitalShortName} ',
                        '',
                      ),
                      style: TextStyle(color: Color(0xFF2F8F5B)),
                    ),
                    TextSpan(
                      text: '\nABDM Patients',
                      style: TextStyle(color: Color(0xFF17324A)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              ConstrainedBox(
                constraints: BoxConstraints(maxWidth: 720),
                child: Text(
                  'Start from a patient list that feels calm and operational. Select one person, then move into the current working page for profile, ABHA card, M1 verification, and Scan & Share tasks.',
                  style: TextStyle(
                    color: Color(0xFF577086),
                    fontSize: 16,
                    height: 1.55,
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  _GreenPill('Registered users: $totalUsers'),
                  const _GreenPill('ABHA Address switcher'),
                  const _GreenPill('Select patient to continue'),
                  _GreenPill('Blue-green ${HospitalConfig.workspaceName}'),
                ],
              ),
            ],
          );

          final actions = Column(
            crossAxisAlignment: compact
                ? CrossAxisAlignment.start
                : CrossAxisAlignment.end,
            children: [
              Container(
                constraints: const BoxConstraints(maxWidth: 420),
                padding: const EdgeInsets.all(22),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.92),
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(color: const Color(0xFFD7E4F0)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Open a flow',
                      style: TextStyle(
                        color: Color(0xFF17324A),
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Create a new ABHA profile, verify an existing ABHA, or register a patient who does not yet have ABHA details.',
                      style: TextStyle(
                        color: Color(0xFF5A6F82),
                        fontSize: 14,
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 18),
                    SizedBox(
                      height: 54,
                      child: ElevatedButton(
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const CreateAbhaScreen(),
                            ),
                          );
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF1B5E8C),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                        child: const Text('Create ABHA'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      height: 54,
                      child: OutlinedButton.icon(
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) =>
                                  const BasicPatientRegistrationScreen(),
                            ),
                          );
                        },
                        icon: const Icon(Icons.person_add_alt_1_rounded),
                        label: const Text('Register Patient (No ABHA)'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF1B5E8C),
                          side: const BorderSide(color: Color(0xFF9CC8E5)),
                          backgroundColor: const Color(0xFFF7FBFF),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      height: 54,
                      child: OutlinedButton(
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const AbhaLoginScreen(),
                            ),
                          );
                        },
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF2F8F5B),
                          side: const BorderSide(color: Color(0xFFA9DDBD)),
                          backgroundColor: const Color(0xFFF7FCF8),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                        child: const Text('ABHA Verification'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      height: 54,
                      child: ElevatedButton.icon(
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const HiuModuleScreen(),
                            ),
                          );
                        },
                        icon: const Icon(Icons.health_and_safety_rounded),
                        label: const Text('HIU Module'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF2F8F5B),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF7FBFF),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFFD9E7F2)),
                      ),
                      child: const Text(
                        'Use ABHA Verification for patients who already have ABHA details. Use patient registration when those details are not yet available.',
                        style: TextStyle(
                          color: Color(0xFF607285),
                          fontSize: 13,
                          height: 1.45,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );

          if (compact) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [left, const SizedBox(height: 18), actions],
            );
          }

          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(flex: 5, child: left),
              const SizedBox(width: 20),
              Expanded(flex: 6, child: actions),
            ],
          );
        },
      ),
    );
  }

  Widget _searchStrip(int filteredCount) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        boxShadow: const [
          BoxShadow(
            color: Color(0x120E2233),
            blurRadius: 18,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < 940;
          final searchField = SizedBox(
            width: compact ? double.infinity : 320,
            child: TextField(
              controller: _searchCtrl,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: 'Search by name, ABHA address, number, or mobile',
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 16,
                ),
                filled: true,
                fillColor: const Color(0xFFFBFCFD),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(
                    color: Color(0xFF1B5E8C),
                    width: 1.3,
                  ),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: Color(0xFFD5E1EC)),
                ),
              ),
            ),
          );

          final searchButton = ElevatedButton(
            onPressed: () => setState(() {}),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF2F8F5B),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 18),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: const Text('Search'),
          );

          final refreshButton = IconButton(
            tooltip: 'Refresh list',
            onPressed: () => setState(() {}),
            icon: const Icon(Icons.refresh_rounded, color: Color(0xFF2BC46A)),
          );

          final countText = Text(
            '$filteredCount patient${filteredCount == 1 ? '' : 's'} shown',
            style: const TextStyle(
              color: Color(0xFF5A6F82),
              fontWeight: FontWeight.w700,
            ),
          );

          if (compact) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    refreshButton,
                    const SizedBox(width: 8),
                    Expanded(child: searchField),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    searchButton,
                    const SizedBox(width: 12),
                    Expanded(
                      child: Align(
                        alignment: Alignment.centerRight,
                        child: countText,
                      ),
                    ),
                  ],
                ),
              ],
            );
          }

          return Row(
            children: [
              refreshButton,
              const SizedBox(width: 8),
              searchField,
              const SizedBox(width: 12),
              searchButton,
              const Spacer(),
              countText,
            ],
          );
        },
      ),
    );
  }

  Widget _scanShareQueuePanel(BuildContext context) {
    final queuedCount = _scanShareQueue.length;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFD7E9F6)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x120E2233),
            blurRadius: 20,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Tooltip(
                message: 'Open Scan and Share QR',
                child: Material(
                  color: const Color(0xFFEAF6FF),
                  borderRadius: BorderRadius.circular(14),
                  child: InkWell(
                    onTap: _preparingScanShareQr
                        ? null
                        : _prepareAndShowScanShareQrDialog,
                    borderRadius: BorderRadius.circular(14),
                    child: SizedBox(
                      width: 40,
                      height: 40,
                      child: Center(
                        child: _preparingScanShareQr
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(
                                Icons.qr_code_scanner_rounded,
                                color: Color(0xFF1B6C9E),
                              ),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Scan and Share Queue',
                      style: TextStyle(
                        color: Color(0xFF17324A),
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      'Mobile scans appear here with a token number. Register the queued patients one by one.',
                      style: TextStyle(color: Color(0xFF5F7280)),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Text(
                '$queuedCount waiting',
                style: const TextStyle(
                  color: Color(0xFF2F8F5B),
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                tooltip: 'Refresh scan queue',
                onPressed: _scanShareLoading ? null : _refreshScanShareQueue,
                icon: _scanShareLoading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(
                        Icons.refresh_rounded,
                        color: Color(0xFF2BC46A),
                      ),
              ),
            ],
          ),
          if (_scanShareError != null) ...[
            const SizedBox(height: 12),
            Text(
              _scanShareError!,
              style: const TextStyle(
                color: Color(0xFFB42318),
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 16),
          if (_scanShareQueue.isEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: const Color(0xFFF7FBFF),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFD7E4F0)),
              ),
              child: const Text(
                'No mobile scan is waiting right now. Keep this page open; new scans will appear automatically.',
                style: TextStyle(
                  color: Color(0xFF607285),
                  fontWeight: FontWeight.w600,
                ),
              ),
            )
          else
            Column(
              children: _scanShareQueue
                  .map((record) => _scanShareQueueTile(context, record))
                  .toList(growable: false),
            ),
        ],
      ),
    );
  }

  Widget _scanShareQueueTile(
    BuildContext context,
    Map<String, dynamic> record,
  ) {
    final patient = _scanSharePatient(record);
    final tokenNumber = _cellValue(record['tokenNumber']);
    final name = _cellValue(patient['name']);
    final abhaAddress = _cellValue(patient['AbhaAddress']);
    final mobile = _cellValue(patient['mobile']);
    final abhaNumber = _cellValue(patient['AbhaNumber']);
    final scanCount = _cellValue(record['scanCount']);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFAFCFE),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFD9E7F2)),
      ),
      child: Row(
        children: [
          Container(
            width: 56,
            height: 56,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: const Color(0xFFEAF9F0),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: const Color(0xFFBCE9CB)),
            ),
            child: Text(
              tokenNumber,
              style: const TextStyle(
                color: Color(0xFF218653),
                fontSize: 20,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Wrap(
              spacing: 20,
              runSpacing: 8,
              children: [
                _queueField('Name', name),
                _queueField('ABHA Address', abhaAddress),
                _queueField('ABHA Number', abhaNumber),
                _queueField('Mobile', mobile),
                if (scanCount.isNotEmpty && scanCount != '-')
                  _queueField('Scans', scanCount),
              ],
            ),
          ),
          const SizedBox(width: 12),
          OutlinedButton(
            onPressed: () => _skipScannedPatient(record),
            child: const Text('Skip'),
          ),
          const SizedBox(width: 10),
          ElevatedButton.icon(
            onPressed: () => _registerScannedPatient(record),
            icon: const Icon(Icons.person_add_alt_1_rounded),
            label: const Text('Register'),
          ),
        ],
      ),
    );
  }

  Widget _queueField(String label, String value) {
    return SizedBox(
      width: 210,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: Color(0xFF6A7D8D),
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Color(0xFF17324A),
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  Widget _patientsTableShell(
    BuildContext context,
    List<Map<String, dynamic>> users,
  ) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: const [
          BoxShadow(
            color: Color(0x120E2233),
            blurRadius: 20,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Patients',
            style: TextStyle(
              color: Color(0xFF17324A),
              fontSize: 22,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            users.isEmpty
                ? 'No users are available in this session yet. Create or register a patient to populate the table.'
                : 'Patients without ABHA details are listed as No ABHA and can be verified later. Use the eye icon to review details and the notepad icon to open the current patient workspace.',
            style: const TextStyle(color: Color(0xFF5F7280), height: 1.45),
          ),
          const SizedBox(height: 16),
          if (users.isEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(28),
              decoration: BoxDecoration(
                color: const Color(0xFFF7FBFF),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFD7E4F0)),
              ),
              child: const Text(
                'No patients registered in this app session.',
                style: TextStyle(
                  fontSize: 15,
                  color: Color(0xFF607285),
                  fontWeight: FontWeight.w600,
                ),
              ),
            )
          else
            _registeredUsersTable(context, users),
        ],
      ),
    );
  }

  Widget _registeredUsersTable(
    BuildContext context,
    List<Map<String, dynamic>> users,
  ) {
    final columns = <DataColumn>[
      const DataColumn(label: Text("Name")),
      const DataColumn(label: Text("ABHA Address")),
      const DataColumn(label: Text("ABHA Number")),
      const DataColumn(label: Text("Patient Type")),
      const DataColumn(label: Text("UHID")),
      const DataColumn(label: Text("Mobile")),
      const DataColumn(label: Text("Gender")),
      const DataColumn(label: Text("DOB")),
      const DataColumn(label: Text("Address")),
      const DataColumn(label: Text("Pincode")),
      const DataColumn(label: Text("Actions")),
    ];

    final rows = users
        .map((user) {
          final selectedProfile = _selectedProfileForUser(user);
          return DataRow(
            cells: [
              DataCell(Text(_cellValue(selectedProfile['name']))),
              DataCell(_abhaAddressDropdown(user)),
              DataCell(_abhaNumberDropdown(user)),
              DataCell(Text(_patientTypeLabel(selectedProfile))),
              DataCell(Text(_cellValue(selectedProfile['uhid']))),
              DataCell(Text(_cellValue(selectedProfile['mobile']))),
              DataCell(Text(_cellValue(selectedProfile['gender']))),
              DataCell(Text(_cellValue(selectedProfile['dob']))),
              DataCell(
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 320),
                  child: Text(
                    _cellValue(selectedProfile['address']),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
              DataCell(Text(_cellValue(selectedProfile['pincode']))),
              DataCell(
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      tooltip: "View patient details",
                      onPressed: () =>
                          _showPatientDetails(context, selectedProfile),
                      icon: const Icon(
                        Icons.remove_red_eye_outlined,
                        color: Color(0xFF22B565),
                      ),
                    ),
                    IconButton(
                      tooltip: "Open patient workspace",
                      onPressed: () =>
                          _openPatientWorkspace(context, selectedProfile),
                      icon: const Icon(
                        Icons.sticky_note_2_outlined,
                        color: Color(0xFF22B565),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        })
        .toList(growable: false);

    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: Container(
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFFD6E9DC)),
          borderRadius: BorderRadius.circular(18),
        ),
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Theme(
            data: Theme.of(context).copyWith(
              dataTableTheme: const DataTableThemeData(
                headingRowColor: WidgetStatePropertyAll(Color(0xFF33C06B)),
                headingTextStyle: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                ),
                dataRowMinHeight: 62,
                dataRowMaxHeight: 72,
              ),
            ),
            child: DataTable(
              columns: columns,
              rows: rows,
              headingRowHeight: 64,
              columnSpacing: 26,
              dividerThickness: 0.6,
            ),
          ),
        ),
      ),
    );
  }

  String _patientTypeLabel(Map<String, dynamic> profile) {
    final abhaNumber = _cellValue(profile['AbhaNumber']);
    final abhaAddress = _cellValue(profile['AbhaAddress']);
    return abhaNumber != '-' || abhaAddress != '-'
        ? 'ABHA available'
        : 'No ABHA';
  }

  Widget _abhaAddressDropdown(Map<String, dynamic> user) {
    final options = _profileOptionsForUser(user);
    final selectedAddress = _selectedAddressForUser(user, options);
    if (options.length <= 1) {
      return Text(selectedAddress);
    }

    return DropdownButtonHideUnderline(
      child: DropdownButton<String>(
        value: selectedAddress,
        isDense: true,
        borderRadius: BorderRadius.circular(16),
        icon: const Icon(Icons.keyboard_arrow_down_rounded),
        items: options
            .map(
              (address) => DropdownMenuItem<String>(
                value: address,
                child: SizedBox(
                  width: 180,
                  child: Text(address, overflow: TextOverflow.ellipsis),
                ),
              ),
            )
            .toList(growable: false),
        onChanged: (value) {
          if (value == null) {
            return;
          }
          setState(() {
            _selectedAddressByUserId[_userId(user)] = value;
          });
        },
      ),
    );
  }

  Widget _abhaNumberDropdown(Map<String, dynamic> user) {
    final options = _abhaNumberOptionsForUser(user);
    final selectedAbhaNumber = _selectedAbhaNumberForUser(user, options);
    if (options.length <= 1) {
      return Text(selectedAbhaNumber);
    }

    return DropdownButtonHideUnderline(
      child: DropdownButton<String>(
        value: selectedAbhaNumber,
        isDense: true,
        borderRadius: BorderRadius.circular(16),
        icon: const Icon(Icons.keyboard_arrow_down_rounded),
        items: options
            .map(
              (abhaNumber) => DropdownMenuItem<String>(
                value: abhaNumber,
                child: SizedBox(
                  width: 170,
                  child: Text(abhaNumber, overflow: TextOverflow.ellipsis),
                ),
              ),
            )
            .toList(growable: false),
        onChanged: (value) {
          if (value == null) {
            return;
          }
          setState(() {
            final selectedProfile = _firstProfileMatchingAbhaNumber(
              user,
              value,
            );
            if (selectedProfile.isNotEmpty) {
              _selectedProfileKeyByUserId[_userId(user)] = _profileKeyForUi(
                selectedProfile,
              );
              final selectedAddress = _cellValue(
                selectedProfile['AbhaAddress'],
              );
              if (selectedAddress != '-' && selectedAddress.isNotEmpty) {
                _selectedAddressByUserId[_userId(user)] = selectedAddress;
              }
            }
          });
        },
      ),
    );
  }

  Map<String, dynamic> _selectedProfileForUser(Map<String, dynamic> user) {
    final profiles = _profilesForUser(user);
    if (profiles.isEmpty) {
      return user;
    }

    final selectedProfileKey = _selectedProfileKeyByUserId[_userId(user)];
    if (selectedProfileKey != null) {
      for (final profile in profiles) {
        if (_profileKeyForUi(profile) == selectedProfileKey) {
          return {...user, ...profile};
        }
      }
    }

    return {...user, ...profiles.first};
  }

  List<Map<String, dynamic>> _profilesForUser(Map<String, dynamic> user) {
    final linkedProfiles = user['linkedProfiles'];
    if (linkedProfiles is List) {
      final profiles = linkedProfiles
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
      if (profiles.isNotEmpty) {
        return profiles;
      }
    }
    return <Map<String, dynamic>>[Map<String, dynamic>.from(user)];
  }

  Map<String, dynamic> _firstProfileMatchingAddress(
    Map<String, dynamic> user,
    String address,
  ) {
    for (final profile in _profilesForUser(user)) {
      if (_cellValue(profile['AbhaAddress']).toLowerCase() ==
          address.toLowerCase()) {
        return profile;
      }
    }
    return const <String, dynamic>{};
  }

  Map<String, dynamic> _firstProfileMatchingAbhaNumber(
    Map<String, dynamic> user,
    String abhaNumber,
  ) {
    for (final profile in _profilesForUser(user)) {
      if (_cellValue(profile['AbhaNumber']) == abhaNumber) {
        return profile;
      }
    }
    return const <String, dynamic>{};
  }

  List<String> _profileOptionsForUser(Map<String, dynamic> user) {
    final seen = <String>{};
    final options = <String>[];
    for (final profile in _profilesForUser(user)) {
      final address = _cellValue(profile['AbhaAddress']);
      if (address.isEmpty || address == '-') {
        continue;
      }
      final key = address.toLowerCase();
      if (seen.add(key)) {
        options.add(address);
      }
    }
    final storedAddressHistory = user['AbhaAddresses'];
    if (storedAddressHistory is List) {
      for (final rawAddress in storedAddressHistory) {
        final address = _cellValue(rawAddress);
        if (address.isEmpty || address == '-') {
          continue;
        }
        final key = address.toLowerCase();
        if (seen.add(key)) {
          options.add(address);
        }
      }
    }
    if (options.isEmpty) {
      options.add(_cellValue(user['AbhaAddress']));
    }
    return options;
  }

  List<String> _abhaNumberOptionsForUser(Map<String, dynamic> user) {
    final seen = <String>{};
    final options = <String>[];
    for (final profile in _profilesForUser(user)) {
      final abhaNumber = _cellValue(profile['AbhaNumber']);
      if (abhaNumber.isEmpty || abhaNumber == '-') {
        continue;
      }
      if (seen.add(abhaNumber)) {
        options.add(abhaNumber);
      }
    }
    if (options.isEmpty) {
      options.add(_cellValue(user['AbhaNumber']));
    }
    return options;
  }

  String _selectedAddressForUser(
    Map<String, dynamic> user,
    List<String> options,
  ) {
    final userId = _userId(user);
    final selected = _selectedAddressByUserId[userId];
    if (selected != null &&
        options.any(
          (option) => option.toLowerCase() == selected.toLowerCase(),
        )) {
      return selected;
    }
    return options.first;
  }

  String _selectedAbhaNumberForUser(
    Map<String, dynamic> user,
    List<String> options,
  ) {
    final selectedProfileKey = _selectedProfileKeyByUserId[_userId(user)];
    if (selectedProfileKey != null) {
      for (final profile in _profilesForUser(user)) {
        if (_profileKeyForUi(profile) == selectedProfileKey) {
          final abhaNumber = _cellValue(profile['AbhaNumber']);
          if (options.contains(abhaNumber)) {
            return abhaNumber;
          }
        }
      }
    }
    return _cellValue(_selectedProfileForUser(user)['AbhaNumber']);
  }

  String _userId(Map<String, dynamic> user) =>
      user['id']?.toString() ??
      user['AbhaNumber']?.toString() ??
      user['mobile']?.toString() ??
      '${user['name']}-${user['AbhaAddress']}';

  String _profileKeyForUi(Map<String, dynamic> profile) {
    final abhaAddress = _cellValue(profile['AbhaAddress']).toLowerCase();
    final abhaNumber = _cellValue(profile['AbhaNumber']);
    final mobile = _cellValue(profile['mobile']);
    return '$abhaAddress|$abhaNumber|$mobile';
  }

  List<Map<String, dynamic>> _filteredUsers(List<Map<String, dynamic>> users) {
    final query = _searchCtrl.text.trim().toLowerCase();
    if (query.isEmpty) {
      return users;
    }

    return users
        .where((user) {
          final selected = _selectedProfileForUser(user);
          final haystack = [
            selected['name'],
            selected['AbhaAddress'],
            selected['AbhaNumber'],
            selected['uhid'],
            selected['mobile'],
            selected['gender'],
            selected['dob'],
            selected['address'],
            selected['pincode'],
          ].map((value) => value?.toString().toLowerCase() ?? '').join(' ');
          return haystack.contains(query);
        })
        .toList(growable: false);
  }

  void _openPatientWorkspace(BuildContext context, Map<String, dynamic> user) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => AbhaHomeScreen(selectedUser: user)),
    );
  }

  Future<void> _refreshScanShareQueue({bool silent = false}) async {
    if (_scanShareLoading && !silent) {
      return;
    }
    if (!silent) {
      setState(() {
        _scanShareLoading = true;
        _scanShareError = null;
      });
    }

    try {
      final queue = await ScanShareApiService.fetchQueue();
      if (!mounted) {
        return;
      }
      setState(() {
        _scanShareQueue = queue;
        _scanShareError = null;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      if (!silent) {
        setState(() {
          _scanShareError =
              'Could not fetch scan queue. Check that the backend is running.';
        });
      }
    } finally {
      if (mounted && !silent) {
        setState(() {
          _scanShareLoading = false;
        });
      }
    }
  }

  Future<void> _prepareAndShowScanShareQrDialog() async {
    if (_preparingScanShareQr) return;

    setState(() => _preparingScanShareQr = true);
    try {
      await ScanShareQrDialog.prepareAndShow(context);
    } finally {
      if (mounted) {
        setState(() => _preparingScanShareQr = false);
      }
    }
  }

  Future<void> _registerScannedPatient(Map<String, dynamic> record) async {
    final patient = _scanSharePatient(record);
    final tokenNumber = _cellValue(record['tokenNumber']);
    RegisteredUsersStore.upsert(patient);

    try {
      await ScanShareApiService.markRegistered(tokenNumber);
    } catch (_) {
      // Local registration should still succeed even if the status sync fails.
    }

    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Token $tokenNumber registered for ${_cellValue(patient['name'])}.',
        ),
      ),
    );
    await _refreshScanShareQueue(silent: true);
    if (mounted) {
      setState(() {});
    }
  }

  Future<void> _skipScannedPatient(Map<String, dynamic> record) async {
    final tokenNumber = _cellValue(record['tokenNumber']);
    try {
      await ScanShareApiService.skip(tokenNumber);
      await _refreshScanShareQueue(silent: true);
      if (mounted) {
        setState(() {});
      }
    } catch (_) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not skip token $tokenNumber.')),
      );
    }
  }

  Map<String, dynamic> _scanSharePatient(Map<String, dynamic> record) {
    final rawPatient = record['patient'];
    final patient = rawPatient is Map
        ? Map<String, dynamic>.from(rawPatient)
        : <String, dynamic>{};
    return {
      'name': _cleanScanValue(patient['name']),
      'AbhaAddress': _cleanScanValue(patient['abhaAddress']),
      'AbhaNumber': _cleanScanValue(patient['abhaNumber']),
      'mobile': _cleanScanValue(patient['mobile']),
      'gender': _cleanScanValue(patient['gender']),
      'dob': _cleanScanValue(patient['dob']),
      'address': _cleanScanValue(patient['address']),
      'district': _cleanScanValue(patient['district']),
      'state': _cleanScanValue(patient['state']),
      'pincode': _cleanScanValue(patient['pincode']),
      'rawProfile': patient['rawProfile'] ?? patient,
      'source': 'scan-share',
      'scanShareTokenNumber': record['tokenNumber'],
      'registeredAt': DateTime.now().toIso8601String(),
    };
  }

  String _cleanScanValue(Object? value) {
    final text = value?.toString().trim() ?? '';
    return text == '-' ? '' : text;
  }

  Future<void> _showPatientDetails(
    BuildContext context,
    Map<String, dynamic> user,
  ) async {
    final saved = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => PatientProfileDetailsDialog(user: user),
    );
    if (!mounted) {
      return;
    }
    if (saved == true) {
      setState(() {});
    }
  }

  Future<void> _showRegisteredUserCard(
    BuildContext context,
    Map<String, dynamic> user,
  ) async {
    await showRegisteredPatientAbhaCardPreviewDialog(
      context,
      cardPayload: user['cardPayload'] is Map<String, dynamic>
          ? Map<String, dynamic>.from(
              user['cardPayload'] as Map<String, dynamic>,
            )
          : null,
      userSession: user,
      onCardPayloadLoaded: (payload) {
        user['cardPayload'] = payload;
      },
      unavailableMessage:
          'ABHA card is not available for this user in the current app session.',
    );
  }

  void _showInfoDialog(BuildContext context, String message) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text("Info"),
          content: Text(message),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text("OK"),
            ),
          ],
        );
      },
    );
  }

  Widget _qrPanel() {
    return Container(
      width: 122,
      height: 122,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFBFE7C0)),
      ),
      child: CustomPaint(painter: _QrPainter()),
    );
  }

  String _cellValue(Object? value) {
    final text = value?.toString().trim() ?? '';
    return text.isEmpty ? '-' : text;
  }
}

class _GreenPill extends StatelessWidget {
  const _GreenPill(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.86),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0xFFD7E4F0)),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Color(0xFF1B5E8C),
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _QrPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final whitePaint = Paint()..color = Colors.white;
    final blackPaint = Paint()..color = Colors.black;
    canvas.drawRect(Offset.zero & size, whitePaint);

    final cell = size.width / 21;
    for (var row = 0; row < 21; row++) {
      for (var col = 0; col < 21; col++) {
        final inFinder = _isFinder(row, col);
        final filled = inFinder || ((row * 7 + col * 11 + row * col) % 5 == 0);
        if (!filled) {
          continue;
        }
        canvas.drawRect(
          Rect.fromLTWH(col * cell, row * cell, cell, cell),
          blackPaint,
        );
      }
    }
  }

  bool _isFinder(int row, int col) {
    const positions = [Offset(0, 0), Offset(14, 0), Offset(0, 14)];
    for (final position in positions) {
      final r = row - position.dy.toInt();
      final c = col - position.dx.toInt();
      if (r >= 0 && r < 7 && c >= 0 && c < 7) {
        if (r == 0 || r == 6 || c == 0 || c == 6) return true;
        if (r >= 2 && r <= 4 && c >= 2 && c <= 4) return true;
      }
    }
    return false;
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
