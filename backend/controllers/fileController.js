const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, "../../");

exports.writeFile = (req, res) => {
  try {
    const { filePath, content } = req.body;
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: "filePath and content are required" });
    }

    // filePath expected as: "FolderName/FileName.txt"
    const parts = filePath.split('/');
    const folderName = parts.length > 1 ? parts[0] : '';
    const fileName = parts[parts.length - 1];

    let targetFolder = PROJECT_ROOT;
    if (folderName) {
      targetFolder = path.join(PROJECT_ROOT, path.basename(folderName));
      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }
    }

    const fullPath = path.join(targetFolder, path.basename(fileName));
    fs.writeFileSync(fullPath, content, 'utf8');

    return res.json({ success: true, path: fullPath });
  } catch (error) {
    console.error("Error writing file:", error);
    return res.status(500).json({ error: "Failed to write file" });
  }
};

exports.readFile = (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: "filePath is required" });
    }

    const parts = filePath.split('/');
    const folderName = parts.length > 1 ? parts[0] : '';
    const fileName = parts[parts.length - 1];

    let targetFolder = PROJECT_ROOT;
    if (folderName) {
      targetFolder = path.join(PROJECT_ROOT, path.basename(folderName));
    }

    const fullPath = path.join(targetFolder, path.basename(fileName));

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    return res.json({ success: true, content });
  } catch (error) {
    console.error("Error reading file:", error);
    return res.status(500).json({ error: "Failed to read file" });
  }
};
