/**
 * Header: M2FHIRBuilder.js
 * Purpose: Central coordinator for building and validating ABDM-compliant FHIR R4 document bundles.
 * Responsibility: Register type builders, generate common wrappers (Bundle, Composition, Patient, Encounter),
 *                 and perform comprehensive structural, reference, and profile validation.
 * Methods:
 *   - buildBundle(recordType, businessData)
 *   - validateBundle(bundle)
 *   - serializeBundle(bundle)
 *   - validateReferences(bundle)
 *   - validateProfiles(bundle)
 */

const { v4: uuidv4 } = require("uuid");
const Logger = require("../logging/logger");

const { formatTimestamp } = require("./fhirHelpers");

const OpConsultationBuilder = require("./opConsultationBuilder");
const PrescriptionBuilder = require("./prescriptionBuilder");
const WellnessBuilder = require("./wellnessBuilder");
const ImmunizationBuilder = require("./immunizationBuilder");
const HealthDocumentBuilder = require("./healthDocumentBuilder");
const DischargeSummaryBuilder = require("./dischargeSummaryBuilder");
const DiagnosticReportBuilder = require("./diagnosticReportBuilder");
const InvoiceBuilder = require("./invoiceBuilder");

class M2FHIRBuilder {
  constructor() {
    if (M2FHIRBuilder.instance) {
      return M2FHIRBuilder.instance;
    }

    this.builders = new Map();
    this._registerDefaultBuilders();

    M2FHIRBuilder.instance = this;
  }

  /**
   * Returns the central Singleton instance.
   * @returns {M2FHIRBuilder} Singleton instance.
   */
  static getInstance() {
    if (!M2FHIRBuilder.instance) {
      M2FHIRBuilder.instance = new M2FHIRBuilder();
    }
    return M2FHIRBuilder.instance;
  }

  /**
   * Registers a dynamic record type builder.
   * @param {string} recordType - Category name.
   * @param {Object} builderClass - Builder implementation.
   */
  registerBuilder(recordType, builderClass) {
    Logger.info("M2FHIRBuilder", `Registering builder for recordType: ${recordType}`);
    this.builders.set(recordType, builderClass);
  }

  /**
   * Registers default out-of-the-box builders.
   */
  _registerDefaultBuilders() {
    this.builders.set("OP Consultation", OpConsultationBuilder);
    this.builders.set("Prescription", PrescriptionBuilder);
    this.builders.set("Wellness", WellnessBuilder);
    this.builders.set("Immunization", ImmunizationBuilder);
    this.builders.set("Health Document", HealthDocumentBuilder);
    this.builders.set("Discharge Summary", DischargeSummaryBuilder);
    this.builders.set("Diagnostic Report", DiagnosticReportBuilder);
    this.builders.set("Invoice", InvoiceBuilder);
  }

  /**
   * Formulates a complete compliant FHIR Document Bundle wrapping the record payload.
   * @param {string} recordType - Supported record classification.
   * @param {Object} businessData - Clinical data entries.
   * @returns {Object} Complete FHIR R4 Bundle object.
   */
  buildBundle(recordType, businessData) {
    const startTime = Date.now();
    Logger.info("M2FHIRBuilder", "Generating FHIR R4 bundle.", { recordType });

    try {
      const builder = this.builders.get(recordType);
      if (!builder) {
        throw new Error(`Unsupported record type classification: "${recordType}"`);
      }

      // Basic builder validation on businessData
      const valReport = builder.validate(businessData);
      if (!valReport.isValid) {
        throw new Error(`Validation check failed on business data: ${valReport.reason}`);
      }

      const timestamp = formatTimestamp(businessData.timestamp);

      // 1. Generate unique URN IDs for common outer resources
      const compositionId = uuidv4();
      const patientId = uuidv4();
      const practitionerId = uuidv4();
      const organizationId = uuidv4();
      const encounterId = uuidv4();
      const bundleId = `bundle-${uuidv4()}`;

      const urnIds = {
        patientId: `urn:uuid:${patientId}`,
        practitionerId: `urn:uuid:${practitionerId}`,
        organizationId: `urn:uuid:${organizationId}`,
        encounterId: `urn:uuid:${encounterId}`,
        compositionId: `urn:uuid:${compositionId}`,
        timestamp
      };

      // 2. Build common outer resources
      
      // Patient Resource
      const patientResource = {
        resourceType: "Patient",
        id: patientId,
        meta: {
          versionId: "1",
          lastUpdated: timestamp,
          profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient"]
        },
        identifier: [
          {
            type: {
              coding: [
                {
                  system: "http://terminology.hl7.org/CodeSystem/v2-0203",
                  code: "MR",
                  display: "Medical record number"
                }
              ],
              text: "Medical record number"
            },
            system: "https://healthid.ndhm.gov.in",
            value: businessData.abhaAddress
          }
        ],
        name: [
          {
            text: businessData.patientName
          }
        ],
        telecom: [
          {
            system: "phone",
            value: businessData.mobile || "",
            use: "home"
          }
        ],
        gender: (businessData.gender || "male").toLowerCase(),
        birthDate: businessData.birthDate
      };

      // Practitioner Resource
      const practitionerResource = {
        resourceType: "Practitioner",
        id: practitionerId,
        meta: {
          versionId: "1",
          lastUpdated: timestamp,
          profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Practitioner"]
        },
        identifier: [
          {
            type: {
              coding: [
                {
                  system: "http://terminology.hl7.org/CodeSystem/v2-0203",
                  code: "MD",
                  display: "Medical License number"
                }
              ],
              text: "Medical License number"
            },
            system: "https://doctor.ndhm.gov.in",
            value: businessData.doctorLicense || ""
          }
        ],
        name: [
          {
            text: businessData.doctorName
          }
        ]
      };

      // Organization Resource
      const organizationResource = {
        resourceType: "Organization",
        id: organizationId,
        meta: {
          profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Organization"]
        },
        identifier: [
          {
            type: {
              coding: [
                {
                  system: "http://terminology.hl7.org/CodeSystem/v2-0203",
                  code: "PRN",
                  display: "Provider number"
                }
              ],
              text: "Provider number"
            },
            system: "https://facility.ndhm.gov.in",
            value: businessData.facilityCode
          }
        ],
        name: businessData.facilityName
      };

      // Encounter Resource
      const encounterResource = {
        resourceType: "Encounter",
        id: encounterId,
        meta: {
          profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Encounter"]
        },
        identifier: [
          {
            system: "https://abdm.gov.in/fhir/encounter",
            value: uuidv4()
          }
        ],
        status: businessData.encounterStatus || "arrived",
        class: {
          system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
          code: "AMB",
          display: "Ambulatory-Walkable Outpatient Encounter"
        },
        subject: {
          reference: urnIds.patientId,
          display: businessData.patientName
        },
        period: {
          start: timestamp
        }
      };

      // 3. Invoke specific builder to generate sub-resources and sections
      const builtResult = builder.build(businessData, urnIds);

      // 4. Assemble Composition Resource
      const recordSections = builtResult.sections || [];

      const compositionResource = {
        resourceType: "Composition",
        id: compositionId,
        meta: {
          profile: [builtResult.metadata.compositionProfile]
        },
        status: "final",
        type: builtResult.metadata.compositionType,
        subject: {
          reference: urnIds.patientId,
          display: businessData.patientName
        },
        encounter: {
          reference: urnIds.encounterId,
          display: "Ambulatory"
        },
        date: timestamp,
        author: [
          {
            reference: urnIds.practitionerId,
            display: businessData.doctorName
          }
        ],
        title: builtResult.metadata.compositionTitle,
        custodian: {
          reference: urnIds.organizationId,
          display: businessData.facilityName
        },
        section: recordSections
      };

      // 5. Wrap everything into a Document Bundle
      const entries = [
        { fullUrl: urnIds.compositionId, resource: compositionResource },
        { fullUrl: urnIds.patientId, resource: patientResource },
        { fullUrl: urnIds.practitionerId, resource: practitionerResource },
        { fullUrl: urnIds.organizationId, resource: organizationResource },
        { fullUrl: urnIds.encounterId, resource: encounterResource },
        ...builtResult.entries
      ];

      const bundle = {
        resourceType: "Bundle",
        id: bundleId,
        meta: {
          versionId: "1",
          lastUpdated: timestamp,
          profile: [builtResult.metadata.bundleProfile]
        },
        identifier: {
          system: "https://abdm.gov.in/fhir/r4/document",
          value: uuidv4()
        },
        type: "document",
        timestamp,
        entry: entries
      };

      const duration = Date.now() - startTime;
      Logger.info("M2FHIRBuilder", "FHIR R4 Bundle constructed successfully.", {
        recordType,
        durationMs: duration
      });

      return bundle;
    } catch (err) {
      Logger.error("M2FHIRBuilder", "Failed to build FHIR R4 Bundle.", err);
      throw err;
    }
  }

  /**
   * Asserts structural consistency, profile compliance, references, and composition integrity.
   * @param {Object} bundle - FHIR R4 Bundle object.
   * @returns {Object} Validation report detailing status and issues.
   */
  validateBundle(bundle) {
    Logger.info("M2FHIRBuilder", "Running validation suite on FHIR Bundle.");
    const errors = [];

    if (!bundle || typeof bundle !== "object") {
      return { isValid: false, errors: ["Bundle must be a non-null object."] };
    }

    if (bundle.resourceType !== "Bundle") {
      errors.push("Missing core resourceType: 'Bundle'.");
    }

    if (bundle.type !== "document") {
      errors.push("FHIR Bundle type must be set to 'document'.");
    }

    if (!bundle.entry || !Array.isArray(bundle.entry) || bundle.entry.length === 0) {
      errors.push("Bundle entries list must contain a non-empty array.");
      return { isValid: false, errors };
    }

    const firstEntry = bundle.entry[0]?.resource;
    if (!firstEntry || firstEntry.resourceType !== "Composition") {
      errors.push("The first entry in the bundle must be a 'Composition' resource.");
    }

    // Check mandatory wrapper resources
    const resourceTypes = new Set(bundle.entry.map(e => e.resource?.resourceType));
    const mandatory = ["Patient", "Practitioner", "Organization", "Encounter"];
    for (const type of mandatory) {
      if (!resourceTypes.has(type)) {
        errors.push(`Missing mandatory wrapper resource: '${type}'.`);
      }
    }

    // Run sub-validators
    const refErrors = this.validateReferences(bundle);
    errors.push(...refErrors);

    const profErrors = this.validateProfiles(bundle);
    errors.push(...profErrors);

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Verifies that all references resolve internally to a fullUrl entry in the bundle.
   * @param {Object} bundle - FHIR R4 Bundle object.
   * @returns {Array<string>} List of validation errors.
   */
  validateReferences(bundle) {
    const errors = [];
    const fullUrls = new Set(bundle.entry.map(e => e.fullUrl).filter(Boolean));

    const checkReferencesRecursive = (obj, path = "root") => {
      if (!obj || typeof obj !== "object") return;

      if (obj.reference && typeof obj.reference === "string") {
        if (obj.reference.startsWith("urn:uuid:")) {
          if (!fullUrls.has(obj.reference)) {
            errors.push(`Broken reference target at path '${path}': '${obj.reference}' could not be resolved.`);
          }
        }
      }

      for (const key of Object.keys(obj)) {
        checkReferencesRecursive(obj[key], `${path}.${key}`);
      }
    };

    for (let i = 0; i < bundle.entry.length; i++) {
      checkReferencesRecursive(bundle.entry[i].resource, `entry[${i}].resource`);
    }

    return errors;
  }

  /**
   * Assures that required profile URLs are present in meta fields.
   * @param {Object} bundle - FHIR R4 Bundle object.
   * @returns {Array<string>} List of validation errors.
   */
  validateProfiles(bundle) {
    const errors = [];

    if (!bundle.meta?.profile || bundle.meta.profile.length === 0) {
      errors.push("Bundle is missing meta.profile configuration.");
    }

    for (let i = 0; i < bundle.entry.length; i++) {
      const res = bundle.entry[i].resource;
      if (res && res.meta) {
        if (!res.meta.profile || res.meta.profile.length === 0) {
          errors.push(`Resource of type '${res.resourceType}' at index ${i} is missing meta.profile.`);
        }
      }
    }

    return errors;
  }

  /**
   * Deep clones and formats the bundle object.
   * @param {Object} bundle - Bundle object.
   * @returns {Object} JSON-ready bundle.
   */
  serializeBundle(bundle) {
    try {
      return JSON.parse(JSON.stringify(bundle));
    } catch (err) {
      Logger.error("M2FHIRBuilder", "Failed to serialize Bundle.", err);
      throw new Error("Serialization failure: " + err.message);
    }
  }

  // --- Static wrappers to preserve class-level calls for backward compatibility ---

  static buildBundle(recordType, businessData) {
    return this.getInstance().buildBundle(recordType, businessData);
  }

  static validateBundle(bundle) {
    return this.getInstance().validateBundle(bundle);
  }

  static serializeBundle(bundle) {
    return this.getInstance().serializeBundle(bundle);
  }

  static validateReferences(bundle) {
    return this.getInstance().validateReferences(bundle);
  }

  static validateProfiles(bundle) {
    return this.getInstance().validateProfiles(bundle);
  }
}

module.exports = M2FHIRBuilder.getInstance();
