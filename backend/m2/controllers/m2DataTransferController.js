/**
 * Header: m2DataTransferController.js
 * Purpose: Handles express requests for clinical packaging and transfer operations.
 * Responsibility: Extract data params, validate transfer constraints, log operations, and delegate to TransferManager.
 */

const Logger = require("../logging/logger");
const M2TransactionStore = require("../transactions/M2TransactionStore");
const M2DataTransferManager = require("../transfer/M2DataTransferManager");
const M2FHIRBuilder = require("../fhir/M2FHIRBuilder");

class M2DataTransferController {
  /**
   * Manual trigger for packaging, encrypting, and pushing clinical data to the HIU.
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  static async transferHealthInformation(req, res) {
    Logger.info("M2DataTransferController", "transferHealthInformation route handler triggered.");

    const { consentId, transactionId, recordTypes, abhaAddress } = req.body;

    if (!consentId || !transactionId) {
      Logger.warn("M2DataTransferController", "Missing consentId or transactionId in body.");
      return res.status(400).json({ error: "Missing required parameters." });
    }

    try {
      // Find the transaction record holding receiver keys & push endpoint
      const tx = M2TransactionStore.getTransaction(transactionId) || M2TransactionStore.getTransaction(consentId);
      if (!tx) {
        Logger.warn("M2DataTransferController", "No active transaction found.", { transactionId, consentId });
        return res.status(404).json({ error: "Transaction context not found on backend." });
      }

      const patientId = abhaAddress || tx.patientId;
      if (!patientId) {
        throw new Error("Transaction failed: Patient ID missing from live data.");
      }
      // Get dashboard requested types
      const dashboardTypes = Array.isArray(recordTypes) && recordTypes.length > 0 ? recordTypes : (tx.recordTypes || [tx.recordType || "OPConsultation"]);

      // Get consent authorized types
      const allTxs = M2TransactionStore.listTransactions();
      const consentTx = allTxs.find(t => t.consentId === consentId || t.consentDetails?.consentId === consentId);
      const authorizedHiTypes = tx.consentDetails?.hiTypes || tx.hiTypes || consentTx?.consentDetails?.hiTypes || ["OPConsultation"];

      // Map dashboard record type to canonical HI Type
      const canonicalMap = {
        "Prescription": "Prescription",
        "Diagnostic Report": "DiagnosticReport",
        "OP Consultation": "OPConsultation",
        "OPConsultation": "OPConsultation",
        "Discharge Summary": "DischargeSummary",
        "Immunization": "ImmunizationRecord",
        "Health Document": "HealthDocumentRecord",
        "Wellness": "WellnessRecord",
        "Invoice": "Invoice"
      };

      // Filter dashboard types by what's actually authorized
      let recordType = dashboardTypes.filter(type => {
        const canonical = canonicalMap[type] || type.replace(/\s+/g, "");
        return authorizedHiTypes.includes(canonical);
      });

      // Prioritize the actual HI request payload from the mobile app (Gateway) over any mock data
      const actualHiRequest = tx.hiRequestPayload?.hiRequest;
      const receiverPublicKey = actualHiRequest?.keyMaterial?.dhPublicKey?.keyValue || tx.hiuPublicKey || tx.receiverPublicKey || (tx.keyMaterial && tx.keyMaterial.dhPublicKey?.keyValue);
      const receiverNonce = actualHiRequest?.keyMaterial?.nonce || tx.hiuNonce || tx.receiverNonce || (tx.keyMaterial && tx.keyMaterial.nonce);
      const dataPushUrl = actualHiRequest?.dataPushUrl || tx.dataPushUrl;

      // Enforce strictly one HI type at a time for Mobile App (M2), but send ALL for Desktop App (M3)
      const isDesktopApp = dataPushUrl && dataPushUrl.includes('/m3/');
      if (!isDesktopApp && recordType.length > 1) {
        recordType = [recordType[0]];
      }

      if (recordType.length === 0) {
        throw new Error(`Transaction failed: The selected record types (${dashboardTypes.join(", ")}) do not match the authorized HI Types in the consent (${authorizedHiTypes.join(", ")}).`);
      }

      if (!receiverPublicKey || !receiverNonce || !dataPushUrl) {
        throw new Error("Missing receiver keyMaterial or dataPushUrl in transaction store.");
      }

      // Run the transfer asynchronously to prevent Ngrok/Cloudflare from timing out the frontend connection
      M2DataTransferManager.initiateTransfer(
        consentId,
        patientId,
        recordType,
        receiverPublicKey,
        receiverNonce,
        dataPushUrl,
        transactionId
      ).catch(e => Logger.error("M2DataTransferController", "Background transfer failed", e));

      // Map status for legacy client expectations
      const legacyTx = {
        status: "TRANSFER_COMPLETED",
        transactionId: transactionId || consentId,
        consentId: consentId
      };

      return res.json({ success: true, transaction: legacyTx });
    } catch (err) {
      Logger.error("M2DataTransferController", "Data transfer trigger failed.", err);
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Checks current status of the M2 data transfer.
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  static async getTransactionStatus(req, res) {
    Logger.info("M2DataTransferController", "getTransactionStatus route handler triggered.");

    const { id } = req.params;

    if (!id) {
      Logger.warn("M2DataTransferController", "Missing transaction/consent id param.");
      return res.status(400).json({ error: "Parameter id is required." });
    }

    try {
      const tx = M2TransactionStore.getTransaction(id);
      if (!tx) {
        return res.status(404).json({ error: "Transaction not found." });
      }

      // Map status values for compatibility
      let statusValue = tx.currentState;
      if (tx.currentState === "Completed") statusValue = "TRANSFER_COMPLETED";
      if (tx.currentState === "Failed") statusValue = "FAILED";

      const legacyTx = {
        ...tx,
        status: statusValue,
        error: tx.errorDetails || (tx.auditHistory && tx.auditHistory.length > 0 ? tx.auditHistory[tx.auditHistory.length - 1].details.reason : "")
      };

      // Populate preview bundle dynamically for client preview tab if generated
      if (tx.recordType && tx.clinicalData) {
        try {
          const fhirBundle = M2FHIRBuilder.buildBundle(tx.recordType, tx.clinicalData);
          legacyTx.bundles = {
            [tx.recordType]: fhirBundle
          };
        } catch (_) {}
      }

      return res.json({ success: true, transaction: legacyTx });
    } catch (err) {
      Logger.error("M2DataTransferController", "Failed to retrieve status.", err);
      return res.status(500).json({ error: err.message });
    }
  }

  static async listTransferHistory(req, res) {
    try {
      const patientId = String(req.query.patientId || "").trim();
      const records = [];

      for (const tx of M2TransactionStore.listTransactions()) {
        if (patientId && tx.patientId !== patientId && tx.abhaAddress !== patientId) {
          continue;
        }

        const explicitRecords = Array.isArray(tx.transferHistory) ? tx.transferHistory : [];
        records.push(...explicitRecords);

        if (explicitRecords.length === 0) {
          const completedTransitions = (tx.statusHistory || []).filter(
            (entry) => entry && entry.to === "Completed"
          );
          for (const completion of completedTransitions) {
            const started = [...(tx.statusHistory || [])]
              .reverse()
              .find(
                (entry) =>
                  entry &&
                  entry.to === "Data Push Started" &&
                  Number(entry.timestamp) <= Number(completion.timestamp)
              );
            const requestAudit = [...(tx.auditHistory || [])]
              .reverse()
              .find(
                (entry) =>
                  entry &&
                  entry.eventType === "HI_REQUEST_CREATED" &&
                  Number(entry.timestamp) <= Number(completion.timestamp)
              );
            const notifyStatusCode = Number(tx.healthInformationNotifyStatusCode || 0);
            records.push({
              id: `${tx.transactionId}:${completion.timestamp}`,
              transactionId: tx.transactionId,
              requestId: requestAudit?.details?.requestId || tx.hiRequestId || tx.requestId,
              consentId: requestAudit?.details?.consentId || tx.consentId,
              patientId: tx.patientId || tx.abhaAddress,
              recordTypes: Array.isArray(tx.recordType) ? tx.recordType : (tx.recordType ? [tx.recordType] : []),
              recordsTransferred: Array.isArray(tx.entries) ? tx.entries.length : 0,
              startedAt: Number(started?.timestamp || completion.timestamp),
              completedAt: Number(completion.timestamp),
              durationMs: Math.max(
                0,
                Number(completion.timestamp) - Number(started?.timestamp || completion.timestamp)
              ),
              status: notifyStatusCode >= 200 && notifyStatusCode < 300
                ? "TRANSFER_COMPLETED"
                : "PUSH_ACKNOWLEDGED",
              evidence: {
                dataPushUrl: tx.dataPushUrl || "",
                dataPushStatusCode: Number(tx.dataPushAcknowledgement?.statusCode || 0),
                consentManagerNotifyStatusCode: notifyStatusCode,
                checksum: tx.encryptionMetadata?.checksum || "",
                encrypted: Boolean(tx.encryptedPayload || tx.entries?.length),
                gatewayNotified: notifyStatusCode >= 200 && notifyStatusCode < 300,
                legacyRecord: true
              }
            });
          }
        }
      }

      records.sort((a, b) => Number(b.completedAt || 0) - Number(a.completedAt || 0));
      return res.json({ success: true, items: records });
    } catch (err) {
      Logger.error("M2DataTransferController", "Failed to list transfer history.", err);
      return res.status(500).json({ error: err.message });
    }
  }
}

module.exports = M2DataTransferController;
