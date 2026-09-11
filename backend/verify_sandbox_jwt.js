const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

const token = "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJBbFJiNVdDbThUbTlFSl9JZk85ejA2ajlvQ3Y1MXBLS0ZrbkdiX1RCdkswIn0.eyJleHAiOjE3ODg4MzcwNTMsImlhdCI6MTc4ODgzNTg1MywianRpIjoiMzRhYjYzOWYtYjVmNC00NDhhLWI4ZTYtZjNjOGIzMDAwMDJiIiwiaXNzIjoiaHR0cHM6Ly9kZXYuYWJkbS5nb3YuaW4vYXV0aC9yZWFsbXMvY2VudHJhbC1yZWdpc3RyeSIsInN1YiI6IjEwMzhkMjM3LTZkOGMtNGQzNS04YTcyLWJkMDhlNjkzYjg5NiIsInR5cCI6IkJlYXJlciIsImF6cCI6IlNCWElEXzAxMDA4NiIsInNlc3Npb25fc3RhdGUiOiI5NjcxNWIzNS0zYjliLTQ3MjctODcyYy01ZWNhYWUzYjcxOGQiLCJhY3IiOiIxIiwiYWxsb3dlZC1vcmlnaW5zIjpbImh0dHA6Ly9sb2NhbGhvc3Q6OTAwNyJdLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsiSElVX1BBWUVSIiwiRElHSV9ET0NUT1IiLCJoZWFsdGhJZCIsImhlYWx0aF9sb2NrZXIiLCJoaXAiLCJISVBfUEFZRVIiLCJoZnIiLCJoaXUiLCJvZmZsaW5lX2FjY2VzcyIsInBociIsIk9JREMiLCJIaWRBYmhhU2VhcmNoIiwiaHBfaWQiXX0sInJlc291cmNlX2FjY2VzcyI6eyJTQlhJRF8wMTAwODYiOnsicm9sZXMiOlsidW1hX3Byb3RlY3Rpb24iXX19LCJzY29wZSI6Im9wZW5pZCBlbWFpbCBwcm9maWxlIiwiY2xpZW50SG9zdCI6IjEwLjIwMS44OS4yMTYiLCJlbWFpbF92ZXJpZmllZCI6ZmFsc2UsImNsaWVudElkIjoiU0JYSURfMDEwMDg2IiwicHJlZmVycmVkX3VzZXJuYW1lIjoic2VydmljZS1hY2NvdW50LXNieGlkXzAxMDA4NiIsImNsaWVudEFkZHJlc3MiOiIxMC4yMDEuODkuMjE2In0.RKCYzNmeSHW6KJqXLuKf0Yxoppv6gTU4mGOnGYtgOj2V9VEhyQXfSJzcUixUyrqImKFHaUhkQyC3PMHvrLNE7U-7obzxxRV9GUedJXy6HrjjBBpicRJMrGW01dCIeC8yfciXZB0SG6jeeC2si307Bp1x8ZCcuU0jWgIHavHVzMGRBGvFx56MMzKO75tWFA3ZohehjaAX1YMcMr0MP3dKnatscWPXG-ugfld9-i-p9DBaFOCbhGjkOPxF20gZgciZnUWrOHZtwkse_odvLy-NvCkmHbxZokZB2-5AJLuKSsaTLhJePXVaOiiTcAc0ezzWP8uoOvr7s7Gb6pygeH1x5g";

const client = jwksClient({
  jwksUri: "https://dev.abdm.gov.in/gateway/v0.5/certs"
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, function(err, key) {
    if (err) return callback(err);
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

jwt.verify(token, getKey, { algorithms: ["RS256"], ignoreExpiration: true }, function(err, decoded) {
  if (err) {
    console.error("Signature Validation Failed:", err.message);
  } else {
    console.log("Signature Validated Successfully!");
    console.log("Decoded:", decoded);
  }
});
