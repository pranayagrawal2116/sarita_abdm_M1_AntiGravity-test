import 'dart:io';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import '../services/abha_api_service.dart';
import '../utils/app_runtime_store.dart';
import '../utils/auth_session.dart';
import '../utils/registered_users_store.dart';
import '../utils/download_helper.dart';
import '../widgets/desktop_workspace.dart';
import '../widgets/virtual_abha_card.dart';
import 'hi_record_creation_screen.dart';
import 'm2_data_exchange_screen.dart';

class AbhaHomeScreen extends StatefulWidget {
  const AbhaHomeScreen({super.key, this.selectedUser});

  final Map<String, dynamic>? selectedUser;

  @override
  State<AbhaHomeScreen> createState() => _AbhaHomeScreenState();
}

class _AbhaHomeScreenState extends State<AbhaHomeScreen> {
  static const List<String> _m2FormTypes = [
    'OP Consultation Record',
    'Prescription Record',
    'Wellness Record',
    'Diagnostic Report',
    'Immunization Record',
    'Invoice Record',
    'Discharge Summary',
    'Health Document Record',
  ];

  late Future<Map<String, dynamic>> _profileFuture;
  late Future<Map<String, dynamic>> _phrCardFuture;
  bool _downloadingCard = false;

  String _findJwtRecursive(dynamic data) {
    if (data is Map) {
      for (final key in ['sessionToken', 'token', 'accessToken']) {
        if (data.containsKey(key)) {
          final val = data[key]?.toString().trim() ?? '';
          if (val.startsWith('eyJ') && val.contains('.')) {
            return val;
          }
        }
      }
      for (final value in data.values) {
        final res = _findJwtRecursive(value);
        if (res.isNotEmpty) {
          return res;
        }
      }
    } else if (data is List) {
      for (final element in data) {
        final res = _findJwtRecursive(element);
        if (res.isNotEmpty) {
          return res;
        }
      }
    } else if (data is String) {
      final val = data.trim();
      if (val.startsWith('eyJ') && val.contains('.')) {
        return val;
      }
    }
    return '';
  }

  String _findRefreshTokenRecursive(dynamic data, String sessionToken) {
    if (data is Map) {
      for (final key in ['refreshToken', 'refresh_token']) {
        if (data.containsKey(key)) {
          final val = data[key]?.toString().trim() ?? '';
          if (val.isNotEmpty && val != sessionToken) {
            return val;
          }
        }
      }
      for (final value in data.values) {
        final res = _findRefreshTokenRecursive(value, sessionToken);
        if (res.isNotEmpty) {
          return res;
        }
      }
    } else if (data is List) {
      for (final element in data) {
        final res = _findRefreshTokenRecursive(element, sessionToken);
        if (res.isNotEmpty) {
          return res;
        }
      }
    } else if (data is String) {
      final val = data.trim();
      if (val.isNotEmpty && val.startsWith('eyJ') && val.contains('.') && val != sessionToken) {
        return val;
      }
    }
    return '';
  }

  String _findValueRecursive(dynamic data, List<String> keys) {
    if (data is Map) {
      for (final key in keys) {
        if (data.containsKey(key)) {
          final val = data[key]?.toString().trim() ?? '';
          if (val.isNotEmpty) {
            return val;
          }
        }
      }
      for (final value in data.values) {
        final res = _findValueRecursive(value, keys);
        if (res.isNotEmpty) {
          return res;
        }
      }
    } else if (data is List) {
      for (final element in data) {
        final res = _findValueRecursive(element, keys);
        if (res.isNotEmpty) {
          return res;
        }
      }
    }
    return '';
  }

  @override
  void initState() {
    super.initState();
    if (widget.selectedUser != null) {
      final foundSessionToken = _findJwtRecursive(widget.selectedUser);
      final foundRefreshToken = _findRefreshTokenRecursive(widget.selectedUser, foundSessionToken);

      if (foundSessionToken.isNotEmpty) {
        widget.selectedUser!['sessionToken'] = foundSessionToken;
      }
      if (foundRefreshToken.isNotEmpty) {
        widget.selectedUser!['refreshToken'] = foundRefreshToken;
      }

      var abhaAddress = [
        widget.selectedUser!['AbhaAddress'],
        widget.selectedUser!['abhaAddress'],
      ].map((v) => v?.toString().trim() ?? '').firstWhere((v) => v.isNotEmpty, orElse: () => '');

      if (abhaAddress.isEmpty) {
        abhaAddress = _findValueRecursive(widget.selectedUser, ['AbhaAddress', 'abhaAddress', 'preferredAbhaAddress', 'abhaAddr']);
        if (abhaAddress.isNotEmpty) {
          widget.selectedUser!['AbhaAddress'] = abhaAddress;
        }
      }

      final sessionToken = [
        widget.selectedUser!['sessionToken'],
        widget.selectedUser!['token'],
      ].map((v) => v?.toString().trim() ?? '').firstWhere((v) => v.isNotEmpty, orElse: () => '');
      final refreshToken = [
        widget.selectedUser!['refreshToken'],
      ].map((v) => v?.toString().trim() ?? '').firstWhere((v) => v.isNotEmpty, orElse: () => '');

      if (sessionToken.isNotEmpty) {
        AuthSession.setM1Login(
          token: sessionToken,
          address: abhaAddress,
          refreshToken: refreshToken.isEmpty ? null : refreshToken,
        );
        AuthSession.setM2Login(
          token: sessionToken,
          address: abhaAddress,
          refreshToken: refreshToken.isEmpty ? null : refreshToken,
        );
      }
    }
    _profileFuture = widget.selectedUser != null
        ? Future.value(Map<String, dynamic>.from(widget.selectedUser!))
        : _loadProfile();
    _phrCardFuture = widget.selectedUser != null
        ? (widget.selectedUser!['cardPayload'] is Map<String, dynamic> &&
                  (widget.selectedUser!['cardPayload']['data']
                          ?.toString()
                          .trim()
                          .isNotEmpty ??
                      false)
              ? Future.value(
                  Map<String, dynamic>.from(
                    widget.selectedUser!['cardPayload'],
                  ),
                )
              : _loadPhrCard())
        : _loadPhrCard();
  }

  Future<Map<String, dynamic>> _loadProfile() {
    return AbhaApiService.fetchLoggedInProfile();
  }

  Future<Map<String, dynamic>> _loadPhrCard() {
    if (widget.selectedUser != null) {
      final payload = widget.selectedUser!['cardPayload'];
      if (payload is Map<String, dynamic> &&
          (payload['data']?.toString().trim().isNotEmpty ?? false)) {
        return Future.value(Map<String, dynamic>.from(payload));
      }

      final source = widget.selectedUser!['source']?.toString().trim() ?? '';
      final shouldPreferAccountCard =
          source == 'abdm-enrollment-profile-details' ||
          source == 'abdm-existing-account';
      final sessionToken =
          [widget.selectedUser!['sessionToken'], widget.selectedUser!['token']]
              .map((value) => value?.toString().trim() ?? '')
              .firstWhere((value) => value.isNotEmpty, orElse: () => '');
      final refreshToken = [widget.selectedUser!['refreshToken']]
          .map((value) => value?.toString().trim() ?? '')
          .firstWhere((value) => value.isNotEmpty, orElse: () => '');

      Future<Map<String, dynamic>> fetch;
      if (shouldPreferAccountCard && sessionToken.isNotEmpty) {
        fetch = AbhaApiService.downloadProfileAccountCard(
          xToken: sessionToken,
          refreshToken: refreshToken.isEmpty ? null : refreshToken,
        );
      } else if (sessionToken.isNotEmpty) {
        fetch = AbhaApiService.downloadPhrCardWithToken(xToken: sessionToken)
            .catchError((error) {
              if (sessionToken.isEmpty) {
                throw error;
              }
              return AbhaApiService.downloadProfileAccountCard(
                xToken: sessionToken,
                refreshToken: refreshToken.isEmpty ? null : refreshToken,
              );
            });
      } else {
        fetch = Future.value(const <String, dynamic>{});
      }

      return fetch.then((res) {
        if (widget.selectedUser != null &&
            res['data']?.toString().trim().isNotEmpty == true) {
          widget.selectedUser!['cardPayload'] = res;
          RegisteredUsersStore.upsert(widget.selectedUser!);
        }
        return res;
      });
    }
    return AbhaApiService.downloadPhrCard();
  }

  void _reloadProfile() {
    setState(() {
      _profileFuture = widget.selectedUser != null
          ? Future.value(Map<String, dynamic>.from(widget.selectedUser!))
          : _loadProfile();
    });
  }

  void _reloadPhrCard() {
    setState(() {
      _phrCardFuture = _loadPhrCardForce();
    });
  }

  Future<Map<String, dynamic>> _loadPhrCardForce() {
    if (widget.selectedUser != null) {
      final source = widget.selectedUser!['source']?.toString().trim() ?? '';
      final shouldPreferAccountCard =
          source == 'abdm-enrollment-profile-details' ||
          source == 'abdm-existing-account';
      final sessionToken =
          [widget.selectedUser!['sessionToken'], widget.selectedUser!['token']]
              .map((value) => value?.toString().trim() ?? '')
              .firstWhere((value) => value.isNotEmpty, orElse: () => '');
      final refreshToken = [widget.selectedUser!['refreshToken']]
          .map((value) => value?.toString().trim() ?? '')
          .firstWhere((value) => value.isNotEmpty, orElse: () => '');

      Future<Map<String, dynamic>> fetch;
      if (shouldPreferAccountCard && sessionToken.isNotEmpty) {
        fetch = AbhaApiService.downloadProfileAccountCard(
          xToken: sessionToken,
          refreshToken: refreshToken.isEmpty ? null : refreshToken,
        );
      } else if (sessionToken.isNotEmpty) {
        fetch = AbhaApiService.downloadPhrCardWithToken(xToken: sessionToken)
            .catchError((error) {
              if (sessionToken.isEmpty) {
                throw error;
              }
              return AbhaApiService.downloadProfileAccountCard(
                xToken: sessionToken,
                refreshToken: refreshToken.isEmpty ? null : refreshToken,
              );
            });
      } else {
        fetch = Future.value(const <String, dynamic>{});
      }

      return fetch.then((res) {
        if (widget.selectedUser != null &&
            res['data']?.toString().trim().isNotEmpty == true) {
          widget.selectedUser!['cardPayload'] = res;
          RegisteredUsersStore.upsert(widget.selectedUser!);
        }
        return res;
      });
    }
    return AbhaApiService.downloadPhrCard();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.selectedUser != null ? "Patient Workspace" : "PHR Home",
        ),
      ),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _profileFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      snapshot.error.toString().replaceFirst(
                        RegExp(r'^Exception:\s*'),
                        '',
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 12),
                    ElevatedButton(
                      onPressed: _reloadProfile,
                      child: const Text("Retry Profile Fetch"),
                    ),
                  ],
                ),
              ),
            );
          }

          final profile = snapshot.data ?? const <String, dynamic>{};
          final fullName =
              profile['name']?.toString() ??
              profile['fullName']?.toString() ??
              [profile['firstName'], profile['middleName'], profile['lastName']]
                  .whereType<String>()
                  .where((part) => part.trim().isNotEmpty)
                  .join(' ');
          final abhaAddress =
              profile['preferredAbhaAddress']?.toString() ??
              profile['AbhaAddress']?.toString() ??
              AuthSession.m1AbhaAddress ??
              "-";
          final abhaNumber =
              profile['AbhaNumber']?.toString() ??
              profile['healthIdNumber']?.toString() ??
              profile['AbhaNumber']?.toString() ??
              "-";
          final maskedAbhaNumber = _maskAbhaNumber(abhaNumber);
          final maskedMobile = _maskMobile(
            profile['mobile']?.toString() ?? "-",
          );

          return LayoutBuilder(
            builder: (context, constraints) {
              final desktop = constraints.maxWidth >= 1000;

              final profileCard = _infoCard(
                title: "Profile",
                children: [
                  _infoRow("Full Name", fullName.isEmpty ? "-" : fullName),
                  _infoRow("ABHA Address", abhaAddress),
                  _infoRow("ABHA Number", maskedAbhaNumber),
                  _infoRow("Mobile", maskedMobile),
                  _infoRow("Gender", profile['gender']?.toString() ?? "-"),
                  _infoRow(
                    "Year of Birth",
                    profile['yearOfBirth']?.toString() ?? "-",
                  ),
                ],
              );

              final cardPreview = _cardPreviewCard(profile);

              final actionsCard = _infoCard(
                title: "PHR Actions",
                children: [
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE3F2FD),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: const Color(0xFFE3F2FD)),
                    ),
                    child: const Text(
                      "You are now in the PHR layer. From here you can fetch the user profile, card, and continue with M1 verification work.",
                      style: TextStyle(color: Color(0xFF0D47A1), height: 1.35),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 48,
                    child: ElevatedButton(
                      onPressed: _downloadingCard
                          ? null
                          : () => _downloadAbhaCard(context),
                      child: Text(
                        _downloadingCard
                            ? "Downloading PHR Card..."
                            : "Download ABHA / PHR Card",
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 48,
                    child: OutlinedButton(
                      onPressed: _reloadPhrCard,
                      child: const Text("Refresh ABHA Card"),
                    ),
                  ),
                  SizedBox(
                    height: 48,
                    child: OutlinedButton(
                      onPressed: () => _showM2FormsDialog(context, profile),
                      child: const Text("Patient Records"),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 48,
                    child: OutlinedButton(
                      onPressed: () {
                        final m2Profile = <String, dynamic>{
                          ...profile,
                          if (widget.selectedUser != null)
                            ...widget.selectedUser!,
                        };
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) =>
                                M2DataExchangeScreen(patientProfile: m2Profile),
                          ),
                        );
                      },
                      child: const Text("M2 Consent & Data Transfer"),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
              );

              return Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1240),
                  child: ListView(
                    padding: const EdgeInsets.all(20),
                    children: [
                      DesktopPageIntro(
                        eyebrow: widget.selectedUser != null
                            ? "Selected Patient"
                            : "PHR Workspace",
                        title: widget.selectedUser != null
                            ? "Work on the selected patient in the current desktop workspace."
                            : "See profile, card, and next actions in one desktop view.",
                        description: widget.selectedUser != null
                            ? "This is the current work page for the patient you selected from the homepage. Their details stay visible here while you move through card and M1 actions."
                            : "The PHR home screen is now laid out like a working desktop surface so profile details, the ABHA card, and downstream actions stay visible together.",
                        pills: const [
                          "Profile",
                          "ABHA card",
                          "M1 verification",
                          "Scan & Share",
                        ],
                      ),
                      if (desktop)
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              flex: 3,
                              child: Column(
                                children: [
                                  profileCard,
                                  const SizedBox(height: 16),
                                  cardPreview,
                                ],
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(flex: 2, child: actionsCard),
                          ],
                        )
                      else ...[
                        profileCard,
                        const SizedBox(height: 16),
                        cardPreview,
                        const SizedBox(height: 16),
                        actionsCard,
                      ],
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  Widget _infoCard({required String title, required List<Widget> children}) {
    return DesktopSurface(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _cardPreviewCard(Map<String, dynamic> profile) {
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

    return _infoCard(
      title: "ABHA Card",
      children: [
        FutureBuilder<Map<String, dynamic>>(
          future: _phrCardFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(child: CircularProgressIndicator()),
              );
            }

            if (snapshot.hasError) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  VirtualAbhaCard(
                    name: fullName,
                    abhaAddress: abhaAddress,
                    abhaNumber: abhaNumber,
                    gender: gender,
                    dob: dob,
                    mobile: mobile,
                    photoBase64: photoBase64,
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          "Failed to download image: ${snapshot.error.toString().replaceFirst(RegExp(r'^Exception:\s*'), '')}",
                          style: const TextStyle(
                            color: Colors.red,
                            fontSize: 12,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton(
                        onPressed: _reloadPhrCard,
                        child: const Text("Retry Fetch"),
                      ),
                    ],
                  ),
                ],
              );
            }

            final payload = snapshot.data ?? const <String, dynamic>{};
            final contentType = (payload['contentType']?.toString() ?? '')
                .toLowerCase();
            final encoded = payload['data']?.toString() ?? '';

            if (encoded.isEmpty) {
              return VirtualAbhaCard(
                name: fullName,
                abhaAddress: abhaAddress,
                abhaNumber: abhaNumber,
                gender: gender,
                dob: dob,
                mobile: mobile,
                photoBase64: photoBase64,
              );
            }

            final bytes = base64Decode(encoded);
            if (_isImageContentType(contentType)) {
              return ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: Container(
                  width: double.infinity,
                  color: const Color(0xFFFAFAFA),
                  child: Image.memory(
                    bytes,
                    fit: BoxFit.contain,
                    errorBuilder: (context, error, stackTrace) =>
                        VirtualAbhaCard(
                          name: fullName,
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
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                VirtualAbhaCard(
                  name: fullName,
                  abhaAddress: abhaAddress,
                  abhaNumber: abhaNumber,
                  gender: gender,
                  dob: dob,
                  mobile: mobile,
                  photoBase64: photoBase64,
                ),
                const SizedBox(height: 12),
                _binaryCardSummary(
                  contentType: contentType.isEmpty ? "-" : contentType,
                  bytes: bytes,
                ),
              ],
            );
          },
        ),
      ],
    );
  }

  Widget _binaryCardSummary({
    required String contentType,
    required Uint8List bytes,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFAFAFA),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE3F2FD)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _infoRow("Format", contentType),
          _infoRow("Size", "${bytes.lengthInBytes} bytes"),
          _infoRow(
            "Preview",
            "Full in-app preview is available when ABDM returns PNG or JPG.",
          ),
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }



  Future<void> _downloadAbhaCard(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _downloadingCard = true);

    try {
      Map<String, dynamic> payload;
      final source = widget.selectedUser?['source']?.toString().trim() ?? '';
      final shouldPreferAccountCard =
          source == 'abdm-enrollment-profile-details' ||
          source == 'abdm-existing-account';
      final sessionToken =
          [widget.selectedUser?['sessionToken'], widget.selectedUser?['token']]
              .map((value) => value?.toString().trim() ?? '')
              .firstWhere((value) => value.isNotEmpty, orElse: () => '');
      final refreshToken = [widget.selectedUser?['refreshToken']]
          .map((value) => value?.toString().trim() ?? '')
          .firstWhere((value) => value.isNotEmpty, orElse: () => '');

      if (shouldPreferAccountCard && sessionToken.isNotEmpty) {
        payload = await AbhaApiService.downloadProfileAccountCard(
          xToken: sessionToken,
          refreshToken: refreshToken.isEmpty ? null : refreshToken,
        );
      } else {
        try {
          payload = sessionToken.isNotEmpty
              ? await AbhaApiService.downloadPhrCardWithToken(
                  xToken: sessionToken,
                )
              : await AbhaApiService.downloadPhrCard();
        } catch (_) {
          if (sessionToken.isEmpty) rethrow;
          payload = await AbhaApiService.downloadProfileAccountCard(
            xToken: sessionToken,
            refreshToken: refreshToken.isEmpty ? null : refreshToken,
          );
        }
      }
      final contentType =
          (payload['contentType']?.toString() ?? 'application/octet-stream')
              .trim()
              .toLowerCase();
      final fileName = (payload['fileName']?.toString() ?? 'Abha_card').trim();
      final encoded = payload['data']?.toString() ?? '';

      if (encoded.isEmpty) {
        throw Exception("ABHA card response was empty");
      }

      if (widget.selectedUser != null) {
        widget.selectedUser!['cardPayload'] = payload;
        RegisteredUsersStore.upsert(widget.selectedUser!);
      }

      if (mounted) {
        setState(() {
          _phrCardFuture = Future.value(payload);
        });
      }

      final extension = _fileExtensionForContentType(contentType);
      final safeName = fileName.contains('.')
          ? fileName
          : '$fileName.$extension';
          
      final savedMessage = await saveAbhaCard(safeName, extension, encoded);

      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(content: Text(savedMessage)),
      );
    } catch (e) {
      if (!mounted) return;
      final errorMessage = AbhaApiService.userFacingError(e);
      messenger.showSnackBar(SnackBar(content: Text(errorMessage)));
    } finally {
      if (mounted) {
        setState(() => _downloadingCard = false);
      }
    }
  }

  Future<void> _showM2FormsDialog(
    BuildContext context,
    Map<String, dynamic> profile,
  ) async {
    String? selectedHiType;
    final selected = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('Select HI Type'),
              content: SizedBox(
                width: 520,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Health Information Type:',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      initialValue: selectedHiType,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        hintText: '-- Select HI Type --',
                      ),
                      items: _m2FormTypes
                          .map(
                            (type) => DropdownMenuItem<String>(
                              value: type,
                              child: Text(type),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        setDialogState(() => selectedHiType = value);
                      },
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(dialogContext),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  onPressed: selectedHiType == null
                      ? null
                      : () => Navigator.pop(dialogContext, selectedHiType),
                  child: const Text('Continue'),
                ),
              ],
            );
          },
        );
      },
    );

    if (!context.mounted || selected == null) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) =>
            HiRecordCreationScreen(hiType: selected, patientProfile: profile),
      ),
    );
  }

  String _fileExtensionForContentType(String contentType) {
    if (contentType.contains('pdf')) return 'pdf';
    if (contentType.contains('png')) return 'png';
    if (contentType.contains('jpeg') || contentType.contains('jpg')) {
      return 'jpg';
    }
    if (contentType.contains('json')) return 'json';
    return 'bin';
  }

  bool _isImageContentType(String contentType) {
    return contentType.contains('png') ||
        contentType.contains('jpeg') ||
        contentType.contains('jpg');
  }

  String _maskMobile(String value) {
    if (value.contains('*')) {
      return value;
    }

    final digits = value.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 4) {
      return value;
    }
    return '******${digits.substring(digits.length - 4)}';
  }

  String _maskAbhaNumber(String value) {
    if (value.contains('*') || value.toUpperCase().contains('X')) {
      return value;
    }

    final digits = value.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 4) {
      return value;
    }
    return 'XXXX-XXXX-${digits.substring(digits.length - 4)}';
  }
}
