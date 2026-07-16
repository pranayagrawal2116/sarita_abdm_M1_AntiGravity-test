const crypto = require("crypto");

const normalizePem = (value, label) => {
  const body = value
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");

  const lines = body.match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
};

const getEncryptionKey = (rawKey) => {
  const key = String(rawKey || "").trim().replace(/\\n/g, "\n");

  if (!key) {
    throw new Error("ABDM certificate response did not include a public key");
  }

  if (key.includes("BEGIN CERTIFICATE")) {
    const cert = new crypto.X509Certificate(key);
    return cert.publicKey.export({ type: "spki", format: "pem" });
  }

  if (key.includes("BEGIN PUBLIC KEY")) {
    return key;
  }

  if (key.includes("BEGIN RSA PUBLIC KEY")) {
    return key;
  }

  // Some APIs return the certificate/public key body without PEM markers.
  // Try certificate first, then a plain public key.
  try {
    const cert = new crypto.X509Certificate(normalizePem(key, "CERTIFICATE"));
    return cert.publicKey.export({ type: "spki", format: "pem" });
  } catch (_) {
    return normalizePem(key, "PUBLIC KEY");
  }
};

exports.encrypt = (data, publicKey) => {
  const encryptionKey = getEncryptionKey(publicKey);

  return crypto.publicEncrypt(
    {
      key: encryptionKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha1",
    },
    Buffer.from(data)
  ).toString("base64");
};
