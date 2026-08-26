import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../services/hiu_api_service.dart';
import 'hip_documents_screen.dart';

class ConsentDetailScreen extends StatefulWidget {
  final dynamic request;

  const ConsentDetailScreen({super.key, required this.request});

  @override
  State<ConsentDetailScreen> createState() => _ConsentDetailScreenState();
}

class _ConsentDetailScreenState extends State<ConsentDetailScreen> {
  bool _autoPullTriggered = false;
  bool _isRequestingAll = false;
  String? _selectedHiTypeFilter;
  late Map<String, dynamic> _request;

  @override
  void initState() {
    super.initState();
    _request = Map.from(widget.request);
    _scheduleAutoDataPull();
  }

  Future<void> _refreshRequestData() async {
    try {
      final apiService = HiuApiService();
      final reqs = await apiService.fetchConsentRequests();
      final reqId = _request['requestId']?.toString() ?? _request['id']?.toString();
      final updatedReq = reqs.firstWhere((r) => (r['requestId']?.toString() ?? r['id']?.toString()) == reqId, orElse: () => null);
      if (updatedReq != null) {
        setState(() {
          _request = updatedReq;
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Data refreshed successfully!')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to refresh data')),
        );
      }
    }
  }

  void _scheduleAutoDataPull() {
    // Auto-pull is disabled to prevent overloading the server and ABDM gateway.
    // The user must manually click "Request All" or "Request" on individual hospitals.
  }

  String _formatDate(String? isoStr) {
    if (isoStr == null || isoStr.isEmpty) return '-';
    try {
      return DateFormat(
        'dd MMM yyyy, hh:mm a',
      ).format(DateTime.parse(isoStr).toLocal());
    } catch (e) {
      return isoStr;
    }
  }

  String _formatDateOnly(String? isoStr) {
    if (isoStr == null || isoStr.isEmpty) return '-';
    try {
      return DateFormat('dd MMM yyyy').format(DateTime.parse(isoStr).toLocal());
    } catch (e) {
      return isoStr;
    }
  }

  String _mapStatus(String rawStatus) {
    final s = rawStatus.toUpperCase();
    if (s == 'FETCHED' || s == 'GRANTED') return 'GRANTED';
    if (s == 'INITIATED' || s == 'REQUESTED') return 'REQUESTED';
    if (s == 'REVOKED') return 'REVOKED';
    if (s == 'EXPIRED') return 'EXPIRED';
    if (s == 'DENIED') return 'DENIED';
    return 'REQUESTED';
  }

  Future<void> _handleRequestAll(List<dynamic> artefacts) async {
    if (_isRequestingAll) return;
    setState(() {
      _isRequestingAll = true;
    });

    final apiService = HiuApiService();
    int requestCount = 0;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Initiating data requests for ${artefacts.length} hospitals...'),
        duration: const Duration(seconds: 2),
      ),
    );

    for (var i = 0; i < artefacts.length; i++) {
      if (!mounted) break;
      final hipId = artefacts[i]['id']?.toString() ?? '';
      if (hipId.isEmpty) continue;

      try {
        final dates = _getGrantedDatesForHip(hipId);
        await apiService.requestHealthData({
          'consentId': hipId,
          'patientId': _request['patientId'] ?? '',
          'dateFrom': dates['dateFrom'],
          'dateTo': dates['dateTo'],
          'dataEraseAt': dates['dataEraseAt'],
        });
        requestCount++;
      } catch (e) {
        debugPrint('Failed to request data for $hipId: $e');
      }
      
      // 500ms delay to avoid overloading ABDM Sandbox Gateway
      await Future.delayed(const Duration(milliseconds: 500));
    }

    if (mounted) {
      setState(() {
        _isRequestingAll = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Successfully initiated $requestCount requests. Click refresh to check for incoming data.'),
          duration: const Duration(seconds: 4),
        ),
      );
      _refreshRequestData();
    }
  }

  Map<String, String> _getGrantedDatesForHip(String hipId) {
    String dateFrom = _request['dateFrom']?.toString() ?? '';
    String dateTo = _request['dateTo']?.toString() ?? '';
    String dataEraseAt = _request['dateEraseAt']?.toString() ?? '';

    dynamic artDetails;
    if (_request['artefactDetails'] != null && _request['artefactDetails'][hipId] != null) {
      artDetails = _request['artefactDetails'][hipId];
    } else if (_request['details'] != null && _request['details']['consentId'] == hipId) {
      artDetails = _request['details'];
    } else if (_request['details'] != null && _request['details']['hip'] != null) {
      artDetails = _request['details'];
    }

    if (artDetails != null && artDetails['permission'] != null) {
      final perm = artDetails['permission'];
      if (perm['dateRange'] != null) {
        dateFrom = perm['dateRange']['from']?.toString() ?? dateFrom;
        dateTo = perm['dateRange']['to']?.toString() ?? dateTo;
      }
      dataEraseAt = perm['dataEraseAt']?.toString() ?? dataEraseAt;
    }

    return {
      'dateFrom': dateFrom,
      'dateTo': dateTo,
      'dataEraseAt': dataEraseAt,
    };
  }

  @override
  Widget build(BuildContext context) {
    final rawStatus = _request['status']?.toString() ?? 'UNKNOWN';
    String displayStatus = _mapStatus(rawStatus);
    
    String? grantedDateEraseAtStr = _request['dateEraseAt']?.toString() ?? '';
    dynamic artDetails1 = _request['details'];
    if (artDetails1 == null && _request['artefactDetails'] != null) {
      final keys = (_request['artefactDetails'] as Map).keys.toList();
      if (keys.isNotEmpty) artDetails1 = _request['artefactDetails'][keys.first];
    }
    if (artDetails1 != null && artDetails1['permission'] != null) {
      grantedDateEraseAtStr = artDetails1['permission']['dataEraseAt']?.toString() ?? grantedDateEraseAtStr;
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
    final reqId =
        _request['requestId']?.toString() ??
        _request['id']?.toString() ??
        '-';
    final shortId = reqId.length > 8 ? '${reqId.substring(0, 8)}...' : reqId;

    Color statusColor;
    switch (displayStatus) {
      case 'GRANTED':
        statusColor = const Color(0xFF2F8F5B);
        break;
      case 'DENIED':
        statusColor = Colors.red;
        break;
      case 'REQUESTED':
        statusColor = Colors.blue;
        break;
      case 'EXPIRED':
        statusColor = Colors.orange;
        break;
      case 'REVOKED':
        statusColor = Colors.red;
        break;
      default:
        statusColor = Colors.grey;
    }

    final patientId = _request['patientId']?.toString() ?? '-';
    final purpose = _request['purpose']?.toString() ?? '-';
    final artefactsCount =
        (_request['consentArtefacts'] as List?)?.length ?? 0;
    final createdStr =
        _request['timestamp'] ?? _request['createdAt'];
    final updatedStr = _request['updatedAt'] ?? createdStr;

    // Dates
    final dateFrom = _request['dateFrom'];
    final dateTo = _request['dateTo'];
    final dateEraseAt = _request['dateEraseAt'];
    
    String? grantedDateFrom = dateFrom;
    String? grantedDateTo = dateTo;
    String? grantedDateEraseAt = dateEraseAt;
    dynamic artDetails2 = _request['details'];
    if (artDetails2 == null && _request['artefactDetails'] != null) {
      final keys = (_request['artefactDetails'] as Map).keys.toList();
      if (keys.isNotEmpty) artDetails2 = _request['artefactDetails'][keys.first];
    }
    if (artDetails2 != null && artDetails2['permission'] != null) {
      final perm = artDetails2['permission'];
      if (perm['dateRange'] != null) {
        grantedDateFrom = perm['dateRange']['from']?.toString() ?? grantedDateFrom;
        grantedDateTo = perm['dateRange']['to']?.toString() ?? grantedDateTo;
      }
      grantedDateEraseAt = perm['dataEraseAt']?.toString() ?? grantedDateEraseAt;
    }

    return Scaffold(
      backgroundColor: const Color(0xFFF8FCFF),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Color(0xFF17324A)),
          onPressed: () => Navigator.pop(context),
        ),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: const Color(0xFFE6F7F9),
                borderRadius: BorderRadius.circular(8),
              ),
              child:
                  const Icon(Icons.security, color: Color(0xFF0C8A99), size: 24),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Consent Artefact Details',
                  style: TextStyle(
                    color: Color(0xFF17324A),
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                  ),
                ),
                Text(
                  'ID: $shortId',
                  style: const TextStyle(
                    color: Color(0xFF577086),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              margin: const EdgeInsets.only(right: 16),
              decoration: BoxDecoration(
                border: Border.all(color: statusColor.withOpacity(0.5)),
                borderRadius: BorderRadius.circular(999),
                color: statusColor.withOpacity(0.05),
              ),
              child: Text(
                displayStatus,
                style: TextStyle(
                  color: statusColor,
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                ),
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF577086)),
            onPressed: _refreshRequestData,
          ),
          const SizedBox(width: 8),
          if (displayStatus == 'GRANTED')
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
              child: ElevatedButton.icon(
                onPressed: _isRequestingAll
                    ? null
                    : () => _handleRequestAll(
                        _request['consentArtefacts'] as List<dynamic>? ??
                            [],
                      ),
                icon: _isRequestingAll
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2,
                        ),
                      )
                    : const Icon(Icons.download, size: 16, color: Colors.white),
                label: Text(
                  _isRequestingAll ? 'Requesting...' : 'Request All',
                  style: const TextStyle(color: Colors.white),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF75C8C6),
                  disabledBackgroundColor: const Color(0xFFB1E5CB),
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(6),
                ),
              ),
            ),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: _buildPatientCard(patientId)),
                const SizedBox(width: 16),
                Expanded(
                  child: _buildConsentCard(
                    purpose,
                    artefactsCount,
                    createdStr,
                    updatedStr,
                    grantedDateEraseAt,
                    displayStatus,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: _buildValidityCard(dateFrom, dateTo, dateEraseAt, grantedDateFrom, grantedDateTo, grantedDateEraseAt, displayStatus),
                ),
              ],
            ),
            const SizedBox(height: 32),
            _buildHiTypesSection(
              _request['hiTypes'],
              _request['details'],
            ),
            const SizedBox(height: 32),
            Expanded(
              child: _buildDocumentsSection(
                context,
                displayStatus,
                _request['consentArtefacts'] as List<dynamic>? ?? [],
                _request['details'],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPatientCard(String patientId) {
    return _buildCard(
      title: 'PATIENT',
      icon: Icons.person_outline,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            patientId,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Color(0xFF17324A),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'ABHA Address : $patientId',
            style: const TextStyle(color: Color(0xFF577086), fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _buildConsentCard(
    String purpose,
    int artefacts,
    String? createdAt,
    String? grantedAt,
    String? expiredAt,
    String status,
  ) {
    return _buildCard(
      title: 'CONSENT',
      icon: Icons.security,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildInfoRow('Purpose :', '$purpose (CAREMGT)'),
          _buildInfoRow('Requested HIP :', 'Any Facility'),
          _buildInfoRow('Artefacts :', '$artefacts'),
          _buildInfoRow('Consent Created At :', _formatDate(createdAt)),
          if (status == 'EXPIRED')
            _buildInfoRow('Consent Expired On :', _formatDate(expiredAt))
          else if (status == 'REVOKED')
            _buildInfoRow('Consent Revoked On :', _formatDate(grantedAt))
          else if (status == 'GRANTED')
            _buildInfoRow('Consent Granted On :', _formatDate(grantedAt))
          else if (status == 'DENIED')
            _buildInfoRow('Consent Denied On :', _formatDate(grantedAt)),
        ],
      ),
    );
  }

  Widget _buildValidityCard(String? dateFrom, String? dateTo, String? eraseAt, String? grantedFrom, String? grantedTo, String? grantedEraseAt, String status) {
    final reqRange = '${_formatDateOnly(dateFrom)} -> ${_formatDateOnly(dateTo)}';
    final grantedRange = '${_formatDateOnly(grantedFrom)} -> ${_formatDateOnly(grantedTo)}';
    
    return _buildCard(
      title: 'VALIDITY',
      icon: Icons.calendar_today_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildInfoRow('Request Date Range :', reqRange),
          _buildInfoRow('Request Erased On :', _formatDate(eraseAt)),
          if (status == 'GRANTED' || status == 'EXPIRED' || status == 'REVOKED') ...[
            _buildInfoRow(status == 'EXPIRED' ? 'Expired Date Range :' : status == 'REVOKED' ? 'Revoked Date Range :' : 'Granted Date Range :', grantedRange),
            _buildInfoRow(status == 'EXPIRED' ? 'Expired On :' : status == 'REVOKED' ? 'Revoked On :' : 'Granted Erase On :', _formatDate(grantedEraseAt)),
          ],
        ],
      ),
    );
  }

  Widget _buildCard({
    required String title,
    required IconData icon,
    required Widget child,
  }) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2F0F9)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: const Color(0xFF0C8A99)),
              const SizedBox(width: 8),
              Text(
                title,
                style: const TextStyle(
                  color: Color(0xFF0C8A99),
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          child,
        ],
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 150,
            child: Text(
              label,
              style: const TextStyle(
                color: Color(0xFF7A8D9C),
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                color: Color(0xFF17324A),
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHiTypesSection(dynamic requestedHiTypes, dynamic details) {
    final List<String> requested =
        (requestedHiTypes as List?)?.map((e) => e.toString()).toList() ?? [];
    List<String> granted = [];
    if (details != null && details['hiTypes'] != null) {
      granted = (details['hiTypes'] as List).map((e) => e.toString()).toList();
    } else {
      granted = requested;
    }

    final notGranted = requested.where((t) => !granted.contains(t)).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.list_alt, size: 16, color: Color(0xFF0C8A99)),
            const SizedBox(width: 8),
            const Text(
              'HI TYPES',
              style: TextStyle(
                color: Color(0xFF0C8A99),
                fontWeight: FontWeight.bold,
                fontSize: 12,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: requested.map((type) {
            final isGranted = granted.contains(type);
            final isSelected = _selectedHiTypeFilter == type;
            return GestureDetector(
              onTap: () {
                if (isGranted) {
                  setState(() {
                    if (_selectedHiTypeFilter == type) {
                      _selectedHiTypeFilter = null;
                    } else {
                      _selectedHiTypeFilter = type;
                    }
                  });
                }
              },
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: isSelected
                      ? const Color(0xFFE2F0F9)
                      : (isGranted ? const Color(0xFFF3FCF7) : Colors.white),
                  border: Border.all(
                    color: isSelected
                        ? const Color(0xFF0C8A99)
                        : (isGranted
                              ? const Color(0xFFB1E5CB)
                              : const Color(0xFFE2F0F9)),
                  ),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      isGranted ? Icons.check : Icons.close,
                      size: 14,
                      color: isSelected
                          ? const Color(0xFF0C8A99)
                          : (isGranted
                                ? const Color(0xFF2F8F5B)
                                : const Color(0xFF7A8D9C)),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      type,
                      style: TextStyle(
                        color: isSelected
                            ? const Color(0xFF0C8A99)
                            : (isGranted
                                  ? const Color(0xFF2F8F5B)
                                  : const Color(0xFF7A8D9C)),
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }).toList(),
        ),
        if (notGranted.isNotEmpty) ...[
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF9E6),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.info_outline,
                  color: Color(0xFFD97706),
                  size: 20,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: RichText(
                    text: TextSpan(
                      style: const TextStyle(
                        fontSize: 14,
                        color: Color(0xFF17324A),
                      ),
                      children: [
                        TextSpan(
                          text: '${notGranted.length} of ${requested.length} ',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        const TextSpan(
                          text: 'requested HI type(s) not granted: ',
                        ),
                        TextSpan(
                          text: notGranted.join(', '),
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildDocumentsSection(
    BuildContext context,
    String displayStatus,
    List<dynamic> artefacts,
    dynamic details,
  ) {
    if (displayStatus == 'REVOKED' || displayStatus == 'EXPIRED') {
      return _buildRevokedOrExpiredState(displayStatus);
    }

    if (artefacts.isEmpty) {
      return _buildEmptyDocumentsSection();
    }

    List<dynamic> filteredArtefacts = artefacts.where((art) {
      if (_selectedHiTypeFilter == null) return true;
      final hipId = art['id']?.toString() ?? '';
      dynamic artDetails;
      if (_request['artefactDetails'] != null &&
          _request['artefactDetails'][hipId] != null) {
        artDetails = _request['artefactDetails'][hipId];
      } else if (details != null && details['consentId'] == hipId) {
        artDetails = details;
      } else if (details != null &&
          details['hip'] != null &&
          artefacts.length == 1) {
        artDetails = details;
      }

      if (artDetails != null && artDetails['hiTypes'] != null) {
        final List<dynamic> hiTypes = artDetails['hiTypes'];
        return hiTypes.any((t) => t.toString() == _selectedHiTypeFilter);
      }
      return false;
    }).toList();

    if (filteredArtefacts.isEmpty && _selectedHiTypeFilter != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.link, size: 16, color: Color(0xFF0C8A99)),
              const SizedBox(width: 8),
              const Text(
                'Linked HIPs',
                style: TextStyle(
                  color: Color(0xFF17324A),
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                ),
              ),
              const SizedBox(width: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFF0C8A99),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '0',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Expanded(
            child: Center(
              child: Text(
                'No HIPs provide $_selectedHiTypeFilter',
                style: const TextStyle(color: Color(0xFF7A8D9C)),
              ),
            ),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.link, size: 16, color: Color(0xFF0C8A99)),
            const SizedBox(width: 8),
            const Text(
              'Linked HIPs',
              style: TextStyle(
                color: Color(0xFF17324A),
                fontWeight: FontWeight.bold,
                fontSize: 16,
              ),
            ),
            const SizedBox(width: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: const Color(0xFF0C8A99),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                '${filteredArtefacts.length}',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Text(
              'Showing 1-${filteredArtefacts.length} of ${artefacts.length}',
              style: const TextStyle(
                color: Color(0xFF7A8D9C),
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Expanded(
          child: ListView.builder(
            itemCount: filteredArtefacts.length,
            itemBuilder: (context, index) {
              final art = filteredArtefacts[index];
              try {
                final hipId = art['id']?.toString() ?? 'Unknown';
                String hipName = 'HIP Facility';
                int records = 1;

                dynamic artDetails;
                if (_request['artefactDetails'] != null &&
                    _request['artefactDetails'][hipId] != null) {
                  artDetails = _request['artefactDetails'][hipId];
                } else if (details != null && details['consentId'] == hipId) {
                  artDetails = details;
                } else if (details != null &&
                    details['hip'] != null &&
                    artefacts.length == 1) {
                  artDetails = details;
                }

                if (artDetails != null) {
                  if (artDetails['hip'] is Map) {
                    hipName =
                        artDetails['hip']['name'] ??
                        artDetails['hip']['id'] ??
                        hipName;
                  } else if (artDetails['hip'] is String) {
                    hipName = artDetails['hip'];
                  }
                  records = (artDetails['careContexts'] as List?)?.length ?? 1;
                }

                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFE2F0F9)),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(7),
                    child: Container(
                      decoration: const BoxDecoration(
                        border: Border(
                          left: BorderSide(color: Color(0xFF0C8A99), width: 4),
                        ),
                      ),
                      padding: const EdgeInsets.all(20),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        hipName,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.bold,
                                          fontSize: 16,
                                          color: Color(0xFF17324A),
                                        ),
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 10,
                                        vertical: 4,
                                      ),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFE6F7F9),
                                        borderRadius: BorderRadius.circular(12),
                                        border: Border.all(
                                          color: const Color(0xFFB1E5CB),
                                        ),
                                      ),
                                      child: const Text(
                                        'GRANTED',
                                        style: TextStyle(
                                          color: Color(0xFF2F8F5B),
                                          fontSize: 11,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  hipId,
                                  style: const TextStyle(
                                    color: Color(0xFF7A8D9C),
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          IconButton(
                            icon: const Icon(
                              Icons.refresh,
                              color: Color(0xFF0C8A99),
                            ),
                            onPressed: _refreshRequestData,
                          ),
                          const SizedBox(width: 12),
                          ElevatedButton.icon(
                            onPressed: () async {
                              try {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('Requesting data flow...'),
                                  ),
                                );
                                final apiService = HiuApiService();
                                final dates = _getGrantedDatesForHip(hipId);
                                await apiService.requestHealthData({
                                  'consentId': hipId,
                                  'patientId': _request['patientId'] ?? '',
                                  'dateFrom': dates['dateFrom'],
                                  'dateTo': dates['dateTo'],
                                  'dataEraseAt': dates['dataEraseAt'],
                                });
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text(
                                        'Data request sent successfully!',
                                      ),
                                    ),
                                  );
                                }
                              } catch (e) {
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(content: Text('Error: $e')),
                                  );
                                }
                              }
                            },
                            icon: const Icon(
                              Icons.download,
                              size: 16,
                              color: Colors.white,
                            ),
                            label: const Text(
                              'Request',
                              style: TextStyle(color: Colors.white),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF1CB1C2),
                              elevation: 0,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 16,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(6),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          OutlinedButton.icon(
                            onPressed: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (context) => HipDocumentsScreen(
                                    hipName: hipName,
                                    hipId: hipId,
                                    recordsCount: records,
                                  ),
                                ),
                              );
                            },
                            icon: const Icon(
                              Icons.description_outlined,
                              size: 16,
                              color: Color(0xFF1CB1C2),
                            ),
                            label: const Text(
                              'View Documents',
                              style: TextStyle(color: Color(0xFF1CB1C2)),
                            ),
                            style: OutlinedButton.styleFrom(
                              side: const BorderSide(color: Color(0xFF1CB1C2)),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 16,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(6),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              } catch (e, st) {
                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(20),
                  color: Colors.red.shade100,
                  child: Text(
                    'Error rendering card: $e\n$st',
                    style: const TextStyle(color: Colors.red),
                  ),
                );
              }
            },
          ),
        ),
      ],
    );
  }

  Widget _buildEmptyDocumentsSection() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 64, horizontal: 32),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: const Color(0xFFE2F0F9),
          style: BorderStyle.solid,
        ),
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(
              color: Color(0xFFF2F5F8),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.folder_open,
              size: 32,
              color: Color(0xFFB3C1CC),
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'No documents received yet',
            style: TextStyle(
              color: Color(0xFF17324A),
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Once a HIP shares records under this consent, it will appear above with a "View Docs"\\nbutton.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Color(0xFF7A8D9C), fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _buildRevokedOrExpiredState(String status) {
    final isRevoked = status == 'REVOKED';
    final title = isRevoked ? 'Consent Revoked — Records Removed!' : 'Consent Expired — Records Removed!';
    final desc = isRevoked 
        ? 'The patient has revoked authorisation for this consent. All previously fetched\ndocuments and decryption keys have been deleted as required by ABDM.'
        : 'The authorisation for this consent has expired. All previously fetched\ndocuments and decryption keys have been deleted as required by ABDM.';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 64, horizontal: 32),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: const Color(0xFFE2F0F9),
          style: BorderStyle.solid,
        ),
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(
              color: Color(0xFFF2F5F8),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.block,
              size: 32,
              color: Color(0xFFB3C1CC),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            title,
            style: const TextStyle(
              color: Color(0xFF17324A),
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            desc,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 13),
          ),
        ],
      ),
    );
  }
}
