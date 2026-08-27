const fs = require('fs');
let code = fs.readFileSync('lib/m3/widgets/fhir_data_viewer.dart', 'utf8');

// 1. Replace declarations
code = code.replace(
  'List<Map<String, dynamic>> vitals = [];',
  `List<Map<String, dynamic>> vitalSigns = [];
    List<Map<String, dynamic>> bodyMeasurements = [];
    List<Map<String, dynamic>> physicalActivity = [];
    List<Map<String, dynamic>> generalAssessment = [];
    List<Map<String, dynamic>> otherVitals = [];`
);

// 2. Replace the Observation logic
const oldObsLogic = `        if (obsName.contains('chief complaint')) {
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
        }`;

const newObsLogic = `        bool isVital = false;
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
        }`;

code = code.replace(oldObsLogic, newObsLogic);

// 3. Replace the build section
const oldBuildSection = '_buildSection("PHYSICAL EXAMINATION (VITALS)", Icons.monitor_heart, const Color(0xFF0C8A99), vitals, _buildFullWidthItem),';
const newBuildSection = `_buildSection("VITAL SIGNS", Icons.monitor_heart, const Color(0xFFE91E63), vitalSigns, _buildFullWidthItem),
          _buildSection("BODY MEASUREMENT", Icons.accessibility_new, const Color(0xFF0C8A99), bodyMeasurements, _buildFullWidthItem),
          _buildSection("PHYSICAL ACTIVITY", Icons.directions_run, const Color(0xFF4CAF50), physicalActivity, _buildFullWidthItem),
          _buildSection("GENERAL ASSESSMENT", Icons.assignment_ind, const Color(0xFFFF9800), generalAssessment, _buildFullWidthItem),
          _buildSection("OTHER VITALS / PHYSICAL EXAM", Icons.monitor_weight, const Color(0xFF0C8A99), otherVitals, _buildFullWidthItem),`;

code = code.replace(oldBuildSection, newBuildSection);

// 4. Replace the empty check
const oldEmptyCheck = `if (allergies.isEmpty && vitals.isEmpty && diagnoses.isEmpty && symptoms.isEmpty &&`;
const newEmptyCheck = `if (allergies.isEmpty && vitalSigns.isEmpty && bodyMeasurements.isEmpty && physicalActivity.isEmpty && generalAssessment.isEmpty && otherVitals.isEmpty && diagnoses.isEmpty && symptoms.isEmpty &&`;

code = code.replace(oldEmptyCheck, newEmptyCheck);

fs.writeFileSync('lib/m3/widgets/fhir_data_viewer.dart', code);
console.log("Patched fhir_data_viewer.dart successfully!");
