import re
import os

filepath = 'lib/m3/screens/hip_documents_screen.dart'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Add new state variables and fetch function inside builder
old_vars = "        bool isPdfOpen = false;"
new_vars = """        bool isPdfOpen = false;
        bool _isLoadingContent = false;
        String? _contentType;
        dynamic _contentData;
        String? _errorMessage;

        Future<void> fetchContent(StateSetter setState) async {
          setState(() {
            _isLoadingContent = true;
            _errorMessage = null;
          });
          try {
            final response = await http.get(Uri.parse('${HiuApiService.baseUrl}/documents/${doc['id']}/pdf'));
            if (response.statusCode == 200) {
              final contentType = response.headers['content-type']?.toLowerCase() ?? '';
              setState(() {
                if (contentType.contains('application/json')) {
                  _contentType = 'json';
                  try {
                    _contentData = const JsonEncoder.withIndent('  ').convert(jsonDecode(response.body));
                  } catch(e) {
                    _contentData = response.body;
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
        }"""
content = content.replace(old_vars, new_vars)


# 2. Replace the SfPdfViewer code
old_pdf_view = """                    if (isPdfOpen)
                      Expanded(
                        child: Container(
                          decoration: BoxDecoration(
                            border: Border.all(color: const Color(0xFFE2F0F9)),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: SfPdfViewer.network('${HiuApiService.baseUrl}/documents/${doc['id']}/pdf'),
                        ),
                      )"""

new_pdf_view = """                    if (isPdfOpen)
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
                                      ? SingleChildScrollView(
                                          padding: const EdgeInsets.all(16),
                                          child: Text(_contentData as String, style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
                                        )
                                      : SfPdfViewer.memory(_contentData),
                        ),
                      )"""

content = content.replace(old_pdf_view, new_pdf_view)


# 3. Replace doc['hasPdf'] conditional block
old_has_pdf_block = """                      // PDF Document Card or No Data Message
                      doc['hasPdf'] == true
                          ? Container(
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
                                      color: const Color(0xFFFDECEC),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: const Icon(Icons.picture_as_pdf, color: Colors.red, size: 24),
                                  ),
                                  const SizedBox(width: 16),
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Text('PDF document', style: TextStyle(color: Color(0xFF17324A), fontSize: 14, fontWeight: FontWeight.bold)),
                                      const SizedBox(height: 8),
                                      InkWell(
                                        onTap: () {
                                          setState(() {
                                            isPdfOpen = true;
                                          });
                                        },
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFFE6F7F9),
                                            borderRadius: BorderRadius.circular(4),
                                          ),
                                          child: Row(
                                            children: const [
                                              Icon(Icons.open_in_new, size: 12, color: Color(0xFF0C8A99)),
                                              SizedBox(width: 4),
                                              Text('Open PDF', style: TextStyle(color: Color(0xFF0C8A99), fontSize: 12, fontWeight: FontWeight.bold)),
                                            ],
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            )
                          : Container(
                              padding: const EdgeInsets.all(24),
                              decoration: BoxDecoration(
                                border: Border.all(color: const Color(0xFFE2F0F9)),
                                borderRadius: BorderRadius.circular(8),
                                color: const Color(0xFFF8FCFF),
                              ),
                              alignment: Alignment.center,
                              child: const Text('No PDF data available.', style: TextStyle(color: Color(0xFF7A8D9C), fontSize: 14)),
                            ),"""

new_has_pdf_block = """                      // PDF Document Card or No Data Message
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
                                InkWell(
                                  onTap: () {
                                    setState(() {
                                      isPdfOpen = true;
                                    });
                                    if (_contentData == null && !_isLoadingContent) {
                                      fetchContent(setState);
                                    }
                                  },
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFE6F7F9),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Row(
                                      children: [
                                        const Icon(Icons.open_in_new, size: 12, color: Color(0xFF0C8A99)),
                                        const SizedBox(width: 4),
                                        Text(
                                          doc['hasPdf'] == true ? 'Open PDF' : 'View Data', 
                                          style: const TextStyle(color: Color(0xFF0C8A99), fontSize: 12, fontWeight: FontWeight.bold)
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),"""

content = content.replace(old_has_pdf_block, new_has_pdf_block)

with open(filepath, 'w') as f:
    f.write(content)
