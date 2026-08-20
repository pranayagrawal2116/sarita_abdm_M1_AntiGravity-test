import 'package:flutter/material.dart';
import 'dart:convert';

class FhirDataViewer extends StatelessWidget {
  final Map<String, dynamic> bundle;

  const FhirDataViewer({Key? key, required this.bundle}) : super(key: key);

  String _capitalize(String s) => s.isNotEmpty ? '${s[0].toUpperCase()}${s.substring(1)}' : '';

  @override
  Widget build(BuildContext context) {
    List<dynamic> entries = [];
    if (bundle['resourceType'] == 'Bundle' && bundle['entry'] != null) {
      entries = bundle['entry'] as List<dynamic>;
    } else if (bundle['resourceType'] != null) {
      entries = [{'resource': bundle}];
    }
    
    if (entries.isEmpty) {
      return const Center(child: Text('No structured data available in this document.'));
    }

    // Extract summary information
    String docType = "HEALTH RECORD";
    String docTitle = "Health Document";
    String docDate = "";
    String doctorName = "Unknown Doctor";
    String encounterType = "";
    
    String patientName = "Unknown";
    String patientGender = "";
    String patientMrn = "";
    
    List<Map<String, dynamic>> records = [];

    for (var entry in entries) {
      final res = entry['resource'];
      if (res == null) continue;
      
      final type = res['resourceType'];
      
      if (type == 'Composition') {
        if (res['type'] != null && res['type']['text'] != null) {
          docType = res['type']['text'].toString().toUpperCase();
        }
        docTitle = res['title'] ?? docTitle;
        docDate = res['date'] ?? docDate;
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
      } else if (!['Patient', 'Practitioner', 'Organization', 'Composition', 'Encounter'].contains(type)) {
        // Collect as a record
        records.add(res as Map<String, dynamic>);
      }
    }

    // Default to something if docTitle is generic and we have a single record type
    if (docTitle == "Health Document" && records.isNotEmpty) {
      if (records.every((r) => r['resourceType'] == 'MedicationRequest')) {
        docType = "PRESCRIPTION RECORD";
        docTitle = "Prescription Record for $patientName";
      } else if (records.every((r) => r['resourceType'] == 'Invoice' || r['resourceType'] == 'ChargeItem')) {
        docType = "INVOICE RECORD";
        docTitle = "Invoice Record for $patientName";
      }
    }

    // Format date string
    String dateStr = docDate.length > 10 ? docDate.substring(0, 10) : docDate; // simple formatting

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // SUMMARY CARD
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: const Color(0xFFE2F0F9)),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Icon block
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE6F7F9),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.description, color: Color(0xFF0C8A99), size: 28),
                ),
                const SizedBox(width: 16),
                
                // Document Details
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(docType, style: const TextStyle(color: Color(0xFF0C8A99), fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
                      const SizedBox(height: 4),
                      Text(docTitle, style: const TextStyle(color: Color(0xFF17324A), fontSize: 16, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 4),
                      Text('$dateStr • $doctorName ${encounterType.isNotEmpty ? ' • $encounterType' : ''}', 
                           style: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 12)),
                    ],
                  ),
                ),
                
                // Patient Details Block
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FCFF),
                    borderRadius: BorderRadius.circular(30),
                  ),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 16,
                        backgroundColor: const Color(0xFF0C8A99),
                        child: Text(
                          patientName.isNotEmpty ? patientName[0].toUpperCase() : '?',
                          style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(patientName, style: const TextStyle(color: Color(0xFF17324A), fontSize: 13, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 2),
                          Text('${patientGender.isNotEmpty ? patientGender : ''}${patientMrn.isNotEmpty ? ' • MRN: $patientMrn' : ''}', 
                               style: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 11)),
                        ],
                      )
                    ],
                  ),
                )
              ],
            ),
          ),
          
          const SizedBox(height: 32),
          
          // RECORDS LIST
          if (records.isNotEmpty) ...[
            Text(docType, style: const TextStyle(color: Color(0xFF0C8A99), fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
            const SizedBox(height: 16),
            
            Wrap(
              spacing: 16,
              runSpacing: 16,
              children: records.map((res) => _buildRecordCard(res)).toList(),
            ),
          ] else ...[
             const Center(child: Text("No actionable records found in this document.", style: TextStyle(color: Color(0xFF7A8D9C)))),
          ]
        ],
      ),
    );
  }

  Widget _buildRecordCard(Map<String, dynamic> res) {
    final type = res['resourceType'];
    String title = type;
    String subtitle = '';
    String status = res['status'] ?? 'Active';
    IconData icon = Icons.data_usage;
    Color iconColor = const Color(0xFF0C8A99);
    Color iconBg = const Color(0xFFE6F7F9);

    if (type == 'MedicationRequest') {
      icon = Icons.medication;
      if (res['medicationCodeableConcept'] != null) {
        title = res['medicationCodeableConcept']['text'] ?? 'Unknown Medication';
      }
      if (res['dosageInstruction'] != null && res['dosageInstruction'].isNotEmpty) {
        subtitle = 'Doses: ${res['dosageInstruction'][0]['text'] ?? ''}';
      }
    } else if (type == 'Observation') {
      icon = Icons.science;
      if (res['code'] != null) {
        title = res['code']['text'] ?? 'Observation';
      }
      if (res['valueQuantity'] != null) {
        subtitle = 'Result: ${res['valueQuantity']['value']} ${res['valueQuantity']['unit'] ?? ''}';
      } else if (res['valueString'] != null) {
        subtitle = 'Result: ${res['valueString']}';
      }
    } else if (type == 'Invoice') {
      icon = Icons.receipt_long;
      title = 'Invoice Summary';
      if (res['totalGross'] != null) {
        subtitle = 'Gross: ${res['totalGross']['value']} ${res['totalGross']['currency'] ?? ''}';
      }
    } else if (type == 'ChargeItem') {
      icon = Icons.payments_outlined;
      if (res['code'] != null && res['code']['text'] != null) {
        title = res['code']['text'];
      } else {
        title = 'Charge Item';
      }
      if (res['priceOverride'] != null) {
        subtitle = 'Amount: ${res['priceOverride']['value']} ${res['priceOverride']['currency'] ?? ''}';
      }
    } else if (type == 'DiagnosticReport') {
      icon = Icons.assessment;
      if (res['code'] != null) {
        title = res['code']['text'] ?? 'Diagnostic Report';
      }
      subtitle = 'Issued: ${res['issued'] ?? ''}';
    } else if (type == 'Condition') {
      icon = Icons.coronavirus;
      if (res['code'] != null) {
        title = res['code']['text'] ?? 'Condition';
      }
      subtitle = 'Recorded: ${res['recordedDate'] ?? ''}';
    } else if (type == 'AllergyIntolerance') {
       icon = Icons.warning_amber_rounded;
       iconColor = Colors.orange;
       iconBg = Colors.orange.withOpacity(0.1);
       if (res['code'] != null) {
          title = res['code']['text'] ?? 'Allergy';
       }
    } else if (type == 'Procedure') {
       icon = Icons.healing;
       if (res['code'] != null) {
          title = res['code']['text'] ?? 'Procedure';
       }
    } else if (type == 'DocumentReference') {
       icon = Icons.description_outlined;
       if (res['type'] != null) {
          title = res['type']['text'] ?? 'Document Reference';
       } else {
          title = 'Document Reference';
       }
    } else {
      if (res['code'] != null && res['code']['text'] != null) {
        title = res['code']['text'];
      }
    }

    return Container(
      width: 400,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFE2F0F9)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(8)),
            child: Icon(icon, color: iconColor, size: 20),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(color: Color(0xFF17324A), fontSize: 14, fontWeight: FontWeight.bold)),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(subtitle, style: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 12)),
                ],
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE9F7EF),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    _capitalize(status),
                    style: const TextStyle(color: Color(0xFF27AE60), fontSize: 10, fontWeight: FontWeight.bold),
                  ),
                )
              ],
            ),
          )
        ],
      ),
    );
  }
}
