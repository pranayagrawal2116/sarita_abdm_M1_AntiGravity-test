const { v4: uuidv4 } = require("uuid");
const { nowIso } = require("./dateUtils");

exports.getHeaders = (token = null, customRequestId = null, customTimestamp = null) => {
    return {
        "Content-Type": "application/json",
        "REQUEST-ID": customRequestId || uuidv4(),
        "TIMESTAMP": customTimestamp || nowIso(),
        "X-CM-ID": process.env.X_CM_ID,
        ...(token && { Authorization: `Bearer ${token}` }),
    };
};