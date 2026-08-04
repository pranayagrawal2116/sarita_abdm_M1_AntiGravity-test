const M2FHIRBuilder = require('./backend/m2/fhir/M2FHIRBuilder');
const { generateWellnessRecordBundle } = require('./backend/m2/fhir/M2FHIRBundleBuilder');

const params = {
  patientData: {
    referenceNumber: "12345",
    display: "Test Patient"
  },
  records: [
    {
      display: "Diet",
      value: "Vegetarian"
    }
  ]
};

async function test() {
  try {
    const result = M2FHIRBuilder.buildBundle("Wellness", params);
    const validation = M2FHIRBuilder.validateBundle(result);
    console.log("Builder validation:", validation);
    
    // Also test M2FHIRBundleBuilder
    const file = {
      hiType: "WellnessRecord",
      content: "Diet: Vegetarian\nSmoking: Never smoked"
    };
    const context = {
      abhaId: "test@sbx",
      folderName: "Wellness-Record-123",
      file,
      canonicalHiType: "WellnessRecord"
    };
    
    // The generator needs some dependencies, might fail, let's just see
    // const bundleResult = await generateWellnessRecordBundle(context);
    // console.log("M2FHIRBundleBuilder validation:", M2FHIRBuilder.validateBundle(bundleResult));
  } catch (error) {
    console.error("Error:", error);
  }
}

test();
