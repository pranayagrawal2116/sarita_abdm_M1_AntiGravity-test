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
        // If vital signs
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
        if (isVital || type == 'Observation') { 
          // For mock, put all observations in vitals unless it's obviously a symptom
          vitals.add(res);
        } else {
          others.add(res);
        }
      } else if (type == 'FamilyMemberHistory') {
        familyHistory.add(res);
      } else if (type == 'ServiceRequest' || type == 'DiagnosticReport') {
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

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildSection("ALLERGIES", Icons.do_not_disturb_alt, Colors.red, allergies, _buildAllergyItem),
          _buildSection("VITALS / MEASURES", Icons.monitor_heart, const Color(0xFF0C8A99), vitals, _buildVitalItem),
          _buildSection("DIAGNOSIS", Icons.medical_information, const Color(0xFF673AB7), diagnoses, _buildFullWidthItem),
          _buildSection("SYMPTOMS", Icons.access_time, Colors.orange, symptoms, _buildFullWidthItem),
          _buildSection("FAMILY HISTORY", Icons.family_restroom, Colors.pink, familyHistory, _buildFullWidthItem),
          _buildSection("INVESTIGATION ADVICE", Icons.biotech, const Color(0xFF0C8A99), investigations, _buildFullWidthItem),
          _buildSection("FOLLOW UP", Icons.calendar_today, Colors.green, followUps, _buildFullWidthItem),
          _buildSection("MEDICATIONS", Icons.medication, const Color(0xFF0C8A99), medications, _buildFullWidthItem),
          _buildSection("OTHER RECORDS", Icons.folder, const Color(0xFF0C8A99), others, _buildFullWidthItem),
          
          if (allergies.isEmpty && vitals.isEmpty && diagnoses.isEmpty && symptoms.isEmpty && 
              familyHistory.isEmpty && investigations.isEmpty && followUps.isEmpty && 
              medications.isEmpty && others.isEmpty)
             const Center(child: Text("No actionable records found in this document.", style: TextStyle(color: Color(0xFF7A8D9C)))),
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

  Widget _buildAllergyItem(Map<String, dynamic> res, Color color) {
    String text = 'Unknown Allergy';
    if (res['code'] != null && res['code']['text'] != null) {
      text = res['code']['text'];
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        border: Border.all(color: color.withOpacity(0.5)),
        borderRadius: BorderRadius.circular(20),
        color: color.withOpacity(0.05),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.do_not_disturb_alt, color: color, size: 14),
          const SizedBox(width: 8),
          Text(text, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildVitalItem(Map<String, dynamic> res, Color color) {
    String value = '';
    String label = 'Observation';
    IconData icon = Icons.science;
    
    if (res['code'] != null && res['code']['text'] != null) {
      label = res['code']['text'];
    }
    
    if (res['valueQuantity'] != null) {
      value = '${res['valueQuantity']['value']} ${res['valueQuantity']['unit'] ?? ''}';
    } else if (res['valueString'] != null) {
      value = res['valueString'];
    }
    
    // Guess icon based on label
    if (label.toLowerCase().contains('height')) icon = Icons.height;
    if (label.toLowerCase().contains('bp') || label.toLowerCase().contains('blood pressure')) icon = Icons.monitor_heart;
    if (label.toLowerCase().contains('step')) icon = Icons.directions_walk;
    if (label.toLowerCase().contains('calor')) icon = Icons.local_fire_department;
    if (label.toLowerCase().contains('spc') || label.toLowerCase().contains('oxy')) icon = Icons.water_drop;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFFE2F0F9)),
        borderRadius: BorderRadius.circular(8),
        color: Colors.white,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FCFF),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: const Color(0xFF577086), size: 16),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(value, style: const TextStyle(color: Color(0xFF17324A), fontSize: 14, fontWeight: FontWeight.bold)),
              Text(label.toUpperCase(), style: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 10, fontWeight: FontWeight.bold)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildFullWidthItem(Map<String, dynamic> res, Color color) {
    final type = res['resourceType'];
    String text = '';
    
    if (type == 'Condition') {
      text = res['code']?['text'] ?? 'Unknown Condition';
    } else if (type == 'FamilyMemberHistory') {
      text = res['condition']?[0]?['code']?['text'] ?? 'Family History';
      final relation = res['relationship']?['text'] ?? '';
      if (relation.isNotEmpty) text += ' — Relationship: $relation';
    } else if (type == 'ServiceRequest') {
      text = res['code']?['text'] ?? 'Investigation';
    } else if (type == 'Appointment' || type == 'CarePlan') {
      text = res['description'] ?? res['title'] ?? 'Follow up';
    } else if (type == 'MedicationRequest') {
      text = res['medicationCodeableConcept']?['text'] ?? 'Medication';
      if (res['dosageInstruction'] != null && res['dosageInstruction'].isNotEmpty) {
        text += ' - ${res['dosageInstruction'][0]['text'] ?? ''}';
      }
    } else if (type == 'DiagnosticReport') {
      text = res['code']?['text'] ?? 'Diagnostic Report';
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
