const elliptic = require("elliptic");
require("./backend/services/fhirEncryptionService");
const ec = new elliptic.ec("wei25519");
const keyPair = ec.genKeyPair();
console.log("Success");
