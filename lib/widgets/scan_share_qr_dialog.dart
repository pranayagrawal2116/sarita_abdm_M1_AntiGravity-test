import 'package:flutter/material.dart';

import '../config/hospital_config.dart';
import '../services/hip_setup_api_service.dart';

class ScanShareQrDialog {
  const ScanShareQrDialog._();

  static Future<void> prepareAndShow(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);

    try {
      final setup = await HipSetupApiService.runScanShareSetup();
      final ok = setup['ok'] == true;
      if (!ok) {
        final canShowQr = _scanShareSetupCanContinue(setup);
        if (!canShowQr) {
          throw Exception(_scanShareSetupMessage(setup));
        }
        if (context.mounted) {
          messenger.showSnackBar(
            SnackBar(
              content: Text(_scanShareSetupMessage(setup)),
              duration: const Duration(seconds: 6),
            ),
          );
        }
      }

      if (!context.mounted) return;
      await show(context);
    } catch (error) {
      if (!context.mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            error.toString().replaceFirst(RegExp(r'^Exception:\s*'), ''),
          ),
          duration: const Duration(seconds: 8),
        ),
      );
    }
  }

  static Future<void> show(BuildContext context) async {
    await showDialog<void>(
      context: context,
      builder: (context) {
        return Dialog(
          insetPadding: const EdgeInsets.symmetric(
            horizontal: 32,
            vertical: 24,
          ),
          backgroundColor: Colors.white,
          clipBehavior: Clip.antiAlias,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 680),
            child: Stack(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(48, 52, 48, 44),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FBFD),
                      borderRadius: BorderRadius.circular(32),
                      border: Border.all(color: const Color(0xFFD7E5F1)),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.06),
                          blurRadius: 28,
                          offset: const Offset(0, 18),
                        ),
                      ],
                    ),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(36, 32, 36, 36),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            HospitalConfig.scanShareHospitalName,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: Color(0xFF1C2430),
                              fontSize: 30,
                              fontWeight: FontWeight.w700,
                              letterSpacing: -0.4,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            HospitalConfig.scanShareCounterLabel,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: Color(0xFF1C2430),
                              fontSize: 26,
                              fontWeight: FontWeight.w600,
                              letterSpacing: -0.2,
                            ),
                          ),
                          const SizedBox(height: 34),
                          DecoratedBox(
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(24),
                              border: Border.all(
                                color: const Color(0xFFE1EAF2),
                              ),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(20),
                              child: ConstrainedBox(
                                constraints: const BoxConstraints(
                                  maxWidth: 420,
                                  maxHeight: 420,
                                ),
                                child: Image.asset(
                                  HospitalConfig.scanShareQrAssetPath,
                                  fit: BoxFit.contain,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                Positioned(
                  top: 12,
                  right: 12,
                  child: IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  static bool _scanShareSetupCanContinue(Map<String, dynamic> setup) {
    final steps = setup['steps'];
    if (steps is! List) return false;
    final sessionOk = steps.whereType<Map>().any((step) {
      return step['name'] == 'session' && step['ok'] == true;
    });
    final bridgeOk = steps.whereType<Map>().any((step) {
      final name = step['name'];
      final duplicateAccepted = step['duplicateAccepted'] == true;
      return name == 'updateBridgeUrl' &&
          (step['ok'] == true || duplicateAccepted);
    });
    return sessionOk && bridgeOk;
  }

  static String _scanShareSetupMessage(Map<String, dynamic> setup) {
    final steps = setup['steps'];
    if (steps is List) {
      final failed = steps.whereType<Map>().where((step) {
        return step['required'] == true && step['ok'] != true;
      });
      if (failed.isNotEmpty) {
        final step = failed.first;
        return 'Scan and Share setup failed at ${step['name']}: ${step['error'] ?? step}';
      }
      final warnings = steps.whereType<Map>().where((step) {
        return step['required'] != true && step['ok'] != true;
      });
      if (warnings.isNotEmpty) {
        final step = warnings.first;
        return 'Scan and Share setup warning at ${step['name']}: ${step['error'] ?? step}. Showing QR because the callback URL setup is ready.';
      }
    }
    return 'Scan and Share setup failed. Check backend logs for the ABDM prerequisite response.';
  }
}
