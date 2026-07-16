import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/abha_api_service.dart';
import '../utils/api_config.dart';
import '../utils/app_runtime_store.dart';
import '../utils/registered_users_store.dart';
import '../widgets/abha_card_preview_dialog.dart';
import '../widgets/desktop_workspace.dart';

class CreateAbhaAddressScreen extends StatefulWidget {
  const CreateAbhaAddressScreen({
    super.key,
    required this.txnId,
    this.existingUserForComparison,
  });

  final String txnId;
  final Map<String, dynamic>? existingUserForComparison;

  @override
  State<CreateAbhaAddressScreen> createState() =>
      _CreateAbhaAddressScreenState();
}

class _CreateAbhaAddressScreenState extends State<CreateAbhaAddressScreen> {
  final TextEditingController _controller = TextEditingController();
  bool? isAvailable;
  bool loading = false;
  bool loadingSuggestions = false;
  List<String> suggestions = const [];
  late String _activeTxnId;
  Timer? _availabilityDebounce;

  String get phrAddress => ApiConfig.fullAbhaAddress(_controller.text);
  String get _localPart => _controller.text.trim().toLowerCase();
  bool get _isLocalPartValid => _isValidLocalPart(_localPart);
  bool get _canCreate => !loading && isAvailable == true && _isLocalPartValid;

  @override
  void initState() {
    super.initState();
    _activeTxnId = widget.txnId;
    _loadSuggestions();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Step 2: Create ABHA Address")),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final desktop = constraints.maxWidth >= 980;

          final formCard = DesktopSurface(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    "Choose your ABHA Address",
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _controller,
                    textInputAction: TextInputAction.done,
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(
                        RegExp(r'[A-Za-z0-9._]'),
                      ),
                      LengthLimitingTextInputFormatter(18),
                    ],
                    decoration: InputDecoration(
                      labelText: "ABHA Address",
                      suffixText: "@${ApiConfig.abhaAddressDomain}",
                    ),
                    onChanged: (_) => _scheduleAvailabilityCheck(),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    "Length must be between 8 and 18 characters,",
                    style: TextStyle(fontSize: 12, color: Colors.black54),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    "At most one (.) and one (_) is allowed,",
                    style: TextStyle(fontSize: 12, color: Colors.black54),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    "Only alphanumeric allowed,",
                    style: TextStyle(fontSize: 12, color: Colors.black54),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    "No special character at the beginning or end.",
                    style: TextStyle(fontSize: 12, color: Colors.black54),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _localPart.isEmpty
                        ? "Full address will be created as username@${ApiConfig.abhaAddressDomain}"
                        : "Full address: ${ApiConfig.fullAbhaAddress(_localPart)}",
                    style: const TextStyle(fontSize: 12, color: Colors.black87),
                  ),
                  const SizedBox(height: 12),
                  if (isAvailable != null)
                    Text(
                      isAvailable!
                          ? "Address is available"
                          : "Address is not available",
                      style: TextStyle(
                        color: isAvailable! ? Colors.green : Colors.red,
                      ),
                    ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      onPressed: _canCreate ? _createAddress : null,
                      child: loading
                          ? const CircularProgressIndicator(color: Colors.white)
                          : const Text("Create ABHA Address"),
                    ),
                  ),
                ],
              ),
            ),
          );

          final suggestionsCard = DesktopSurface(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    "Suggested ABHA Addresses",
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 10),
                  if (loadingSuggestions)
                    const CircularProgressIndicator()
                  else if (suggestions.isEmpty)
                    const Text(
                      "No suggestions available right now.",
                      style: TextStyle(color: Colors.black54),
                    )
                  else
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: suggestions.take(8).map((suggestion) {
                        return ActionChip(
                          label: Text(
                            "$suggestion@${ApiConfig.abhaAddressDomain}",
                          ),
                          onPressed: () {
                            _controller.text = suggestion;
                            _checkAvailability();
                          },
                        );
                      }).toList(),
                    ),
                ],
              ),
            ),
          );

          return Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1180),
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const DesktopPageIntro(
                      eyebrow: "PHR Address",
                      title:
                          "Choose an ABHA address with better desktop guidance.",
                      description:
                          "Suggestions, availability, and the final full address stay visible together so the PHR setup step is easier to complete on larger screens.",
                      pills: ["Suggestions", "Availability", "PHR setup"],
                    ),
                    if (desktop)
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(flex: 3, child: formCard),
                          const SizedBox(width: 16),
                          Expanded(flex: 2, child: suggestionsCard),
                        ],
                      )
                    else ...[
                      formCard,
                      const SizedBox(height: 12),
                      suggestionsCard,
                    ],
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _checkAvailability() async {
    final localPart = _localPart;
    if (localPart.isEmpty) {
      if (!mounted) return;
      setState(() => isAvailable = null);
      return;
    }

    if (!_isValidLocalPart(localPart)) {
      if (!mounted) return;
      setState(() => isAvailable = false);
      return;
    }

    try {
      final available = await AbhaApiService.checkPhrAvailability(
        ApiConfig.fullAbhaAddress(localPart),
      );

      if (!mounted) return;
      setState(() {
        isAvailable = available;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => isAvailable = null);
    }
  }

  Future<void> _loadSuggestions() async {
    if (_activeTxnId.isEmpty) return;

    setState(() => loadingSuggestions = true);
    try {
      final payload = await AbhaApiService.getPhrSuggestionsPayload(
        _activeTxnId,
      );
      final list =
          ((payload['AbhaAddressList'] ?? payload['abhaAddressList'])
                      as List? ??
                  const [])
              .map((item) => item.toString())
              .toList();
      final nextTxnId = payload['txnId']?.toString().trim() ?? '';
      if (!mounted) return;
      setState(() {
        suggestions = list;
        if (nextTxnId.isNotEmpty) {
          _activeTxnId = nextTxnId;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        suggestions = const [];
      });
    } finally {
      if (mounted) {
        setState(() => loadingSuggestions = false);
      }
    }
  }

  bool _isValidLocalPart(String value) {
    return RegExp(
      r'^(?=.{8,18}$)(?=.*[A-Za-z0-9])[A-Za-z0-9](?:[A-Za-z0-9._]*[A-Za-z0-9])?$',
    ).hasMatch(value);
  }

  Future<void> _createAddress() async {
    try {
      if (_activeTxnId.isEmpty) {
        throw Exception(
          "Missing enrollment transaction ID for ABHA address creation",
        );
      }
      if (!_isValidLocalPart(_controller.text.trim())) {
        throw Exception("Please enter a valid ABHA address as per ABDM rules");
      }

      setState(() => loading = true);

      await AbhaApiService.linkPhrAddress(
        phrAddress: phrAddress,
        txnId: _activeTxnId,
      );

      final newRecord = _buildRegisteredUserPayload(phrAddress);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("ABHA Address created successfully")),
      );
      if (widget.existingUserForComparison != null) {
        final existingUser = _resolveExistingUserForComparison(newRecord);
        final normalizedNewRecord = await _refreshUpdatedRecordForCardPreview(
          newRecord,
        );

        final reviewedUpdatedDetails = await _showUpdatedDetailsReviewDialog(
          updatedRecord: normalizedNewRecord,
        );
        if (reviewedUpdatedDetails == true) {
          final comparisonChoice = await _showUpdatedComparisonDialog(
            existingUser: existingUser,
            updatedRecord: normalizedNewRecord,
          );
          if (comparisonChoice == 'updated') {
            RegisteredUsersStore.upsert(normalizedNewRecord);
          } else if (comparisonChoice == 'old') {
            RegisteredUsersStore.upsert(existingUser);
          } else {
            return;
          }
          if (!mounted) return;
          Navigator.of(context).popUntil((route) => route.isFirst);
          return;
        }
        return;
      }

      Navigator.of(context).popUntil((route) => route.isFirst);
    } catch (e) {
      if (mounted) {
        setState(() => loading = false);
      }
      if (!mounted) return;
      _showError(e.toString());
    } finally {
      if (mounted) {
        setState(() => loading = false);
      }
    }
  }

  Map<String, dynamic> _resolveExistingUserForComparison(
    Map<String, dynamic> newRecord,
  ) {
    final registeredUser = RegisteredUsersStore.findExistingUser(newRecord);
    if (registeredUser != null) {
      return registeredUser;
    }

    return widget.existingUserForComparison!;
  }

  Future<Map<String, dynamic>> _refreshUpdatedRecordForCardPreview(
    Map<String, dynamic> updatedRecord,
  ) async {
    final sessionToken = _firstNonEmpty([
      updatedRecord['sessionToken'],
      AppRuntimeStore.getValue<String>('Abha.profile.account.sessionToken') ??
          '',
      AppRuntimeStore.getValue<String>('Abha.enrollment.xToken') ?? '',
    ]);
    final refreshToken = _firstNonEmpty([
      updatedRecord['refreshToken'],
      AppRuntimeStore.getValue<String>('Abha.profile.account.refreshToken') ??
          '',
      AppRuntimeStore.getValue<String>('Abha.enrollment.refreshToken') ?? '',
    ]);

    final baseRecord = {
      ...updatedRecord,
      // Force the preview flow to fetch a fresh card instead of reusing
      // the previous account card payload from the earlier ABHA session.
      'cardPayload': const <String, dynamic>{},
    };

    if (sessionToken.isEmpty && refreshToken.isEmpty) {
      return baseRecord;
    }

    try {
      final refreshedProfile =
          await AbhaApiService.fetchEnrollmentProfileDetails(
            xToken: sessionToken,
            refreshToken: refreshToken.isEmpty ? null : refreshToken,
          );
      final refreshedSessionToken = _firstNonEmpty([
        refreshedProfile['sessionToken'],
        sessionToken,
      ]);
      final refreshedRefreshToken = _firstNonEmpty([
        refreshedProfile['refreshToken'],
        refreshToken,
      ]);

      Map<String, dynamic> refreshedCardPayload = const <String, dynamic>{};
      if (refreshedSessionToken.isNotEmpty) {
        try {
          refreshedCardPayload =
              await AbhaApiService.downloadProfileAccountCard(
                xToken: refreshedSessionToken,
                refreshToken: refreshedRefreshToken.isEmpty
                    ? null
                    : refreshedRefreshToken,
              );
        } catch (_) {
          refreshedCardPayload = const <String, dynamic>{};
        }
      }

      return {
        ...baseRecord,
        'name': _firstNonEmpty([
          refreshedProfile['name'],
          refreshedProfile['fullName'],
          baseRecord['name'],
        ]),
        'AbhaAddress': _firstNonEmpty([
          refreshedProfile['AbhaAddress'],
          refreshedProfile['preferredAbhaAddress'],
          baseRecord['AbhaAddress'],
        ]),
        'AbhaNumber': _firstNonEmpty([
          refreshedProfile['AbhaNumber'],
          baseRecord['AbhaNumber'],
        ]),
        'mobile': _firstNonEmpty([
          refreshedProfile['mobile'],
          baseRecord['mobile'],
        ]),
        'gender': _firstNonEmpty([
          refreshedProfile['gender'],
          baseRecord['gender'],
        ]),
        'dob': _firstNonEmpty([
          refreshedProfile['dob'],
          refreshedProfile['dateOfBirth'],
          baseRecord['dob'],
        ]),
        'address': _firstNonEmpty([
          refreshedProfile['address'],
          baseRecord['address'],
        ]),
        'pincode': _firstNonEmpty([
          refreshedProfile['pincode'],
          refreshedProfile['pinCode'],
          baseRecord['pincode'],
        ]),
        'district': _firstNonEmpty([
          refreshedProfile['district'],
          baseRecord['district'],
        ]),
        'state': _firstNonEmpty([
          refreshedProfile['state'],
          baseRecord['state'],
        ]),
        'imageBase64': _firstNonEmpty([
          refreshedProfile['photo'],
          refreshedProfile['imageBase64'],
          baseRecord['imageBase64'],
        ]),
        'sessionToken': _firstNonEmpty([
          refreshedCardPayload['sessionToken'],
          refreshedSessionToken,
          baseRecord['sessionToken'],
        ]),
        'refreshToken': refreshedRefreshToken,
        'cardPayload': refreshedCardPayload,
        'rawProfile': refreshedProfile,
      };
    } catch (_) {
      return baseRecord;
    }
  }

  Map<String, dynamic> _buildRegisteredUserPayload(String createdPhrAddress) {
    final linkResponse =
        AppRuntimeStore.getApiResponse('Abha.linkPhrAddress') is Map
        ? Map<String, dynamic>.from(
            AppRuntimeStore.getApiResponse('Abha.linkPhrAddress') as Map,
          )
        : const <String, dynamic>{};
    final linkTokens = linkResponse['tokens'] is Map
        ? Map<String, dynamic>.from(linkResponse['tokens'] as Map)
        : const <String, dynamic>{};
    final linkAbhaProfile = linkResponse['ABHAProfile'] is Map
        ? Map<String, dynamic>.from(linkResponse['ABHAProfile'] as Map)
        : const <String, dynamic>{};
    final abhaProfile =
        AppRuntimeStore.getValue<Map<String, dynamic>>('Abha.profile') ??
        const <String, dynamic>{};
    final phrProfile =
        AppRuntimeStore.getValue<Map<String, dynamic>>('phr.profile') ??
        const <String, dynamic>{};
    final cardPayload =
        AppRuntimeStore.getValue<Map<String, dynamic>>('phr.card') ??
        const <String, dynamic>{};

    final linkFirstName = _firstNonEmpty([linkAbhaProfile['firstName']]);
    final linkMiddleName = _firstNonEmpty([linkAbhaProfile['middleName']]);
    final linkLastName = _firstNonEmpty([linkAbhaProfile['lastName']]);
    final linkCombinedName = _firstNonEmpty([
      [
        linkFirstName,
        linkMiddleName,
        linkLastName,
      ].where((part) => part.trim().isNotEmpty).join(' '),
    ]);
    final linkDob = _firstNonEmpty([linkAbhaProfile['dob']]);
    final linkGender = _firstNonEmpty([linkAbhaProfile['gender']]);
    final linkPhoto = _firstNonEmpty([linkAbhaProfile['photo']]);
    final linkMobile = _firstNonEmpty([linkAbhaProfile['mobile']]);
    final linkPhrAddressList = linkAbhaProfile['phrAddress'] is List
        ? List<String>.from(
            (linkAbhaProfile['phrAddress'] as List)
                .map((item) => item?.toString().trim() ?? '')
                .where((item) => item.isNotEmpty),
          )
        : const <String>[];
    final linkPhrAddress = _firstNonEmpty([
      linkPhrAddressList.isNotEmpty ? linkPhrAddressList.first : '',
      createdPhrAddress,
    ]);
    final linkAddress = _firstNonEmpty([linkAbhaProfile['address']]);
    final linkDistrictCode = _firstNonEmpty([linkAbhaProfile['districtCode']]);
    final linkStateCode = _firstNonEmpty([linkAbhaProfile['stateCode']]);
    final linkPinCode = _firstNonEmpty([linkAbhaProfile['pinCode']]);
    final linkAbhaType = _firstNonEmpty([linkAbhaProfile['abhaType']]);
    final linkStateName = _firstNonEmpty([linkAbhaProfile['stateName']]);
    final linkDistrictName = _firstNonEmpty([linkAbhaProfile['districtName']]);
    final linkAbhaNumber = _firstNonEmpty([linkAbhaProfile['ABHANumber']]);
    final linkAbhaStatus = _firstNonEmpty([linkAbhaProfile['abhaStatus']]);
    final linkToken = _firstNonEmpty([linkTokens['token']]);
    final linkExpiresIn = _firstNonEmpty([linkTokens['expiresIn']]);
    final linkRefreshToken = _firstNonEmpty([linkTokens['refreshToken']]);
    final linkRefreshExpiresIn = _firstNonEmpty([
      linkTokens['refreshExpiresIn'],
    ]);

    final name = _firstNonEmpty([
      linkCombinedName,
      linkAbhaProfile['name'],
      _composeName(abhaProfile),
      phrProfile['name'],
      phrProfile['fullName'],
    ]);
    if (name.isEmpty) throw Exception("Transaction Failed: Patient name is missing from live ABDM response.");
    
    final abhaAddress = _firstNonEmpty([linkPhrAddress, createdPhrAddress]);
    if (abhaAddress.isEmpty) throw Exception("Transaction Failed: ABHA Address missing from live ABDM response.");
    
    final abhaNumber = _firstNonEmpty([
      linkAbhaNumber,
      abhaProfile['AbhaNumber'],
      abhaProfile['ABHANumber'],
      phrProfile['AbhaNumber'],
      phrProfile['ABHANumber'],
    ]);
    
    final mobile = _firstNonEmpty([
      linkMobile,
      phrProfile['mobile'],
      abhaProfile['mobile'],
      abhaProfile['mob'],
    ]);
    
    final dob = _firstNonEmpty([
      linkDob,
      phrProfile['dob'],
      phrProfile['dateOfBirth'],
      abhaProfile['dob'],
      abhaProfile['dateOfBirth'],
      abhaProfile['yearOfBirth'],
      abhaProfile['yob'],
    ]);
    
    final gender = _displayGender(_firstNonEmpty([linkGender, phrProfile['gender'], abhaProfile['gender']]));
    
    final address = _firstNonEmpty([linkAddress, phrProfile['address'], abhaProfile['address'], (abhaProfile['addr'] is Map) ? (Map<String, dynamic>.from(abhaProfile['addr'])['full']) : null]);
    final pincode = _firstNonEmpty([linkPinCode, phrProfile['pincode'], phrProfile['pinCode'], abhaProfile['pincode'], abhaProfile['pinCode'], (abhaProfile['addr'] is Map) ? (Map<String, dynamic>.from(abhaProfile['addr'])['pincode']) : null]);
    final district = _firstNonEmpty([linkDistrictName, phrProfile['district'], phrProfile['districtName'], abhaProfile['district'], abhaProfile['districtName'], (abhaProfile['addr'] is Map) ? (Map<String, dynamic>.from(abhaProfile['addr'])['district']) : null]);
    final state = _firstNonEmpty([linkStateName, phrProfile['state'], phrProfile['stateName'], abhaProfile['state'], abhaProfile['stateName'], (abhaProfile['addr'] is Map) ? (Map<String, dynamic>.from(abhaProfile['addr'])['state']) : null]);
    final imageBase64 = _firstNonEmpty([linkPhoto, phrProfile['photo'], abhaProfile['photo'], abhaProfile['kycPhoto']]);
    final uhid = _firstNonEmpty([abhaProfile['uhid'], abhaProfile['healthId'], abhaProfile['healthIdNumber'], phrProfile['uhid']]);


    final sessionToken = _firstNonEmpty([
      linkToken,
      AppRuntimeStore.getValue<String>('Abha.create.enrollment.xToken') ?? '',
      AppRuntimeStore.getValue<String>('Abha.enrollment.xToken') ?? '',
    ]);
    final refreshToken = _firstNonEmpty([
      linkRefreshToken,
      AppRuntimeStore.getValue<String>('Abha.create.enrollment.refreshToken') ??
          '',
      AppRuntimeStore.getValue<String>('Abha.enrollment.refreshToken') ?? '',
    ]);
    final rawProfile = linkAbhaProfile.isNotEmpty
        ? <String, dynamic>{
            ...linkAbhaProfile,
            'districtCode': linkDistrictCode,
            'stateCode': linkStateCode,
            'pinCode': linkPinCode,
            'abhaType': linkAbhaType,
            'abhaStatus': linkAbhaStatus,
            'expiresIn': linkExpiresIn,
            'refreshExpiresIn': linkRefreshExpiresIn,
          }
        : (abhaProfile.isNotEmpty ? abhaProfile : phrProfile);

    return {
      'name': name,
      'AbhaAddress': abhaAddress,
      'AbhaNumber': abhaNumber,
      'uhid': uhid,
      'mobile': mobile,
      'gender': gender,
      'dob': dob,
      'address': address,
      'pincode': pincode,
      'district': district,
      'state': state,
      'imageBase64': imageBase64,
      'cardPayload': cardPayload,
      'rawProfile': rawProfile,
      'sessionToken': sessionToken,
      'refreshToken': refreshToken,
      'registeredAt': DateTime.now().toIso8601String(),
    };
  }

  Future<bool?> _showUpdatedDetailsReviewDialog({
    required Map<String, dynamic> updatedRecord,
  }) async {
    return showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        final screenSize = MediaQuery.of(dialogContext).size;
        return Dialog(
          insetPadding: const EdgeInsets.all(24),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(28),
          ),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: 1220,
              maxHeight: screenSize.height * 0.88,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.max,
              children: [
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.fromLTRB(28, 26, 20, 24),
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
                      topLeft: Radius.circular(28),
                      topRight: Radius.circular(28),
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 7,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(0xFFEAF6FF),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                  color: const Color(0xFFB8D8F2),
                                ),
                              ),
                              child: const Text(
                                'Updated ABHA Details',
                                style: TextStyle(
                                  color: Color(0xFF1B5E8C),
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.2,
                                ),
                              ),
                            ),
                            const SizedBox(height: 18),
                            const Text(
                              'The ABHA card has been updated',
                              style: TextStyle(
                                color: Color(0xFF17324A),
                                fontSize: 24,
                                fontWeight: FontWeight.w900,
                                height: 1.15,
                              ),
                            ),
                            const SizedBox(height: 10),
                            const Text(
                              'Review the updated ABDM details below. The new ABHA address was created successfully, and you can open the updated ABHA card or continue with the updated record.',
                              style: TextStyle(
                                color: Color(0xFF5A6F82),
                                fontSize: 15,
                                height: 1.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: 'Close review',
                        onPressed: () => Navigator.pop(dialogContext, false),
                        icon: const Icon(Icons.close, size: 30),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(24, 22, 24, 20),
                    child: Column(
                      children: [
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF8FCFF),
                            borderRadius: BorderRadius.circular(24),
                            border: Border.all(color: const Color(0xFFD8E8F4)),
                          ),
                          child: LayoutBuilder(
                            builder: (context, constraints) {
                              final stacked = constraints.maxWidth < 860;
                              final updatedName = _firstNonEmpty([
                                updatedRecord['name'],
                                'Updated Patient',
                              ]);
                              final updatedDob = _firstNonEmpty([
                                updatedRecord['dob'],
                                '-',
                              ]);
                              final updatedGender = _firstNonEmpty([
                                updatedRecord['gender'],
                                '-',
                              ]);
                              final updatedAbhaNumber = _firstNonEmpty([
                                updatedRecord['AbhaNumber'],
                                '-',
                              ]);
                              final updatedAbhaAddress = _firstNonEmpty([
                                updatedRecord['AbhaAddress'],
                                '-',
                              ]);
                              final updatedMobile = _firstNonEmpty([
                                updatedRecord['mobile'],
                                '-',
                              ]);
                              final updatedPincode = _firstNonEmpty([
                                updatedRecord['pincode'],
                                '-',
                              ]);
                              final updatedDistrict = _firstNonEmpty([
                                updatedRecord['district'],
                                '-',
                              ]);
                              final updatedState = _firstNonEmpty([
                                updatedRecord['state'],
                                '-',
                              ]);
                              final updatedAddress = _firstNonEmpty([
                                updatedRecord['address'],
                                '-',
                              ]);

                              final heroCard = Container(
                                width: stacked ? double.infinity : 250,
                                padding: const EdgeInsets.all(20),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(24),
                                  border: Border.all(
                                    color: const Color(0xFFD7E4F0),
                                  ),
                                  boxShadow: const [
                                    BoxShadow(
                                      color: Color(0x080E2233),
                                      blurRadius: 10,
                                      offset: Offset(0, 4),
                                    ),
                                  ],
                                ),
                                child: Column(
                                  children: [
                                    _updatedProfileAvatar(updatedRecord),
                                    const SizedBox(height: 16),
                                    Text(
                                      updatedName,
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(
                                        color: Color(0xFF17324A),
                                        fontSize: 20,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ],
                                ),
                              );

                              final detailsGrid = Wrap(
                                spacing: 16,
                                runSpacing: 16,
                                children: [
                                  _detailColumn(
                                    label: 'Name',
                                    value: updatedName,
                                  ),
                                  _detailColumn(
                                    label: 'DOB',
                                    value: updatedDob,
                                  ),
                                  _detailColumn(
                                    label: 'Gender',
                                    value: updatedGender,
                                  ),
                                  _detailColumn(
                                    label: 'ABHA Number',
                                    value: updatedAbhaNumber,
                                  ),
                                  _detailColumn(
                                    label: 'ABHA Address',
                                    value: updatedAbhaAddress,
                                  ),
                                  _detailColumn(
                                    label: 'Phone Number',
                                    value: updatedMobile,
                                  ),
                                  _detailColumn(
                                    label: 'Pincode',
                                    value: updatedPincode,
                                  ),
                                  _detailColumn(
                                    label: 'District',
                                    value: updatedDistrict,
                                  ),
                                  _detailColumn(
                                    label: 'State',
                                    value: updatedState,
                                  ),
                                  _detailColumn(
                                    label: 'Address',
                                    value: updatedAddress,
                                    wide: true,
                                  ),
                                ],
                              );

                              if (stacked) {
                                return Column(
                                  children: [
                                    heroCard,
                                    const SizedBox(height: 18),
                                    detailsGrid,
                                  ],
                                );
                              }

                              return Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  heroCard,
                                  const SizedBox(width: 20),
                                  Expanded(child: detailsGrid),
                                ],
                              );
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
                  decoration: const BoxDecoration(
                    color: Color(0xFFFBFDFF),
                    border: Border(top: BorderSide(color: Color(0xFFE1E9F0))),
                    borderRadius: BorderRadius.only(
                      bottomLeft: Radius.circular(28),
                      bottomRight: Radius.circular(28),
                    ),
                  ),
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final stacked = constraints.maxWidth < 860;
                      final backButton = SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(dialogContext, false),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFF62748A),
                            side: const BorderSide(color: Color(0xFFD2DCE7)),
                            padding: const EdgeInsets.symmetric(vertical: 18),
                          ),
                          child: const Text('Back'),
                        ),
                      );
                      final viewCardButton = SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: () async {
                            await showEnrollmentAccountAbhaCardPreviewDialog(
                              dialogContext,
                              cardPayload:
                                  updatedRecord['cardPayload']
                                      is Map<String, dynamic>
                                  ? Map<String, dynamic>.from(
                                      updatedRecord['cardPayload'],
                                    )
                                  : null,
                              userSession: updatedRecord,
                              onCardPayloadLoaded: (payload) {
                                updatedRecord['cardPayload'] = payload;
                              },
                              unavailableMessage:
                                  'ABHA card is not available for this updated profile in the current app session.',
                            );
                          },
                          icon: const Icon(Icons.badge_outlined),
                          label: const Text('View ABHA Card'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFF2F8F5B),
                            side: const BorderSide(color: Color(0xFFAEDFC0)),
                            padding: const EdgeInsets.symmetric(vertical: 18),
                          ),
                        ),
                      );
                      final continueButton = SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: () => Navigator.pop(dialogContext, true),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF1B5E8C),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 18),
                          ),
                          child: const Text('Continue'),
                        ),
                      );

                      if (stacked) {
                        return Column(
                          children: [
                            backButton,
                            const SizedBox(height: 12),
                            viewCardButton,
                            const SizedBox(height: 12),
                            continueButton,
                          ],
                        );
                      }

                      return Row(
                        children: [
                          Expanded(child: backButton),
                          const SizedBox(width: 14),
                          Expanded(child: viewCardButton),
                          const SizedBox(width: 14),
                          Expanded(child: continueButton),
                        ],
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<String?> _showUpdatedComparisonDialog({
    required Map<String, dynamic> existingUser,
    required Map<String, dynamic> updatedRecord,
  }) async {
    final comparisonFields = <Map<String, String>>[
      {
        'label': 'Name',
        'old': _firstNonEmpty([existingUser['name'], '-']),
        'updated': _firstNonEmpty([updatedRecord['name'], '-']),
      },
      {
        'label': 'ABHA Number',
        'old': _firstNonEmpty([existingUser['AbhaNumber'], '-']),
        'updated': _firstNonEmpty([updatedRecord['AbhaNumber'], '-']),
      },
      {
        'label': 'ABHA Address',
        'old': _firstNonEmpty([existingUser['AbhaAddress'], '-']),
        'updated': _firstNonEmpty([updatedRecord['AbhaAddress'], '-']),
      },
      {
        'label': 'Gender',
        'old': _firstNonEmpty([existingUser['gender'], '-']),
        'updated': _firstNonEmpty([updatedRecord['gender'], '-']),
      },
      {
        'label': 'Mobile',
        'old': _firstNonEmpty([existingUser['mobile'], '-']),
        'updated': _firstNonEmpty([updatedRecord['mobile'], '-']),
      },
      {
        'label': 'DOB',
        'old': _firstNonEmpty([existingUser['dob'], '-']),
        'updated': _firstNonEmpty([updatedRecord['dob'], '-']),
      },
      {
        'label': 'Address',
        'old': _firstNonEmpty([existingUser['address'], '-']),
        'updated': _firstNonEmpty([updatedRecord['address'], '-']),
      },
      {
        'label': 'District',
        'old': _firstNonEmpty([existingUser['district'], '-']),
        'updated': _firstNonEmpty([updatedRecord['district'], '-']),
      },
      {
        'label': 'State',
        'old': _firstNonEmpty([existingUser['state'], '-']),
        'updated': _firstNonEmpty([updatedRecord['state'], '-']),
      },
      {
        'label': 'Pincode',
        'old': _firstNonEmpty([existingUser['pincode'], '-']),
        'updated': _firstNonEmpty([updatedRecord['pincode'], '-']),
      },
    ];

    return showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        final screenSize = MediaQuery.of(dialogContext).size;
        final oldName = _firstNonEmpty([
          existingUser['name'],
          'Existing Patient',
        ]);
        final updatedName = _firstNonEmpty([
          updatedRecord['name'],
          'Updated Patient',
        ]);
        final oldImageBytes = _tryDecodeImage(
          _firstNonEmpty([
            existingUser['imageBase64'],
            existingUser['photo'],
            existingUser['profilePhoto'],
          ]),
        );
        final updatedImageBytes = _tryDecodeImage(
          _firstNonEmpty([
            updatedRecord['imageBase64'],
            updatedRecord['photo'],
            updatedRecord['profilePhoto'],
          ]),
        );

        Widget comparisonPanel({
          required String title,
          required Color accent,
          required Color background,
          required Uint8List? imageBytes,
          required String name,
          required bool isUpdated,
        }) {
          return Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: background,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: accent.withValues(alpha: 0.28)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                          color: accent.withValues(alpha: 0.28),
                        ),
                      ),
                      child: Text(
                        title,
                        style: TextStyle(
                          color: accent,
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.2,
                        ),
                      ),
                    ),
                    if (isUpdated) ...[
                      const SizedBox(width: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFE8F7EE),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: const Text(
                          'Changed fields highlighted',
                          style: TextStyle(
                            color: Color(0xFF2F8F5B),
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    CircleAvatar(
                      radius: 34,
                      backgroundColor: Colors.white,
                      backgroundImage: imageBytes != null
                          ? MemoryImage(imageBytes)
                          : null,
                      child: imageBytes == null
                          ? Icon(Icons.person, size: 28, color: accent)
                          : null,
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Text(
                        name,
                        style: const TextStyle(
                          color: Color(0xFF17324A),
                          fontSize: 24,
                          fontWeight: FontWeight.w800,
                          height: 1.15,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                ...comparisonFields.map((field) {
                  final oldValue = field['old']!;
                  final updatedValue = field['updated']!;
                  final value = isUpdated ? updatedValue : oldValue;
                  final changed =
                      oldValue.trim().toLowerCase() !=
                      updatedValue.trim().toLowerCase();
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: isUpdated && changed
                            ? const Color(0xFFEAF6FF)
                            : Colors.white,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(
                          color: isUpdated && changed
                              ? const Color(0xFF9ED0F3)
                              : const Color(0xFFD8E3EE),
                          width: isUpdated && changed ? 1.4 : 1,
                        ),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x080E2233),
                            blurRadius: 8,
                            offset: Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                field['label']!,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xFF657A8E),
                                  letterSpacing: 0.2,
                                ),
                              ),
                              if (isUpdated && changed) ...[
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 3,
                                  ),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFDFF2E7),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: const Text(
                                    'Updated',
                                    style: TextStyle(
                                      color: Color(0xFF2F8F5B),
                                      fontSize: 10,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                          const SizedBox(height: 10),
                          Text(
                            value.isEmpty ? '-' : value,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF1F3650),
                              height: 1.45,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }),
              ],
            ),
          );
        }

        return Dialog(
          insetPadding: const EdgeInsets.all(24),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(28),
          ),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: 1320,
              maxHeight: screenSize.height * 0.9,
            ),
            child: Column(
              children: [
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.fromLTRB(28, 26, 20, 24),
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
                      topLeft: Radius.circular(28),
                      topRight: Radius.circular(28),
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 7,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(0xFFEAF6FF),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                  color: const Color(0xFFB8D8F2),
                                ),
                              ),
                              child: const Text(
                                'ABHA Update Comparison',
                                style: TextStyle(
                                  color: Color(0xFF1B5E8C),
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.2,
                                ),
                              ),
                            ),
                            const SizedBox(height: 18),
                            const Text(
                              'Compare the old ABHA details with the updated details',
                              style: TextStyle(
                                color: Color(0xFF17324A),
                                fontSize: 24,
                                fontWeight: FontWeight.w900,
                                height: 1.15,
                              ),
                            ),
                            const SizedBox(height: 10),
                            const Text(
                              'Review both records below. Updated fields are highlighted so you can decide whether to keep the old details or use the updated details.',
                              style: TextStyle(
                                color: Color(0xFF5A6F82),
                                fontSize: 15,
                                height: 1.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: 'Close comparison',
                        onPressed: () => Navigator.pop(dialogContext),
                        icon: const Icon(Icons.close, size: 30),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(24, 22, 24, 20),
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        final stacked = constraints.maxWidth < 980;
                        final oldPanel = comparisonPanel(
                          title: 'Old Details',
                          accent: const Color(0xFF1B5E8C),
                          background: const Color(0xFFF7FBFF),
                          imageBytes: oldImageBytes,
                          name: oldName,
                          isUpdated: false,
                        );
                        final updatedPanel = comparisonPanel(
                          title: 'Updated Details',
                          accent: const Color(0xFF2F8F5B),
                          background: const Color(0xFFF4FBF7),
                          imageBytes: updatedImageBytes,
                          name: updatedName,
                          isUpdated: true,
                        );

                        if (stacked) {
                          return Column(
                            children: [
                              oldPanel,
                              const SizedBox(height: 18),
                              updatedPanel,
                            ],
                          );
                        }

                        return Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(child: oldPanel),
                            const SizedBox(width: 18),
                            Expanded(child: updatedPanel),
                          ],
                        );
                      },
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.fromLTRB(24, 18, 24, 22),
                  decoration: const BoxDecoration(
                    color: Color(0xFFFBFDFF),
                    border: Border(top: BorderSide(color: Color(0xFFE3EAF1))),
                    borderRadius: BorderRadius.only(
                      bottomLeft: Radius.circular(28),
                      bottomRight: Radius.circular(28),
                    ),
                  ),
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final stacked = constraints.maxWidth < 900;
                      final keepOldButton = SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(dialogContext, 'old'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFF62748A),
                            side: const BorderSide(color: Color(0xFFD2DCE7)),
                            padding: const EdgeInsets.symmetric(vertical: 18),
                          ),
                          child: const Text('Keep Old Details'),
                        ),
                      );
                      final useUpdatedButton = SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: () =>
                              Navigator.pop(dialogContext, 'updated'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF1B5E8C),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 18),
                          ),
                          child: const Text('Use Updated Details'),
                        ),
                      );
                      final backButton = SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(dialogContext),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFF2F8F5B),
                            side: const BorderSide(color: Color(0xFFAEDFC0)),
                            padding: const EdgeInsets.symmetric(vertical: 18),
                          ),
                          child: const Text('Back to Updated Details'),
                        ),
                      );

                      if (stacked) {
                        return Column(
                          children: [
                            backButton,
                            const SizedBox(height: 12),
                            keepOldButton,
                            const SizedBox(height: 12),
                            useUpdatedButton,
                          ],
                        );
                      }

                      return Row(
                        children: [
                          Expanded(child: backButton),
                          const SizedBox(width: 14),
                          Expanded(child: keepOldButton),
                          const SizedBox(width: 14),
                          Expanded(child: useUpdatedButton),
                        ],
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _updatedProfileAvatar(Map<String, dynamic> user) {
    final imageBase64 = _firstNonEmpty([
      user['imageBase64'],
      user['profilePhoto'],
      user['photo'],
      user['kycPhoto'],
    ]);
    final imageBytes = _tryDecodeImage(imageBase64);

    return CircleAvatar(
      radius: 54,
      backgroundColor: const Color(0xFFE6F1EC),
      backgroundImage: imageBytes != null ? MemoryImage(imageBytes) : null,
      child: imageBytes == null
          ? const Icon(Icons.person, size: 46, color: Color(0xFF2F8F5B))
          : null,
    );
  }

  Widget _detailColumn({
    required String label,
    required String value,
    bool wide = false,
  }) {
    return SizedBox(
      width: wide ? 520 : 250,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: const Color(0xFFD8E3EE)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x080E2233),
                  blurRadius: 8,
                  offset: Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF657A8E),
                    letterSpacing: 0.2,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  value.isEmpty ? '-' : value,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF1F3650),
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Uint8List? _tryDecodeImage(String value) {
    final trimmedValue = value.trim();
    if (trimmedValue.isEmpty) {
      return null;
    }

    try {
      return base64Decode(trimmedValue);
    } catch (_) {
      return null;
    }
  }

  String _composeName(Map<String, dynamic> profile) {
    final parts =
        [profile['firstName'], profile['middleName'], profile['lastName']]
            .map((value) => value?.toString().trim() ?? '')
            .where((value) => value.isNotEmpty)
            .toList(growable: false);
    if (parts.isNotEmpty) {
      return parts.join(' ');
    }
    return _firstNonEmpty([profile['name'], profile['fullName']]);
  }

  String _displayGender(String value) {
    switch (value.trim().toUpperCase()) {
      case 'M':
        return 'Male';
      case 'F':
        return 'Female';
      case 'O':
        return 'Other';
      default:
        return value.trim();
    }
  }

  String _firstNonEmpty(List<dynamic> values) {
    for (final value in values) {
      final text = value?.toString().trim() ?? '';
      if (text.isNotEmpty && text.toLowerCase() != 'null') {
        return text;
      }
    }
    return '';
  }

  void _scheduleAvailabilityCheck() {
    _availabilityDebounce?.cancel();
    setState(() {
      isAvailable = null;
    });
    _availabilityDebounce = Timer(const Duration(milliseconds: 350), () {
      _checkAvailability();
    });
  }

  void _showError(String message) {
    final cleaned = AbhaApiService.userFacingError(message);
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text("Error"),
        content: Text(cleaned.isEmpty ? message : cleaned),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text("OK"),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _availabilityDebounce?.cancel();
    _controller.dispose();
    super.dispose();
  }
}
