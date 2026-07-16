const axios = require("axios");
const { getGatewayToken } = require("../services/gatewayService");
const { getHeaders } = require("../utils/headers");

const toText = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text.length > 0 ? text : "";
};

const getByPath = (source, path) => {
  let current = source;
  for (const key of path) {
    if (Array.isArray(current) && typeof key === "number") {
      current = current[key];
      continue;
    }

    if (current && typeof current === "object" && key in current) {
      current = current[key];
      continue;
    }

    return undefined;
  }
  return current;
};

const findFirstString = (source, paths) => {
  for (const path of paths) {
    const text = toText(getByPath(source, path));
    if (text) return text;
  }
  return "";
};

const getErrorPayload = (err) => {
  const status = err.response?.status || 500;
  const data = err.response?.data;

  if (typeof data === "string") {
    return { status, body: { error: data } };
  }

  if (data && typeof data === "object") {
    return { status, body: data };
  }

  return {
    status,
    body: { error: err.message || "Unknown ABDM facility API error" },
  };
};

const normalizeProviderList = (data) => {
  const source =
    data?.providers ||
    data?.facilities ||
    data?.facility ||
    data?.data ||
    data?.results ||
    data;
  const list = Array.isArray(source) ? source : [];

  return list.map((item) => ({
    id: findFirstString(item, [["identifier", "id"], ["id"], ["hipId"]]),
    hipId: findFirstString(item, [
      ["identifier", "id"],
      ["hipId"],
      ["id"],
      ["facilityId"],
    ]),
    name:
      findFirstString(item, [["name"], ["facilityName"], ["display"]]) ||
      "Unnamed facility",
    facilityType: findFirstString(item, [["facilityType"], ["type"]]),
    city: findFirstString(item, [["city"], ["address", "city"]]),
    district: findFirstString(item, [["district"], ["address", "district"]]),
    state: findFirstString(item, [["state"], ["address", "state"]]),
    raw: item,
  }));
};

exports.searchProviders = async (req, res) => {
  try {
    const name = toText(req.query?.name);

    if (!name) {
      return res.status(400).json({ error: "Facility name is required" });
    }

    const gatewayToken = await getGatewayToken();
    const headers = getHeaders(gatewayToken);
    const response = await axios.get(
      `${process.env.GATEWAY_BASE}/api/hiecm/gateway/v3/providers`,
      {
        headers,
        params: {
          stateCode: req.query?.stateCode || -1,
          districtCode: req.query?.districtCode || -1,
          name,
        },
      }
    );

    return res.json({
      providers: normalizeProviderList(response.data),
    });
  } catch (err) {
    const { status, body } = getErrorPayload(err);
    res.status(status).json(body);
  }
};

exports.getProviderById = async (req, res) => {
  try {
    const providerId = toText(req.params?.providerId);

    if (!providerId) {
      return res.status(400).json({ error: "Provider ID is required" });
    }

    const gatewayToken = await getGatewayToken();
    const headers = getHeaders(gatewayToken);
    const response = await axios.get(
      `${process.env.GATEWAY_BASE}/api/hiecm/gateway/v3/providers/${encodeURIComponent(providerId)}`,
      { headers }
    );

    const providers = normalizeProviderList([response.data]);
    return res.json({
      provider: providers[0] || null,
    });
  } catch (err) {
    const { status, body } = getErrorPayload(err);
    res.status(status).json(body);
  }
};
