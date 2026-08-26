import re

with open('backend/m2/fhir/M2FolderWatcher.js', 'r') as f:
    content = f.read()

pattern = r"""  // Watch for \.txt files in directories matching the abhaId pattern
  const watchPattern = path\.join\(PROJECT_ROOT, "\*@sbx_\*", "\*\.txt"\);
  
  const watcher = chokidar\.watch\(watchPattern, \{"""

replacement = r"""  // Watch for .txt files in directories matching the abhaId pattern
  // MacOS desktop writes directly to PROJECT_ROOT, Web backend writes to backend/data/
  const watchPatterns = [
    path.join(PROJECT_ROOT, "*@sbx_*", "*.txt"),
    path.join(PROJECT_ROOT, "backend", "data", "*@sbx_*", "*.txt")
  ];
  
  const watcher = chokidar.watch(watchPatterns, {"""

content = re.sub(pattern, replacement, content)

with open('backend/m2/fhir/M2FolderWatcher.js', 'w') as f:
    f.write(content)
