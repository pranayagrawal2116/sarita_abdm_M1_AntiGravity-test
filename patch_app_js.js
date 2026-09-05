const fs = require('fs');
const file = 'backend/app.js';
let content = fs.readFileSync(file, 'utf8');

// Replace inbound body logging
content = content.replace(
  /body: req\.body,/,
  'body: "<omitted for security>"'
);

// Replace outbound request data logging
content = content.replace(
  /data: config\.data,/,
  'data: "<omitted for security>"'
);

// Replace outbound response data logging
content = content.replace(
  /data: response\.data,/,
  'data: "<omitted for security>"'
);

// Replace outbound error data logging
content = content.replace(
  /data: error\.response\?\.data \|\| error\.message,/,
  'data: error.response ? "<omitted for security>" : error.message,'
);

// Replace inbound response body logging
content = content.replace(
  /body: body\.length > 2000 \? `<body \${body\.length} bytes>` : body,/,
  'body: "<omitted for security>"'
);

fs.writeFileSync(file, content, 'utf8');
console.log('backend/app.js sanitized');
