const builder = require("./m2/fhir/M2FHIRBuilder");
const ids = { abhaAddress: "pranay211_2006@sbx", doctorName: "Dr", facilityCode: "123", facilityName: "Fac", patientName: "Pranay" };
const bundle = builder.buildBundle("Diagnostic Report", ids);
console.log(JSON.stringify(bundle, null, 2));
