import re

with open('backend/m2/helpers/axiosClient.js', 'r') as f:
    content = f.read()

# Remove the top-level require
content = content.replace('const M2TokenManager = require("../tokens/M2TokenManager");\n', '')

# Insert it inside the async function
pattern = r"""      console\.log\("\[ABDM axiosClient\] 401 Unauthorized encountered\. Forcing token refresh and retrying\.\.\."\);"""

replacement = r"""      console.log("[ABDM axiosClient] 401 Unauthorized encountered. Forcing token refresh and retrying...");
      
      const M2TokenManager = require("../tokens/M2TokenManager");"""

content = re.sub(pattern, replacement, content)

with open('backend/m2/helpers/axiosClient.js', 'w') as f:
    f.write(content)
