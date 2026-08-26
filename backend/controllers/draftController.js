const fs = require('fs');
const path = require('path');

exports.saveDraft = (req, res) => {
  try {
    const { fileName, content } = req.body;
    if (!fileName || !content) {
      return res.status(400).json({ error: "fileName and content are required" });
    }

    // Ensure the data/drafts directory exists
    const draftsDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(draftsDir)) {
      fs.mkdirSync(draftsDir, { recursive: true });
    }

    const safeName = path.basename(fileName);
    const filePath = path.join(draftsDir, safeName);

    fs.writeFileSync(filePath, content, 'utf8');

    return res.json({ 
      success: true, 
      message: "Draft saved successfully",
      path: filePath
    });
  } catch (error) {
    console.error("Error saving draft:", error);
    return res.status(500).json({ error: "Failed to save draft" });
  }
};
