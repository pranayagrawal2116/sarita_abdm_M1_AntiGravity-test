import 'package:flutter/material.dart';

class FhirDataViewer extends StatelessWidget {
  final Map<String, dynamic> bundle;

  const FhirDataViewer({super.key, required this.bundle});

  String _capitalize(String s) => s.isNotEmpty ? '${s[0].toUpperCase()}${s.substring(1)}' : '';

  @override
  Widget build(BuildContext context) {
    if (bundle['resourceType'] != 'Bundle' || bundle['entry'] == null) {
      return const Center(child: Text("Invalid FHIR Bundle"));
    }

    final entries = bundle['entry'] as List<dynamic>;

    // Extraction variables
    String patientName = '';
    String patientGender = '';
    String patientMrn = '';
    String doctorName = 'Unknown Doctor';
    String docDate = '';
    String docTitle = 'Health Document';
    String docType = 'CLINICAL DOCUMENT';
    String encounterType = '';

    List<Map<String, dynamic>> allergies = [];
    List<Map<String, dynamic>> vitalSigns = [];
    List<Map<String, dynamic>> bodyMeasurements = [];
    List<Map<String, dynamic>> physicalActivity = [];
    List<Map<String, dynamic>> generalAssessment = [];
    List<Map<String, dynamic>> otherVitals = [];
    List<Map<String, dynamic>> diagnoses = [];
    List<Map<String, dynamic>> symptoms = [];
    List<Map<String, dynamic>> familyHistory = [];
    List<Map<String, dynamic>> procedures = [];
    List<Map<String, dynamic>> investigations = [];
    List<Map<String, dynamic>> followUps = [];
    List<Map<String, dynamic>> medications = [];
    List<Map<String, dynamic>> others = [];
    List<Map<String, dynamic>> invoices = [];
    List<Map<String, dynamic>> immunizations = [];

    List<Map<String, dynamic>> diagnosticReports = [];
    Set<String> diagObsIds = {};
    Map<String, Map<String, dynamic>> allObsMap = {};

    for (var entry in entries) {
      final res = entry['resource'];
      if (res == null) continue;
      if (res['resourceType'] == 'DiagnosticReport') {
        diagnosticReports.add(res);
        if (res['result'] != null) {
          for (var r in res['result']) {
             if (r['reference'] != null) {
                String ref = r['reference'].toString();
                if (ref.startsWith('urn:uuid:')) ref = ref.substring(9);
                diagObsIds.add(ref);
             }
          }
        }
      } else if (res['resourceType'] == 'Observation') {
        if (res['id'] != null) {
           allObsMap[res['id'].toString()] = res;
        }
      }
    }

    // First pass: extract summary & categorize
    for (var entry in entries) {
      final res = entry['resource'];
      if (res == null) continue;
      
      final type = res['resourceType'];
      if (type == 'Observation' && res['id'] != null && diagObsIds.contains(res['id'].toString())) {
         continue; // skip! rendered inside diagnostic report
      }

      if (type == 'Composition') {
        docDate = res['date'] ?? docDate;
        if (res['title'] != null) docTitle = res['title'];
        if (res['type'] != null && res['type']['text'] != null) docType = res['type']['text'].toUpperCase();
        if (res['author'] != null && res['author'].isNotEmpty) {
          doctorName = res['author'][0]['display'] ?? doctorName;
        }
      } else if (type == 'Patient') {
        if (res['name'] != null && res['name'].isNotEmpty) {
          patientName = res['name'][0]['text'] ?? patientName;
        }
        patientGender = res['gender'] != null ? _capitalize(res['gender']) : '';
        if (res['identifier'] != null && res['identifier'].isNotEmpty) {
          patientMrn = res['identifier'][0]['value'] ?? '';
        }
      } else if (type == 'Practitioner') {
        if (doctorName == "Unknown Doctor" && res['name'] != null && res['name'].isNotEmpty) {
          doctorName = res['name'][0]['text'] ?? doctorName;
        }
      } else if (type == 'Encounter') {
        if (res['class'] != null) {
          encounterType = res['class']['display'] ?? res['class']['code'] ?? encounterType;
        }
      } else if (type == 'DiagnosticReport') {
        if (docTitle == 'Health Document' && res['code'] != null && res['code']['text'] != null) docTitle = res['code']['text'];
        if (docType == 'CLINICAL DOCUMENT') docType = 'DIAGNOSTIC REPORT';
        if (docDate == '' && res['effectiveDateTime'] != null) docDate = res['effectiveDateTime'];
        if (doctorName == 'Unknown Doctor' && res['performer'] != null && res['performer'].isNotEmpty) {
          doctorName = res['performer'][0]['display'] ?? doctorName;
        }
      } else if (type == 'DocumentReference') {
        if (docTitle == 'Health Document' && res['type'] != null && res['type']['text'] != null) docTitle = res['type']['text'];
        if (docType == 'CLINICAL DOCUMENT') docType = 'DOCUMENT REFERENCE';
        if (docDate == '' && res['date'] != null) docDate = res['date'];
        if (doctorName == 'Unknown Doctor' && res['author'] != null && res['author'].isNotEmpty) {
          doctorName = res['author'][0]['display'] ?? doctorName;
        }
      } else if (type == 'AllergyIntolerance') {
        allergies.add(res);
      } else if (type == 'Condition') {
        // Simple heuristic: if category contains 'symptom', it's a symptom. Otherwise diagnosis.
        bool isSymptom = false;
        if (res['category'] != null) {
          for (var cat in res['category']) {
            final text = (cat['text'] ?? '').toLowerCase();
            if (text.contains('symptom')) {
              isSymptom = true;
              break;
            }
          }
        }
        if (isSymptom) {
          symptoms.add(res);
        } else {
          diagnoses.add(res);
        }
      } else if (type == 'Observation') {
        String obsName = '';
        if (res['code'] != null && res['code']['text'] != null) {
          obsName = res['code']['text'].toString().toLowerCase();
        }
        
        bool isVital = false;
        if (res['category'] != null) {
           for(var cat in res['category']) {
             if (cat['coding'] != null) {
               for (var coding in cat['coding']) {
                 if (coding['code'] == 'vital-signs') isVital = true;
               }
             }
           }
        }

        if (obsName.contains('chief complaint')) {
          symptoms.add(res);
        } else if (obsName.contains('medical history') || obsName.contains('diagnosis') || obsName.contains('condition')) {
          diagnoses.add(res);
        } else if (obsName.contains('investigation') || obsName.contains('lab') || obsName.contains('diagnostic') || obsName.contains('blood group') || obsName.contains('x-ray')) {
          investigations.add(res);
        } else if (obsName.contains('treatment') || obsName.contains('procedure')) {
          procedures.add(res);
        } else if (obsName.contains('medication')) {
          medications.add(res);
        } else {
          // Wellness Record / Vitals Categorization
          if (obsName.contains('height') || obsName.contains('weight') || obsName.contains('bmi') || obsName.contains('body mass')) {
            bodyMeasurements.add(res);
          } else if (obsName.contains('sleep') || obsName.contains('calories burned') || obsName.contains('step count') || obsName.contains('steps')) {
            physicalActivity.add(res);
          } else if (obsName.contains('calories intake') || obsName.contains('fluid intake') || obsName.contains('oral estimated')) {
            generalAssessment.add(res);
          } else if (obsName.contains('heart rate') || obsName.contains('respiratory rate') || obsName.contains('temperature') || obsName.contains('blood pressure') || obsName.contains('oxygen saturation') || obsName.contains('spo2') || obsName.contains('pulse') || obsName.contains('pain')) {
            vitalSigns.add(res);
          } else if (obsName.contains('physical examination') || obsName.contains('vital') || isVital) {
            otherVitals.add(res);
          } else {
            others.add(res);
          }
        }
      } else if (type == 'Procedure') {
        procedures.add(res);
      } else if (type == 'FamilyMemberHistory') {
        familyHistory.add(res);
      } else if (type == 'ServiceRequest') {
        investigations.add(res);
      } else if (type == 'Appointment' || type == 'CarePlan') {
        followUps.add(res);
      } else if (type == 'MedicationRequest') {
        medications.add(res);
      } else if (type == 'Invoice') {
        invoices.add(res);
      } else if (type == 'ChargeItem') {
        // Ignored, rendered inside Invoice
      } else if (type == 'Immunization') {
        immunizations.add(res);
      } else if (!['Patient', 'Practitioner', 'Organization', 'Composition', 'Encounter', 'DocumentReference'].contains(type)) {
        others.add(res);
      }
    }

    String dateStr = docDate.length > 10 ? docDate.substring(0, 10) : docDate;
    String patientInitials = patientName.isNotEmpty ? patientName.split(' ').take(2).map((e) => e.isNotEmpty ? e[0] : '').join('').toUpperCase() : 'P';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHeader(docType, docTitle, dateStr, doctorName, encounterType, patientName, patientInitials, patientGender, patientMrn),
          const SizedBox(height: 32),
          _buildSection("CHIEF COMPLAINTS", Icons.access_time, Colors.orange, symptoms, _buildFullWidthItem),
          _buildSection("VITAL SIGNS", Icons.monitor_heart, const Color(0xFFE91E63), vitalSigns, _buildFullWidthItem),
          _buildSection("BODY MEASUREMENT", Icons.accessibility_new, const Color(0xFF0C8A99), bodyMeasurements, _buildFullWidthItem),
          _buildSection("PHYSICAL ACTIVITY", Icons.directions_run, const Color(0xFF4CAF50), physicalActivity, _buildFullWidthItem),
          _buildSection("GENERAL ASSESSMENT", Icons.assignment_ind, const Color(0xFFFF9800), generalAssessment, _buildFullWidthItem),
          _buildSection("OTHER VITALS / PHYSICAL EXAM", Icons.monitor_weight, const Color(0xFF0C8A99), otherVitals, _buildFullWidthItem),
          _buildSection("ALLERGIES", Icons.do_not_disturb_alt, Colors.red, allergies, _buildFullWidthItem),
          _buildSection("MEDICAL HISTORY", Icons.medical_information, const Color(0xFF673AB7), diagnoses, _buildFullWidthItem),
          _buildSection("PROCEDURE PERFORMED", Icons.medical_services, Colors.teal, procedures, _buildFullWidthItem),
          _buildSection("DIAGNOSTIC / LAB REPORTS", Icons.biotech, const Color(0xFF0C8A99), investigations, _buildFullWidthItem),
          if (medications.isNotEmpty) _buildPrescriptionSection(medications),
          _buildSection("CARE PLAN", Icons.calendar_today, Colors.green, followUps, _buildFullWidthItem),
          _buildSection("FAMILY HISTORY", Icons.family_restroom, Colors.pink, familyHistory, _buildFullWidthItem),
          if (diagnosticReports.isNotEmpty) _buildDiagnosticReportsSection(diagnosticReports, allObsMap),
          if (immunizations.isNotEmpty) _buildImmunizationSection(immunizations),
          if (invoices.isNotEmpty) _buildInvoiceSection(invoices),
          _buildSection("OTHER RECORDS", Icons.folder, const Color(0xFF0C8A99), others, _buildFullWidthItem),
          
          if (allergies.isEmpty && vitalSigns.isEmpty && bodyMeasurements.isEmpty && physicalActivity.isEmpty && generalAssessment.isEmpty && otherVitals.isEmpty && diagnoses.isEmpty && symptoms.isEmpty && 
              familyHistory.isEmpty && investigations.isEmpty && followUps.isEmpty && 
              medications.isEmpty && others.isEmpty && invoices.isEmpty && diagnosticReports.isEmpty && immunizations.isEmpty)
             const Center(child: Text("No actionable records found in this document.", style: TextStyle(color: Color(0xFF7A8D9C)))),
        ],
      ),
    );
  }

  Widget _buildHeader(String docType, String docTitle, String docDate, String doctorName, String encounterType, String patientName, String patientInitials, String patientGender, String patientMrn) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFF9FDFD),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2F0F9)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFE6F7F9),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.description, color: Color(0xFF0C8A99), size: 24),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(docType, style: const TextStyle(color: Color(0xFF0C8A99), fontSize: 12, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text(docTitle, style: const TextStyle(color: Color(0xFF17324A), fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text('$docDate • $doctorName${encounterType.isNotEmpty ? ' • $encounterType' : ''}', style: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 13)),
              ],
            ),
          ),
          const SizedBox(width: 16),
          Row(
            children: [
              CircleAvatar(
                backgroundColor: const Color(0xFF0C8A99),
                radius: 20,
                child: Text(patientInitials, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(patientName, style: const TextStyle(color: Color(0xFF17324A), fontSize: 16, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Text('${patientGender.isNotEmpty ? "$patientGender • " : ""}MRN: $patientMrn', style: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 13)),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSection(String title, IconData icon, Color color, List<Map<String, dynamic>> items, Widget Function(Map<String, dynamic>, Color) builder) {
    if (items.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, color: color, size: 16),
            const SizedBox(width: 8),
            Text(title, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.bold)),
          ]
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: items.map((res) => builder(res, color)).toList(),
        ),
        const SizedBox(height: 24),
      ],
    );
  }


  Widget _buildFullWidthItem(Map<String, dynamic> res, Color color) {
    final type = res['resourceType'];
    String text = '';
    
    if (type == 'Condition') {
      text = res['code']?['text'] ?? 'Unknown Condition';
      final clinicalStatus = res['clinicalStatus']?['coding']?[0]?['code'] ?? '';
      if (clinicalStatus.isNotEmpty) text += '\nStatus: $clinicalStatus';
    } else if (type == 'FamilyMemberHistory') {
      text = res['condition']?[0]?['code']?['text'] ?? 'Family History';
      final relation = res['relationship']?['text'] ?? '';
      if (relation.isNotEmpty) text += '\nRelationship: $relation';
    } else if (type == 'ServiceRequest') {
      text = res['code']?['text'] ?? 'Investigation';
    } else if (type == 'Procedure') {
      text = res['code']?['text'] ?? 'Procedure';
    } else if (type == 'Appointment' || type == 'CarePlan') {
      text = res['description'] ?? res['title'] ?? 'Follow up';
    } else if (type == 'MedicationRequest') {
      text = res['medicationCodeableConcept']?['text'] ?? 'Medication';
      if (res['dosageInstruction'] != null && res['dosageInstruction'].isNotEmpty) {
        final dosageText = res['dosageInstruction'][0]['text'] ?? '';
        if (dosageText.isNotEmpty) {
          text += '\nDoses: $dosageText';
        }
      }
    } else if (type == 'DiagnosticReport') {
      text = res['code']?['text'] ?? 'Diagnostic Report';
    } else if (type == 'Observation') {
      text = res['code']?['text'] ?? 'Observation';
      String value = '';
      if (res['valueQuantity'] != null) {
        value = '${res['valueQuantity']['value'] ?? ''} ${res['valueQuantity']['unit'] ?? ''}';
      } else if (res['valueString'] != null) {
        value = res['valueString'];
      }
      if (value.isNotEmpty) text += '\nResult: $value';
    } else if (type == 'AllergyIntolerance') {
      text = res['code']?['text'] ?? 'Allergy';
    } else {
      text = res['code']?['text'] ?? type;
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.05),
        border: Border(left: BorderSide(color: color, width: 4)),
      ),
      child: Text(
        text,
        style: const TextStyle(color: Color(0xFF17324A), fontSize: 13, fontWeight: FontWeight.w600),
      ),
    );
  }

  Widget _buildInvoiceSection(List<Map<String, dynamic>> invoices) {
    if (invoices.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            Icon(Icons.receipt_long, color: Color(0xFF0C8A99), size: 16),
            SizedBox(width: 8),
            Text("INVOICE RECORD", style: TextStyle(color: Color(0xFF0C8A99), fontSize: 12, fontWeight: FontWeight.bold)),
          ]
        ),
        const SizedBox(height: 12),
        ...invoices.map((inv) => _buildSingleInvoice(inv)),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildSingleInvoice(Map<String, dynamic> invoice) {
    String invoiceNo = 'Unknown';
    if (invoice['identifier'] != null && invoice['identifier'].isNotEmpty) {
      invoiceNo = invoice['identifier'][0]['value']?.toString() ?? 'Unknown';
    }
    
    final date = invoice['date']?.toString() ?? '';
    final totalNet = invoice['totalNet']?['value']?.toString() ?? '0';
    
    final lineItems = invoice['lineItem'] as List<dynamic>? ?? [];

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFD9E4EF)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x040E2233),
            blurRadius: 8,
            offset: Offset(0, 2),
          )
        ]
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Container(
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(
              color: Color(0xFFF9FDFD),
              borderRadius: BorderRadius.only(topLeft: Radius.circular(12), topRight: Radius.circular(12)),
              border: Border(bottom: BorderSide(color: Color(0xFFD9E4EF))),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Invoice No', style: TextStyle(color: Color(0xFF7A8D9C), fontSize: 11, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    Text(invoiceNo, style: const TextStyle(color: Color(0xFF17324A), fontSize: 14, fontWeight: FontWeight.bold)),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    const Text('Invoice Date', style: TextStyle(color: Color(0xFF7A8D9C), fontSize: 11, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    Text(date.length > 10 ? date.substring(0, 10) : date, style: const TextStyle(color: Color(0xFF17324A), fontSize: 14, fontWeight: FontWeight.bold)),
                  ],
                ),
              ],
            ),
          ),
          
          // Items Table
          LayoutBuilder(
            builder: (context, constraints) {
              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: ConstrainedBox(
                  constraints: BoxConstraints(minWidth: constraints.maxWidth),
                  child: DataTable(
                    headingRowHeight: 40,
              dataRowMinHeight: 48,
              dataRowMaxHeight: 48,
              headingTextStyle: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 11, fontWeight: FontWeight.bold),
              dataTextStyle: const TextStyle(color: Color(0xFF17324A), fontSize: 13, fontWeight: FontWeight.w500),
              columns: const [
                DataColumn(label: Text('Item Name')),
                DataColumn(label: Text('MRP')),
                DataColumn(label: Text('Qty')),
                DataColumn(label: Text('Discount')),
                DataColumn(label: Text('Rate')),
                DataColumn(label: Text('GST')),
                DataColumn(label: Text('Amount')),
              ],
              rows: lineItems.map((item) {
                final itemName = item['chargeItemReference']?['display']?.toString() ?? 'Item';
                final prices = item['priceComponent'] as List<dynamic>? ?? [];
                
                double mrp = 0;
                double qty = 1;
                double discount = 0;
                double rate = 0;
                double cgst = 0;
                double sgst = 0;
                
                for (var p in prices) {
                  final code = p['code']?['coding']?[0]?['display']?.toString().toLowerCase() ?? '';
                  final valStr = p['amount']?['value']?.toString() ?? '0';
                  final val = double.tryParse(valStr) ?? 0;
                  
                  if (code == 'mrp') {
                    mrp = val;
                    if (p['factor'] != null) {
                      qty = double.tryParse(p['factor'].toString()) ?? 1;
                    }
                  }
                  if (code == 'discount') discount = val;
                  if (code == 'rate') rate = val;
                  if (code == 'cgst') cgst = val;
                  if (code == 'sgst') sgst = val;
                }
                
                final double totalGst = cgst + sgst;
                final double amount = rate + totalGst;
                
                return DataRow(
                  cells: [
                    DataCell(Text(itemName)),
                    DataCell(Text('₹ ${mrp.toStringAsFixed(2)}')),
                    DataCell(Text('${qty.toInt()}')),
                    DataCell(Text('₹ ${discount.toStringAsFixed(2)}')),
                    DataCell(Text('₹ ${rate.toStringAsFixed(2)}')),
                    DataCell(Text('₹ ${totalGst.toStringAsFixed(2)}')),
                    DataCell(Text('₹ ${amount.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold))),
                  ]
                );
              }).toList(),
                  ),
                ),
              );
            },
          ),
          
          // Footer / Total
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            decoration: const BoxDecoration(
              color: Color(0xFFF9FDFD),
              borderRadius: BorderRadius.only(bottomLeft: Radius.circular(12), bottomRight: Radius.circular(12)),
              border: Border(top: BorderSide(color: Color(0xFFD9E4EF))),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                const Text('Total Net: ', style: TextStyle(color: Color(0xFF7A8D9C), fontSize: 13, fontWeight: FontWeight.w600)),
                Text('₹ $totalNet', style: const TextStyle(color: Color(0xFF17324A), fontSize: 16, fontWeight: FontWeight.bold)),
              ],
            ),
          )
        ],
      ),
    );
  }

  Widget _buildDiagnosticReportsSection(List<Map<String, dynamic>> reports, Map<String, Map<String, dynamic>> allObsMap) {
    if (reports.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            Icon(Icons.biotech, color: Color(0xFF0C8A99), size: 16),
            SizedBox(width: 8),
            Text("LAB REPORTS (DIAGNOSTIC)", style: TextStyle(color: Color(0xFF0C8A99), fontSize: 12, fontWeight: FontWeight.bold)),
          ]
        ),
        const SizedBox(height: 12),
        ...reports.map((report) => _buildSingleDiagnosticReport(report, allObsMap)),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildSingleDiagnosticReport(Map<String, dynamic> report, Map<String, Map<String, dynamic>> allObsMap) {
    final reportName = report['code']?['text'] ?? report['code']?['coding']?[0]?['display'] ?? 'Diagnostic Report';
    final results = report['result'] as List<dynamic>? ?? [];

    List<Map<String, dynamic>> reportObs = [];
    for (var r in results) {
       if (r['reference'] != null) {
          String ref = r['reference'].toString();
          if (ref.startsWith('urn:uuid:')) ref = ref.substring(9);
          if (allObsMap.containsKey(ref)) {
             reportObs.add(allObsMap[ref]!);
          }
       }
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFD9E4EF)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x040E2233),
            blurRadius: 8,
            offset: Offset(0, 2),
          )
        ]
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Container(
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(
              color: Color(0xFFF9FDFD),
              borderRadius: BorderRadius.only(topLeft: Radius.circular(12), topRight: Radius.circular(12)),
              border: Border(bottom: BorderSide(color: Color(0xFFD9E4EF))),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Lab Report Name', style: TextStyle(color: Color(0xFF7A8D9C), fontSize: 11, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(reportName, style: const TextStyle(color: Color(0xFF17324A), fontSize: 14, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          
          // Items Table
          if (reportObs.isNotEmpty)
            LayoutBuilder(
              builder: (context, constraints) {
                return SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: ConstrainedBox(
                    constraints: BoxConstraints(minWidth: constraints.maxWidth),
                    child: DataTable(
                      headingRowHeight: 40,
                dataRowMinHeight: 48,
                dataRowMaxHeight: 48,
                headingTextStyle: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 11, fontWeight: FontWeight.bold),
                dataTextStyle: const TextStyle(color: Color(0xFF17324A), fontSize: 13, fontWeight: FontWeight.w500),
                columns: const [
                  DataColumn(label: Text('Test Name / Display')),
                  DataColumn(label: Text('Value')),
                  DataColumn(label: Text('Unit')),
                ],
                rows: reportObs.map((obs) {
                  final testName = obs['code']?['text'] ?? obs['code']?['coding']?[0]?['display'] ?? 'Unknown Test';
                  
                  String valueStr = '-';
                  String unitStr = '';
                  
                  if (obs['valueQuantity'] != null) {
                    valueStr = obs['valueQuantity']['value']?.toString() ?? '-';
                    unitStr = obs['valueQuantity']['unit']?.toString() ?? '';
                  } else if (obs['valueString'] != null) {
                    valueStr = obs['valueString']?.toString() ?? '-';
                  }
                  
                  return DataRow(
                    cells: [
                      DataCell(Text(testName)),
                      DataCell(Text(valueStr)),
                      DataCell(Text(unitStr)),
                    ]
                  );
                }).toList(),
                    ),
                  ),
                );
              },
            ),
          if (reportObs.isEmpty)
             const Padding(
               padding: EdgeInsets.all(16.0),
               child: Text('No observation results available.', style: TextStyle(color: Color(0xFF7A8D9C), fontSize: 13, fontStyle: FontStyle.italic)),
             )
        ],
      ),
    );
  }

  Widget _buildPrescriptionSection(List<Map<String, dynamic>> medications) {
    if (medications.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            Icon(Icons.medication, color: Colors.teal, size: 16),
            SizedBox(width: 8),
            Text("MEDICATION ADVICE", style: TextStyle(color: Colors.teal, fontSize: 12, fontWeight: FontWeight.bold)),
          ]
        ),
        const SizedBox(height: 12),
        Container(
          margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFD9E4EF)),
            boxShadow: const [
              BoxShadow(
                color: Color(0x040E2233),
                blurRadius: 8,
                offset: Offset(0, 2),
              )
            ]
          ),
          child: LayoutBuilder(
            builder: (context, constraints) {
              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: ConstrainedBox(
                  constraints: BoxConstraints(minWidth: constraints.maxWidth),
                  child: DataTable(
                    headingRowHeight: 40,
              dataRowMinHeight: 48,
              dataRowMaxHeight: 48,
              headingTextStyle: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 11, fontWeight: FontWeight.bold),
              dataTextStyle: const TextStyle(color: Color(0xFF17324A), fontSize: 13, fontWeight: FontWeight.w500),
              columns: const [
                DataColumn(label: Text('Medicine Name')),
                DataColumn(label: Text('Dose Pattern')),
                DataColumn(label: Text('Route')),
                DataColumn(label: Text('Timing / Method')),
                DataColumn(label: Text('Instructions')),
              ],
              rows: medications.map((med) {
                final name = med['medicationCodeableConcept']?['text'] ?? med['medicationCodeableConcept']?['coding']?[0]?['display'] ?? 'Unknown Medicine';
                
                String dose = '';
                String route = '';
                String timing = '';
                
                if (med['dosageInstruction'] != null && med['dosageInstruction'].isNotEmpty) {
                  final dosage = med['dosageInstruction'][0];
                  dose = dosage['text']?.toString() ?? '';
                  if (dosage['route'] != null) {
                     route = dosage['route']['text'] ?? dosage['route']['coding']?[0]?['display'] ?? '';
                  }
                  if (dosage['method'] != null) {
                     timing = dosage['method']['text'] ?? dosage['method']['coding']?[0]?['display'] ?? '';
                  }
                }
                
                String instructions = '';
                if (med['reasonCode'] != null && med['reasonCode'].isNotEmpty) {
                  instructions = med['reasonCode'][0]['text'] ?? med['reasonCode'][0]['coding']?[0]?['display'] ?? '';
                }
                
                return DataRow(
                  cells: [
                    DataCell(Text(name.toString())),
                    DataCell(Text(dose.toString())),
                    DataCell(Text(route.toString())),
                    DataCell(Text(timing.toString())),
                    DataCell(Text(instructions.toString())),
                  ]
                );
              }).toList(),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildImmunizationSection(List<Map<String, dynamic>> immunizations) {
    if (immunizations.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            Icon(Icons.vaccines, color: Colors.blueAccent, size: 16),
            SizedBox(width: 8),
            Text("IMMUNIZATION TABLE", style: TextStyle(color: Colors.blueAccent, fontSize: 12, fontWeight: FontWeight.bold)),
          ]
        ),
        const SizedBox(height: 12),
        Container(
          margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFD9E4EF)),
            boxShadow: const [
              BoxShadow(
                color: Color(0x040E2233),
                blurRadius: 8,
                offset: Offset(0, 2),
              )
            ]
          ),
          child: LayoutBuilder(
            builder: (context, constraints) {
              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: ConstrainedBox(
                  constraints: BoxConstraints(minWidth: constraints.maxWidth),
                  child: DataTable(
                    headingRowHeight: 40,
                    dataRowMinHeight: 48,
                    dataRowMaxHeight: 48,
                    headingTextStyle: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 11, fontWeight: FontWeight.bold),
                    dataTextStyle: const TextStyle(color: Color(0xFF17324A), fontSize: 13, fontWeight: FontWeight.w500),
                    columns: const [
                      DataColumn(label: Text('Vaccine Name')),
                      DataColumn(label: Text('Brand')),
                      DataColumn(label: Text('Occurrence Date')),
                      DataColumn(label: Text('Lot Number')),
                      DataColumn(label: Text('Dose No.')),
                    ],
                    rows: immunizations.map((imm) {
                      final name = imm['vaccineCode']?['text'] ?? imm['vaccineCode']?['coding']?[0]?['display'] ?? 'Vaccine';
                      final brand = imm['manufacturer']?['display'] ?? imm['manufacturer']?['reference'] ?? '-';
                      final date = imm['occurrenceDateTime'] ?? imm['occurrenceString'] ?? '-';
                      final lot = imm['lotNumber'] ?? '-';
                      
                      String dose = '-';
                      if (imm['protocolApplied'] != null && (imm['protocolApplied'] as List).isNotEmpty) {
                        final p = imm['protocolApplied'][0];
                        if (p['doseNumberPositiveInt'] != null) {
                          dose = p['doseNumberPositiveInt'].toString();
                        } else if (p['doseNumberString'] != null) {
                          dose = p['doseNumberString'].toString();
                        }
                      }
                      
                      return DataRow(
                        cells: [
                          DataCell(Text(name.toString())),
                          DataCell(Text(brand.toString())),
                          DataCell(Text(date.toString().length > 10 ? date.toString().substring(0, 10) : date.toString())),
                          DataCell(Text(lot.toString())),
                          DataCell(Text(dose.toString())),
                        ]
                      );
                    }).toList(),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }
}
