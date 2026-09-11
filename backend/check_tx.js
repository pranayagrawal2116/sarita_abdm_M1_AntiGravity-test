const fs = require('fs');
try {
  const data = JSON.parse(fs.readFileSync('m2_transactions.json', 'utf8'));
  console.log("Transaction:", JSON.stringify(data['9dc8fd77-e34c-4432-ad04-0a3893af6725'], null, 2));
} catch(e) {
  console.log("Error:", e.message);
}
