const fs = require('fs');
let content = fs.readFileSync('backend/controllers/linkingController.js', 'utf8');

// revert the global replacement
content = content.replace(/\(findFirstString\(item, \[/g, "findFirstString(item, [");

// only modify the specific lines for name
content = content.replace(
/name:\s*findFirstString\(item, \[\s*\["identifier", "name"\],\s*\["name"\],\s*\["display"\],\s*\]\) \|\| hipId\)\.substring\(0, 44\),/gm,
`name: (findFirstString(item, [
                        ["identifier", "name"],
                        ["name"],
                        ["display"],
                    ]) || hipId).substring(0, 44),`
);

fs.writeFileSync('backend/controllers/linkingController.js', content);
