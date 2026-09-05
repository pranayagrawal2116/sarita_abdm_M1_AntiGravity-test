const fs = require('fs');
const file = 'backend/m2/user_init/controllers/UserInitController.js';
let content = fs.readFileSync(file, 'utf8');

// Part 1: Remove from processDiscovery
const oldDiscoveryCall = `      if (discoveryResult.storageFolderPath) {
        await LocalDataRegistry.persistPatientDocumentIdentity({
          folderPath: discoveryResult.storageFolderPath,
          folderName: discoveryResult.storageFolderName,
          storageClass: discoveryResult.storageClass,
          identity: discoveryResult.identity,
          patientName: patientDetails.name || requestedAbhaAddress,
          abhaAddress: requestedAbhaAddress,
          abhaNumber,
        });
      }`;
      
// Just delete the call
content = content.replace(oldDiscoveryCall, '');

// Part 2: Add to processLinkConfirm
const oldLinkConfirmUpdate = `      // Success
      UserInitState.updateTransaction(txId, { status: "LINK_COMPLETED" });
      await UserInitController.persistUserInitiatedTransferContext(tx, incomingRequestId);
      confirmedCareContexts = tx.selectedCareContexts || [];`;
      
const newLinkConfirmUpdate = `      // Success
      
      // Ownership is persisted ONLY after successful confirmation.
      // This establishes the durable binding between the folder and the ABHA.
      if (tx.sourceStorageClass === 'NON_ABHA_VERIFIED' && tx.sourcePatientFolder) {
        try {
          await LocalDataRegistry.persistPatientDocumentIdentity({
            folderPath: tx.sourcePatientFolder,
            folderName: tx.sourcePatientFolderName,
            storageClass: tx.sourceStorageClass,
            identity: tx.nonAbhaPatientIdentity,
            patientName: tx.patientName,
            abhaAddress: tx.abhaAddress,
            abhaNumber: tx.abhaNumber,
          });
        } catch (error) {
          responsePayload.error = { code: "ABDM-1086", message: error.message };
          try {
            await UserInitController.sendGatewayCallback(
              \`\${process.env.GATEWAY_BASE || 'https://dev.abdm.gov.in'}/api/hiecm/user-initiated-linking/v3/link/care-context/on-confirm\`,
              responsePayload,
              "on-confirm",
              incomingRequestId
            );
          } catch (_) {}
          return;
        }
      }

      UserInitState.updateTransaction(txId, { status: "LINK_COMPLETED" });
      await UserInitController.persistUserInitiatedTransferContext(tx, incomingRequestId);
      confirmedCareContexts = tx.selectedCareContexts || [];`;

if (content.includes(oldLinkConfirmUpdate)) {
  content = content.replace(oldLinkConfirmUpdate, newLinkConfirmUpdate);
  fs.writeFileSync(file, content, 'utf8');
  console.log('UserInitController patched successfully');
} else {
  console.log('Could not find oldLinkConfirmUpdate in UserInitController');
}
