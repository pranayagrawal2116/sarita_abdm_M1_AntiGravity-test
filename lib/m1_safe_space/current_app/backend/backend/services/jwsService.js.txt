const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const toText = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text.length > 0 ? text : "";
};

const base64UrlEncode = (value) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const normalizePem = (value) => {
  const raw = toText(value).replace(/\\n/g, "\n");
  if (!raw) return "";

  if (raw.includes("BEGIN PRIVATE KEY") || raw.includes("BEGIN RSA PRIVATE KEY")) {
    return raw;
  }

  const body = raw
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (!body) return "";

  const lines = body.match(/.{1,64}/g) || [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
};

const resolvePrivateKeyPath = () => {
  const configuredPath =
    toText(process.env.ABDM_HIU_PRIVATE_KEY_PATH) ||
    toText(process.env.HIU_PRIVATE_KEY_PATH) ||
    toText(process.env.ABDM_PRIVATE_KEY_PATH);

  if (!configuredPath) return "";
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
};

const getPrivateKey = () => {
  const keyFromEnv =
    toText(process.env.ABDM_HIU_PRIVATE_KEY) ||
    toText(process.env.HIU_PRIVATE_KEY) ||
    toText(process.env.ABDM_PRIVATE_KEY);

  if (keyFromEnv) {
    const normalized = normalizePem(keyFromEnv);
    if (normalized) return normalized;
  }

  const keyPath = resolvePrivateKeyPath();
  if (keyPath && fs.existsSync(keyPath)) {
    const keyFromFile = fs.readFileSync(keyPath, "utf8");
    const normalized = normalizePem(keyFromFile);
    if (normalized) return normalized;
  }

  throw new Error(
    "HIU private key is not configured. Set ABDM_HIU_PRIVATE_KEY or ABDM_HIU_PRIVATE_KEY_PATH."
  );
};

exports.signPayloadAsJws = (payload, options = {}) => {
  const keyId = toText(options.keyId);
  const privateKey = getPrivateKey();

  const header = {
    alg: "RS256",
    typ: "JWT",
    ...(keyId ? { kid: keyId } : {}),
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload || {}));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign(privateKey);
  const encodedSignature = base64UrlEncode(signature);

  return `${unsignedToken}.${encodedSignature}`;
};
