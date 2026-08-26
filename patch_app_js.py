import re

with open('backend/app.js', 'r') as f:
    content = f.read()

pattern = r"""app\.post\(
  \["/api/v3/hip/token/on-generate-token", "/v3/hip/token/on-generate-token"\],
  hipLinkingController\.onGenerateToken
\);"""

replacement = r"""app.post(
  [
    "/api/v3/hip/token/on-generate-token",
    "/v3/hip/token/on-generate-token",
    "/api/v3/link/token/on-generate-token",
    "/v3/link/token/on-generate-token",
    "/api/hiecm/v3/token/on-generate-token",
    "/hiecm/v3/token/on-generate-token",
    "/api/v3/token/on-generate-token",
    "/v3/token/on-generate-token"
  ],
  hipLinkingController.onGenerateToken
);"""

content = re.sub(pattern, replacement, content)

with open('backend/app.js', 'w') as f:
    f.write(content)
