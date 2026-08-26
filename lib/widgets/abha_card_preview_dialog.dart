import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../utils/download_helper.dart';

import '../services/abha_api_service.dart';
import '../utils/app_runtime_store.dart';
import '../utils/auth_session.dart';
import 'virtual_abha_card.dart';

Future<void> showEnrollmentAccountAbhaCardPreviewDialog(
  BuildContext context, {
  Map<String, dynamic>? cardPayload,
  Map<String, dynamic>? userSession,
  void Function(Map<String, dynamic> payload)? onCardPayloadLoaded,
  String unavailableMessage =
      'ABHA card is not available for this enrollment profile in the current app session.',
}) async {
  final resolvedPayload = await _resolveEnrollmentCardPayload(
    context,
    cardPayload: cardPayload,
    userSession: userSession,
    onCardPayloadLoaded: onCardPayloadLoaded,
  );
  if (resolvedPayload == null) {
    if (context.mounted) {
      await _showResolvedAbhaCardDialog(
        context,
        cardPayload ?? const <String, dynamic>{},
        userSession: userSession,
      );
    }
    return;
  }

  if (context.mounted) {
    await _showResolvedAbhaCardDialog(
      context,
      resolvedPayload,
      userSession: userSession,
    );
  }
}

Future<void> showProfileAccountAbhaCardPreviewDialog(
  BuildContext context, {
  Map<String, dynamic>? cardPayload,
  Map<String, dynamic>? userSession,
  void Function(Map<String, dynamic> payload)? onCardPayloadLoaded,
  String unavailableMessage =
      'ABHA card is not available for this verified profile in the current app session.',
}) async {
  Map<String, dynamic>? resolvedPayload = _normalizePayload(cardPayload);
  if (_payloadHasCardData(resolvedPayload)) {
    await _showResolvedAbhaCardDialog(
      context,
      resolvedPayload!,
      userSession: userSession,
    );
    return;
  }

  final sessionTokenValue = userSession?['sessionToken'];
  final tokenValue = userSession?['token'];
  final runtimeLoginTokenValue = AppRuntimeStore.getValue<String>(
    'phr.login.token',
  );
  final authSessionTokenValue = AuthSession.m1PhrAuthToken;
  final runtimeEnrollmentTokenValue = AppRuntimeStore.getValue<String>(
    'Abha.enrollment.xToken',
  );
  final sessionToken = _firstNonEmptyString([
    sessionTokenValue,
    tokenValue,
    runtimeLoginTokenValue,
    authSessionTokenValue,
    runtimeEnrollmentTokenValue,
  ]);

  final refreshTokenValue = userSession?['refreshToken'];
  final runtimeRefreshTokenValue = AppRuntimeStore.getValue<String>(
    'Abha.enrollment.refreshToken',
  );
  final refreshToken = _firstNonEmptyString([
    refreshTokenValue,
    runtimeRefreshTokenValue,
  ]);

  if (sessionToken.isNotEmpty) {
    try {
      resolvedPayload = await AbhaApiService.downloadProfileAccountCard(
        xToken: sessionToken,
        refreshToken: refreshToken.isEmpty ? null : refreshToken,
      );
      onCardPayloadLoaded?.call(resolvedPayload);
      if (context.mounted) {
        await _showResolvedAbhaCardDialog(
          context,
          resolvedPayload,
          userSession: userSession,
        );
      }
      return;
    } catch (_) {}

    try {
      resolvedPayload = await AbhaApiService.downloadPhrCardWithToken(
        xToken: sessionToken,
      );
      onCardPayloadLoaded?.call(resolvedPayload);
      if (context.mounted) {
        await _showResolvedAbhaCardDialog(
          context,
          resolvedPayload,
          userSession: userSession,
        );
      }
      return;
    } catch (_) {}
  }

  if (context.mounted) {
    await _showResolvedAbhaCardDialog(
      context,
      cardPayload ?? const <String, dynamic>{},
      userSession: userSession,
    );
  }
}

Future<void> showLoggedInPhrAbhaCardPreviewDialog(
  BuildContext context, {
  Map<String, dynamic>? cardPayload,
  Map<String, dynamic>? userSession,
  void Function(Map<String, dynamic> payload)? onCardPayloadLoaded,
  String unavailableMessage =
      'ABHA card is not available for this verified profile in the current app session.',
}) async {
  final resolvedPayload = await _resolvePhrCardPayload(
    context,
    cardPayload: cardPayload,
    userSession: userSession,
    onCardPayloadLoaded: onCardPayloadLoaded,
  );
  if (resolvedPayload == null) {
    if (context.mounted) {
      await _showResolvedAbhaCardDialog(
        context,
        cardPayload ?? const <String, dynamic>{},
        userSession: userSession,
      );
    }
    return;
  }

  if (context.mounted) {
    await _showResolvedAbhaCardDialog(
      context,
      resolvedPayload,
      userSession: userSession,
    );
  }
}

Future<void> showRegisteredPatientAbhaCardPreviewDialog(
  BuildContext context, {
  Map<String, dynamic>? cardPayload,
  Map<String, dynamic>? userSession,
  void Function(Map<String, dynamic> payload)? onCardPayloadLoaded,
  String unavailableMessage =
      'ABHA card is not available for this user in the current app session.',
}) async {
  final source = userSession?['source']?.toString().trim() ?? '';
  final usesEnrollmentCardApi =
      source == 'abdm-enrollment-profile-details' ||
      source == 'abdm-existing-account' ||
      source == 'abdm-profile-login-verification' ||
      source == 'abdm-mobile-linked-account';

  if (usesEnrollmentCardApi) {
    await showEnrollmentAccountAbhaCardPreviewDialog(
      context,
      cardPayload: cardPayload,
      userSession: userSession,
      onCardPayloadLoaded: onCardPayloadLoaded,
      unavailableMessage: unavailableMessage,
    );
    return;
  }

  await showLoggedInPhrAbhaCardPreviewDialog(
    context,
    cardPayload: cardPayload,
    userSession: userSession,
    onCardPayloadLoaded: onCardPayloadLoaded,
    unavailableMessage: unavailableMessage,
  );
}

Future<void> showAbhaCardPreviewDialog(
  BuildContext context, {
  Map<String, dynamic>? cardPayload,
  Map<String, dynamic>? userSession,
  void Function(Map<String, dynamic> payload)? onCardPayloadLoaded,
  String unavailableMessage =
      'ABHA card is not available for this user in the current app session.',
}) {
  return showRegisteredPatientAbhaCardPreviewDialog(
    context,
    cardPayload: cardPayload,
    userSession: userSession,
    onCardPayloadLoaded: onCardPayloadLoaded,
    unavailableMessage: unavailableMessage,
  );
}

Future<Map<String, dynamic>?> _resolveEnrollmentCardPayload(
  BuildContext context, {
  Map<String, dynamic>? cardPayload,
  Map<String, dynamic>? userSession,
  void Function(Map<String, dynamic> payload)? onCardPayloadLoaded,
}) async {
  Map<String, dynamic>? resolvedPayload = _normalizePayload(cardPayload);
  if (_payloadHasCardData(resolvedPayload)) {
    return resolvedPayload;
  }

  final sessionToken = _firstNonEmptyString([
    userSession?['sessionToken'],
    userSession?['token'],
    AppRuntimeStore.getValue<String>('Abha.enrollment.xToken'),
  ]);
  final refreshToken = _firstNonEmptyString([
    userSession?['refreshToken'],
    AppRuntimeStore.getValue<String>('Abha.enrollment.refreshToken'),
  ]);

  if (sessionToken.isEmpty) {
    return null;
  }

  try {
    resolvedPayload = await AbhaApiService.downloadProfileAccountCard(
      xToken: sessionToken,
      refreshToken: refreshToken.isEmpty ? null : refreshToken,
    );
    onCardPayloadLoaded?.call(resolvedPayload);
    return resolvedPayload;
  } catch (_) {
    return null;
  }
}

Future<Map<String, dynamic>?> _resolvePhrCardPayload(
  BuildContext context, {
  Map<String, dynamic>? cardPayload,
  Map<String, dynamic>? userSession,
  void Function(Map<String, dynamic> payload)? onCardPayloadLoaded,
}) async {
  Map<String, dynamic>? resolvedPayload = _normalizePayload(cardPayload);
  if (_payloadHasCardData(resolvedPayload)) {
    return resolvedPayload;
  }

  final sessionTokenValue = userSession?['sessionToken'];
  final tokenValue = userSession?['token'];
  final runtimeTokenValue = AppRuntimeStore.getValue<String>('phr.login.token');
  final authTokenValue = AuthSession.m1PhrAuthToken;
  final sessionToken = _firstNonEmptyString([
    sessionTokenValue,
    tokenValue,
    runtimeTokenValue,
    authTokenValue,
  ]);

  final refreshTokenValue = userSession?['refreshToken'];
  final runtimeRefreshTokenValue = AppRuntimeStore.getValue<String>(
    'Abha.enrollment.refreshToken',
  );
  final authRefreshTokenValue = AuthSession.m1PhrRefreshToken;
  final refreshToken = _firstNonEmptyString([
    refreshTokenValue,
    runtimeRefreshTokenValue,
    authRefreshTokenValue,
  ]);

  final previousTokenValue = AuthSession.m1PhrAuthToken;
  final previousRefreshTokenValue = AuthSession.m1PhrRefreshToken;
  final previousAddressValue = AuthSession.m1AbhaAddress;

  Future<void> restorePreviousSession() async {
    final hasPreviousToken =
        previousTokenValue != null && previousTokenValue.trim().isNotEmpty;
    final hasPreviousAddress =
        previousAddressValue != null && previousAddressValue.trim().isNotEmpty;
    if (hasPreviousToken && hasPreviousAddress) {
      AuthSession.setM1Login(
        token: previousTokenValue,
        address: previousAddressValue,
        refreshToken: previousRefreshTokenValue,
      );
      AuthSession.setM2Login(
        token: previousTokenValue,
        address: previousAddressValue,
        refreshToken: previousRefreshTokenValue,
      );
    }
  }

  try {
    if (sessionToken.isNotEmpty) {
      resolvedPayload = await AbhaApiService.downloadPhrCardWithToken(
        xToken: sessionToken,
      );
    } else {
      resolvedPayload = await AbhaApiService.downloadPhrCard();
    }
    onCardPayloadLoaded?.call(resolvedPayload);
    return resolvedPayload;
  } catch (phrError) {
    if (sessionToken.isNotEmpty) {
      try {
        resolvedPayload = await AbhaApiService.downloadProfileAccountCard(
          xToken: sessionToken,
          refreshToken: refreshToken.isEmpty ? null : refreshToken,
        );
        onCardPayloadLoaded?.call(resolvedPayload);
        return resolvedPayload;
      } catch (_) {}
    }
    await restorePreviousSession();
    return null;
  }
}

Future<void> _showResolvedAbhaCardDialog(
  BuildContext context,
  Map<String, dynamic> resolvedPayload, {
  Map<String, dynamic>? userSession,
}) async {
  final encoded = resolvedPayload['data']?.toString() ?? '';
  await showDialog<void>(
    context: context,
    builder: (dialogContext) {
      return _AbhaCardPreviewDialog(
        resolvedPayload: resolvedPayload,
        encoded: encoded,
        userSession: userSession,
      );
    },
  );
}

class _AbhaCardPreviewDialog extends StatefulWidget {
  const _AbhaCardPreviewDialog({
    required this.resolvedPayload,
    required this.encoded,
    this.userSession,
  });

  final Map<String, dynamic> resolvedPayload;
  final String encoded;
  final Map<String, dynamic>? userSession;

  @override
  State<_AbhaCardPreviewDialog> createState() => _AbhaCardPreviewDialogState();
}

class _AbhaCardPreviewDialogState extends State<_AbhaCardPreviewDialog> {
  late final Future<Uint8List?> _imageBytesFuture;

  @override
  void initState() {
    super.initState();
    _imageBytesFuture = compute(_decodeBase64ImageBytes, widget.encoded);
  }

  @override
  Widget build(BuildContext context) {
    final profile = widget.userSession ?? widget.resolvedPayload;
    final fullName =
        profile['name']?.toString() ??
        profile['fullName']?.toString() ??
        [
          profile['firstName'],
          profile['middleName'],
          profile['lastName'],
        ].whereType<String>().where((part) => part.trim().isNotEmpty).join(' ');
    final abhaAddress =
        profile['preferredAbhaAddress']?.toString() ??
        profile['AbhaAddress']?.toString() ??
        AuthSession.m1AbhaAddress ??
        "-";
    final abhaNumber =
        profile['AbhaNumber']?.toString() ??
        profile['healthIdNumber']?.toString() ??
        "-";
    final gender = profile['gender']?.toString() ?? "-";
    final dob =
        profile['dob']?.toString() ?? profile['yearOfBirth']?.toString() ?? "-";
    final mobile = profile['mobile']?.toString() ?? "-";
    final photoBase64 =
        profile['photo']?.toString() ?? profile['imageBase64']?.toString();

    return Dialog(
      insetPadding: const EdgeInsets.all(24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: 1220,
          maxHeight: MediaQuery.of(context).size.height * 0.9,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 18),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Color(0xFFEAF6FF),
                    Color(0xFFEFFBF4),
                    Color(0xFFFFFFFF),
                  ],
                ),
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(24),
                  topRight: Radius.circular(24),
                ),
              ),
              child: Row(
                children: [
                  OutlinedButton.icon(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.arrow_back_rounded),
                    label: const Text('Back'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF1B5E8C),
                      side: const BorderSide(color: Color(0xFFD2E3F1)),
                    ),
                  ),
                  const SizedBox(width: 16),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'ABHA Card Preview',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF17324A),
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Preview the full ABHA card below or download it for local use.',
                          style: TextStyle(
                            color: Color(0xFF5A6F82),
                            fontSize: 14,
                            height: 1.45,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 22, 24, 20),
                child: FutureBuilder<Uint8List?>(
                  future: _imageBytesFuture,
                  builder: (context, snapshot) {
                    if (snapshot.connectionState != ConnectionState.done) {
                      return Container(
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: const Color(0xFFF8FBFF),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: const Color(0xFFDCE8F2)),
                        ),
                        child: const CircularProgressIndicator(),
                      );
                    }

                    final imageBytes = snapshot.data;
                    return SingleChildScrollView(
                      child: Center(
                        child: Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF8FBFF),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: const Color(0xFFDCE8F2)),
                          ),
                          child: imageBytes != null
                              ? RepaintBoundary(
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(16),
                                    child: Image.memory(
                                      imageBytes,
                                      fit: BoxFit.contain,
                                      filterQuality: FilterQuality.low,
                                      gaplessPlayback: true,
                                    ),
                                  ),
                                )
                              : VirtualAbhaCard(
                                  name: fullName.isEmpty
                                      ? 'Patient Profile'
                                      : fullName,
                                  abhaAddress: abhaAddress,
                                  abhaNumber: abhaNumber,
                                  gender: gender,
                                  dob: dob,
                                  mobile: mobile,
                                  photoBase64: photoBase64,
                                ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
            Container(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 22),
              decoration: const BoxDecoration(
                color: Color(0xFFFBFDFF),
                border: Border(top: BorderSide(color: Color(0xFFE3EAF1))),
                borderRadius: BorderRadius.only(
                  bottomLeft: Radius.circular(24),
                  bottomRight: Radius.circular(24),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(context),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF2F8F5B),
                        side: const BorderSide(color: Color(0xFFA9DDBD)),
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      child: const Text('Back'),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: widget.encoded.trim().isEmpty
                          ? null
                          : () async {
                              final messenger = ScaffoldMessenger.of(context);
                              try {
                                final savedPath = await _saveCardPayload(
                                  cardPayload: widget.resolvedPayload,
                                  fallbackEncoded: widget.encoded,
                                );
                                if (!context.mounted) {
                                  return;
                                }
                                messenger.showSnackBar(
                                  SnackBar(
                                    content: Text(
                                      'ABHA card saved to $savedPath',
                                    ),
                                  ),
                                );
                              } catch (e) {
                                if (!context.mounted) {
                                  return;
                                }
                                messenger.showSnackBar(
                                  SnackBar(content: Text(e.toString())),
                                );
                              }
                            },
                      icon: const Icon(Icons.download_rounded),
                      label: const Text('Download ABHA Card'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1B5E8C),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Uint8List? _decodeBase64ImageBytes(String encoded) {
  try {
    return base64Decode(encoded);
  } catch (_) {
    return null;
  }
}

String _firstNonEmptyString(Iterable<dynamic> values) {
  for (final value in values) {
    final text = value?.toString().trim() ?? '';
    if (text.isNotEmpty && text.toLowerCase() != 'null') {
      return text;
    }
  }
  return '';
}

Map<String, dynamic>? _normalizePayload(Map<String, dynamic>? payload) {
  if (payload == null) {
    return null;
  }
  return Map<String, dynamic>.from(payload);
}

bool _payloadHasCardData(Map<String, dynamic>? payload) {
  return payload?['data']?.toString().trim().isNotEmpty == true;
}

Future<String> _saveCardPayload({
  required Map<String, dynamic> cardPayload,
  required String fallbackEncoded,
}) async {
  final contentType =
      (cardPayload['contentType']?.toString() ?? 'application/octet-stream')
          .trim()
          .toLowerCase();
  final fileName = (cardPayload['fileName']?.toString() ?? 'Abha_card').trim();
  final encoded = cardPayload['data']?.toString().trim().isNotEmpty == true
      ? cardPayload['data']?.toString() ?? ''
      : fallbackEncoded;

  if (encoded.trim().isEmpty) {
    throw Exception('ABHA card response was empty');
  }

  final extension = _fileExtensionForContentType(contentType);
  
  return await saveAbhaCard(fileName, extension, encoded);
}

String _fileExtensionForContentType(String contentType) {
  if (contentType.contains('pdf')) return 'pdf';
  if (contentType.contains('png')) return 'png';
  if (contentType.contains('jpeg') || contentType.contains('jpg')) return 'jpg';
  if (contentType.contains('json')) return 'json';
  return 'bin';
}
