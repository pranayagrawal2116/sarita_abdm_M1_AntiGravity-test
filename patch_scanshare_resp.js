const fs = require('fs');
let content = fs.readFileSync('backend/controllers/scanShareController.js', 'utf8');

content = content.replace(
  /resp: \{ requestId \}/g,
  `response: { requestId }, resp: { requestId }`
);

content = content.replace(
  /console\.error\("\[ScanShare\] Failed to send on-share acknowledgement", e\.response \? e\.response\.data : e\.message\);/g,
  `console.error("[ScanShare] Failed to send on-share acknowledgement", error.response ? error.response.data : error.message);`
);

// I must also fix the catch block. wait, is it catch (e) or catch (error)?
// Let's replace the whole try-catch
content = content.replace(
  /\} catch \(e\) \{/g,
  `} catch (error) {`
);

fs.writeFileSync('backend/controllers/scanShareController.js', content);
console.log("Patched response and error handling");
