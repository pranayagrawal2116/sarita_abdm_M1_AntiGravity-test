const fs = require('fs');
let code = fs.readFileSync('lib/m3/widgets/fhir_data_viewer.dart', 'utf8');

const badCode = `      final type = res['resourceType'];
      if (type == 'Observation' && res['id'] != null && diagObsIds.contains(res['id'].toString())) {
         continue; // skip! rendered inside diagnostic report
      }
      final res = entry['resource'];
      if (res == null) continue;

      final type = res['resourceType'];`;

const goodCode = `      final type = res['resourceType'];
      if (type == 'Observation' && res['id'] != null && diagObsIds.contains(res['id'].toString())) {
         continue; // skip! rendered inside diagnostic report
      }`;

code = code.replace(badCode, goodCode);
fs.writeFileSync('lib/m3/widgets/fhir_data_viewer.dart', code);
console.log("Fixed syntax error");
