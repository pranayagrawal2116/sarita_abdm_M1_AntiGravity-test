const { v4: uuidv4 } = require("uuid");
const { nowIso } = require("./dateUtils");

exports.getHeaders = (token = null) => {
    return {
        "Content-Type": "application/json",
        "REQUEST-ID": uuidv4(),
        "TIMESTAMP": nowIso(),
        "X-CM-ID": process.env.X_CM_ID,
        ...(token && { Authorization: `Bearer ${token}` }),
    };
};