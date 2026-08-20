const fs = require('fs');
const path = require('path');
const elliptic = require('elliptic');
const crypto = require('crypto');
const ec = new elliptic.ec("wei25519");

const file = fs.readdirSync('saurav_50505@sbx_Saurav_Kumar/Other_hospital_data/HIP_Data').find(f => f.includes('df132d29-33c5-4345-ae02-372e0e21c78e'));
const data = JSON.parse(fs.readFileSync('saurav_50505@sbx_Saurav_Kumar/Other_hospital_data/HIP_Data/' + file));
const senderPublicKeyBase64 = data.keyMaterial.dhPublicKey.keyValue;

let senderPublicKeyBuffer = Buffer.from(senderPublicKeyBase64, "base64");
console.log("Original senderPublicKeyBuffer length:", senderPublicKeyBuffer.length);

if (senderPublicKeyBuffer.length > 65 && senderPublicKeyBuffer[senderPublicKeyBuffer.length - 65] === 0x04) {
  console.log("Extracting last 65 bytes!");
  senderPublicKeyBuffer = senderPublicKeyBuffer.subarray(-65);
} else if (senderPublicKeyBuffer.length === 93) {
  senderPublicKeyBuffer = senderPublicKeyBuffer.subarray(28);
} else if (senderPublicKeyBuffer.length === 64) {
  senderPublicKeyBuffer = Buffer.concat([Buffer.from([0x04]), senderPublicKeyBuffer]);
}

try {
  const senderKey = ec.keyFromPublic(senderPublicKeyBuffer);
  console.log("SUCCESS! Key format is valid.");
} catch(e) {
  console.log("ERROR parsing key:", e.message);
}
