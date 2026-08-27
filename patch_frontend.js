const fs = require('fs');
let code = fs.readFileSync('lib/m3/screens/consent_detail_screen.dart', 'utf8');

const filterLogicOld = `      if (artDetails != null && artDetails['hiTypes'] != null) {
        final List<dynamic> hiTypes = artDetails['hiTypes'];
        return hiTypes.any((t) => t.toString() == _selectedHiTypeFilter);
      }
      return false;`;

const filterLogicNew = `      final hasData = artDetails != null && artDetails['hasData'] == true;
      if (!hasData) return false;
      
      if (_selectedHiTypeFilter == null) return true;

      if (artDetails != null && artDetails['hiTypes'] != null) {
        final List<dynamic> hiTypes = artDetails['hiTypes'];
        return hiTypes.any((t) => t.toString() == _selectedHiTypeFilter);
      }
      return false;`;

// I also need to remove the initial `if (_selectedHiTypeFilter == null) return true;` so it doesn't bypass my `hasData` check!
code = code.replace(`if (_selectedHiTypeFilter == null) return true;`, ``);
code = code.replace(filterLogicOld, filterLogicNew);

fs.writeFileSync('lib/m3/screens/consent_detail_screen.dart', code);
console.log("Patched frontend filter logic");
