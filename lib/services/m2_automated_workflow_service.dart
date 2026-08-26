import 'dart:async';
import 'dart:math';

import '../config/hospital_config.dart';
import '../services/consent_api_service.dart';
import '../services/consent_manager_api_service.dart';
import '../utils/consent_mode.dart';

class M2AutomatedWorkflowService {
  M2AutomatedWorkflowService._();

  static String _generateRequestId() {
    final rand = Random();
    final chars = 'abcdef0123456789';
    String gen(int len) => List.generate(len, (index) => chars[rand.nextInt(16)]).join();
    return '${gen(8)}-${gen(4)}-${gen(4)}-${gen(4)}-${gen(12)}';
  }

  static String _formatToAbdmDate(DateTime dt) {
    return dt.toUtc().toIso8601String().split('.').first + '.000Z';
  }

  static String _extractTransactionId(Map<String, dynamic> callbackData) {
    if (callbackData['hiRequest'] != null && callbackData['hiRequest']['transactionId'] != null) {
      return callbackData['hiRequest']['transactionId'].toString();
    }
    if (callbackData['transactionId'] != null) {
      return callbackData['transactionId'].toString();
    }
    return '';
  }

  static Future<void> runAutomatedDataTransfer({
    required Map<String, dynamic> patientProfile,
    required String hiType,
    required void Function(String message) onProgress,
  }) async {
    final abhaAddress = (patientProfile['abhaAddress'] ?? patientProfile['AbhaAddress'] ?? patientProfile['healthId'] ?? '').toString();
    if (abhaAddress.isEmpty) {
      throw Exception('ABHA Address is required for M2 automation.');
    }

    String apiHiType = hiType.replaceAll(' Record', '').replaceAll(' ', '');
    if (apiHiType == 'HealthDocument') apiHiType = 'HealthDocumentRecord';

    onProgress('Initializing M2 Token Manager...');
    await ConsentManagerApiService.initializeM2TokenManager();

    
    onProgress('Step 1/7: Creating HIU Consent Request...');
    final requestId = _generateRequestId();
    final now = DateTime.now().toUtc();
    final fromDate = now.subtract(const Duration(days: 365));
    final toDate = now.add(const Duration(days: 1));
    final dataEraseAt = now.add(const Duration(days: 30));

    await ConsentManagerApiService.initConsentRequest({
      'requestId': requestId,
      'timestamp': _formatToAbdmDate(now),
      'consent': {
        'purpose': {
          'code': 'PATRQT',
          'text': 'Self Requested',
        },
        'patient': {'id': abhaAddress},
        'hiu': {'id': HospitalConfig.hiuId},
        'requester': {
          'name': HospitalConfig.requesterName,
          'identifier': {
            'type': 'REGNO',
            'value': 'MCI-1234',
          },
        },
        'hiTypes': [apiHiType],
        'permission': {
          'accessMode': 'VIEW',
          'dateRange': {
            'from': _formatToAbdmDate(fromDate),
            'to': _formatToAbdmDate(toDate),
          },
          'dataEraseAt': _formatToAbdmDate(dataEraseAt),
          'frequency': {'unit': 'HOUR', 'value': 1, 'repeats': 0},
        },
      },
    });

    
    onProgress('Step 2/7: Waiting for Consent Request ID from ABDM...');
    String? consentRequestId;
    for (int i = 0; i < 20; i++) {
      await Future.delayed(const Duration(seconds: 3));
      try {
        final res = await ConsentManagerApiService.fetchOnInitCallback(requestId);
        final cid = res['consentRequest']?['id']?.toString().trim();
        if (cid != null && cid.isNotEmpty) {
          consentRequestId = cid;
          break;
        }
      } catch (_) {}
    }
    if (consentRequestId == null) {
      throw Exception('Failed to receive consent request ID callback from ABDM.');
    }

    
    onProgress('Step 3/7: Auto-approving Consent Request (HIP)...');
    final grantResult = await ConsentApiService.submitConsentDecisionWithMetadata(
      consentRequestId,
      'APPROVED',
      raw: {},
      mode: ConsentMode.currentDefault,
    );
    final grantedConsentArtefactId = grantResult.consentArtefactId;
    if (grantedConsentArtefactId.isEmpty) {
      
      onProgress('Step 4/7: Waiting for Consent Artefact generation...');
    }

    String finalConsentArtefactId = grantedConsentArtefactId;
    if (finalConsentArtefactId.isEmpty) {
      for (int i = 0; i < 20; i++) {
        await Future.delayed(const Duration(seconds: 3));
        try {
          final res = await ConsentManagerApiService.fetchNotifyCallback(consentRequestId);
          final status = res['notification']?['status']?.toString().trim();
          if (status == 'GRANTED') {
            final artefacts = res['notification']?['consentArtefacts'] as List?;
            if (artefacts != null && artefacts.isNotEmpty) {
              finalConsentArtefactId = artefacts[0]['id']?.toString() ?? '';
              break;
            }
          }
        } catch (_) {}
      }
    }
    if (finalConsentArtefactId.isEmpty) {
      throw Exception('Failed to retrieve Consent Artefact ID.');
    }

    
    onProgress('Step 5/7: Requesting Data Transfer (HIU)...');
    final hiRequestId = _generateRequestId();
    await ConsentManagerApiService.requestHealthInformationWithMetadata({
      'requestId': hiRequestId, // Need to make sure payload has requestId if needed
      'timestamp': _formatToAbdmDate(DateTime.now().toUtc()),
      'hiRequest': {
        'consent': {'id': finalConsentArtefactId},
        'dateRange': {
          'from': _formatToAbdmDate(fromDate),
          'to': _formatToAbdmDate(toDate),
        },
      },
    });

    
    onProgress('Step 6/7: Waiting for Transaction ID...');
    String? transactionId;
    for (int i = 0; i < 20; i++) {
      await Future.delayed(const Duration(seconds: 3));
      try {
        final res = await ConsentManagerApiService.fetchOnRequestCallback(hiRequestId);
        final tid = _extractTransactionId(res);
        if (tid.isNotEmpty) {
          transactionId = tid;
          break;
        }
      } catch (_) {}
    }
    if (transactionId == null) {
      throw Exception('Failed to receive HI Request transaction ID.');
    }

    
    onProgress('Step 7/7: Pushing FHIR bundle to HIU (HIP)...');
    await ConsentManagerApiService.delegatePushToBackendWithMetadata(
      consentId: finalConsentArtefactId,
      transactionId: transactionId,
      recordTypes: [hiType],
      abhaAddress: abhaAddress,
    );

    onProgress('Success! Automated M2 flow completed.');
  }
}
