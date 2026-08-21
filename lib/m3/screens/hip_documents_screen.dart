import 'package:flutter/material.dart';
import 'package:syncfusion_flutter_pdfviewer/pdfviewer.dart';
import '../services/hiu_api_service.dart';
import '../widgets/fhir_data_viewer.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class HipDocumentsScreen extends StatefulWidget {
  final String hipName;
  final String hipId;
  final int recordsCount;

  const HipDocumentsScreen({
    super.key,
    required this.hipName,
    required this.hipId,
    required this.recordsCount,
  });

  @override
  State<HipDocumentsScreen> createState() => _HipDocumentsScreenState();
}

class _HipDocumentsScreenState extends State<HipDocumentsScreen> {
  List<Map<String, dynamic>> _documents = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchDocuments();
  }

  Future<void> _fetchDocuments() async {
    try {
      final apiService = HiuApiService();
      var docs = await apiService.fetchHealthDocuments(widget.hipId);
      
      if (docs.isEmpty) {
        // Auto-fetch from HIP if data does not exist locally
        try {
          await apiService.requestHealthData({'consentId': widget.hipId});
          // Poll for data up to 10 times (20 seconds max)
          for (int i = 0; i < 10; i++) {
            await Future.delayed(const Duration(seconds: 2));
            final retryDocs = await apiService.fetchHealthDocuments(widget.hipId);
            if (retryDocs.isNotEmpty) {
              docs = retryDocs;
              break;
            }
          }
        } catch (err) {
          debugPrint("Auto data pull failed: $err");
        }
      }

      if (mounted) {
        setState(() {
          _documents = List<Map<String, dynamic>>.from(docs);
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint("Error fetching documents: $e");
      if (mounted) {
        if (e.toString().contains('Data pull was unsuccfull')) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Data pull was unsuccessful, please try again after some time'))
          );
        }
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final double paddingHorizontal = size.width * 0.02; // approx 2% of width
    final double paddingVertical = size.height * 0.03; // approx 3% of height

    return Scaffold(
      backgroundColor: const Color(0xFFF8FCFF),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header Section (formerly appBar)
            Container(
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(bottom: BorderSide(color: Color(0xFFE2F0F9))),
              ),
              padding: EdgeInsets.symmetric(horizontal: paddingHorizontal, vertical: size.height * 0.01),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back, color: Color(0xFF577086)),
                    onPressed: () => Navigator.pop(context),
                  ),
                  SizedBox(width: size.width * 0.01),
                  Container(
                    padding: EdgeInsets.all(size.width * 0.01),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE6F7F9),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.assignment_outlined, color: Color(0xFF0C8A99), size: 24),
                  ),
                  SizedBox(width: size.width * 0.015),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.link, size: 14, color: Color(0xFF0C8A99)),
                            const SizedBox(width: 4),
                            const Text('HIP DOCUMENTS', style: TextStyle(color: Color(0xFF0C8A99), fontWeight: FontWeight.bold, fontSize: 11, letterSpacing: 0.5)),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(widget.hipName, style: const TextStyle(color: Color(0xFF17324A), fontWeight: FontWeight.bold, fontSize: 20), overflow: TextOverflow.ellipsis),
                        Text(widget.hipId, style: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 12), overflow: TextOverflow.ellipsis),
                      ],
                    ),
                  ),
                  Container(
                    padding: EdgeInsets.symmetric(horizontal: paddingHorizontal, vertical: size.height * 0.01),
                    decoration: BoxDecoration(
                      border: Border.all(color: const Color(0xFFE2F0F9)),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('${_documents.length}', style: const TextStyle(color: Color(0xFF0C8A99), fontWeight: FontWeight.bold, fontSize: 16)),
                        const Text('DOCUMENTS', style: TextStyle(color: Color(0xFF7A8D9C), fontSize: 10, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
                  SizedBox(width: size.width * 0.01),
                  IconButton(
                    icon: const Icon(Icons.refresh, color: Color(0xFF577086)),
                    onPressed: () {},
                  ),
                ],
              ),
            ),
            
            // Body content
            Expanded(
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: paddingHorizontal, vertical: paddingVertical),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildSearchBar(size),
                    SizedBox(height: paddingVertical),
                    Text('Showing 1-${_documents.length} of ${_documents.length} document(s)', style: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 14)),
                    SizedBox(height: paddingVertical * 0.5),
                    Expanded(
                      child: Container(
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFFE2F0F9)),
                        ),
                        child: _isLoading 
                            ? const Center(child: CircularProgressIndicator())
                            : _documents.isEmpty
                                ? const Center(child: Text("No documents found for this HIP.", style: TextStyle(color: Color(0xFF7A8D9C))))
                                : ListView.separated(
                                    itemCount: _documents.length,
                                    separatorBuilder: (context, index) => const Divider(height: 1, color: Color(0xFFE2F0F9), thickness: 1),
                                    itemBuilder: (context, index) {
                                      return _buildDocumentListRow(_documents[index], size);
                                    },
                                  ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSearchBar(Size size) {
    return Container(
      padding: EdgeInsets.all(size.width * 0.015),
      decoration: BoxDecoration(
        color: const Color(0xFF0C8A99),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            flex: 2,
            child: _buildInputColumn('Report Name', 'Search Report Name', size),
          ),
          SizedBox(width: size.width * 0.015),
          Expanded(
            flex: 2,
            child: _buildDropdownColumn('Report Type', 'All Types', size),
          ),
          SizedBox(width: size.width * 0.015),
          Expanded(
            flex: 2,
            child: _buildInputColumn('Dr. Name', 'Search Doctor Name', size),
          ),
          SizedBox(width: size.width * 0.02),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.search, size: 16, color: Colors.white),
            label: const Text('Search Report', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1CB1C2),
              padding: EdgeInsets.symmetric(horizontal: size.width * 0.015, vertical: size.height * 0.02),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
              elevation: 0,
            ),
          ),
          SizedBox(width: size.width * 0.01),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.refresh, size: 16, color: Color(0xFF0C8A99)),
            label: const Text('Reset Search', style: TextStyle(color: Color(0xFF0C8A99), fontWeight: FontWeight.bold)),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.white,
              padding: EdgeInsets.symmetric(horizontal: size.width * 0.015, vertical: size.height * 0.02),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
              elevation: 0,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInputColumn(String label, String hint, Size size) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
        SizedBox(height: size.height * 0.01),
        Container(
          height: size.height * 0.05,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(4),
          ),
          child: TextField(
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: const TextStyle(color: Color(0xFFB3C1CC), fontSize: 14),
              border: InputBorder.none,
              contentPadding: EdgeInsets.symmetric(horizontal: size.width * 0.01, vertical: size.height * 0.01),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildDropdownColumn(String label, String value, Size size) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
        SizedBox(height: size.height * 0.01),
        Container(
          height: size.height * 0.05,
          padding: EdgeInsets.symmetric(horizontal: size.width * 0.01),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(4),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(value, style: const TextStyle(color: Color(0xFF17324A), fontSize: 14)),
              const Icon(Icons.unfold_more, size: 16, color: Color(0xFF7A8D9C)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildDocumentListRow(Map<String, dynamic> doc, Size size) {
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: size.width * 0.02, vertical: size.height * 0.02),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            padding: EdgeInsets.all(size.width * 0.01),
            decoration: BoxDecoration(
              color: const Color(0xFFF2F5F8),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.assignment_outlined, size: 24, color: Color(0xFF7A8D9C)),
          ),
          SizedBox(width: size.width * 0.02),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(doc['title'], style: const TextStyle(color: Color(0xFF17324A), fontSize: 16, fontWeight: FontWeight.bold)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        doc['id'], 
                        style: const TextStyle(color: Color(0xFFB3C1CC), fontSize: 12),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Text(doc['type'], style: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 12, fontWeight: FontWeight.bold)),
                    const SizedBox(width: 24),
                    const Icon(Icons.calendar_today_outlined, size: 14, color: Color(0xFF7A8D9C)),
                    const SizedBox(width: 6),
                    Text(doc['date'], style: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 13)),
                    const SizedBox(width: 24),
                    const Icon(Icons.person_outline, size: 14, color: Color(0xFF0C8A99)),
                    const SizedBox(width: 6),
                    Text(doc['doctor'], style: const TextStyle(color: Color(0xFF0C8A99), fontSize: 13)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          OutlinedButton(
            onPressed: () => _showDocumentDialog(context, doc),
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: Color(0xFF0C8A99)),
              padding: EdgeInsets.symmetric(horizontal: size.width * 0.015, vertical: size.height * 0.015),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
            ),
            child: const Text('View', style: TextStyle(color: Color(0xFF0C8A99), fontSize: 13, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  void _showDocumentDialog(BuildContext context, Map<String, dynamic> doc) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        bool isPdfOpen = false;
        bool _isLoadingContent = false;
        String? _contentType;
        dynamic _contentData;
        String? _errorMessage;

        Future<void> fetchContent(StateSetter setState, {bool forceJson = false}) async {
          setState(() {
            _isLoadingContent = true;
            _errorMessage = null;
          });
          try {
            final url = forceJson 
              ? '${HiuApiService.baseUrl}/documents/${doc['id']}/pdf?format=json'
              : '${HiuApiService.baseUrl}/documents/${doc['id']}/pdf';
            final response = await http.get(Uri.parse(url));
            if (response.statusCode == 200) {
              final contentType = response.headers['content-type']?.toLowerCase() ?? '';
              setState(() {
                if (contentType.contains('application/json')) {
                  _contentType = 'json';
                  try {
                    _contentData = jsonDecode(response.body);
                  } catch(e) {
                    _contentData = null;
                    _errorMessage = 'Invalid JSON document format';
                  }
                } else {
                  _contentType = 'pdf';
                  _contentData = response.bodyBytes;
                }
                _isLoadingContent = false;
              });
            } else {
              setState(() {
                _errorMessage = 'Failed to load document (Status: ${response.statusCode})';
                _isLoadingContent = false;
              });
            }
          } catch (e) {
            setState(() {
              _errorMessage = 'Error loading document: $e';
              _isLoadingContent = false;
            });
          }
        }

        return StatefulBuilder(
          builder: (context, setState) {
            return Dialog(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: Container(
                width: isPdfOpen ? 1000 : 600,
                height: isPdfOpen ? MediaQuery.of(context).size.height * 0.85 : null,
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: isPdfOpen ? MainAxisSize.max : MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFE6F7F9),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: const Icon(Icons.description, color: Color(0xFF0C8A99), size: 24),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  doc['title'], 
                                  style: const TextStyle(color: Color(0xFF17324A), fontSize: 20, fontWeight: FontWeight.bold),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 12),
                        IconButton(
                          icon: const Icon(Icons.close, color: Color(0xFF7A8D9C)),
                          onPressed: () => Navigator.pop(context),
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    
                    // Metadata Row
                    Row(
                      children: [
                        const Icon(Icons.access_time, size: 14, color: Color(0xFF7A8D9C)),
                        const SizedBox(width: 6),
                        Text('${doc['date']}, 04:19 PM', style: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 13)),
                        const SizedBox(width: 16),
                        const Icon(Icons.link, size: 14, color: Color(0xFF7A8D9C)),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            doc['id'], 
                            style: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 13),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 16),
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(color: Colors.green, shape: BoxShape.circle),
                        ),
                        const SizedBox(width: 6),
                        const Text('OK', style: TextStyle(color: Colors.green, fontSize: 12, fontWeight: FontWeight.bold)),
                      ],
                    ),
                    const SizedBox(height: 24),
                    
                    if (isPdfOpen)
                      Expanded(
                        child: Container(
                          decoration: BoxDecoration(
                            border: Border.all(color: const Color(0xFFE2F0F9)),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: _isLoadingContent 
                              ? const Center(child: CircularProgressIndicator(color: Color(0xFF0C8A99)))
                              : _errorMessage != null
                                  ? Center(child: Text(_errorMessage!, style: const TextStyle(color: Colors.red)))
                                  : _contentType == 'json'
                                      ? (_contentData is Map<String, dynamic>
                                          ? FhirDataViewer(bundle: _contentData as Map<String, dynamic>)
                                          : const Center(child: Text('Invalid JSON data', style: TextStyle(color: Colors.red))))
                                      : SfPdfViewer.memory(_contentData),
                        ),
                      )
                    else ...[
                      // First Inner Card (Record Artifact Details)
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          border: Border.all(color: const Color(0xFFE2F0F9)),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF2F5F8),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Icon(Icons.assignment_outlined, color: Color(0xFF7A8D9C), size: 24),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(doc['type'].toUpperCase(), style: const TextStyle(color: Color(0xFF0C8A99), fontSize: 10, fontWeight: FontWeight.bold)),
                                  const SizedBox(height: 4),
                                  Text('Record Artifact for ${doc['title']}', style: const TextStyle(color: Color(0xFF17324A), fontSize: 14, fontWeight: FontWeight.bold)),
                                  const SizedBox(height: 4),
                                  Text('${doc['date']}, 04:19 PM', style: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 12)),
                                ],
                              ),
                            ),
                            Container(
                              width: 32,
                              height: 32,
                              decoration: const BoxDecoration(color: Color(0xFF0C8A99), shape: BoxShape.circle),
                            ),
                            const SizedBox(width: 8),
                            const Text('- MRN:', style: TextStyle(color: Color(0xFF7A8D9C), fontSize: 12)),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(doc['type'].toUpperCase(), style: const TextStyle(color: Color(0xFF0C8A99), fontSize: 12, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      
                      // PDF Document Card or No Data Message
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          border: Border.all(color: const Color(0xFFE2F0F9)),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: doc['hasPdf'] == true ? const Color(0xFFFDECEC) : const Color(0xFFE6F7F9),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Icon(
                                doc['hasPdf'] == true ? Icons.picture_as_pdf : Icons.data_object, 
                                color: doc['hasPdf'] == true ? Colors.red : const Color(0xFF0C8A99), 
                                size: 24
                              ),
                            ),
                            const SizedBox(width: 16),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  doc['hasPdf'] == true ? 'PDF document' : 'Document Data', 
                                  style: const TextStyle(color: Color(0xFF17324A), fontSize: 14, fontWeight: FontWeight.bold)
                                ),
                                const SizedBox(height: 8),
                                Row(
                                  children: [
                                    if (doc['hasPdf'] == true) ...[
                                      InkWell(
                                        onTap: () {
                                          setState(() {
                                            isPdfOpen = true;
                                          });
                                          if (_contentData == null && !_isLoadingContent) {
                                            fetchContent(setState);
                                          } else if (_contentType == 'json') {
                                            fetchContent(setState, forceJson: false);
                                          }
                                        },
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFFE6F7F9),
                                            borderRadius: BorderRadius.circular(4),
                                          ),
                                          child: Row(
                                            children: const [
                                              Icon(Icons.picture_as_pdf, size: 12, color: Color(0xFF0C8A99)),
                                              SizedBox(width: 4),
                                              Text('Open PDF', style: TextStyle(color: Color(0xFF0C8A99), fontSize: 12, fontWeight: FontWeight.bold)),
                                            ],
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                    ],
                                    InkWell(
                                      onTap: () {
                                        setState(() {
                                          isPdfOpen = true;
                                        });
                                        // If PDF exists, force JSON mode for this button
                                        if (_contentData == null && !_isLoadingContent) {
                                          fetchContent(setState, forceJson: doc['hasPdf'] == true);
                                        } else if (doc['hasPdf'] == true && _contentType != 'json') {
                                          // Re-fetch if they previously loaded the PDF
                                          fetchContent(setState, forceJson: true);
                                        }
                                      },
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFFE6F7F9),
                                          borderRadius: BorderRadius.circular(4),
                                        ),
                                        child: Row(
                                          children: const [
                                            Icon(Icons.data_object, size: 12, color: Color(0xFF0C8A99)),
                                            SizedBox(width: 4),
                                            Text('Read Data', style: TextStyle(color: Color(0xFF0C8A99), fontSize: 12, fontWeight: FontWeight.bold)),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                    
                    // Footer
                    Align(
                      alignment: Alignment.bottomRight,
                      child: OutlinedButton(
                        onPressed: isPdfOpen
                            ? () {
                                setState(() {
                                  isPdfOpen = false;
                                });
                              }
                            : () => Navigator.pop(context),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: Color(0xFF0C8A99)),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                        ),
                        child: Text(isPdfOpen ? 'Back to Summary' : 'Close', style: const TextStyle(color: Color(0xFF0C8A99))),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}
