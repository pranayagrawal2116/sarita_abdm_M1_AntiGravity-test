import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../services/hiu_api_service.dart';
import 'consent_detail_screen.dart';

class HiuModuleScreen extends StatefulWidget {
  const HiuModuleScreen({super.key});

  @override
  State<HiuModuleScreen> createState() => _HiuModuleScreenState();
}

class _HiuModuleScreenState extends State<HiuModuleScreen> {
  int _selectedIndex = 0;
  final HiuApiService _apiService = HiuApiService();

  // Form State
  final _formKey = GlobalKey<FormState>();
  final TextEditingController _abhaController = TextEditingController();
  final TextEditingController _requesterController = TextEditingController();
  String _selectedPurpose = 'Care Management';
  
  final List<String> _purposes = [
    'Care Management',
    'Self Requested',
    'Telemedicine',
  ];

  final List<String> _availableHiTypes = [
    'DiagnosticReport',
    'Prescription',
    'OPConsultation',
    'DischargeSummary',
    'ImmunizationRecord',
    'HealthDocumentRecord',
    'WellnessRecord',
    'Invoice'
  ];
  final Set<String> _selectedHiTypes = {};

  DateTime _dataFrom = DateTime.now().subtract(const Duration(days: 365));
  DateTime _dataTo = DateTime.now();
  DateTime? _dataEraseAt = DateTime.now().add(const Duration(days: 365));

  bool _isLoading = false;
  List<dynamic> _requests = [];

  // Filter State for MyRequests Tab
  final TextEditingController _filterAbhaController = TextEditingController();
  String _filterStatus = 'All Status';
  DateTime? _filterDateFrom;
  DateTime? _filterDateTo;

  @override
  void initState() {
    super.initState();
    _fetchRequests();
  }

  @override
  void dispose() {
    _abhaController.dispose();
    _requesterController.dispose();
    _filterAbhaController.dispose();
    super.dispose();
  }

  Future<void> _fetchRequests() async {
    setState(() => _isLoading = true);
    try {
      final data = await _apiService.fetchConsentRequests();
      setState(() {
        _requests = data;
        // Stats removed as per new UI

      });
    } catch (e) {
      // Fallback or leave as default
      debugPrint('Error fetching requests: $e');
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _submitConsentRequest() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedHiTypes.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select at least one HI Type')),
      );
      return;
    }

    setState(() => _isLoading = true);

    if (_dataEraseAt == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select an erase date')),
      );
      setState(() => _isLoading = false);
      return;
    }

    String abhaAddress = _abhaController.text;
    if (!abhaAddress.endsWith('@sbx')) {
      abhaAddress += '@sbx';
    }

    final payload = {
      "patientId": abhaAddress,
      "requesterName": _requesterController.text,
      "purpose": _selectedPurpose,
      "hiTypes": _selectedHiTypes.toList(),
      "dateFrom": _dataFrom.toUtc().toIso8601String(),
      "dateTo": _dataTo.toUtc().toIso8601String(),
      "dateEraseAt": _dataEraseAt!.toUtc().toIso8601String(),
    };

    try {
      await _apiService.initConsentRequest(payload);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Consent Request Initiated Successfully')),
        );
        setState(() => _selectedIndex = 1);
        _fetchRequests();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _selectDateTime(BuildContext context, DateTime? initialDate,
      Function(DateTime) onDateSelected) async {
    final DateTime? pickedDate = await showDatePicker(
      context: context,
      initialDate: initialDate ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2101),
    );
    if (pickedDate != null) {
      if (!context.mounted) return;
      final TimeOfDay? pickedTime = await showTimePicker(
        context: context,
        initialTime: TimeOfDay.fromDateTime(initialDate ?? DateTime.now()),
      );
      if (pickedTime != null) {
        onDateSelected(DateTime(
          pickedDate.year,
          pickedDate.month,
          pickedDate.day,
          pickedTime.hour,
          pickedTime.minute,
        ));
      }
    }
  }



  InputDecoration _buildInputDeco(String label, {String? suffixText, String? errorText}) {
    return InputDecoration(
      labelText: label,
      suffixText: suffixText,
      errorText: errorText,
      filled: true,
      fillColor: Colors.white.withOpacity(0.8),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFD7E4F0)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFD7E4F0)),
      ),
    );
  }

  Widget _buildNewConsentTab() {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.86),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: const Color(0xFFD7E4F0)),
            ),
            child: const Text(
              'Create Consent Request',
              style: TextStyle(color: Color(0xFF1B5E8C), fontWeight: FontWeight.w800, letterSpacing: 0.2),
            ),
          ),
          const SizedBox(height: 24),
                  TextFormField(
                    controller: _abhaController,
                    decoration: _buildInputDeco('Patient ABHA Address', suffixText: '@sbx'),
                    validator: (val) => val == null || val.isEmpty ? 'Required field' : null,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _requesterController,
                    decoration: _buildInputDeco('Requester Name'),
                    validator: (val) => val == null || val.isEmpty ? 'Required field' : null,
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    value: _selectedPurpose,
                    decoration: _buildInputDeco('Purpose'),
              items: _purposes.map((p) {
                return DropdownMenuItem(value: p, child: Text(p));
              }).toList(),
              onChanged: (val) {
                if (val != null) setState(() => _selectedPurpose = val);
              },
            ),
            const SizedBox(height: 24),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Health Info Types (Select multiple)',
                        style: TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF1B5E8C)),
                      ),
                      TextButton(
                        onPressed: () {
                          setState(() {
                            if (_selectedHiTypes.length == _availableHiTypes.length) {
                              _selectedHiTypes.clear();
                            } else {
                              _selectedHiTypes.addAll(_availableHiTypes);
                            }
                          });
                        },
                        style: TextButton.styleFrom(
                          foregroundColor: const Color(0xFF2F8F5B),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        child: Text(
                          _selectedHiTypes.length == _availableHiTypes.length ? 'Clear All' : 'Select All',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8.0,
                    runSpacing: 8.0,
                    children: _availableHiTypes.map((type) {
                      final isSelected = _selectedHiTypes.contains(type);
                      return FilterChip(
                        label: Text(type, style: TextStyle(color: isSelected ? Colors.white : const Color(0xFF1B5E8C), fontWeight: isSelected ? FontWeight.bold : FontWeight.normal)),
                        selected: isSelected,
                        selectedColor: const Color(0xFF2F8F5B),
                        backgroundColor: Colors.white.withOpacity(0.8),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8), side: const BorderSide(color: Color(0xFFD7E4F0))),
                        onSelected: (selected) {
                          setState(() {
                            if (selected) {
                              _selectedHiTypes.add(type);
                            } else {
                              _selectedHiTypes.remove(type);
                            }
                          });
                        },
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      Expanded(
                        child: InkWell(
                          onTap: () => _selectDateTime(context, _dataFrom, (d) => setState(() => _dataFrom = d)),
                          child: InputDecorator(
                            decoration: _buildInputDeco('Data From'),
                            child: Text(DateFormat('yyyy-MM-dd HH:mm').format(_dataFrom), style: const TextStyle(fontWeight: FontWeight.w500)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: InkWell(
                          onTap: () => _selectDateTime(context, _dataTo, (d) => setState(() => _dataTo = d)),
                          child: InputDecorator(
                            decoration: _buildInputDeco('Data To'),
                            child: Text(DateFormat('yyyy-MM-dd HH:mm').format(_dataTo), style: const TextStyle(fontWeight: FontWeight.w500)),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  InkWell(
                    onTap: () => _selectDateTime(context, _dataEraseAt, (d) => setState(() => _dataEraseAt = d)),
                    child: InputDecorator(
                      decoration: _buildInputDeco('Data Erase At', errorText: _dataEraseAt == null ? 'Please select an erase date' : null),
                      child: Text(_dataEraseAt != null ? DateFormat('yyyy-MM-dd HH:mm').format(_dataEraseAt!) : 'Select Date & Time', style: const TextStyle(fontWeight: FontWeight.w500)),
                    ),
                  ),
                  const SizedBox(height: 32),
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : _submitConsentRequest,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2F8F5B),
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: _isLoading
                          ? const SizedBox(height: 24, width: 24, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Text(
                              'Submit Consent Request',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                            ),
                    ),
                  ),
        ],
      ),
    );
  }

  Widget _buildMyRequestsTab() {
    String _mapStatus(String rawStatus) {
      final s = rawStatus.toUpperCase();
      if (s == 'FETCHED' || s == 'GRANTED') return 'GRANTED';
      if (s == 'INITIATED' || s == 'REQUESTED') return 'REQUESTED';
      if (s == 'REVOKED') return 'REVOKED';
      if (s == 'EXPIRED') return 'EXPIRED';
      if (s == 'DENIED') return 'DENIED';
      return 'REQUESTED';
    }

    List<dynamic> filteredRequests = _requests.where((req) {
      bool matchAbha = true;
      if (_filterAbhaController.text.isNotEmpty) {
         final patientId = req['patientId']?.toString().toLowerCase() ?? '';
         matchAbha = patientId.contains(_filterAbhaController.text.toLowerCase());
      }
      bool matchStatus = true;
      if (_filterStatus != 'All Status') {
         final rawStatus = req['status']?.toString() ?? 'UNKNOWN';
         matchStatus = _mapStatus(rawStatus) == _filterStatus.toUpperCase();
      }
      bool matchDateFrom = true;
      if (_filterDateFrom != null) {
         final createdStr = req['timestamp'] ?? req['createdAt'];
         if (createdStr != null) {
            final createdDate = DateTime.parse(createdStr);
            if (createdDate.isBefore(_filterDateFrom!)) matchDateFrom = false;
         }
      }
      bool matchDateTo = true;
      if (_filterDateTo != null) {
         final createdStr = req['timestamp'] ?? req['createdAt'];
         if (createdStr != null) {
            final createdDate = DateTime.parse(createdStr);
            final toDate = DateTime(_filterDateTo!.year, _filterDateTo!.month, _filterDateTo!.day, 23, 59, 59);
            if (createdDate.isAfter(toDate)) matchDateTo = false;
         }
      }
      return matchAbha && matchStatus && matchDateFrom && matchDateTo;
    }).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Top Filter Section
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: const Color(0xFF0C8A99),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Wrap(
            spacing: 24,
            runSpacing: 16,
            crossAxisAlignment: WrapCrossAlignment.end,
            children: [
              SizedBox(
                width: 200,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('ABHA Address', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    Container(
                      height: 44,
                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6)),
                      child: TextField(
                        controller: _filterAbhaController,
                        decoration: const InputDecoration(
                          hintText: 'Search ABHA address',
                          contentPadding: EdgeInsets.symmetric(horizontal: 16),
                          border: InputBorder.none,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(
                width: 160,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Status', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    Container(
                      height: 44,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6)),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          isExpanded: true,
                          value: _filterStatus,
                          items: ['All Status', 'GRANTED', 'REQUESTED', 'EXPIRED', 'DENIED']
                              .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                              .toList(),
                          onChanged: (val) {
                            if (val != null) setState(() => _filterStatus = val);
                          },
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(
                width: 160,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Date From', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    InkWell(
                      onTap: () async {
                        final d = await showDatePicker(context: context, initialDate: DateTime.now(), firstDate: DateTime(2000), lastDate: DateTime(2100));
                        if (d != null) setState(() => _filterDateFrom = d);
                      },
                      child: Container(
                        height: 44,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6)),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(_filterDateFrom != null ? DateFormat('dd MMM, yyyy').format(_filterDateFrom!) : 'Select Date From', style: TextStyle(color: _filterDateFrom != null ? Colors.black87 : Colors.grey, fontSize: 13)),
                            const Icon(Icons.calendar_today_outlined, size: 16, color: Colors.grey),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(
                width: 160,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Date To', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    InkWell(
                      onTap: () async {
                        final d = await showDatePicker(context: context, initialDate: DateTime.now(), firstDate: DateTime(2000), lastDate: DateTime(2100));
                        if (d != null) setState(() => _filterDateTo = d);
                      },
                      child: Container(
                        height: 44,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6)),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(_filterDateTo != null ? DateFormat('dd MMM, yyyy').format(_filterDateTo!) : 'Select Date To', style: TextStyle(color: _filterDateTo != null ? Colors.black87 : Colors.grey, fontSize: 13)),
                            const Icon(Icons.calendar_today_outlined, size: 16, color: Colors.grey),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(
                height: 44,
                child: ElevatedButton.icon(
                  onPressed: () { setState(() {}); },
                  icon: const Icon(Icons.search, size: 16, color: Colors.white),
                  label: const Text('Search', style: TextStyle(color: Colors.white)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1CB1C2),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                    elevation: 0,
                  ),
                ),
              ),
              SizedBox(
                height: 44,
                child: OutlinedButton.icon(
                  onPressed: () {
                    setState(() {
                      _filterAbhaController.clear();
                      _filterStatus = 'All Status';
                      _filterDateFrom = null;
                      _filterDateTo = null;
                    });
                  },
                  icon: const Icon(Icons.refresh, size: 16, color: Color(0xFF0C8A99)),
                  label: const Text('Reset Search', style: TextStyle(color: Color(0xFF0C8A99))),
                  style: OutlinedButton.styleFrom(
                    backgroundColor: Colors.white,
                    side: BorderSide.none,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 32),
        
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                const Icon(Icons.list_alt, color: Color(0xFF1CB1C2)),
                const SizedBox(width: 8),
                const Text('Consents Request List', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF17324A))),
              ],
            ),
            OutlinedButton.icon(
              onPressed: _fetchRequests,
              icon: const Icon(Icons.refresh, size: 16, color: Color(0xFF0C8A99)),
              label: const Text('Refresh', style: TextStyle(color: Color(0xFF0C8A99))),
              style: OutlinedButton.styleFrom(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                side: const BorderSide(color: Color(0xFFD7E4F0)),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text('${filteredRequests.length} request(s) · Page 1 of 1', style: const TextStyle(color: Color(0xFF577086), fontSize: 13)),
        const SizedBox(height: 16),
        
        if (_isLoading)
          const Padding(padding: EdgeInsets.all(48.0), child: Center(child: CircularProgressIndicator(color: Color(0xFF0C8A99))))
        else if (filteredRequests.isEmpty)
          const Padding(padding: EdgeInsets.all(48.0), child: Center(child: Text('No requests found', style: TextStyle(color: Color(0xFF577086), fontSize: 16))))
        else
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: const Color(0xFFD7E4F0)),
              borderRadius: BorderRadius.circular(8),
            ),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: DataTable(
                showCheckboxColumn: false,
                headingRowColor: MaterialStateProperty.all(const Color(0xFFF4FBFF)),
                dataRowMinHeight: 120,
                dataRowMaxHeight: double.infinity,
                columnSpacing: 32,
                columns: const [
                  DataColumn(label: Text('S.NO', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Color(0xFF17324A)))),
                  DataColumn(label: Text('PATIENT', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Color(0xFF17324A)))),
                  DataColumn(label: Text('REQUESTED FOR', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Color(0xFF17324A)))),
                  DataColumn(label: Text('STATUS', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Color(0xFF17324A)))),
                  DataColumn(label: Text('GRANTED FOR', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Color(0xFF17324A)))),
                  DataColumn(label: Text('REQUESTED DATES', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Color(0xFF17324A)))),
                  DataColumn(label: Text('GRANTED DATES', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Color(0xFF17324A)))),
                  DataColumn(label: Text('CREATED AT / EXPIRES AT', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Color(0xFF17324A)))),
                  DataColumn(label: Text('DETAIL', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Color(0xFF17324A)))),
                ],
                rows: filteredRequests.asMap().entries.map((entry) {
                  final index = entry.key;
                  final req = entry.value;
                  final rawStatus = req['status']?.toString() ?? 'UNKNOWN';
                  String displayStatus = _mapStatus(rawStatus);
                  final patientId = req['patientId']?.toString() ?? 'Unknown';
                  final hiTypes = (req['hiTypes'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [];
                  
                  final dateFromStr = req['dateFrom'] ?? '';
                  final dateToStr = req['dateTo'] ?? '';
                  final dateEraseAtStr = req['dateEraseAt'] ?? '';
                  final createdStr = req['timestamp'] ?? req['createdAt'] ?? '';
                  final updatedStr = req['updatedAt'] ?? createdStr;
                  
                  String grantedDateFromStr = dateFromStr;
                  String grantedDateToStr = dateToStr;
                  String grantedDateEraseAtStr = dateEraseAtStr;
                  dynamic artDetails = req['details'];
                  if (artDetails == null && req['artefactDetails'] != null) {
                    final keys = (req['artefactDetails'] as Map).keys.toList();
                    if (keys.isNotEmpty) artDetails = req['artefactDetails'][keys.first];
                  }
                  
                  if (artDetails != null && artDetails['permission'] != null) {
                    final perm = artDetails['permission'];
                    if (perm['dateRange'] != null) {
                      grantedDateFromStr = perm['dateRange']['from']?.toString() ?? grantedDateFromStr;
                      grantedDateToStr = perm['dateRange']['to']?.toString() ?? grantedDateToStr;
                    }
                    grantedDateEraseAtStr = perm['dataEraseAt']?.toString() ?? grantedDateEraseAtStr;
                  }
                  
                  // Auto-expire logic based on current time
                  if (displayStatus != 'DENIED' && displayStatus != 'REVOKED' && grantedDateEraseAtStr.isNotEmpty) {
                    try {
                      final expireTime = DateTime.parse(grantedDateEraseAtStr).toLocal();
                      if (DateTime.now().isAfter(expireTime)) {
                        displayStatus = 'EXPIRED';
                      }
                    } catch (_) {}
                  }
                  
                  String formatDate(String isoStr) {
                    if (isoStr.isEmpty) return '-';
                    try {
                      return DateFormat('dd MMM, yyyy hh:mm a').format(DateTime.parse(isoStr).toLocal());
                    } catch (e) {
                      return isoStr;
                    }
                  }
                  
                  Color statusColor;
                  switch (displayStatus) {
                    case 'GRANTED': statusColor = const Color(0xFF2F8F5B); break;
                    case 'DENIED': statusColor = Colors.red; break;
                    case 'REQUESTED': statusColor = Colors.blue; break;
                    case 'EXPIRED': statusColor = Colors.orange; break;
                    default: statusColor = Colors.grey;
                  }

                  final details = req['details'];
                  List<String> grantedTypes = [];
                  if (details != null && details['hiTypes'] != null) {
                    grantedTypes = (details['hiTypes'] as List).map((e) => e.toString()).toList();
                  } else {
                    grantedTypes = List.from(hiTypes);
                  }

                  final requestedHiTypesWidget = Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    direction: Axis.vertical,
                    children: hiTypes.map((type) => Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE6F7F9),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(type, style: const TextStyle(color: Color(0xFF0C8A99), fontSize: 11, fontWeight: FontWeight.w500)),
                    )).toList(),
                  );

                  final grantedHiTypesWidget = Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    direction: Axis.vertical,
                    children: hiTypes.map((type) {
                      final isGranted = grantedTypes.contains(type);
                      return Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: isGranted ? const Color(0xFFF3FCF7) : const Color(0xFFFDECEC),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(type, style: TextStyle(
                          color: isGranted ? const Color(0xFF2F8F5B) : Colors.red,
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                        )),
                      );
                    }).toList(),
                  );

                  return DataRow(
                    onSelectChanged: (selected) {
                      _showConsentDetails(context, req);
                    },
                    cells: [
                      // S.NO
                      DataCell(Text('${index + 1}', style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF17324A)))),
                      // PATIENT
                      DataCell(
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: const BoxDecoration(
                                color: Color(0xFFE6F7F9),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.person_outline, color: Color(0xFF0C8A99), size: 20),
                            ),
                            const SizedBox(width: 12),
                            Text(patientId, style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF17324A))),
                          ],
                        )
                      ),
                      // REQUESTED FOR
                      DataCell(Padding(padding: const EdgeInsets.symmetric(vertical: 24), child: requestedHiTypesWidget)),
                      // STATUS (e.g. GRANTED)
                      DataCell(
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          decoration: BoxDecoration(
                            border: Border.all(color: statusColor.withOpacity(0.5)),
                            borderRadius: BorderRadius.circular(999),
                            color: statusColor.withOpacity(0.05),
                          ),
                          child: Text(displayStatus, style: TextStyle(color: statusColor, fontWeight: FontWeight.w700, fontSize: 12)),
                        )
                      ),
                      // GRANTED FOR
                      DataCell(Padding(padding: const EdgeInsets.symmetric(vertical: 24), child: displayStatus == 'GRANTED' ? grantedHiTypesWidget : const Text('-', style: TextStyle(color: Colors.grey)))),
                      // REQUESTED DATES
                      DataCell(
                        Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('From : ${formatDate(dateFromStr)}', style: const TextStyle(fontSize: 13, color: Color(0xFF577086))),
                            const SizedBox(height: 6),
                            Text('To : ${formatDate(dateToStr)}', style: const TextStyle(fontSize: 13, color: Color(0xFF577086))),
                          ],
                        )
                      ),
                      // GRANTED DATES
                      DataCell(
                        (displayStatus == 'GRANTED' || displayStatus == 'EXPIRED' || displayStatus == 'REVOKED')
                          ? Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('From : ${formatDate(grantedDateFromStr)}', style: const TextStyle(fontSize: 13, color: Color(0xFF577086))),
                                const SizedBox(height: 6),
                                Text('To : ${formatDate(grantedDateToStr)}', style: const TextStyle(fontSize: 13, color: Color(0xFF577086))),
                                const SizedBox(height: 6),
                                Text(displayStatus == 'EXPIRED' ? 'Expired At : ${formatDate(grantedDateEraseAtStr)}' : displayStatus == 'REVOKED' ? 'Revoked At : ${formatDate(updatedStr)}' : 'Granted At : ${formatDate(updatedStr)}', style: const TextStyle(fontSize: 13, color: Color(0xFF577086))),
                              ],
                            )
                          : displayStatus == 'DENIED'
                            ? Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Denied At : ${formatDate(updatedStr)}', style: const TextStyle(fontSize: 13, color: Color(0xFF577086))),
                                ],
                              )
                            : const Text('-', style: TextStyle(color: Colors.grey))
                      ),
                      // CREATED AT / EXPIRES AT
                      DataCell(
                        Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Created At : ${formatDate(createdStr)}', style: const TextStyle(fontSize: 13, color: Color(0xFF577086))),
                            const SizedBox(height: 6),
                            Text('Expires At : ${formatDate(grantedDateEraseAtStr)}', style: const TextStyle(fontSize: 13, color: Color(0xFF577086))),
                          ],
                        )
                      ),
                      // DETAIL
                      DataCell(
                        Center(
                          child: InkWell(
                            onTap: () {
                              _showConsentDetails(context, req);
                            },
                            borderRadius: BorderRadius.circular(20),
                            child: const Padding(
                              padding: EdgeInsets.all(8.0),
                              child: Icon(Icons.arrow_forward, color: Color(0xFF1CB1C2), size: 20),
                            ),
                          ),
                        )
                      ),
                    ]
                  );
                }).toList(),
              )
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('HIU Module', style: TextStyle(fontWeight: FontWeight.w700)),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF1B5E8C),
        elevation: 0,
        centerTitle: false,
      ),
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFF4FBFF), Color(0xFFF4FBF6), Color(0xFFFFFFFF)],
          ),
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(48),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Top Horizontal Tabs
              Row(
                children: [
                  Expanded(
                    child: _buildOptionTile(
                      index: 0,
                      title: 'New Consent Request',
                      helper: 'Create a new consent request to fetch patient health data.',
                    ),
                  ),
                  const SizedBox(width: 24),
                  Expanded(
                    child: _buildOptionTile(
                      index: 1,
                      title: 'Request History',
                      helper: 'View the status and details of your previous consent requests.',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 32),
              // Full Width Content
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(48),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: const Color(0xFFD7E4F0)),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x050E2233),
                      blurRadius: 12,
                      offset: Offset(0, 4),
                    ),
                  ],
                ),
                child: _selectedIndex == 0 ? _buildNewConsentTab() : _buildMyRequestsTab(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showConsentDetails(BuildContext context, dynamic req) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => ConsentDetailScreen(request: req),
      ),
    );
  }

  Widget _buildOptionTile({required int index, required String title, required String helper}) {
    final isSelected = _selectedIndex == index;
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () {
        setState(() => _selectedIndex = index);
        if (index == 1) _fetchRequests();
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFFF0FBF4) : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? const Color(0xFF9FD8BA) : const Color(0xFFD9E4EF),
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0x040E2233),
              blurRadius: 8,
              offset: Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              isSelected ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
              color: isSelected ? const Color(0xFF2F8F5B) : const Color(0xFF8AA0B3),
              size: 28,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF17324A),
                      fontSize: 18,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    helper,
                    style: const TextStyle(
                      color: Color(0xFF607285),
                      height: 1.4,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
