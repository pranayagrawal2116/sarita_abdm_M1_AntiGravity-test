const express = require('express');
const app = express();
app.use(express.json());
app.post('/api/m3/consent/data/request', async (req, res) => {
  try {
    const M3ConsentService = require('./backend/m3/services/m3ConsentService');
    const { consentId, patientId, dateFrom, dateTo, dataEraseAt } = req.body;
    const result = await M3ConsentService.requestHealthInformation(consentId, patientId, dateFrom, dateTo, dataEraseAt);
    res.status(202).json({ success: true, transactionId: result.transactionId });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.listen(3002, () => console.log('Listening on 3002'));
