const axios = require('axios');
axios.post('http://localhost:3000/api/hip/setup/scan-share/run', {})
  .then(res => console.log(JSON.stringify(res.data, null, 2)))
  .catch(err => console.error(err.response ? JSON.stringify(err.response.data, null, 2) : err.message));
