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
    List<Map<String, dynamic>> vitals = [];
    List<Map<String, dynamic>> diagnoses = [];
    List<Map<String, dynamic>> symptoms = [];
    List<Map<String, dynamic>> familyHistory = [];
    List<Map<String, dynamic>> procedures = [];
    List<Map<String, dynamic>> investigations = [];
    List<Map<String, dynamic>> followUps = [];
    List<Map<String, dynamic>> medications = [];
    List<Map<String, dynamic>> others = [];

    // First pass: extract summary & categorize
    for (var entry in entries) {
      final res = entry['resource'];
      if (res == null) continue;

      final type = res['resourceType'];

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
        investigations.add(res);
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
        } else if (obsName.contains('physical examination') || obsName.contains('vital')) {
          vitals.add(res);
        } else {
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
          if (isVital) {
            vitals.add(res);
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
          _buildSection("PHYSICAL EXAMINATION (VITALS)", Icons.monitor_heart, const Color(0xFF0C8A99), vitals, _buildFullWidthItem),
          _buildSection("ALLERGIES", Icons.do_not_disturb_alt, Colors.red, allergies, _buildFullWidthItem),
          _buildSection("MEDICAL HISTORY", Icons.medical_information, const Color(0xFF673AB7), diagnoses, _buildFullWidthItem),
          _buildSection("PROCEDURE PERFORMED", Icons.medical_services, Colors.teal, procedures, _buildFullWidthItem),
          _buildSection("DIAGNOSTIC / LAB REPORTS", Icons.biotech, const Color(0xFF0C8A99), investigations, _buildFullWidthItem),
          _buildSection("MEDICATION ADVICE", Icons.medication, const Color(0xFF0C8A99), medications, _buildFullWidthItem),
          _buildSection("CARE PLAN", Icons.calendar_today, Colors.green, followUps, _buildFullWidthItem),
          _buildSection("FAMILY HISTORY", Icons.family_restroom, Colors.pink, familyHistory, _buildFullWidthItem),
          _buildSection("OTHER RECORDS", Icons.folder, const Color(0xFF0C8A99), others, _buildFullWidthItem),
          
          if (allergies.isEmpty && vitals.isEmpty && diagnoses.isEmpty && symptoms.isEmpty && 
              familyHistory.isEmpty && investigations.isEmpty && followUps.isEmpty && 
              medications.isEmpty && others.isEmpty)
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
}
