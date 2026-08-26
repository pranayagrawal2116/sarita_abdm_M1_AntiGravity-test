const fs = require('fs');

// Patch hiu_module_screen.dart
let hiuScreen = fs.readFileSync('lib/m3/screens/hiu_module_screen.dart', 'utf8');

const regexHiu = /if\s*\(\s*req\['details'\]\s*!=\s*null\s*&&\s*req\['details'\]\['permission'\]\s*!=\s*null\s*\)\s*\{\s*final\s*perm\s*=\s*req\['details'\]\['permission'\];\s*if\s*\(\s*perm\['dateRange'\]\s*!=\s*null\s*\)\s*\{\s*grantedDateFromStr\s*=\s*perm\['dateRange'\]\['from'\]\?\.toString\(\)\s*\?\?\s*grantedDateFromStr;\s*grantedDateToStr\s*=\s*perm\['dateRange'\]\['to'\]\?\.toString\(\)\s*\?\?\s*grantedDateToStr;\s*\}\s*grantedDateEraseAtStr\s*=\s*perm\['dataEraseAt'\]\?\.toString\(\)\s*\?\?\s*grantedDateEraseAtStr;\s*\}/;

const replacementHiu = `dynamic artDetails = req['details'];
                  if (artDetails == null && req['artefactDetails'] != null) {
                    final keys = (req['artefactDetails'] as Map).keys.toList();
                    if (keys.isNotEmpty) artDetails = req['artefactDetails'][keys.first];
                  }
                  
                  if (artDetails != null && artDetails['permission'] != null) {
                    final perm = artDetails['permission'];
                    if (perm['dateRange'] != null) {
                      grantedDateFromStr = perm['dateRange']['from']?.toString() ?? grantedDateFromStr;
                      grantedDateToStr = perm['dateRange']['to']?.toString() ?? grantedDateToStr;
                    }
                    grantedDateEraseAtStr = perm['dataEraseAt']?.toString() ?? grantedDateEraseAtStr;
                  }`;

if (hiuScreen.match(regexHiu)) {
  hiuScreen = hiuScreen.replace(regexHiu, replacementHiu);
  fs.writeFileSync('lib/m3/screens/hiu_module_screen.dart', hiuScreen);
  console.log("Patched hiu_module_screen.dart");
} else {
  console.log("Failed to patch hiu_module_screen.dart");
}

// Patch consent_detail_screen.dart
let detailScreen = fs.readFileSync('lib/m3/screens/consent_detail_screen.dart', 'utf8');

const regexDetail1 = /if\s*\(\s*_request\['details'\]\s*!=\s*null\s*&&\s*_request\['details'\]\['permission'\]\s*!=\s*null\s*\)\s*\{\s*grantedDateEraseAtStr\s*=\s*_request\['details'\]\['permission'\]\['dataEraseAt'\]\?\.toString\(\)\s*\?\?\s*grantedDateEraseAtStr;\s*\}/;

const replacementDetail1 = `dynamic artDetails1 = _request['details'];
    if (artDetails1 == null && _request['artefactDetails'] != null) {
      final keys = (_request['artefactDetails'] as Map).keys.toList();
      if (keys.isNotEmpty) artDetails1 = _request['artefactDetails'][keys.first];
    }
    if (artDetails1 != null && artDetails1['permission'] != null) {
      grantedDateEraseAtStr = artDetails1['permission']['dataEraseAt']?.toString() ?? grantedDateEraseAtStr;
    }`;

if (detailScreen.match(regexDetail1)) {
  detailScreen = detailScreen.replace(regexDetail1, replacementDetail1);
  console.log("Patched consent_detail_screen.dart (1)");
} else {
  console.log("Failed to patch consent_detail_screen.dart (1)");
}

const regexDetail2 = /if\s*\(\s*_request\['details'\]\s*!=\s*null\s*&&\s*_request\['details'\]\['permission'\]\s*!=\s*null\s*\)\s*\{\s*final\s*perm\s*=\s*_request\['details'\]\['permission'\];\s*if\s*\(\s*perm\['dateRange'\]\s*!=\s*null\s*\)\s*\{\s*grantedDateFrom\s*=\s*perm\['dateRange'\]\['from'\]\?\.toString\(\)\s*\?\?\s*grantedDateFrom;\s*grantedDateTo\s*=\s*perm\['dateRange'\]\['to'\]\?\.toString\(\)\s*\?\?\s*grantedDateTo;\s*\}\s*grantedDateEraseAt\s*=\s*perm\['dataEraseAt'\]\?\.toString\(\)\s*\?\?\s*grantedDateEraseAt;\s*\}/;

const replacementDetail2 = `dynamic artDetails2 = _request['details'];
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
    }`;

if (detailScreen.match(regexDetail2)) {
  detailScreen = detailScreen.replace(regexDetail2, replacementDetail2);
  fs.writeFileSync('lib/m3/screens/consent_detail_screen.dart', detailScreen);
  console.log("Patched consent_detail_screen.dart (2)");
} else {
  console.log("Failed to patch consent_detail_screen.dart (2)");
}

