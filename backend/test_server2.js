const express = require('express');
const app = express();
app.use(express.json());
app.post('/test', async (req, res) => {
  try {
    throw { response: { data: { get a() { return this; } } } }; // Circular ref
  } catch (error) {
    let details = error.message;
    if (error.response && error.response.data) {
      details = JSON.stringify(error.response.data); // This will crash!
    }
    res.status(500).json({ success: false, error: "Failed", details: details });
  }
});
app.listen(3002, () => console.log('Listening on 3002'));
