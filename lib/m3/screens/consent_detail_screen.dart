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

  @override
  void initState() {
    super.initState();
    _scheduleAutoDataPull();
  }

  void _scheduleAutoDataPull() {
    Future.delayed(const Duration(seconds: 5), () async {
      if (!mounted) return;
      if (_autoPullTriggered) return;
      
      final rawStatus = widget.request['status']?.toString().toUpperCase() ?? '';
      if (rawStatus == 'FETCHED') return;

      final displayStatus = _mapStatus(rawStatus);
      if (displayStatus != 'GRANTED') return;

      final artefacts = widget.request['consentArtefacts'] as List<dynamic>? ?? [];
      if (artefacts.isEmpty) return;

      setState(() {
        _autoPullTriggered = true;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Auto-pulling data for ${artefacts.length} hospital(s)...'))
      );

      final apiService = HiuApiService();
      for (var art in artefacts) {
        if (!mounted) return;
        final hipId = art['id']?.toString() ?? '';
        if (hipId.isEmpty) continue;

        try {
          await apiService.requestHealthData({
            'consentId': hipId,
            'patientId': widget.request['patientId'] ?? '',
            'dateFrom': widget.request['dateFrom'] ?? '',
            'dateTo': widget.request['dateTo'] ?? '',
          });
          // Add a tiny delay between requests to avoid overwhelming the server
          await Future.delayed(const Duration(milliseconds: 500));
        } catch (e) {
          debugPrint('Auto-pull failed for $hipId: $e');
        }
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Automated data pull completed!'))
        );
      }
    });
  }

  String _formatDate(String? isoStr) {
    if (isoStr == null || isoStr.isEmpty) return '-';
    try {
      return DateFormat('dd MMM yyyy, hh:mm a').format(DateTime.parse(isoStr).toLocal());
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
    if (s == 'REVOKED' || s == 'EXPIRED') return 'EXPIRED';
    if (s == 'DENIED') return 'DENIED';
    return 'REQUESTED';
  }

  @override
  Widget build(BuildContext context) {
    final rawStatus = widget.request['status']?.toString() ?? 'UNKNOWN';
    final displayStatus = _mapStatus(rawStatus);
    final reqId = widget.request['requestId']?.toString() ?? widget.request['id']?.toString() ?? '-';
    final shortId = reqId.length > 8 ? '${reqId.substring(0, 8)}...' : reqId;

    Color statusColor;
    switch (displayStatus) {
      case 'GRANTED': statusColor = const Color(0xFF2F8F5B); break;
      case 'DENIED': statusColor = Colors.red; break;
      case 'REQUESTED': statusColor = Colors.blue; break;
      case 'EXPIRED': statusColor = Colors.orange; break;
      default: statusColor = Colors.grey;
    }

    final patientId = widget.request['patientId']?.toString() ?? '-';
    final purpose = widget.request['purpose']?.toString() ?? '-';
    final artefactsCount = (widget.request['consentArtefacts'] as List?)?.length ?? 0;
    final createdStr = widget.request['timestamp'] ?? widget.request['createdAt'];
    
    // Dates
    final dateFrom = widget.request['dateFrom'];
    final dateTo = widget.request['dateTo'];
    final dateEraseAt = widget.request['dateEraseAt'];

    return Scaffold(
      backgroundColor: const Color(0xFFF8FCFF),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 1,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Color(0xFF577086)),
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
              child: const Icon(Icons.security, color: Color(0xFF0C8A99), size: 20),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('HIU Consent Detail', style: TextStyle(color: Color(0xFF17324A), fontWeight: FontWeight.bold, fontSize: 18)),
                Text('ID: $shortId', style: const TextStyle(color: Color(0xFF577086), fontSize: 12)),
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
              child: Text(displayStatus, style: TextStyle(color: statusColor, fontWeight: FontWeight.bold, fontSize: 12)),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF577086)),
            onPressed: () {},
          ),
          const SizedBox(width: 8),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
            child: ElevatedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.download, size: 16, color: Colors.white),
              label: const Text('Request All', style: TextStyle(color: Colors.white)),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF75C8C6), // Light teal color from screenshot
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
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
                Expanded(child: _buildConsentCard(purpose, artefactsCount, createdStr, createdStr)),
                const SizedBox(width: 16),
                Expanded(child: _buildValidityCard(dateFrom, dateTo, dateEraseAt)),
              ],
            ),
            const SizedBox(height: 32),
            _buildHiTypesSection(widget.request['hiTypes'], widget.request['details']),
            const SizedBox(height: 32),
            Expanded(
              child: _buildDocumentsSection(context, displayStatus, widget.request['consentArtefacts'] as List<dynamic>? ?? [], widget.request['details']),
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
          Text(patientId, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF17324A))),
          const SizedBox(height: 12),
          Text('ABHA Address : $patientId', style: const TextStyle(color: Color(0xFF577086), fontSize: 13)),
        ],
      ),
    );
  }

  Widget _buildConsentCard(String purpose, int artefacts, String? createdAt, String? grantedAt) {
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
          _buildInfoRow('Consent Granted On :', _formatDate(grantedAt)),
        ],
      ),
    );
  }

  Widget _buildValidityCard(String? dateFrom, String? dateTo, String? eraseAt) {
    final range = '${_formatDateOnly(dateFrom)} -> ${_formatDateOnly(dateTo)}';
    return _buildCard(
      title: 'VALIDITY',
      icon: Icons.calendar_today_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildInfoRow('Request Date Range :', range),
          _buildInfoRow('Request Erased On :', _formatDate(eraseAt)),
          _buildInfoRow('Granted Date Range :', range),
          _buildInfoRow('Granted Erase On :', _formatDate(eraseAt)),
        ],
      ),
    );
  }

  Widget _buildCard({required String title, required IconData icon, required Widget child}) {
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
              Text(title, style: const TextStyle(color: Color(0xFF0C8A99), fontWeight: FontWeight.bold, fontSize: 12, letterSpacing: 0.5)),
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
          SizedBox(width: 150, child: Text(label, style: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 13, fontWeight: FontWeight.w600))),
          Expanded(child: Text(value, style: const TextStyle(color: Color(0xFF17324A), fontSize: 13, fontWeight: FontWeight.w500))),
        ],
      ),
    );
  }

  Widget _buildHiTypesSection(dynamic requestedHiTypes, dynamic details) {
    final List<String> requested = (requestedHiTypes as List?)?.map((e) => e.toString()).toList() ?? [];
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
            const Text('HI TYPES', style: TextStyle(color: Color(0xFF0C8A99), fontWeight: FontWeight.bold, fontSize: 12, letterSpacing: 0.5)),
          ],
        ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: requested.map((type) {
            final isGranted = granted.contains(type);
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: isGranted ? const Color(0xFFF3FCF7) : Colors.white,
                border: Border.all(color: isGranted ? const Color(0xFFB1E5CB) : const Color(0xFFE2F0F9)),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    isGranted ? Icons.check : Icons.close,
                    size: 14,
                    color: isGranted ? const Color(0xFF2F8F5B) : const Color(0xFF7A8D9C),
                  ),
                  const SizedBox(width: 6),
                  Text(type, style: TextStyle(
                    color: isGranted ? const Color(0xFF2F8F5B) : const Color(0xFF7A8D9C),
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  )),
                ],
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
                const Icon(Icons.info_outline, color: Color(0xFFD97706), size: 20),
                const SizedBox(width: 12),
                Expanded(
                  child: RichText(
                    text: TextSpan(
                      style: const TextStyle(fontSize: 14, color: Color(0xFF17324A)),
                      children: [
                        TextSpan(text: '${notGranted.length} of ${requested.length} ', style: const TextStyle(fontWeight: FontWeight.bold)),
                        const TextSpan(text: 'requested HI type(s) not granted: '),
                        TextSpan(text: notGranted.join(', '), style: const TextStyle(fontWeight: FontWeight.bold)),
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

  Widget _buildDocumentsSection(BuildContext context, String displayStatus, List<dynamic> artefacts, dynamic details) {
    if (artefacts.isEmpty) {
      return _buildEmptyDocumentsSection();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.link, size: 16, color: Color(0xFF0C8A99)),
            const SizedBox(width: 8),
            const Text('Linked HIPs', style: TextStyle(color: Color(0xFF17324A), fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(width: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: const Color(0xFF0C8A99),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text('${artefacts.length}', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
            ),
            const SizedBox(width: 12),
            Text('Showing 1-${artefacts.length} of ${artefacts.length}', style: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 13, fontWeight: FontWeight.w500)),
          ],
        ),
        const SizedBox(height: 16),
        Expanded(
          child: ListView.builder(
            itemCount: artefacts.length,
            itemBuilder: (context, index) {
              final art = artefacts[index];
              try {
                final hipId = art['id']?.toString() ?? 'Unknown';
                String hipName = 'HIP Facility';
                int records = 1;
                
                dynamic artDetails;
                if (widget.request['artefactDetails'] != null && widget.request['artefactDetails'][hipId] != null) {
                  artDetails = widget.request['artefactDetails'][hipId];
                } else if (details != null && details['consentId'] == hipId) {
                  artDetails = details;
                } else if (details != null && details['hip'] != null && artefacts.length == 1) {
                  artDetails = details;
                }

                if (artDetails != null) {
                   if (artDetails['hip'] is Map) {
                      hipName = artDetails['hip']['name'] ?? artDetails['hip']['id'] ?? hipName;
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
                        border: Border(left: BorderSide(color: Color(0xFF0C8A99), width: 4)),
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
                                      child: Text(hipName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Color(0xFF17324A)), overflow: TextOverflow.ellipsis),
                                    ),
                                    const SizedBox(width: 12),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFE6F7F9),
                                        borderRadius: BorderRadius.circular(12),
                                        border: Border.all(color: const Color(0xFFB1E5CB)),
                                      ),
                                      child: const Text('GRANTED', style: TextStyle(color: Color(0xFF2F8F5B), fontSize: 11, fontWeight: FontWeight.bold)),
                                    )
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text('$hipId  ·  $records records', style: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 13, fontWeight: FontWeight.w500)),
                              ],
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.refresh, color: Color(0xFF0C8A99)),
                            onPressed: () {},
                          ),
                          const SizedBox(width: 12),
                          ElevatedButton.icon(
                            onPressed: () async {
                              try {
                                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Requesting data flow...')));
                                final apiService = HiuApiService();
                                await apiService.requestHealthData({
                                  'consentId': hipId,
                                  'patientId': widget.request['patientId'] ?? '',
                                  'dateFrom': widget.request['dateFrom'] ?? '',
                                  'dateTo': widget.request['dateTo'] ?? '',
                                });
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Data requested successfully! Processing in background...')));
                                }
                              } catch (e) {
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
                                }
                              }
                            },
                            icon: const Icon(Icons.download, size: 16, color: Colors.white),
                            label: const Text('Request', style: TextStyle(color: Colors.white)),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF1CB1C2),
                              elevation: 0,
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
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
                            icon: const Icon(Icons.description_outlined, size: 16, color: Color(0xFF1CB1C2)),
                            label: const Text('View Documents', style: TextStyle(color: Color(0xFF1CB1C2))),
                            style: OutlinedButton.styleFrom(
                              side: const BorderSide(color: Color(0xFF1CB1C2)),
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
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
                  child: Text('Error rendering card: $e\n$st', style: const TextStyle(color: Colors.red)),
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
        border: Border.all(color: const Color(0xFFE2F0F9), style: BorderStyle.solid),
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(
              color: Color(0xFFF2F5F8),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.folder_open, size: 32, color: Color(0xFFB3C1CC)),
          ),
          const SizedBox(height: 16),
          const Text('No documents received yet', style: TextStyle(color: Color(0xFF17324A), fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          const Text('Once a HIP shares records under this consent, it will appear above with a "View Docs"\\nbutton.', 
            textAlign: TextAlign.center,
            style: TextStyle(color: Color(0xFF7A8D9C), fontSize: 13)),
        ],
      ),
    );
  }
}

