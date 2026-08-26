import re

with open('backend/m2/controllers/m2ConsentController.js', 'r') as f:
    content = f.read()

pattern = r"""  const response = await axios\.post\(
    `\$\{process\.env\.GATEWAY_BASE\}/api/hiecm/data-flow/v3/health-information/request`,
    payload,
    \{ headers \}
  \);"""

replacement = r"""  let response;
  try {
    response = await axios.post(
      `${process.env.GATEWAY_BASE}/api/hiecm/data-flow/v3/health-information/request`,
      payload,
      { headers }
    );
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log("[ABDM] 401 Unauthorized encountered. Forcing token refresh and retrying...");
      M2TokenManager.invalidate();
      
      const newToken = await M2TokenManager.getGatewayToken();
      const retryHeaders = {
        ...headers,
        Authorization: `Bearer ${newToken}`,
      };
      
      response = await axios.post(
        `${process.env.GATEWAY_BASE}/api/hiecm/data-flow/v3/health-information/request`,
        payload,
        { headers: retryHeaders }
      );
    } else {
      throw error;
    }
  }"""

content = re.sub(pattern, replacement, content)

with open('backend/m2/controllers/m2ConsentController.js', 'w') as f:
    f.write(content)
