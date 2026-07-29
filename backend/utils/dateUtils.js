const toText = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text.length > 0 ? text : "";
};

const toIsoTimestamp = (value, fallback = new Date().toISOString()) => {
  const text = toText(value);
  if (!text) return fallback;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
};

const nowIso = (date = new Date()) => date.toISOString();

module.exports = {
  toIsoTimestamp,
  nowIso,
};
