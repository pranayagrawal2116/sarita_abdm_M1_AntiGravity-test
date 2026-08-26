const express = require("express");
const router = express.Router();
const storageService = require("../storage/PatientStorageService");

router.post("/write", (req, res) => {
  try {
    const { abhaId, patientName, hiType, fileName, content } = req.body;
    
    if (!abhaId || !fileName || content === undefined) {
      return res.status(400).json({ error: "abhaId, fileName, and content are required" });
    }

    const savedPath = storageService.savePatientFile(abhaId, patientName, fileName, content);
    
    return res.json({ 
      success: true, 
      message: "File saved successfully",
      path: savedPath 
    });
  } catch (error) {
    console.error("Error saving patient file:", error);
    return res.status(500).json({ error: "Failed to save file: " + error.message });
  }
});

router.post("/read", (req, res) => {
  try {
    const { abhaId, patientName, fileName } = req.body;
    
    if (!abhaId || !fileName) {
      return res.status(400).json({ error: "abhaId and fileName are required" });
    }

    const content = storageService.readPatientFile(abhaId, patientName, fileName);
    if (content === null) {
      return res.status(404).json({ error: "File not found" });
    }
    
    return res.json({ success: true, content });
  } catch (error) {
    console.error("Error reading patient file:", error);
    return res.status(500).json({ error: "Failed to read file: " + error.message });
  }
});

module.exports = router;
