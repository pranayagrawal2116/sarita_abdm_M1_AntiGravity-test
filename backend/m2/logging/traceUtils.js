const maskValue = (value) => {
  const text = String(value ?? "");
  if (!text) return "";
  if (text.length <= 8) return "***";
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
};

const SENSITIVE_KEY_PATTERN = /(secret|token|authorization|password|cookie|key)/i;

const maskStructured = (value) => {
  if (Array.isArray(value)) {
    return value.map(maskStructured);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? maskValue(child) : maskStructured(child)
      ])
    );
  }

  return value;
};

const configurationSnapshot = (config) => ({
  gatewayBaseUrl: config.gatewayBaseUrl,
  gatewaySessionPath: config.gatewaySessionPath,
  clientIdPresent: Boolean(config.clientId),
  clientSecretPresent: Boolean(config.clientSecret),
  clientId: maskValue(config.clientId),
  clientSecret: maskValue(config.clientSecret),
  xCmIdPresent: Boolean(config.xCmId),
  xCmId: maskValue(config.xCmId)
});

const errorTrace = (err) => ({
  message: err?.message,
  stack: err?.stack,
  code: err?.code,
  status: err?.response?.status,
  statusText: err?.response?.statusText,
  responseBody: maskStructured(err?.response?.data),
  responseHeaders: maskStructured(err?.response?.headers)
});

module.exports = {
  maskValue,
  maskStructured,
  configurationSnapshot,
  errorTrace
};
