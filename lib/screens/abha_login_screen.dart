import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../config/hospital_config.dart';
import '../services/abha_api_service.dart';
import '../utils/aadhaar_text.dart';
import '../utils/api_config.dart';
import '../utils/app_runtime_store.dart';
import '../utils/auth_session.dart';
import '../utils/registered_users_store.dart';
import 'create_Abha_screen.dart';
import '../widgets/abha_card_preview_dialog.dart';
import '../widgets/desktop_workspace.dart';
import '../widgets/otp_digit_row.dart';
import '../widgets/scan_share_qr_dialog.dart';

class AbhaLoginScreen extends StatefulWidget {
  const AbhaLoginScreen({super.key, this.initialAbhaAddress});

  final String? initialAbhaAddress;

  @override
  State<AbhaLoginScreen> createState() => _AbhaLoginScreenState();
}

class _AbhaLoginScreenState extends State<AbhaLoginScreen> {
  static const int _resendCooldownSeconds = 60;
  static const String _mobilePreOtpErrorMessage =
      'No ABHA profile found associated with this mobile number';

  final _identifierCtrl = TextEditingController();
  late final List<TextEditingController> _otpDigitCtrls;
  late final List<FocusNode> _otpFocusNodes;

  String _identifierType = 'Abha_ADDRESS';
  String? _abhaNumberOtpMethod;
  bool _showAadhaarIdentifier = false;
  bool _updatingAadhaarIdentifierText = false;
  String _aadhaarIdentifierRaw = '';
  String? txnId;
  bool otpRequested = false;
  bool loading = false;
  bool _searchingMobileRecords = false;
  bool _searchingAbhaAddressAuthMethods = false;
  bool _preparingScanShare = false;
  String _otpSentMessage = '';
  List<Map<String, dynamic>> _mobileLinkedAccounts = const [];
  List<Map<String, dynamic>> _searchedMobileAccounts = const [];
  String? _selectedSearchedMobileAbhaNumber;
  String? _selectedMobileAbhaNumber;
  Map<String, dynamic> _abhaAddressSearchResult = const {};
  List<String> _abhaAddressAuthMethods = const [];
  String? _selectedAbhaAddressOtpMethod;
  bool _awaitingMobileRecordSelection = false;
  Map<String, dynamic> _mobileOtpVerifyResult = const {};
  int _resendCount = 0;
  int _resendSecondsRemaining = 0;
  Timer? _resendTimer;

  static const _verificationOptions = <_VerificationOption>[
    _VerificationOption(
      type: 'AADHAAR_NUMBER',
      label: 'Aadhaar Number',
      helper:
          'Use the Aadhaar-linked OTP flow from the ABDM profile login APIs.',
    ),
    _VerificationOption(
      type: 'MOBILE',
      label: 'Mobile Number',
      helper:
          'Use the mobile verification flow from the ABDM profile login APIs.',
    ),
    _VerificationOption(
      type: 'Abha_ADDRESS',
      label: 'ABHA Address',
      helper: 'Use the ABHA address login flow from the ABDM PHR web APIs.',
    ),
    _VerificationOption(
      type: 'Abha_NUMBER',
      label: 'ABHA Number',
      helper:
          'Use the ABHA number verification flow from the ABDM profile login APIs.',
    ),
  ];

  static const _abhaNumberOtpMethodOptions = <_OtpMethodOption>[
    _OtpMethodOption(
      value: 'AADHAAR_LINKED_MOBILE',
      label: 'Aadhaar Linked Mobile Number',
      helper:
          'Use the M1 ABHA-number flow with Aadhaar OTP on the Aadhaar-linked mobile number.',
    ),
    _OtpMethodOption(
      value: 'ABHA_LINKED_MOBILE',
      label: 'ABHA Linked Mobile Number',
      helper:
          'Use the M1 ABHA-number flow with ABHA OTP on the ABHA-linked mobile number.',
    ),
  ];

  static const _abhaAddressOtpMethodOptions = <_OtpMethodOption>[
    _OtpMethodOption(
      value: 'MOBILE_OTP',
      label: 'Mobile OTP',
      helper: 'Send OTP to the mobile number linked with this ABHA address.',
    ),
    _OtpMethodOption(
      value: 'AADHAAR_OTP',
      label: 'Aadhaar OTP',
      helper: 'Send OTP through the Aadhaar-linked authentication flow.',
    ),
  ];

  String get _rawInput => _identifierType == 'AADHAAR_NUMBER'
      ? _aadhaarIdentifierRaw
      : _identifierCtrl.text.trim();
  String get _addressLocalPart => _rawInput.toLowerCase();
  String get _resolvedAbhaAddress =>
      ApiConfig.fullAbhaAddress(_addressLocalPart).toLowerCase();
  String get _otpValue =>
      _otpDigitCtrls.map((controller) => controller.text.trim()).join();
  bool get _isOtpValid => RegExp(r'^\d{6}$').hasMatch(_otpValue);
  bool get _canResendOtp =>
      otpRequested &&
      !loading &&
      _resendCount < 2 &&
      _resendSecondsRemaining == 0;

  String get _identifierLabel {
    switch (_identifierType) {
      case 'AADHAAR_NUMBER':
        return 'Aadhaar Number';
      case 'MOBILE':
        return 'Mobile Number';
      case 'Abha_NUMBER':
        return 'ABHA Number';
      case 'Abha_ADDRESS':
      default:
        return 'ABHA Address';
    }
  }

  String get _identifierHint {
    switch (_identifierType) {
      case 'AADHAAR_NUMBER':
        return _showAadhaarIdentifier ? '1234 5678 9012' : 'XXXX XXXX 9012';
      case 'MOBILE':
        return 'Enter 10-digit mobile number';
      case 'Abha_NUMBER':
        return 'Enter ABHA number';
      case 'Abha_ADDRESS':
      default:
        return 'Enter ABHA address username';
    }
  }

  String get _identifierPreview {
    switch (_identifierType) {
      case 'Abha_ADDRESS':
        final selectedOtpMethod = _selectedAbhaAddressOtpMethodOption;
        if (selectedOtpMethod != null) {
          return selectedOtpMethod.helper;
        }
        return _addressLocalPart.isEmpty
            ? 'Full address will appear as username@${ApiConfig.abhaAddressDomain}'
            : 'Full address: $_resolvedAbhaAddress';
      case 'Abha_NUMBER':
        final selectedOtpMethod = _selectedAbhaNumberOtpMethod;
        if (selectedOtpMethod == null) {
          return 'Select which OTP method should be used for ABHA Number verification.';
        }
        return selectedOtpMethod.helper;
      case 'MOBILE':
        return 'OTP will be sent to the registered mobile identity in ABDM.';
      case 'AADHAAR_NUMBER':
        return 'OTP will be sent through the Aadhaar-linked verification flow.';
      default:
        return '';
    }
  }

  bool get _isIdentifierValid {
    switch (_identifierType) {
      case 'AADHAAR_NUMBER':
        return RegExp(r'^\d{12}$').hasMatch(_normalizedIdentifierValue());
      case 'MOBILE':
        return _isValidMobileNumber(_normalizedIdentifierValue());
      case 'Abha_NUMBER':
        final normalizedIdentifierValue = _normalizedIdentifierValue();
        final hasValidAbhaNumber = RegExp(
          r'^(?:\d{14}|\d{2}-\d{4}-\d{4}-\d{4})$',
        ).hasMatch(normalizedIdentifierValue);
        final hasOtpMethod = _abhaNumberOtpMethod?.trim().isNotEmpty == true;
        return hasValidAbhaNumber && hasOtpMethod;
      case 'Abha_ADDRESS':
      default:
        return RegExp(
          r'^(?=.{8,18}$)(?=.*[A-Za-z0-9])[A-Za-z0-9](?:[A-Za-z0-9._]*[A-Za-z0-9])?$',
        ).hasMatch(_addressLocalPart);
    }
  }

  bool get _hasAbhaAddressSearchResult => _abhaAddressSearchResult.isNotEmpty;

  bool get _canRequestAbhaAddressOtp =>
      _hasAbhaAddressSearchResult &&
      (_selectedAbhaAddressOtpMethod?.trim().isNotEmpty ?? false);

  bool _isValidMobileNumber(String value) {
    final mobile = value.trim();
    if (!RegExp(r'^[6-9]\d{9}$').hasMatch(mobile)) {
      return false;
    }

    if (RegExp(r'^(\d)\1{9}$').hasMatch(mobile)) {
      return false;
    }

    const blockedPatterns = <String>{
      '1234567890',
      '2345678901',
      '3456789012',
      '4567890123',
      '5678901234',
      '6789012345',
      '7890123456',
      '8901234567',
      '9012345678',
      '9876543210',
      '0987654321',
      '8765432109',
      '7654321098',
      '6543210987',
      '5432109876',
    };
    if (blockedPatterns.contains(mobile)) {
      return false;
    }

    final firstHalf = mobile.substring(0, 5);
    final secondHalf = mobile.substring(5);
    if (firstHalf == secondHalf) {
      return false;
    }

    return true;
  }

  void _setIdentifierType(String value) {
    if (value == _identifierType) return;
    setState(() {
      _identifierType = value;
      _abhaNumberOtpMethod = null;
      _selectedAbhaAddressOtpMethod = null;
      _showAadhaarIdentifier = false;
      _aadhaarIdentifierRaw = '';
      _resetVerificationState();
      _identifierCtrl.clear();
      if (_identifierType == 'AADHAAR_NUMBER') {
        _syncAadhaarIdentifierText();
      }
    });
  }

  void _resetVerificationState() {
    _resendTimer?.cancel();
    txnId = null;
    otpRequested = false;
    _resendCount = 0;
    _resendSecondsRemaining = 0;
    _otpSentMessage = '';
    _mobileLinkedAccounts = const [];
    _searchedMobileAccounts = const [];
    _selectedSearchedMobileAbhaNumber = null;
    _selectedMobileAbhaNumber = null;
    _abhaAddressSearchResult = const {};
    _abhaAddressAuthMethods = const [];
    _selectedAbhaAddressOtpMethod = null;
    _awaitingMobileRecordSelection = false;
    _mobileOtpVerifyResult = const {};
    _clearOtpInputs();
  }

  void _setAbhaNumberOtpMethod(String? value) {
    if (value == _abhaNumberOtpMethod) {
      return;
    }

    final hasActiveFlow =
        otpRequested ||
        txnId?.trim().isNotEmpty == true ||
        _searchedMobileAccounts.isNotEmpty ||
        _mobileLinkedAccounts.isNotEmpty ||
        _awaitingMobileRecordSelection;

    setState(() {
      _abhaNumberOtpMethod = value;
      if (hasActiveFlow) {
        _resetVerificationState();
      }
    });
  }

  void _setAbhaAddressOtpMethod(String? value) {
    setState(() {
      _selectedAbhaAddressOtpMethod = value;
    });
  }

  void _handleIdentifierChanged(String value) {
    final hasActiveFlow =
        otpRequested ||
        txnId?.trim().isNotEmpty == true ||
        _searchedMobileAccounts.isNotEmpty ||
        _mobileLinkedAccounts.isNotEmpty ||
        _abhaAddressSearchResult.isNotEmpty ||
        _awaitingMobileRecordSelection;

    if (_identifierType == 'AADHAAR_NUMBER') {
      if (_updatingAadhaarIdentifierText) {
        return;
      }
      final digits = normalizeAadhaarDigits(value, previousRaw: _aadhaarIdentifierRaw);
      setState(() {
        _aadhaarIdentifierRaw = digits;
        if (hasActiveFlow) {
          _resetVerificationState();
        }
        _syncAadhaarIdentifierText();
      });
      return;
    }

    setState(() {
      if (hasActiveFlow) {
        _resetVerificationState();
      }
      // Rebuild on every keystroke so button enabled states reflect the
      // latest identifier value instead of getting stuck on stale validation.
    });
  }

  @override
  void initState() {
    super.initState();
    _otpDigitCtrls = List.generate(6, (_) => TextEditingController());
    _otpFocusNodes = List.generate(6, (_) => FocusNode());
    final initialAddress = widget.initialAbhaAddress?.trim() ?? '';
    if (initialAddress.isNotEmpty) {
      _identifierCtrl.text = initialAddress.split('@').first.trim();
    }
  }

  @override
  void dispose() {
    _resendTimer?.cancel();
    _identifierCtrl.dispose();
    for (final ctrl in _otpDigitCtrls) {
      ctrl.dispose();
    }
    for (final node in _otpFocusNodes) {
      node.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('ABHA Verification')),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final desktop = constraints.maxWidth >= 980;
          final form = DesktopSurface(
            child: Padding(
              padding: const EdgeInsets.all(22),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Verify using $_identifierLabel',
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _selectedOption.helper,
                    style: const TextStyle(
                      color: Color(0xFF5C6C7A),
                      height: 1.45,
                    ),
                  ),
                  const SizedBox(height: 18),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 18,
                      vertical: 16,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF7FBFF),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: const Color(0xFFD7E5F0)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Selected Mode',
                          style: TextStyle(
                            color: Color(0xFF617283),
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _identifierLabel,
                          style: const TextStyle(
                            color: Color(0xFF17324A),
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _identifierCtrl,
                    keyboardType: _keyboardTypeFor(_identifierType),
                    inputFormatters: _inputFormattersFor(_identifierType),
                    onChanged: _handleIdentifierChanged,
                    onTap: _identifierType == 'AADHAAR_NUMBER'
                        ? _handleAadhaarIdentifierTap
                        : null,
                    decoration: InputDecoration(
                      labelText: _identifierLabel,
                      hintText: _identifierHint,
                      suffixText: _identifierType == 'Abha_ADDRESS'
                          ? '@${ApiConfig.abhaAddressDomain}'
                          : null,
                      suffixIcon: _identifierType == 'AADHAAR_NUMBER'
                          ? IconButton(
                              tooltip: _showAadhaarIdentifier
                                  ? 'Hide Aadhaar'
                                  : 'Show Aadhaar',
                              icon: Icon(
                                _showAadhaarIdentifier
                                    ? Icons.visibility_off
                                    : Icons.visibility,
                              ),
                              onPressed: _toggleAadhaarIdentifierVisibility,
                            )
                          : null,
                    ),
                  ),
                  if (_identifierType == 'AADHAAR_NUMBER') ...[
                    const SizedBox(height: 8),
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Only last 4 digits will be visible for security.',
                        style: TextStyle(
                          color: Color(0xFF617283),
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  Text(
                    _identifierPreview,
                    style: const TextStyle(
                      color: Color(0xFF617283),
                      fontSize: 12,
                    ),
                  ),
                  if (_identifierType == 'Abha_NUMBER') ...[
                    const SizedBox(height: 18),
                    DropdownButtonFormField<String>(
                      initialValue: _abhaNumberOtpMethod,
                      decoration: const InputDecoration(
                        labelText: 'Select Method of OTP',
                      ),
                      items: _abhaNumberOtpMethodOptions
                          .map((option) {
                            return DropdownMenuItem<String>(
                              value: option.value,
                              child: Text(option.label),
                            );
                          })
                          .toList(growable: false),
                      onChanged: loading ? null : _setAbhaNumberOtpMethod,
                    ),
                  ],
                  if (_identifierType == 'Abha_ADDRESS' &&
                      !otpRequested &&
                      _hasAbhaAddressSearchResult) ...[
                    const SizedBox(height: 18),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF5FBFF),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFFD7E5F0)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _firstNonEmpty([
                              _abhaAddressSearchResult['fullName'],
                              _abhaAddressSearchResult['name'],
                              'ABHA record found',
                            ]),
                            style: const TextStyle(
                              color: Color(0xFF17324A),
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'ABHA Number: ${_firstNonEmpty([_abhaAddressSearchResult['healthIdNumber'], _abhaAddressSearchResult['healthId'], 'N/A'])}',
                            style: const TextStyle(
                              color: Color(0xFF5C6C7A),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Mobile: ${_firstNonEmpty([_abhaAddressSearchResult['mobile'], 'Not available'])}',
                            style: const TextStyle(
                              color: Color(0xFF5C6C7A),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),
                    DropdownButtonFormField<String>(
                      initialValue: _selectedAbhaAddressOtpMethod,
                      decoration: const InputDecoration(
                        labelText: 'Select Method of OTP',
                      ),
                      items: _abhaAddressOtpMethodOptions
                          .where(
                            (option) =>
                                _abhaAddressAuthMethods.contains(option.value),
                          )
                          .map((option) {
                            return DropdownMenuItem<String>(
                              value: option.value,
                              child: Text(option.label),
                            );
                          })
                          .toList(growable: false),
                      onChanged: loading ? null : _setAbhaAddressOtpMethod,
                    ),
                  ],
                  const SizedBox(height: 18),
                  if (!otpRequested && _identifierType == 'Abha_ADDRESS') ...[
                    _button(
                      'Search',
                      !_searchingAbhaAddressAuthMethods &&
                              !loading &&
                              _isIdentifierValid
                          ? _searchAbhaAddressAuthMethods
                          : null,
                      isBusy: _searchingAbhaAddressAuthMethods,
                    ),
                    const SizedBox(height: 18),
                  ],
                  if (!otpRequested && _identifierType == 'MOBILE') ...[
                    _button(
                      'Search ABHA Records',
                      !_searchingMobileRecords && !loading && _isIdentifierValid
                          ? _searchMobileAbhaRecords
                          : null,
                      isBusy: _searchingMobileRecords,
                    ),
                    if (_searchedMobileAccounts.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF5FBFF),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: const Color(0xFFD7E5F0)),
                        ),
                        child: const Text(
                          'Available ABHA records linked to this mobile number are shown below. Review the details and then continue with OTP verification.',
                          style: TextStyle(
                            color: Color(0xFF23412E),
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            height: 1.45,
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      ..._searchedMobileAccounts.map(
                        _searchedMobileAccountTile,
                      ),
                    ],
                    const SizedBox(height: 18),
                  ],
                  if (!otpRequested &&
                      ((_identifierType != 'MOBILE' &&
                              _identifierType != 'Abha_ADDRESS') ||
                          (_identifierType == 'MOBILE' &&
                              _searchedMobileAccounts.isNotEmpty) ||
                          (_identifierType == 'Abha_ADDRESS' &&
                              _canRequestAbhaAddressOtp)))
                    _button(
                      'Request OTP',
                      !loading &&
                              ((_identifierType == 'MOBILE' &&
                                      _isIdentifierValid &&
                                      (_selectedSearchedMobileAbhaNumber
                                              ?.trim()
                                              .isNotEmpty ??
                                          false)) ||
                                  (_identifierType == 'Abha_ADDRESS' &&
                                      _isIdentifierValid &&
                                      _canRequestAbhaAddressOtp) ||
                                  (_identifierType != 'MOBILE' &&
                                      _identifierType != 'Abha_ADDRESS' &&
                                      _isIdentifierValid))
                          ? _requestOtp
                          : null,
                      isBusy: loading,
                    ),
                  if (otpRequested) ...[
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: loading
                            ? null
                            : () => setState(() => _resetVerificationState()),
                        child: const Text('Start New Verification'),
                      ),
                    ),
                    const SizedBox(height: 4),
                    if (_awaitingMobileRecordSelection &&
                        _identifierType == 'MOBILE') ...[
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF5FBFF),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: const Color(0xFFD7E5F0)),
                        ),
                        child: const Text(
                          'Select the ABHA record to continue. We are showing the linked accounts returned by the mobile verification APIs, including their KYC status.',
                          style: TextStyle(
                            color: Color(0xFF23412E),
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            height: 1.45,
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      ..._mobileLinkedAccounts.map(_mobileAccountTile),
                      const SizedBox(height: 16),
                      if (_selectedMobileAbhaNumber?.isNotEmpty == true &&
                          !_isKycVerifiedAccount(_selectedMobileAccount)) ...[
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFFF7E8),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: const Color(0xFFF1D18B)),
                          ),
                          child: const Text(
                            'The selected ABHA is not KYC verified yet, so we cannot continue with login from this account.',
                            style: TextStyle(
                              color: Color(0xFF8B6417),
                              fontWeight: FontWeight.w700,
                              height: 1.4,
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],
                      _button(
                        'Continue With Selected ABHA',
                        _selectedMobileAbhaNumber?.isNotEmpty == true &&
                                _isKycVerifiedAccount(_selectedMobileAccount)
                            ? _verifyOtp
                            : null,
                      ),
                    ] else ...[
                      if (_otpSentMessage.trim().isNotEmpty) ...[
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 12,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF2FAF6),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFFBFE6CD)),
                          ),
                          child: Text(
                            _otpSentMessage,
                            style: const TextStyle(
                              color: Color(0xFF23412E),
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              height: 1.4,
                            ),
                          ),
                        ),
                        const SizedBox(height: 14),
                      ],
                      const Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          'Enter 6-digit OTP',
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                      const SizedBox(height: 10),
                      _otpInputRow(),
                      const SizedBox(height: 12),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 14,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF0FBF4),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          '$_attemptsRemaining out of 2 resend attempts remaining',
                          style: const TextStyle(
                            color: Color(0xFF22B565),
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: _canResendOtp ? _resendOtp : null,
                          child: Text(
                            _resendSecondsRemaining > 0
                                ? 'Resend OTP in ${_resendSecondsRemaining}s'
                                : _resendCount >= 2
                                ? 'Resend limit reached'
                                : 'Resend OTP',
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      _button(
                        'Verify And Continue',
                        _isOtpValid ? _verifyOtp : null,
                      ),
                    ],
                  ],
                ],
              ),
            ),
          );

          return Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1180),
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    const DesktopPageIntro(
                      eyebrow: 'ABHA Verification',
                      title:
                          'Verify an existing ABHA using the identifier you have available.',
                      description:
                          'This screen now supports the ABDM verification routes documented in the local Postman bundle: Aadhaar number, mobile number, ABHA address, and ABHA number.',
                      pills: [
                        'Click any tab to switch',
                        'Aadhaar login',
                        'Mobile login',
                        'ABHA login',
                      ],
                    ),
                    if (desktop)
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(child: _desktopInfoPanel()),
                          const SizedBox(width: 24),
                          SizedBox(width: 480, child: form),
                        ],
                      )
                    else
                      form,
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  _VerificationOption get _selectedOption => _verificationOptions.firstWhere(
    (option) => option.type == _identifierType,
  );

  _OtpMethodOption? get _selectedAbhaNumberOtpMethod {
    final selectedValue = _abhaNumberOtpMethod?.trim() ?? '';
    if (selectedValue.isEmpty) {
      return null;
    }

    for (final option in _abhaNumberOtpMethodOptions) {
      if (option.value == selectedValue) {
        return option;
      }
    }

    return null;
  }

  _OtpMethodOption? get _selectedAbhaAddressOtpMethodOption {
    final selectedValue = _selectedAbhaAddressOtpMethod?.trim() ?? '';
    if (selectedValue.isEmpty) {
      return null;
    }

    for (final option in _abhaAddressOtpMethodOptions) {
      if (option.value == selectedValue) {
        return option;
      }
    }

    return null;
  }

  Widget _desktopInfoPanel() {
    return DesktopSurface(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Verify Existing ABHA',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 12),
            Text(
              'Choose the identifier available with the patient and continue through the matching ABDM verification flow. After OTP verification, we fetch the profile, load the ABHA card when available, and bring the verified patient back to the ${HospitalConfig.hospitalShortName} patient dashboard.',
              style: TextStyle(color: Color(0xFF24384A), height: 1.45),
            ),
            const SizedBox(height: 18),
            ..._verificationOptions.map(
              (option) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: loading ? null : () => _setIdentifierType(option.type),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 160),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: option.type == _identifierType
                          ? const Color(0xFFF0FBF4)
                          : const Color(0xFFF7FAFD),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: option.type == _identifierType
                            ? const Color(0xFF9FD8BA)
                            : const Color(0xFFD9E4EF),
                      ),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          option.type == _identifierType
                              ? Icons.check_circle_rounded
                              : Icons.radio_button_unchecked_rounded,
                          color: option.type == _identifierType
                              ? const Color(0xFF2F8F5B)
                              : const Color(0xFF8AA0B3),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                option.label,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF17324A),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                option.helper,
                                style: const TextStyle(
                                  color: Color(0xFF607285),
                                  height: 1.4,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 4),
            Align(
              alignment: Alignment.centerLeft,
              child: SizedBox(
                height: 42,
                child: OutlinedButton.icon(
                  onPressed: _preparingScanShare
                      ? null
                      : _prepareAndShowScanAndShareQrDialog,
                  icon: _preparingScanShare
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.qr_code_2_rounded),
                  label: Text(
                    _preparingScanShare
                        ? 'Preparing Scan and Share...'
                        : 'Scan and Share',
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _button(String text, VoidCallback? onTap, {bool isBusy = false}) {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: ElevatedButton(
        onPressed: isBusy ? null : onTap,
        child: isBusy
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Text(text),
      ),
    );
  }

  Future<void> _prepareAndShowScanAndShareQrDialog() async {
    setState(() => _preparingScanShare = true);

    try {
      await ScanShareQrDialog.prepareAndShow(context);
    } finally {
      if (mounted) {
        setState(() => _preparingScanShare = false);
      }
    }
  }

  Future<void> _requestOtp() async {
    if (!_isIdentifierValid) {
      if (_identifierType == 'MOBILE') {
        _showError(_mobilePreOtpErrorMessage);
      } else if (_identifierType == 'Abha_ADDRESS') {
        _showError('Enter a valid ABHA Address before continuing.');
      } else {
        _showError('Enter a valid $_identifierLabel before requesting OTP');
      }
      return;
    }
    if (_identifierType == 'Abha_ADDRESS' && !_hasAbhaAddressSearchResult) {
      _showError('Search the ABHA address before requesting OTP.');
      return;
    }
    if (_identifierType == 'Abha_ADDRESS' && !_canRequestAbhaAddressOtp) {
      _showError('Select a valid OTP method before requesting OTP.');
      return;
    }
    if (_identifierType == 'MOBILE' &&
        (_selectedSearchedMobileAbhaNumber?.trim().isEmpty ?? true)) {
      _showError('Select an ABHA record before requesting OTP.');
      return;
    }

    setState(() => loading = true);

    try {
      final identifierValue = _normalizedIdentifierValue();
      if (_identifierType == 'Abha_ADDRESS') {
        txnId = await AbhaApiService.requestLoginOtp(
          identifierValue,
          otpMethod: _selectedAbhaAddressOtpMethod!,
        );
      } else {
        final otpMethod = _resolvedOtpMethodForRequest();
        txnId = await AbhaApiService.requestVerificationOtp(
          identifierType: _identifierType,
          identifierValue: identifierValue,
          otpMethod: otpMethod,
        );
      }
      _clearOtpInputs();
      setState(() {
        otpRequested = true;
        _resendCount = 0;
        _otpSentMessage = _buildVerificationOtpSentMessage();
        _mobileLinkedAccounts = const [];
        _selectedMobileAbhaNumber = null;
        _awaitingMobileRecordSelection = false;
        _mobileOtpVerifyResult = const {};
      });
      _startResendCooldown();
      if (mounted) {
        _otpFocusNodes.first.requestFocus();
      }
    } catch (e) {
      if (_identifierType == 'MOBILE') {
        _showError(_mobilePreOtpErrorMessage);
      } else {
        _showError(e.toString());
      }
    } finally {
      if (mounted) {
        setState(() => loading = false);
      }
    }
  }

  Future<void> _searchAbhaAddressAuthMethods() async {
    if (_identifierType != 'Abha_ADDRESS') {
      return;
    }
    if (!_isIdentifierValid) {
      _showError('Enter a valid ABHA Address before searching.');
      return;
    }

    setState(() => _searchingAbhaAddressAuthMethods = true);
    try {
      final result = await AbhaApiService.searchLoginAuthMethods(
        _normalizedIdentifierValue(),
      );
      final authMethods = ((result['authMethods'] as List?) ?? const [])
          .map((item) => item.toString().trim().toUpperCase())
          .where((item) => item.isNotEmpty)
          .toList(growable: false);
      final blockedMethods =
          ((result['blockedAuthMethods'] as List?) ?? const [])
              .map((item) => item.toString().trim().toUpperCase())
              .where((item) => item.isNotEmpty)
              .toSet();
      final availableMethods = authMethods
          .where((method) => !blockedMethods.contains(method))
          .where((method) => method == 'MOBILE_OTP' || method == 'AADHAAR_OTP')
          .toList(growable: false);

      if (availableMethods.isEmpty) {
        if (!mounted) return;
        setState(() {
          _abhaAddressSearchResult = const {};
          _abhaAddressAuthMethods = const [];
          _selectedAbhaAddressOtpMethod = null;
        });
        _showError(
          'No supported OTP methods are available for this ABHA address.',
        );
        return;
      }

      if (!mounted) return;
      setState(() {
        _abhaAddressSearchResult = result;
        _abhaAddressAuthMethods = availableMethods;
        _selectedAbhaAddressOtpMethod = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _abhaAddressSearchResult = const {};
        _abhaAddressAuthMethods = const [];
        _selectedAbhaAddressOtpMethod = null;
      });
      _showError(e.toString());
    } finally {
      if (mounted) {
        setState(() => _searchingAbhaAddressAuthMethods = false);
      }
    }
  }

  Future<void> _searchMobileAbhaRecords() async {
    if (_identifierType != 'MOBILE') {
      return;
    }
    if (!_isIdentifierValid) {
      _showError(_mobilePreOtpErrorMessage);
      return;
    }

    setState(() => _searchingMobileRecords = true);
    try {
      final result = await AbhaApiService.searchAbhaByMobile(
        _normalizedIdentifierValue(),
      );
      final accounts = _extractMobileAccounts(result);
      _debugLogMobileSearchResolution(response: result, accounts: accounts);
      if (accounts.isEmpty) {
        setState(() {
          _searchedMobileAccounts = const [];
          _selectedSearchedMobileAbhaNumber = null;
        });
        _showError(_mobilePreOtpErrorMessage);
        return;
      }

      setState(() {
        _searchedMobileAccounts = accounts;
        _selectedSearchedMobileAbhaNumber = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _searchedMobileAccounts = const [];
        _selectedSearchedMobileAbhaNumber = null;
      });
      _showError(_mobilePreOtpErrorMessage);
    } finally {
      if (mounted) {
        setState(() => _searchingMobileRecords = false);
      }
    }
  }

  Future<void> _verifyOtp() async {
    if (_identifierType == 'MOBILE' && _awaitingMobileRecordSelection) {
      await _finalizeSelectedMobileUser();
      return;
    }

    final activeTxnId = txnId?.trim() ?? '';
    if (activeTxnId.isEmpty) {
      _showError('Missing transaction ID. Please request OTP again.');
      return;
    }
    if (!_isOtpValid) {
      _showError('OTP must be 6 digits');
      return;
    }

    setState(() => loading = true);
    try {
      final identifierValue = _normalizedIdentifierValue();
      late final Map<String, dynamic> result;
      if (_identifierType == 'Abha_ADDRESS') {
        final selectedOtpMethod = _selectedAbhaAddressOtpMethod?.trim() ?? '';
        if (selectedOtpMethod.isEmpty) {
          throw Exception('Select a valid OTP method before verifying.');
        }
        final session = await AbhaApiService.verifyLoginSession(
          txnId: activeTxnId,
          otp: _otpValue,
          phrAddress: identifierValue,
          otpMethod: selectedOtpMethod,
        );
        result = Map<String, dynamic>.from(
          (session['raw'] is Map<String, dynamic>)
              ? session['raw'] as Map<String, dynamic>
              : const <String, dynamic>{},
        );
      } else {
        final otpMethod = _resolvedOtpMethodForRequest();
        result = await AbhaApiService.verifyRegistrationOtp(
          identifierType: _identifierType,
          identifierValue: identifierValue,
          txnId: activeTxnId,
          otp: _otpValue,
          otpMethod: otpMethod,
        );
      }

      final verified =
          result['verified'] == true ||
          (result['authResult']?.toString().toLowerCase() == 'success');
      if (!verified) {
        throw Exception(
          result['message']?.toString() ??
              'Verification failed. Please try again.',
        );
      }

      if (_identifierType == 'MOBILE') {
        final transferToken = _extractSessionToken(result);
        final accounts = _extractMobileAccounts(result);
        if (transferToken.isEmpty) {
          throw Exception(
            'OTP verified but the mobile verification flow did not return a transfer token.',
          );
        }
        if (accounts.isEmpty) {
          final shouldOpenCreateFlow = await _showNoAccountsFoundDialog();
          if (shouldOpenCreateFlow && mounted) {
            await Navigator.of(
              context,
            ).push(MaterialPageRoute(builder: (_) => const CreateAbhaScreen()));
          }
          return;
        }
        final selectedAccount = _resolveSelectedMobileAccountAfterOtp(accounts);
        if (selectedAccount.isEmpty) {
          throw Exception(
            'Selected ABHA record could not be resolved after OTP verification.',
          );
        }
        await _verifySelectedMobileUserAndComplete(
          otpVerifyResult: result,
          selectedAccount: selectedAccount,
        );
        return;
      }

      await _completeVerificationFlow(
        result: result,
        fallbackIdentifier: identifierValue,
      );
    } catch (e) {
      if (!mounted) return;
      _showError(e.toString());
    } finally {
      if (mounted) {
        setState(() => loading = false);
      }
    }
  }

  Future<void> _finalizeSelectedMobileUser() async {
    final selectedAbhaNumber = _selectedMobileAbhaNumber?.trim() ?? '';
    final selectedAccount = _selectedMobileAccount;
    if (selectedAbhaNumber.isEmpty) {
      _showError('Select an ABHA record before continuing.');
      return;
    }
    if (!_isKycVerifiedAccount(selectedAccount)) {
      _showError(
        'This ABHA account is not KYC verified yet. Please complete KYC before continuing.',
      );
      return;
    }

    setState(() => loading = true);
    try {
      await _verifySelectedMobileUserAndComplete(
        otpVerifyResult: _mobileOtpVerifyResult,
        selectedAccount: selectedAccount,
      );
    } catch (e) {
      if (!mounted) return;
      _showError(e.toString());
    } finally {
      if (mounted) {
        setState(() => loading = false);
      }
    }
  }

  Future<void> _verifySelectedMobileUserAndComplete({
    required Map<String, dynamic> otpVerifyResult,
    required Map<String, dynamic> selectedAccount,
  }) async {
    final selectedAbhaNumber = _firstNonEmpty([
      selectedAccount['AbhaNumber'],
      selectedAccount['ABHANumber'],
      selectedAccount['abhaNo'],
      selectedAccount['abhaNumber'],
    ]);
    final selectedAbhaAddress = _firstNonEmpty([
      selectedAccount['preferredAbhaAddress'],
      selectedAccount['abhaAddr'],
      selectedAccount['AbhaAddress'],
    ]);
    final mergedResult = <String, dynamic>{
      ...otpVerifyResult,
      'accounts': [selectedAccount],
      'AbhaNumber': selectedAbhaNumber,
      'ABHANumber': selectedAbhaNumber,
      'abhaNumber': selectedAbhaNumber,
      'abhaNo': selectedAbhaNumber,
      'preferredAbhaAddress': selectedAbhaAddress,
      'AbhaAddress': selectedAbhaAddress,
      'abhaAddr': selectedAbhaAddress,
      'mobile': _firstNonEmpty([
        selectedAccount['mobile'],
        selectedAccount['mob'],
        _normalizedIdentifierValue(),
      ]),
      'name': _firstNonEmpty([selectedAccount['name']]),
      'gender': _firstNonEmpty([selectedAccount['gender']]),
      'dob': _firstNonEmpty([selectedAccount['dob']]),
      'photo': _firstNonEmpty([selectedAccount['photo']]),
      'address': _firstNonEmpty([selectedAccount['address']]),
      'pincode': _firstNonEmpty([
        selectedAccount['pincode'],
        selectedAccount['pinCode'],
      ]),
      'status': _firstNonEmpty([selectedAccount['status'], 'ACTIVE']),
    };

    final mobileTxnId = _firstNonEmpty([
      otpVerifyResult['txnId'],
      mergedResult['txnId'],
    ]);
    final transferToken = _extractSessionToken(otpVerifyResult);
    if (mobileTxnId.isNotEmpty &&
        transferToken.isNotEmpty &&
        selectedAbhaNumber.isNotEmpty) {
      try {
        final verifiedUserResult = await AbhaApiService.verifyMobileLinkedUser(
          txnId: mobileTxnId,
          abhaNumber: selectedAbhaNumber,
          transferToken: transferToken,
        );
        mergedResult.addAll(verifiedUserResult);
        mergedResult['accounts'] = [selectedAccount];
        mergedResult['AbhaNumber'] = _firstNonEmpty([
          verifiedUserResult['AbhaNumber'],
          verifiedUserResult['ABHANumber'],
          verifiedUserResult['abhaNumber'],
          verifiedUserResult['abhaNo'],
          selectedAbhaNumber,
        ]);
      } catch (_) {}
    }

    await _completeVerificationFlow(
      result: mergedResult,
      fallbackIdentifier: _normalizedIdentifierValue(),
    );
  }

  Future<void> _resendOtp() async {
    if (!_canResendOtp) return;

    setState(() => loading = true);
    try {
      final identifierValue = _normalizedIdentifierValue();
      if (_identifierType == 'Abha_ADDRESS') {
        final selectedOtpMethod = _selectedAbhaAddressOtpMethod?.trim() ?? '';
        if (selectedOtpMethod.isEmpty) {
          throw Exception('Select a valid OTP method before resending OTP.');
        }
        txnId = await AbhaApiService.requestLoginOtp(
          identifierValue,
          otpMethod: selectedOtpMethod,
        );
      } else {
        final otpMethod = _resolvedOtpMethodForRequest();
        txnId = await AbhaApiService.requestVerificationOtp(
          identifierType: _identifierType,
          identifierValue: identifierValue,
          otpMethod: otpMethod,
        );
      }
      _clearOtpInputs();
      setState(() {
        _resendCount += 1;
        _otpSentMessage = _buildVerificationOtpSentMessage();
        _mobileLinkedAccounts = const [];
        _selectedMobileAbhaNumber = null;
        _awaitingMobileRecordSelection = false;
        _mobileOtpVerifyResult = const {};
      });
      _startResendCooldown();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Verification OTP resent successfully')),
      );
      _otpFocusNodes.first.requestFocus();
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) {
        setState(() => loading = false);
      }
    }
  }

  Future<void> _completeVerificationFlow({
    required Map<String, dynamic> result,
    required String fallbackIdentifier,
  }) async {
    final token = _extractSessionToken(result);
    final refreshToken = _extractRefreshToken(result);
    if (token.isEmpty) {
      throw Exception(
        'Verification succeeded but no ABHA session token was returned.',
      );
    }

    final verificationProfile = _profileFromVerificationResult(
      result,
      fallbackIdentifier: fallbackIdentifier,
    );
    final provisionalAddress = _resolvePreferredAddress(
      verificationProfile,
      fallback: _identifierType == 'Abha_ADDRESS' ? fallbackIdentifier : '',
    );
    AuthSession.setM1Login(
      token: token,
      address: provisionalAddress,
      refreshToken: refreshToken.isEmpty ? null : refreshToken,
    );
    AuthSession.setM2Login(
      token: token,
      address: provisionalAddress,
      refreshToken: refreshToken.isEmpty ? null : refreshToken,
    );

    Map<String, dynamic> profile = Map<String, dynamic>.from(
      verificationProfile,
    );
    Map<String, dynamic> cardPayload = const <String, dynamic>{};
    final cardSource = _verificationCardSourceForIdentifier();
    Map<String, dynamic> enrollmentProfile = const <String, dynamic>{};
    Map<String, dynamic> loggedInProfile = const <String, dynamic>{};
    try {
      enrollmentProfile = await AbhaApiService.fetchEnrollmentProfileDetails(
        xToken: token,
        refreshToken: refreshToken.isEmpty ? null : refreshToken,
      );
    } catch (_) {}
    try {
      loggedInProfile = await AbhaApiService.fetchLoggedInProfile();
    } catch (_) {}
    final storedEnrollmentProfile =
        AppRuntimeStore.getValue<Map<String, dynamic>>(
          'Abha.enrollment.profileDetails',
        ) ??
        const <String, dynamic>{};
    final storedLoggedInProfile =
        AppRuntimeStore.getValue<Map<String, dynamic>>('phr.profile') ??
        const <String, dynamic>{};
    final enrollmentRawResponse =
        enrollmentProfile['rawResponse'] is Map<String, dynamic>
        ? Map<String, dynamic>.from(enrollmentProfile['rawResponse'])
        : enrollmentProfile['rawResponse'] is Map
        ? Map<String, dynamic>.from(enrollmentProfile['rawResponse'] as Map)
        : AppRuntimeStore.getApiResponse('Abha.fetchEnrollmentProfileDetails')
              is Map<String, dynamic>
        ? Map<String, dynamic>.from(
            AppRuntimeStore.getApiResponse('Abha.fetchEnrollmentProfileDetails')
                as Map<String, dynamic>,
          )
        : AppRuntimeStore.getApiResponse('Abha.fetchEnrollmentProfileDetails')
              is Map
        ? Map<String, dynamic>.from(
            AppRuntimeStore.getApiResponse('Abha.fetchEnrollmentProfileDetails')
                as Map,
          )
        : const <String, dynamic>{};
    final loggedInRawResponse =
        loggedInProfile['rawResponse'] is Map<String, dynamic>
        ? Map<String, dynamic>.from(loggedInProfile['rawResponse'])
        : loggedInProfile['rawResponse'] is Map
        ? Map<String, dynamic>.from(loggedInProfile['rawResponse'] as Map)
        : AppRuntimeStore.getApiResponse('Abha.fetchLoggedInProfile')
              is Map<String, dynamic>
        ? Map<String, dynamic>.from(
            AppRuntimeStore.getApiResponse('Abha.fetchLoggedInProfile')
                as Map<String, dynamic>,
          )
        : AppRuntimeStore.getApiResponse('Abha.fetchLoggedInProfile') is Map
        ? Map<String, dynamic>.from(
            AppRuntimeStore.getApiResponse('Abha.fetchLoggedInProfile') as Map,
          )
        : const <String, dynamic>{};
    profile = {
      ...verificationProfile,
      ...storedLoggedInProfile,
      ...loggedInProfile,
      ...storedEnrollmentProfile,
      ...enrollmentProfile,
    };

    final resolvedAbhaNumber = _resolveVerifiedAbhaNumber([
      storedEnrollmentProfile,
      storedLoggedInProfile,
      enrollmentProfile,
      loggedInProfile,
      verificationProfile,
    ]);
    if (resolvedAbhaNumber.isNotEmpty) {
      profile['AbhaNumber'] = resolvedAbhaNumber;
      profile['ABHANumber'] = resolvedAbhaNumber;
      profile['abhaNumber'] = resolvedAbhaNumber;
      profile['abhaNo'] = resolvedAbhaNumber;
    }

    final resolvedAbhaAddress = _firstNonEmpty([
      storedEnrollmentProfile['preferredAbhaAddress'],
      storedEnrollmentProfile['AbhaAddress'],
      storedEnrollmentProfile['abhaAddr'],
      storedLoggedInProfile['preferredAbhaAddress'],
      storedLoggedInProfile['AbhaAddress'],
      storedLoggedInProfile['abhaAddr'],
      enrollmentRawResponse['preferredAbhaAddress'],
      enrollmentRawResponse['AbhaAddress'],
      enrollmentRawResponse['abhaAddr'],
      loggedInRawResponse['preferredAbhaAddress'],
      loggedInRawResponse['AbhaAddress'],
      loggedInRawResponse['abhaAddr'],
      enrollmentProfile['preferredAbhaAddress'],
      enrollmentProfile['AbhaAddress'],
      enrollmentProfile['abhaAddr'],
      loggedInProfile['preferredAbhaAddress'],
      loggedInProfile['AbhaAddress'],
      loggedInProfile['abhaAddr'],
      verificationProfile['preferredAbhaAddress'],
      verificationProfile['AbhaAddress'],
      verificationProfile['abhaAddr'],
    ]);
    if (resolvedAbhaAddress.isNotEmpty) {
      profile['preferredAbhaAddress'] = resolvedAbhaAddress;
      profile['AbhaAddress'] = resolvedAbhaAddress;
      profile['abhaAddr'] = resolvedAbhaAddress;
    }

    final resolvedPostalAddress = _firstNonEmpty([
      storedEnrollmentProfile['address'],
      storedEnrollmentProfile['addressLine'],
      storedLoggedInProfile['address'],
      storedLoggedInProfile['addressLine'],
      enrollmentRawResponse['address'],
      enrollmentRawResponse['addressLine'],
      loggedInRawResponse['address'],
      loggedInRawResponse['addressLine'],
      enrollmentProfile['address'],
      enrollmentProfile['addressLine'],
      loggedInProfile['address'],
      loggedInProfile['addressLine'],
      verificationProfile['address'],
    ]);
    if (resolvedPostalAddress.isNotEmpty) {
      profile['address'] = resolvedPostalAddress;
    }

    final resolvedPincode = _firstNonEmpty([
      storedEnrollmentProfile['pincode'],
      storedEnrollmentProfile['pinCode'],
      storedLoggedInProfile['pincode'],
      storedLoggedInProfile['pinCode'],
      enrollmentRawResponse['pincode'],
      enrollmentRawResponse['pinCode'],
      loggedInRawResponse['pincode'],
      loggedInRawResponse['pinCode'],
      enrollmentProfile['pincode'],
      enrollmentProfile['pinCode'],
      loggedInProfile['pincode'],
      loggedInProfile['pinCode'],
      verificationProfile['pincode'],
      verificationProfile['pinCode'],
    ]);
    if (resolvedPincode.isNotEmpty) {
      profile['pincode'] = resolvedPincode;
      profile['pinCode'] = resolvedPincode;
    }
    final resolvedState = _firstNonEmpty([
      storedEnrollmentProfile['state'],
      storedEnrollmentProfile['stateName'],
      storedLoggedInProfile['state'],
      storedLoggedInProfile['stateName'],
      enrollmentRawResponse['state'],
      enrollmentRawResponse['stateName'],
      loggedInRawResponse['state'],
      loggedInRawResponse['stateName'],
      enrollmentProfile['state'],
      enrollmentProfile['stateName'],
      loggedInProfile['state'],
      loggedInProfile['stateName'],
      verificationProfile['state'],
      verificationProfile['stateName'],
    ]);
    final resolvedDistrict = _firstNonEmpty([
      storedEnrollmentProfile['district'],
      storedEnrollmentProfile['districtName'],
      storedLoggedInProfile['district'],
      storedLoggedInProfile['districtName'],
      enrollmentRawResponse['district'],
      enrollmentRawResponse['districtName'],
      loggedInRawResponse['district'],
      loggedInRawResponse['districtName'],
      enrollmentProfile['district'],
      enrollmentProfile['districtName'],
      loggedInProfile['district'],
      loggedInProfile['districtName'],
      verificationProfile['district'],
      verificationProfile['districtName'],
    ]);
    final profileDetails = <String, dynamic>{
      ...storedLoggedInProfile,
      ...loggedInProfile,
      ...storedEnrollmentProfile,
      ...enrollmentProfile,
      'AbhaNumber': resolvedAbhaNumber,
      'ABHANumber': resolvedAbhaNumber,
      'abhaNumber': resolvedAbhaNumber,
      'abhaNo': resolvedAbhaNumber,
      'preferredAbhaAddress': resolvedAbhaAddress,
      'AbhaAddress': resolvedAbhaAddress,
      'abhaAddr': resolvedAbhaAddress,
      if (resolvedPostalAddress.isNotEmpty) 'address': resolvedPostalAddress,
      if (resolvedPostalAddress.isNotEmpty)
        'addressLine': resolvedPostalAddress,
      if (resolvedPincode.isNotEmpty) 'pincode': resolvedPincode,
      if (resolvedPincode.isNotEmpty) 'pinCode': resolvedPincode,
      if (resolvedState.isNotEmpty) 'state': resolvedState,
      if (resolvedState.isNotEmpty) 'stateName': resolvedState,
      if (resolvedDistrict.isNotEmpty) 'district': resolvedDistrict,
      if (resolvedDistrict.isNotEmpty) 'districtName': resolvedDistrict,
      'rawResponse': {
        ...loggedInRawResponse,
        ...enrollmentRawResponse,
        'AbhaNumber': resolvedAbhaNumber,
        'ABHANumber': resolvedAbhaNumber,
        'abhaNumber': resolvedAbhaNumber,
        'abhaNo': resolvedAbhaNumber,
        'preferredAbhaAddress': resolvedAbhaAddress,
        'AbhaAddress': resolvedAbhaAddress,
        'abhaAddr': resolvedAbhaAddress,
        if (resolvedPostalAddress.isNotEmpty) 'address': resolvedPostalAddress,
        if (resolvedPostalAddress.isNotEmpty)
          'addressLine': resolvedPostalAddress,
        if (resolvedPincode.isNotEmpty) 'pincode': resolvedPincode,
        if (resolvedPincode.isNotEmpty) 'pinCode': resolvedPincode,
        if (resolvedState.isNotEmpty) 'state': resolvedState,
        if (resolvedState.isNotEmpty) 'stateName': resolvedState,
        if (resolvedDistrict.isNotEmpty) 'district': resolvedDistrict,
        if (resolvedDistrict.isNotEmpty) 'districtName': resolvedDistrict,
      },
    };
    profile['enrollmentProfile'] = {
      ...storedEnrollmentProfile,
      ...enrollmentProfile,
      'rawResponse': enrollmentRawResponse,
    };
    profile['loggedInProfile'] = {
      ...storedLoggedInProfile,
      ...loggedInProfile,
      'rawResponse': loggedInRawResponse,
    };
    profile['profileDetails'] = profileDetails;

    final resolvedAddress = _resolvePreferredAddress(
      profile,
      fallback: provisionalAddress,
    );

    AuthSession.setM1Login(
      token: token,
      address: resolvedAddress,
      refreshToken: refreshToken.isEmpty ? null : refreshToken,
    );
    AuthSession.setM2Login(
      token: token,
      address: resolvedAddress,
      refreshToken: refreshToken.isEmpty ? null : refreshToken,
    );

    final patientPayload = _buildVerificationUserPayload(
      phrAddress: resolvedAddress,
      verificationProfile: verificationProfile,
      profileDetails: profileDetails,
      loggedInProfile: loggedInProfile,
      cardPayload: cardPayload,
      sessionToken: token,
      refreshToken: refreshToken,
      source: cardSource,
    );

    if (!mounted) return;
    final shouldAddToPatients = await _showVerifiedCardPreview(
      patientPayload: patientPayload,
      cardPayload: cardPayload,
    );
    if (!mounted) return;
    setState(() => _resetVerificationState());
    if (!shouldAddToPatients) {
      return;
    }

    RegisteredUsersStore.upsert(patientPayload);

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('ABHA verification completed')),
    );
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  void _startResendCooldown() {
    _resendTimer?.cancel();
    setState(() => _resendSecondsRemaining = _resendCooldownSeconds);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted || _resendSecondsRemaining <= 1) {
        timer.cancel();
        if (mounted) {
          setState(() => _resendSecondsRemaining = 0);
        }
        return;
      }
      setState(() => _resendSecondsRemaining -= 1);
    });
  }

  int get _attemptsRemaining => 2 - _resendCount;

  String _normalizedIdentifierValue() {
    switch (_identifierType) {
      case 'Abha_ADDRESS':
        return _resolvedAbhaAddress;
      case 'Abha_NUMBER':
        return _rawInput.trim();
      case 'MOBILE':
      case 'AADHAAR_NUMBER':
        return _rawInput.replaceAll(RegExp(r'\s+'), '');
      default:
        return _rawInput;
    }
  }

  String? _resolvedOtpMethodForRequest() {
    if (_identifierType != 'Abha_NUMBER') {
      return null;
    }

    final selectedOtpMethod = _abhaNumberOtpMethod?.trim() ?? '';
    if (selectedOtpMethod.isEmpty) {
      return null;
    }

    return selectedOtpMethod;
  }

  void _toggleAadhaarIdentifierVisibility() {
    setState(() {
      _showAadhaarIdentifier = !_showAadhaarIdentifier;
      _syncAadhaarIdentifierText();
    });
  }

  void _handleAadhaarIdentifierTap() {
    if (_showAadhaarIdentifier) {
      return;
    }

    final currentText = _identifierCtrl.text;
    if (currentText.isEmpty) {
      return;
    }

    _identifierCtrl.selection = TextSelection(
      baseOffset: 0,
      extentOffset: currentText.length,
    );
  }

  void _syncAadhaarIdentifierText() {
    _updatingAadhaarIdentifierText = true;
    _identifierCtrl.value = buildAadhaarEditingValue(
      digits: _aadhaarIdentifierRaw,
      showFullValue: _showAadhaarIdentifier,
    );
    _updatingAadhaarIdentifierText = false;
  }

  String _buildVerificationOtpSentMessage() {
    final response = AppRuntimeStore.getApiResponse(
      _identifierType == 'Abha_ADDRESS'
          ? 'Abha.requestLoginOtp'
          : 'Abha.requestVerificationOtp',
    );
    final directMessage = _extractApiOtpMessage(response);
    if (directMessage.isNotEmpty) {
      return directMessage;
    }

    final maskedEnding = _extractMaskedOtpTarget(response).isNotEmpty
        ? _extractMaskedOtpTarget(response)
        : _maskOtpTarget(_otpTargetFallbackValue);
    if (maskedEnding.isEmpty) {
      return 'OTP sent to $_otpRegistrationLabel';
    }
    return 'OTP sent to $_otpRegistrationLabel ending with $maskedEnding';
  }

  String get _otpRegistrationLabel {
    switch (_identifierType) {
      case 'AADHAAR_NUMBER':
        return 'Aadhaar registered mobile number';
      case 'MOBILE':
        return 'mobile number';
      case 'Abha_NUMBER':
        final selectedOtpMethod = _abhaNumberOtpMethod?.trim() ?? '';
        if (selectedOtpMethod == 'AADHAAR_LINKED_MOBILE') {
          return 'Aadhaar registered mobile number';
        }
        if (selectedOtpMethod == 'ABHA_LINKED_MOBILE') {
          return 'ABHA linked mobile number';
        }
        return 'ABHA number registered mobile number';
      case 'Abha_ADDRESS':
        final selectedOtpMethod = _selectedAbhaAddressOtpMethod?.trim() ?? '';
        if (selectedOtpMethod == 'AADHAAR_OTP') {
          return 'Aadhaar registered mobile number';
        }
        return 'ABHA address registered mobile number';
      default:
        return 'registered mobile number';
    }
  }

  String get _otpTargetFallbackValue {
    switch (_identifierType) {
      case 'MOBILE':
        return _normalizedIdentifierValue();
      default:
        return '';
    }
  }

  String _extractApiOtpMessage(dynamic response) {
    if (response is! Map<String, dynamic>) {
      return '';
    }
    final message = response['message']?.toString().trim() ?? '';
    if (message.isEmpty) {
      return '';
    }
    if (message.toLowerCase().contains('otp sent')) {
      return message;
    }
    return '';
  }

  String _extractMaskedOtpTarget(dynamic response) {
    if (response is! Map<String, dynamic>) {
      return '';
    }
    final directValue =
        response['mobile'] ??
        response['maskedMobile'] ??
        response['maskedMobileNumber'] ??
        response['maskedMobileNo'];
    if (directValue is String && directValue.trim().isNotEmpty) {
      return _maskOtpTarget(directValue);
    }

    final message = response['message']?.toString() ?? '';
    final endingMatch = RegExp(
      r'ending with\s+([*xX0-9-]{4,})',
      caseSensitive: false,
    ).firstMatch(message);
    if (endingMatch != null) {
      return _maskOtpTarget(endingMatch.group(1) ?? '');
    }

    final genericMatch = RegExp(r'([*xX]{2,}\d{2,4})').firstMatch(message);
    if (genericMatch != null) {
      return _maskOtpTarget(genericMatch.group(1) ?? '');
    }
    return '';
  }

  String _maskOtpTarget(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) {
      return '';
    }
    if (trimmed.contains('*') ||
        trimmed.contains('x') ||
        trimmed.contains('X')) {
      return trimmed.replaceAll(RegExp(r'[xX]'), '*');
    }
    final digits = trimmed.replaceAll(RegExp(r'\D'), '');
    if (digits.length >= 4) {
      return '******${digits.substring(digits.length - 4)}';
    }
    return digits;
  }

  List<TextInputFormatter> _inputFormattersFor(String type) {
    switch (type) {
      case 'AADHAAR_NUMBER':
        return <TextInputFormatter>[
          FilteringTextInputFormatter.allow(RegExp(r'[0-9Xx ]')),
        ];
      case 'MOBILE':
        return <TextInputFormatter>[
          FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(10),
        ];
      case 'Abha_NUMBER':
        return <TextInputFormatter>[
          FilteringTextInputFormatter.allow(RegExp(r'[0-9\- ]')),
          LengthLimitingTextInputFormatter(17),
        ];
      case 'Abha_ADDRESS':
      default:
        return <TextInputFormatter>[
          FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9._]')),
          LengthLimitingTextInputFormatter(18),
        ];
    }
  }

  TextInputType _keyboardTypeFor(String type) {
    switch (type) {
      case 'AADHAAR_NUMBER':
      case 'MOBILE':
      case 'Abha_NUMBER':
        return TextInputType.number;
      case 'Abha_ADDRESS':
      default:
        return TextInputType.text;
    }
  }

  Map<String, dynamic> _buildVerificationUserPayload({
    required String phrAddress,
    required Map<String, dynamic> verificationProfile,
    required Map<String, dynamic> profileDetails,
    required Map<String, dynamic> loggedInProfile,
    required Map<String, dynamic> cardPayload,
    required String sessionToken,
    required String refreshToken,
    required String source,
  }) {
    final rawProfileSource = profileDetails['rawResponse'];
    final rawProfile = rawProfileSource is Map<String, dynamic>
        ? rawProfileSource
        : rawProfileSource is Map
        ? Map<String, dynamic>.from(rawProfileSource)
        : Map<String, dynamic>.from(profileDetails);
    final rawAddressMap = rawProfile['addr'] is Map
        ? Map<String, dynamic>.from(rawProfile['addr'] as Map)
        : profileDetails['addr'] is Map
        ? Map<String, dynamic>.from(profileDetails['addr'] as Map)
        : loggedInProfile['addr'] is Map
        ? Map<String, dynamic>.from(loggedInProfile['addr'] as Map)
        : const <String, dynamic>{};

    final name = _firstNonEmpty([
      profileDetails['name'],
      rawProfile['name'],
      loggedInProfile['name'],
      _composeName(profileDetails),
      _composeName(rawProfile),
      verificationProfile['name'],
      'Verified Patient',
    ]);
    final abhaAddress = _firstNonEmpty([
      rawProfile['preferredAbhaAddress'],
      rawProfile['abhaAddr'],
      rawProfile['AbhaAddress'],
      profileDetails['preferredAbhaAddress'],
      profileDetails['abhaAddr'],
      profileDetails['AbhaAddress'],
      loggedInProfile['preferredAbhaAddress'],
      loggedInProfile['AbhaAddress'],
      verificationProfile['preferredAbhaAddress'],
      verificationProfile['AbhaAddress'],
      phrAddress,
    ]);
    final abhaNumber = _firstNonEmpty([
      rawProfile['ABHANumber'],
      rawProfile['AbhaNumber'],
      rawProfile['abhaNo'],
      profileDetails['ABHANumber'],
      profileDetails['AbhaNumber'],
      profileDetails['abhaNo'],
      loggedInProfile['ABHANumber'],
      loggedInProfile['AbhaNumber'],
      verificationProfile['ABHANumber'],
      verificationProfile['AbhaNumber'],
    ]);
    final uhid = _firstNonEmpty([
      rawProfile['healthId'],
      rawProfile['healthIdNumber'],
      rawProfile['uhid'],
      profileDetails['healthId'],
      profileDetails['healthIdNumber'],
      profileDetails['uhid'],
      verificationProfile['healthId'],
      verificationProfile['healthIdNumber'],
      verificationProfile['uhid'],
      'N/A',
    ]);
    final mobile = _firstNonEmpty([
      verificationProfile['mobile'],
      rawProfile['mobile'],
      rawProfile['mob'],
      profileDetails['mobile'],
      profileDetails['mob'],
      loggedInProfile['mobile'],
      loggedInProfile['mob'],
    ]);
    final gender = _displayGender(
      _firstNonEmpty([
        rawProfile['gender'],
        profileDetails['gender'],
        loggedInProfile['gender'],
        verificationProfile['gender'],
      ]),
    );
    final dob = _firstNonEmpty([
      _normalizeDateOfBirth(rawProfile),
      _normalizeDateOfBirth(profileDetails),
      _normalizeDateOfBirth(loggedInProfile),
      verificationProfile['dob'],
      verificationProfile['dateOfBirth'],
      verificationProfile['yearOfBirth'],
    ]);
    final address = _firstNonEmpty([
      rawProfile['address'],
      profileDetails['address'],
      loggedInProfile['address'],
      verificationProfile['address'],
      rawAddressMap['full'],
    ]);
    final pincode = _firstNonEmpty([
      rawProfile['pincode'],
      rawProfile['pinCode'],
      profileDetails['pincode'],
      profileDetails['pinCode'],
      loggedInProfile['pincode'],
      loggedInProfile['pinCode'],
      verificationProfile['pincode'],
      verificationProfile['pinCode'],
      rawAddressMap['pincode'],
    ]);
    final state = _firstNonEmpty([
      rawProfile['stateName'],
      rawProfile['state'],
      profileDetails['state'],
      profileDetails['stateName'],
      loggedInProfile['state'],
      loggedInProfile['stateName'],
      verificationProfile['state'],
      verificationProfile['stateName'],
      rawAddressMap['state'],
    ]);
    final district = _firstNonEmpty([
      rawProfile['districtName'],
      rawProfile['district'],
      profileDetails['district'],
      profileDetails['districtName'],
      loggedInProfile['district'],
      loggedInProfile['districtName'],
      verificationProfile['district'],
      verificationProfile['districtName'],
      rawAddressMap['district'],
    ]);
    final imageBase64 = _firstNonEmpty([
      profileDetails['photo'],
      profileDetails['kycPhoto'],
      profileDetails['profilePhoto'],
      rawProfile['photo'],
      rawProfile['kycPhoto'],
      rawProfile['profilePhoto'],
      loggedInProfile['photo'],
      cardPayload['data'],
    ]);
    final availableAbhaAddresses = _collectAvailableAbhaAddresses([
      rawProfile,
      profileDetails,
      loggedInProfile,
      verificationProfile,
    ], fallback: abhaAddress);

    return {
      'name': name,
      'AbhaAddress': abhaAddress,
      'AbhaAddresses': availableAbhaAddresses,
      'AbhaNumber': abhaNumber,
      'uhid': uhid,
      'mobile': mobile,
      'gender': gender,
      'dob': dob,
      'address': address,
      'pincode': pincode,
      'state': state,
      'district': district,
      'imageBase64': imageBase64,
      'cardPayload': cardPayload,
      'rawProfile': {
        ...verificationProfile,
        ...loggedInProfile,
        ...profileDetails,
        'rawResponse': rawProfile,
        'profileDetails': profileDetails,
        'loggedInProfile': loggedInProfile,
        'enrollmentProfile': profileDetails,
      },
      'sessionToken': sessionToken,
      'refreshToken': refreshToken,
      if (source.trim().isNotEmpty) 'source': source.trim(),
      'registeredAt': DateTime.now().toIso8601String(),
    };
  }

  String _verificationCardSourceForIdentifier() {
    switch (_identifierType) {
      case 'Abha_ADDRESS':
        return 'abdm-phr-login-verification';
      case 'AADHAAR_NUMBER':
      case 'MOBILE':
      case 'Abha_NUMBER':
      default:
        return 'abdm-profile-login-verification';
    }
  }

  String _resolvePreferredAddress(
    Map<String, dynamic> profile, {
    required String fallback,
  }) {
    final phrAddress = profile['phrAddress'];
    String firstPhrAddress = '';
    if (phrAddress is List) {
      for (final entry in phrAddress) {
        final text = entry?.toString().trim() ?? '';
        if (text.isNotEmpty) {
          firstPhrAddress = text;
          break;
        }
      }
    }

    return _firstNonEmpty([
      profile['preferredAbhaAddress'],
      firstPhrAddress,
      profile['AbhaAddress'],
      fallback,
    ]);
  }

  List<String> _collectAvailableAbhaAddresses(
    List<Map<String, dynamic>> profiles, {
    required String fallback,
  }) {
    final seen = <String>{};
    final addresses = <String>[];

    void absorb(dynamic rawValue) {
      if (rawValue is List) {
        for (final entry in rawValue) {
          absorb(entry);
        }
        return;
      }

      final text = rawValue?.toString().trim() ?? '';
      if (text.isEmpty || text.toLowerCase() == 'null') {
        return;
      }

      final key = text.toLowerCase();
      if (seen.add(key)) {
        addresses.add(text);
      }
    }

    for (final profile in profiles) {
      absorb(profile['preferredAbhaAddress']);
      absorb(profile['AbhaAddress']);
      absorb(profile['abhaAddr']);
      absorb(profile['abhaAddress']);
      absorb(profile['phrAddress']);
    }

    absorb(fallback);
    return addresses;
  }

  String _extractSessionToken(Map<String, dynamic> response) {
    final tokens = response['tokens'];
    if (tokens is Map<String, dynamic>) {
      return _firstNonEmpty([
        response['sessionToken'],
        tokens['token'],
        tokens['accessToken'],
        response['token'],
        response['accessToken'],
      ]);
    }
    return _firstNonEmpty([
      response['sessionToken'],
      response['token'],
      response['accessToken'],
    ]);
  }

  String _extractRefreshToken(Map<String, dynamic> response) {
    final tokens = response['tokens'];
    if (tokens is Map<String, dynamic>) {
      return _firstNonEmpty([tokens['refreshToken'], response['refreshToken']]);
    }
    return _firstNonEmpty([response['refreshToken']]);
  }

  List<Map<String, dynamic>> _extractMobileAccounts(
    Map<String, dynamic> response,
  ) {
    final directAccounts = response['accounts'];
    if (directAccounts is List) {
      return directAccounts
          .whereType<Map>()
          .map(
            (item) => _normalizeMobileAccount(Map<String, dynamic>.from(item)),
          )
          .toList(growable: false);
    }

    final nestedResults = response['results'];
    if (nestedResults is List) {
      final collected = <Map<String, dynamic>>[];
      for (final item in nestedResults.whereType<Map>()) {
        final resultMap = Map<String, dynamic>.from(item);
        final abhaList = resultMap['ABHA'];
        if (abhaList is! List) {
          continue;
        }
        for (final abha in abhaList.whereType<Map>()) {
          final normalizedAccount = _normalizeMobileAccount({
            ...Map<String, dynamic>.from(abha),
            'txnId': _firstNonEmpty([resultMap['txnId']]),
          });
          collected.add(normalizedAccount);
        }
      }
      return collected;
    }

    final directAbhaList = response['ABHA'];
    if (directAbhaList is List) {
      return directAbhaList
          .whereType<Map>()
          .map(
            (item) => _normalizeMobileAccount(Map<String, dynamic>.from(item)),
          )
          .toList(growable: false);
    }

    return const [];
  }

  Map<String, dynamic> _normalizeMobileAccount(Map<String, dynamic> account) {
    final normalized = Map<String, dynamic>.from(account);
    normalized['AbhaNumber'] = _firstNonEmpty([
      normalized['AbhaNumber'],
      normalized['ABHANumber'],
      normalized['abhaNo'],
      normalized['abhaNumber'],
      normalized['sub'],
    ]);
    normalized['preferredAbhaAddress'] = _firstNonEmpty([
      normalized['preferredAbhaAddress'],
      normalized['preferredABHAAddress'],
      normalized['abhaAddr'],
      normalized['AbhaAddress'],
      normalized['abhaAddress'],
    ]);
    normalized['mobile'] = _firstNonEmpty([
      normalized['mobile'],
      normalized['mob'],
    ]);
    if ((normalized['address']?.toString().trim().isEmpty ?? true) &&
        normalized['addr'] is Map) {
      normalized['address'] = Map<String, dynamic>.from(
        normalized['addr'],
      )['full'];
    }
    if ((normalized['pincode']?.toString().trim().isEmpty ?? true) &&
        normalized['addr'] is Map) {
      normalized['pincode'] = Map<String, dynamic>.from(
        normalized['addr'],
      )['pincode'];
    }
    normalized['photo'] = _firstNonEmpty([
      normalized['photo'],
      normalized['kycPhoto'],
      normalized['profilePhoto'],
    ]);
    final rawKycVerified =
        normalized['kycVerified'] ?? normalized['isKycVerified'];
    final rawKycVerifiedText =
        rawKycVerified?.toString().trim().toLowerCase() ?? '';
    normalized['kycVerified'] =
        rawKycVerified == true || rawKycVerifiedText == 'true';
    return normalized;
  }

  Map<String, dynamic> get _selectedMobileAccount {
    final selectedAbhaNumber = _selectedMobileAbhaNumber?.trim() ?? '';
    if (selectedAbhaNumber.isEmpty) {
      return const <String, dynamic>{};
    }
    return _mobileLinkedAccounts.firstWhere(
      (item) =>
          (item['AbhaNumber']?.toString().trim() ?? '') == selectedAbhaNumber,
      orElse: () => const <String, dynamic>{},
    );
  }

  Map<String, dynamic> get _selectedSearchedMobileAccount {
    final selectedAbhaNumber = _selectedSearchedMobileAbhaNumber?.trim() ?? '';
    if (selectedAbhaNumber.isEmpty) {
      return const <String, dynamic>{};
    }
    return _searchedMobileAccounts.firstWhere(
      (item) =>
          (item['AbhaNumber']?.toString().trim() ?? '') == selectedAbhaNumber,
      orElse: () => const <String, dynamic>{},
    );
  }

  Map<String, dynamic> _resolveSelectedMobileAccountAfterOtp(
    List<Map<String, dynamic>> accounts,
  ) {
    final selectedSearchAccount = _selectedSearchedMobileAccount;
    if (selectedSearchAccount.isEmpty) {
      return const <String, dynamic>{};
    }

    bool matches(Map<String, dynamic> verifyAccount) {
      final selectedIndex =
          selectedSearchAccount['index']?.toString().trim() ?? '';
      final verifyIndex = verifyAccount['index']?.toString().trim() ?? '';
      if (selectedIndex.isNotEmpty && verifyIndex.isNotEmpty) {
        return selectedIndex == verifyIndex;
      }

      final selectedAbhaNumber = _firstNonEmpty([
        selectedSearchAccount['AbhaNumber'],
        selectedSearchAccount['ABHANumber'],
      ]);
      final verifyAbhaNumber = _firstNonEmpty([
        verifyAccount['AbhaNumber'],
        verifyAccount['ABHANumber'],
      ]);
      if (selectedAbhaNumber.isNotEmpty && verifyAbhaNumber.isNotEmpty) {
        if (selectedAbhaNumber == verifyAbhaNumber) {
          return true;
        }
        final selectedDigits = selectedAbhaNumber.replaceAll(
          RegExp(r'[^0-9]'),
          '',
        );
        final verifyDigits = verifyAbhaNumber.replaceAll(RegExp(r'[^0-9]'), '');
        if (selectedDigits.length >= 4 &&
            verifyDigits.length >= 4 &&
            selectedDigits.substring(selectedDigits.length - 4) ==
                verifyDigits.substring(verifyDigits.length - 4)) {
          return true;
        }
      }

      final selectedName =
          selectedSearchAccount['name']?.toString().trim().toLowerCase() ?? '';
      final verifyName =
          verifyAccount['name']?.toString().trim().toLowerCase() ?? '';
      return selectedName.isNotEmpty && selectedName == verifyName;
    }

    return accounts.firstWhere(
      matches,
      orElse: () => const <String, dynamic>{},
    );
  }

  bool _isKycVerifiedAccount(Map<String, dynamic> account) {
    return account['kycVerified'] == true ||
        account['verifiedStatus']?.toString().trim().toUpperCase() ==
            'VERIFIED';
  }

  Map<String, dynamic> _profileFromVerificationResult(
    Map<String, dynamic> response, {
    required String fallbackIdentifier,
  }) {
    final tokenClaims = _decodeJwtClaims(_extractSessionToken(response));
    final accounts = response['accounts'];
    Map<String, dynamic> account = const <String, dynamic>{};
    if (accounts is List) {
      final mapped = accounts
          .whereType<Map>()
          .map(
            (item) => _normalizeMobileAccount(Map<String, dynamic>.from(item)),
          )
          .toList(growable: false);
      if (mapped.isNotEmpty) {
        if (_identifierType == 'MOBILE' &&
            _selectedMobileAbhaNumber?.trim().isNotEmpty == true) {
          account = mapped.firstWhere(
            (item) =>
                (item['AbhaNumber']?.toString().trim() ?? '') ==
                _selectedMobileAbhaNumber!.trim(),
            orElse: () => const <String, dynamic>{},
          );
        }
        if (account.isEmpty) {
          account = mapped.firstWhere(
            (item) =>
                (item['status']?.toString().trim().toUpperCase() ?? '') ==
                'ACTIVE',
            orElse: () => mapped.first,
          );
        }
      }
    }

    return {
      'authResult': response['authResult'],
      'message': response['message'],
      'txnId': response['txnId'],
      'AbhaNumber': _resolveVerifiedAbhaNumber([
        account,
        response,
        tokenClaims,
      ]),
      'preferredAbhaAddress': _firstNonEmpty([
        account['preferredAbhaAddress'],
        response['preferredAbhaAddress'],
        response['abhaAddr'],
        response['AbhaAddress'],
        tokenClaims['preferredAbhaAddress'],
        tokenClaims['abhaAddress'],
        tokenClaims['phrAddress'],
        _identifierType == 'ABHA_ADDRESS' ? fallbackIdentifier : '',
      ]),
      'AbhaAddress': _firstNonEmpty([
        account['preferredAbhaAddress'],
        response['preferredAbhaAddress'],
        response['abhaAddr'],
        response['AbhaAddress'],
        tokenClaims['preferredAbhaAddress'],
        tokenClaims['abhaAddress'],
        tokenClaims['phrAddress'],
        _identifierType == 'ABHA_ADDRESS' ? fallbackIdentifier : '',
      ]),
      'mobile': _firstNonEmpty([
        tokenClaims['mobile'],
        response['mobile'],
        response['mob'],
        account['mobile'],
        _identifierType == 'MOBILE' ? fallbackIdentifier : '',
      ]),
      'name': _firstNonEmpty([
        tokenClaims['fullName'],
        response['name'],
        [
          response['fName'],
          response['mName'],
          response['lName'],
        ].whereType<String>().where((part) => part.trim().isNotEmpty).join(' '),
        account['name'],
      ]),
      'gender': _firstNonEmpty([response['gender'], account['gender']]),
      'dob': _firstNonEmpty([
        response['dob'],
        response['dateOfBirth'],
        response['yob'],
        account['dob'],
      ]),
      'verifiedStatus': _firstNonEmpty([
        response['verifiedStatus'],
        account['verifiedStatus'],
      ]),
      'verificationType': _firstNonEmpty([
        response['verificationType'],
        account['verificationType'],
      ]),
      'kycVerified':
          response['kycVerified'] ??
          account['kycVerified'] ??
          tokenClaims['isKycVerified'],
      'status': _firstNonEmpty([response['status'], account['status']]),
      'photo': _firstNonEmpty([
        response['photo'],
        response['kycPhoto'],
        response['profilePhoto'],
        account['profilePhoto'],
      ]),
      'profilePhoto': _firstNonEmpty([
        response['photo'],
        response['kycPhoto'],
        response['profilePhoto'],
        account['profilePhoto'],
      ]),
      'address': _firstNonEmpty([
        account['address'],
        tokenClaims['addressLine'],
        response['address'],
        response['addr'] is Map
            ? Map<String, dynamic>.from(response['addr'])['full']
            : null,
      ]),
      'pincode': _firstNonEmpty([
        account['pincode'],
        tokenClaims['pincode'],
        response['pincode'],
        response['pinCode'],
        response['addr'] is Map
            ? Map<String, dynamic>.from(response['addr'])['pincode']
            : null,
      ]),
      'district': _firstNonEmpty([
        response['district'],
        response['addr'] is Map
            ? Map<String, dynamic>.from(response['addr'])['district']
            : null,
      ]),
      'state': _firstNonEmpty([
        response['state'],
        response['addr'] is Map
            ? Map<String, dynamic>.from(response['addr'])['state']
            : null,
      ]),
      'accounts': accounts,
      'tokenClaims': tokenClaims,
    };
  }

  Map<String, dynamic> _decodeJwtClaims(String token) {
    final trimmed = token.trim();
    if (trimmed.isEmpty) {
      return const <String, dynamic>{};
    }

    try {
      final parts = trimmed.split('.');
      if (parts.length < 2) {
        return const <String, dynamic>{};
      }
      final payload = base64Url.normalize(parts[1]);
      final decoded = utf8.decode(base64Url.decode(payload));
      final json = jsonDecode(decoded);
      if (json is Map<String, dynamic>) {
        return json;
      }
      if (json is Map) {
        return Map<String, dynamic>.from(json);
      }
    } catch (_) {}

    return const <String, dynamic>{};
  }

  bool _looksLikeMobileNumber(String value) {
    final digits = value.replaceAll(RegExp(r'\D'), '');
    return digits.length == 10;
  }

  bool _looksLikeAbhaNumber(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) {
      return false;
    }
    if (trimmed.contains('-')) {
      return true;
    }
    final digits = trimmed.replaceAll(RegExp(r'\D'), '');
    return digits.length > 10;
  }

  String _resolveVerifiedAbhaNumber(List<Map<String, dynamic>> profiles) {
    final candidates = <String>[
      for (final profile in profiles) ...[
        _firstNonEmpty([
          profile['AbhaNumber'],
          profile['ABHANumber'],
          profile['abhaNumber'],
          profile['abhaNo'],
        ]),
      ],
    ].where((value) => value.trim().isNotEmpty).toList(growable: false);

    for (final candidate in candidates) {
      if (_looksLikeAbhaNumber(candidate) &&
          !_looksLikeMobileNumber(candidate)) {
        return candidate;
      }
    }

    for (final candidate in candidates) {
      if (!_looksLikeMobileNumber(candidate)) {
        return candidate;
      }
    }

    return candidates.isEmpty ? '' : candidates.first;
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
    return '';
  }

  String _normalizeDateOfBirth(Map<String, dynamic> data) {
    final dob = data['dob'];
    if (dob is Map) {
      final dobMap = Map<String, dynamic>.from(dob);
      final day = _firstNonEmpty([dobMap['d'], dobMap['day']]);
      final month = _firstNonEmpty([dobMap['m'], dobMap['month']]);
      final year = _firstNonEmpty([
        dobMap['y'],
        dobMap['year'],
        data['yob'],
        data['yearOfBirth'],
      ]);
      if (day.isNotEmpty && month.isNotEmpty && year.isNotEmpty) {
        return '$day-$month-$year';
      }
    }

    final dayOfBirth = _firstNonEmpty([data['dayOfBirth'], data['day']]);
    final monthOfBirth = _firstNonEmpty([data['monthOfBirth'], data['month']]);
    final yearOfBirth = _firstNonEmpty([
      data['yearOfBirth'],
      data['yob'],
      data['year'],
    ]);
    if (dayOfBirth.isNotEmpty &&
        monthOfBirth.isNotEmpty &&
        yearOfBirth.isNotEmpty) {
      return '$dayOfBirth-$monthOfBirth-$yearOfBirth';
    }

    return _firstNonEmpty([
      data['dob'],
      data['dateOfBirth'],
      data['yob'],
      data['yearOfBirth'],
    ]);
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

  void _debugLogVerificationPopupPayload({
    required Map<String, dynamic> patientPayload,
    required Map<String, dynamic> cardPayload,
    required Map<String, dynamic> profile,
    required Map<String, dynamic> resolvedFields,
  }) {
    final popupPayload = <String, dynamic>{
      'patientPayload': patientPayload,
      'cardPayload': cardPayload,
      'profile': profile,
      'resolvedFields': resolvedFields,
    };

    String payloadText;
    try {
      payloadText = const JsonEncoder.withIndent('  ').convert(popupPayload);
    } catch (_) {
      payloadText = popupPayload.toString();
    }

    debugPrint('********************************');
    debugPrint('********************************');
    debugPrint('[Verification Popup Payload]\n$payloadText');
  }

  void _debugLogMobileSearchResolution({
    required Map<String, dynamic> response,
    required List<Map<String, dynamic>> accounts,
  }) {
    final payload = <String, dynamic>{
      'rawResponse': response,
      'resolvedAccountCount': accounts.length,
      'resolvedAccounts': accounts,
    };

    String payloadText;
    try {
      payloadText = const JsonEncoder.withIndent('  ').convert(payload);
    } catch (_) {
      payloadText = payload.toString();
    }

    debugPrint('********************************');
    debugPrint('********************************');
    debugPrint('[Mobile Search Resolution]\n$payloadText');
  }

  Map<String, dynamic> _buildVerificationPopupFields({
    required Map<String, dynamic> patientPayload,
    required Map<String, dynamic> cardPayload,
  }) {
    final profile = patientPayload['rawProfile'] is Map<String, dynamic>
        ? Map<String, dynamic>.from(patientPayload['rawProfile'])
        : <String, dynamic>{};
    final profileDetails = profile['profileDetails'] is Map<String, dynamic>
        ? Map<String, dynamic>.from(profile['profileDetails'])
        : <String, dynamic>{};
    final enrollmentProfile =
        profile['enrollmentProfile'] is Map<String, dynamic>
        ? Map<String, dynamic>.from(profile['enrollmentProfile'])
        : <String, dynamic>{};
    final loggedInProfile = profile['loggedInProfile'] is Map<String, dynamic>
        ? Map<String, dynamic>.from(profile['loggedInProfile'])
        : <String, dynamic>{};

    final sources = <Map<String, dynamic>>[
      if (profileDetails['rawResponse'] is Map<String, dynamic>)
        Map<String, dynamic>.from(profileDetails['rawResponse']),
      profileDetails,
      if (enrollmentProfile['rawResponse'] is Map<String, dynamic>)
        Map<String, dynamic>.from(enrollmentProfile['rawResponse']),
      enrollmentProfile,
      if (loggedInProfile['rawResponse'] is Map<String, dynamic>)
        Map<String, dynamic>.from(loggedInProfile['rawResponse']),
      loggedInProfile,
      profile,
    ];

    String pick(String key) =>
        _firstNonEmpty(sources.map((source) => source[key]).toList());

    String pickAddr(String key) {
      for (final source in sources) {
        final addr = source['addr'];
        if (addr is Map) {
          final text =
              Map<String, dynamic>.from(addr)[key]?.toString().trim() ?? '';
          if (text.isNotEmpty && text.toLowerCase() != 'null') {
            return text;
          }
        }
      }
      return '';
    }

    final resolvedName = _firstNonEmpty([
      pick('name'),
      _composeName(profileDetails),
      _composeName(enrollmentProfile),
      _composeName(loggedInProfile),
      patientPayload['name'],
      'Verified Patient',
    ]);
    final resolvedAbhaAddress = _firstNonEmpty([
      pick('preferredAbhaAddress'),
      pick('AbhaAddress'),
      pick('abhaAddr'),
      pick('abhaAddress'),
      patientPayload['AbhaAddress'],
      '-',
    ]);
    final resolvedAbhaNumber = _firstNonEmpty([
      _resolveVerifiedAbhaNumber(sources),
      patientPayload['AbhaNumber'],
      '-',
    ]);
    final resolvedMobile = _firstNonEmpty([
      pick('mobile'),
      pick('mobileNumber'),
      patientPayload['mobile'],
      '-',
    ]);
    final resolvedGender = _displayGender(
      _firstNonEmpty([pick('gender'), patientPayload['gender'], '-']),
    );
    final resolvedDob = _firstNonEmpty([
      pick('dob'),
      pick('dateOfBirth'),
      _normalizeDateOfBirth(profileDetails),
      _normalizeDateOfBirth(enrollmentProfile),
      _normalizeDateOfBirth(loggedInProfile),
      patientPayload['dob'],
      '-',
    ]);
    final resolvedAddress = _firstNonEmpty([
      pick('address'),
      pick('addressLine'),
      pickAddr('full'),
      patientPayload['address'],
      '-',
    ]);
    final resolvedPincode = _firstNonEmpty([
      pick('pincode'),
      pick('pinCode'),
      pickAddr('pincode'),
      patientPayload['pincode'],
      '-',
    ]);
    final resolvedDistrict = _firstNonEmpty([
      pick('district'),
      pick('districtName'),
      pickAddr('district'),
      patientPayload['district'],
      patientPayload['districtName'],
      '-',
    ]);
    final resolvedState = _firstNonEmpty([
      pick('state'),
      pick('stateName'),
      pickAddr('state'),
      patientPayload['state'],
      patientPayload['stateName'],
      '-',
    ]);
    final resolvedImage = _firstNonEmpty([
      pick('profilePhoto'),
      pick('photo'),
      pick('kycPhoto'),
      patientPayload['imageBase64'],
    ]);

    return <String, dynamic>{
      'name': resolvedName,
      'AbhaAddress': resolvedAbhaAddress,
      'AbhaNumber': resolvedAbhaNumber,
      'uhid': _firstNonEmpty([patientPayload['uhid'], 'N/A']),
      'mobile': resolvedMobile,
      'gender': resolvedGender,
      'dob': resolvedDob,
      'address': resolvedAddress,
      'pincode': resolvedPincode,
      'district': resolvedDistrict,
      'districtName': resolvedDistrict,
      'state': resolvedState,
      'stateName': resolvedState,
      'imageBase64': resolvedImage,
      'cardFileName': _firstNonEmpty([cardPayload['fileName']]),
      'cardContentType': _firstNonEmpty([cardPayload['contentType']]),
      'cardData': _firstNonEmpty([cardPayload['data']]),
    };
  }

  void _showError(String msg) {
    final cleaned = AbhaApiService.userFacingError(msg);
    final resolvedMessage =
        _identifierType == 'AADHAAR_NUMBER' &&
            _isInvalidAadhaarVerificationError(cleaned.isEmpty ? msg : cleaned)
        ? 'Please enter a valid Aadhar number, Aadhar does not exists'
        : (cleaned.isEmpty ? msg : cleaned);
    showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Error'),
        content: Text(resolvedMessage),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  bool _isInvalidAadhaarVerificationError(String message) {
    final normalized = message.trim().toLowerCase();
    return normalized.contains('loginid is invalid') ||
        normalized.contains('invalid loginid') ||
        normalized.contains('invalid login id') ||
        normalized.contains('valid aadhar number') ||
        normalized.contains('valid aadhaar number');
  }

  Future<bool> _showNoAccountsFoundDialog() async {
    return await showDialog<bool>(
          context: context,
          builder: (_) => AlertDialog(
            title: const Text('No ABHA Account Linked'),
            content: const Text(
              'No ABHA account is linked to this mobile number. You can continue into the Create ABHA flow from here.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Create ABHA'),
              ),
            ],
          ),
        ) ??
        false;
  }

  Widget _otpInputRow() {
    return OtpDigitRow(
      controllers: _otpDigitCtrls,
      focusNodes: _otpFocusNodes,
      enabled: !loading,
      onChanged: () => setState(() {}),
    );
  }

  Widget _mobileAccountTile(Map<String, dynamic> account) {
    return _mobileRecordTile(
      account: account,
      selectedAbhaNumber: _selectedMobileAbhaNumber,
      onSelect: (abhaNumber) =>
          setState(() => _selectedMobileAbhaNumber = abhaNumber),
      pendingHint:
          'KYC is pending for this ABHA. It is shown for review, but login cannot continue until KYC is completed.',
    );
  }

  Widget _searchedMobileAccountTile(Map<String, dynamic> account) {
    return _mobileRecordTile(
      account: account,
      selectedAbhaNumber: _selectedSearchedMobileAbhaNumber,
      onSelect: (abhaNumber) =>
          setState(() => _selectedSearchedMobileAbhaNumber = abhaNumber),
    );
  }

  Widget _mobileRecordTile({
    required Map<String, dynamic> account,
    required String? selectedAbhaNumber,
    required ValueChanged<String> onSelect,
    String? pendingHint,
  }) {
    final abhaNumber = account['AbhaNumber']?.toString().trim() ?? '';
    final selected =
        abhaNumber.isNotEmpty &&
        abhaNumber == (selectedAbhaNumber?.trim() ?? '');
    final kycVerified = _isKycVerifiedAccount(account);
    final verificationType =
        account['verificationType']?.toString().trim() ?? '';
    final abhaAddress = _firstNonEmpty([
      account['preferredAbhaAddress'],
      account['AbhaAddress'],
      account['abhaAddr'],
    ]);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: loading || abhaNumber.isEmpty
            ? null
            : () => onSelect(abhaNumber),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: selected ? const Color(0xFFF0FBF4) : Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: selected
                  ? const Color(0xFF9FD8BA)
                  : const Color(0xFFD7E5F0),
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                selected
                    ? Icons.check_circle_rounded
                    : Icons.radio_button_unchecked_rounded,
                color: selected
                    ? const Color(0xFF2F8F5B)
                    : const Color(0xFF8AA0B3),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _firstNonEmpty([account['name'], 'ABHA Record']),
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 17,
                        color: Color(0xFF17324A),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'ABHA Number: ${_firstNonEmpty([abhaNumber, '-'])}',
                      style: const TextStyle(
                        color: Color(0xFF4D6072),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Gender: ${_displayGender(_firstNonEmpty([account['gender'], '-']))}',
                      style: const TextStyle(color: Color(0xFF607285)),
                    ),
                    if (abhaAddress.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        'ABHA Address: $abhaAddress',
                        style: const TextStyle(color: Color(0xFF607285)),
                      ),
                    ],
                    if (verificationType.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        'Verification Type: $verificationType',
                        style: const TextStyle(color: Color(0xFF607285)),
                      ),
                    ],
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: kycVerified
                            ? const Color(0xFFEFFAF3)
                            : const Color(0xFFFFF7E8),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                          color: kycVerified
                              ? const Color(0xFFB8E2C8)
                              : const Color(0xFFF1D18B),
                        ),
                      ),
                      child: Text(
                        kycVerified ? 'KYC Verified' : 'KYC Pending',
                        style: TextStyle(
                          color: kycVerified
                              ? const Color(0xFF2F8F5B)
                              : const Color(0xFF9C6B08),
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    if (!kycVerified) ...[
                      const SizedBox(height: 10),
                      Text(
                        pendingHint ?? 'KYC is pending for this ABHA.',
                        style: TextStyle(
                          color: Color(0xFF8B6417),
                          fontWeight: FontWeight.w600,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _clearOtpInputs() {
    for (final controller in _otpDigitCtrls) {
      controller.clear();
    }
  }

  Future<bool> _showVerifiedCardPreview({
    required Map<String, dynamic> patientPayload,
    required Map<String, dynamic> cardPayload,
  }) async {
    final profile = patientPayload['rawProfile'] is Map<String, dynamic>
        ? Map<String, dynamic>.from(patientPayload['rawProfile'])
        : <String, dynamic>{};
    final resolvedFields = _buildVerificationPopupFields(
      patientPayload: patientPayload,
      cardPayload: cardPayload,
    );
    final patientName = _firstNonEmpty([
      resolvedFields['name'],
      'Verified Patient',
    ]);
    final patientAbhaAddress = _firstNonEmpty([
      resolvedFields['AbhaAddress'],
      '-',
    ]);
    final patientAbhaNumber = _firstNonEmpty([
      resolvedFields['AbhaNumber'],
      '-',
    ]);
    final patientMobile = _firstNonEmpty([resolvedFields['mobile'], '-']);
    final patientGender = _firstNonEmpty([resolvedFields['gender'], '-']);
    final patientDob = _firstNonEmpty([resolvedFields['dob'], '-']);
    final patientAddress = _firstNonEmpty([resolvedFields['address'], '-']);
    final patientPincode = _firstNonEmpty([resolvedFields['pincode'], '-']);
    final patientDistrict = _firstNonEmpty([
      resolvedFields['district'],
      resolvedFields['districtName'],
      '-',
    ]);
    final patientState = _firstNonEmpty([
      resolvedFields['state'],
      resolvedFields['stateName'],
      '-',
    ]);
    final patientImageBase64 = _firstNonEmpty([resolvedFields['imageBase64']]);
    final profilePhoto = _firstNonEmpty([
      profile['profilePhoto'],
      profile['photo'],
      patientImageBase64,
    ]);
    final avatarBytes = _decodeBase64Safe(profilePhoto);
    _debugLogVerificationPopupPayload(
      patientPayload: patientPayload,
      cardPayload: cardPayload,
      profile: profile,
      resolvedFields: resolvedFields,
    );

    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        final size = MediaQuery.of(dialogContext).size;
        return Dialog(
          insetPadding: const EdgeInsets.all(24),
          clipBehavior: Clip.antiAlias,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: 960,
              maxHeight: size.height * 0.9,
            ),
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.fromLTRB(24, 20, 18, 20),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        Color(0xFFF0F9FF),
                        Color(0xFFF2FBF4),
                        Color(0xFFFFFFFF),
                      ],
                    ),
                    border: Border(
                      bottom: BorderSide(color: Color(0xFFE1EAF2)),
                    ),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Verify ABHA Profile',
                              style: TextStyle(
                                color: Color(0xFF17324A),
                                fontSize: 28,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Review the verified ABHA details for $patientName before adding this patient to the ${HospitalConfig.hospitalShortName} dashboard.',
                              style: const TextStyle(
                                color: Color(0xFF607285),
                                height: 1.45,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.of(dialogContext).pop(false),
                        icon: const Icon(Icons.close_rounded, size: 28),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(24),
                            gradient: const LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [Color(0xFFEAF6FF), Color(0xFFF0FBF4)],
                            ),
                            border: Border.all(color: const Color(0xFFD7E5F0)),
                          ),
                          child: Row(
                            children: [
                              Container(
                                width: 94,
                                height: 94,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(28),
                                  color: Colors.white,
                                  border: Border.all(
                                    color: const Color(0xFFD8E6EF),
                                  ),
                                  boxShadow: const [
                                    BoxShadow(
                                      color: Color(0x11000000),
                                      blurRadius: 18,
                                      offset: Offset(0, 8),
                                    ),
                                  ],
                                ),
                                clipBehavior: Clip.antiAlias,
                                child: avatarBytes != null
                                    ? Image.memory(
                                        avatarBytes,
                                        fit: BoxFit.cover,
                                      )
                                    : const Icon(
                                        Icons.account_circle_rounded,
                                        size: 72,
                                        color: Color(0xFF8FA2B5),
                                      ),
                              ),
                              const SizedBox(width: 18),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 12,
                                        vertical: 8,
                                      ),
                                      decoration: BoxDecoration(
                                        color: Colors.white.withValues(
                                          alpha: 0.8,
                                        ),
                                        borderRadius: BorderRadius.circular(
                                          999,
                                        ),
                                        border: Border.all(
                                          color: const Color(0xFFD2E3F1),
                                        ),
                                      ),
                                      child: const Text(
                                        'Verified ABHA profile',
                                        style: TextStyle(
                                          color: Color(0xFF1B5E8C),
                                          fontSize: 13,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 14),
                                    Text(
                                      patientName,
                                      style: const TextStyle(
                                        color: Color(0xFF17324A),
                                        fontSize: 34,
                                        fontWeight: FontWeight.w900,
                                        height: 1.05,
                                      ),
                                    ),
                                    const SizedBox(height: 10),
                                    Wrap(
                                      spacing: 18,
                                      runSpacing: 10,
                                      children: [
                                        _cardFact(
                                          'ABHA Number',
                                          patientAbhaNumber,
                                        ),
                                        _cardFact(
                                          'ABHA Address',
                                          patientAbhaAddress,
                                        ),
                                        _cardFact('Mobile', patientMobile),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 20),
                        LayoutBuilder(
                          builder: (context, constraints) {
                            final twoColumns = constraints.maxWidth >= 760;
                            final fieldWidgets = <Widget>[
                              _verificationDetailField(
                                'Patient Name',
                                patientName,
                              ),
                              _verificationDetailField('DOB', patientDob),
                              _verificationDetailField('Gender', patientGender),
                              _verificationDetailField(
                                'ABHA Number',
                                patientAbhaNumber,
                              ),
                              _verificationDetailField(
                                'ABHA Address',
                                patientAbhaAddress,
                              ),
                              _verificationDetailField(
                                'Phone Number',
                                patientMobile,
                              ),
                              _verificationDetailField(
                                'Pincode',
                                patientPincode,
                              ),
                              _verificationDetailField(
                                'District',
                                patientDistrict,
                              ),
                              _verificationDetailField('State', patientState),
                              _verificationDetailField(
                                'Address',
                                patientAddress,
                                maxLines: 4,
                              ),
                            ];

                            if (twoColumns) {
                              final left = <Widget>[];
                              final right = <Widget>[];
                              for (var i = 0; i < fieldWidgets.length; i++) {
                                (i.isEven ? left : right).add(fieldWidgets[i]);
                              }
                              return Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(
                                    child: Column(
                                      children:
                                          left
                                              .expand(
                                                (widget) => [
                                                  widget,
                                                  const SizedBox(height: 16),
                                                ],
                                              )
                                              .toList()
                                            ..removeLast(),
                                    ),
                                  ),
                                  const SizedBox(width: 18),
                                  Expanded(
                                    child: Column(
                                      children:
                                          right
                                              .expand(
                                                (widget) => [
                                                  widget,
                                                  const SizedBox(height: 16),
                                                ],
                                              )
                                              .toList()
                                            ..removeLast(),
                                    ),
                                  ),
                                ],
                              );
                            }

                            return Column(
                              children:
                                  fieldWidgets
                                      .expand(
                                        (widget) => [
                                          widget,
                                          const SizedBox(height: 16),
                                        ],
                                      )
                                      .toList()
                                    ..removeLast(),
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.fromLTRB(24, 18, 24, 24),
                  decoration: const BoxDecoration(
                    color: Color(0xFFFCFEFF),
                    border: Border(top: BorderSide(color: Color(0xFFE1EAF2))),
                  ),
                  child: Row(
                    children: [
                      TextButton(
                        onPressed: () => Navigator.of(dialogContext).pop(false),
                        child: const Text('Back'),
                      ),
                      const Spacer(),
                      OutlinedButton.icon(
                        onPressed: () async {
                          await _showVerificationCardDialog(
                            dialogContext,
                            cardPayload,
                            patientPayload,
                          );
                        },
                        icon: const Icon(Icons.badge_outlined),
                        label: const Text('View ABHA Card'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF2F8F5B),
                          side: const BorderSide(color: Color(0xFFAEDFC0)),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 20,
                            vertical: 16,
                          ),
                        ),
                      ),
                      const SizedBox(width: 14),
                      ElevatedButton(
                        onPressed: () => Navigator.of(dialogContext).pop(true),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF1B5E8C),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 24,
                            vertical: 16,
                          ),
                        ),
                        child: const Text('Register Patient'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );

    return result == true;
  }

  Widget _cardFact(String label, String value) {
    return SizedBox(
      width: 220,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: Color(0xFF637587),
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.2,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: const TextStyle(
              color: Color(0xFF17324A),
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }

  Widget _verificationDetailField(
    String label,
    String value, {
    int maxLines = 2,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFD7E5F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: Color(0xFF5F7387),
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.2,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            value,
            maxLines: maxLines,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Color(0xFF17324A),
              fontSize: 17,
              fontWeight: FontWeight.w800,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }

  Uint8List? _decodeBase64Safe(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) {
      return null;
    }
    try {
      return base64Decode(trimmed);
    } catch (_) {
      return null;
    }
  }

  Future<void> _showVerificationCardDialog(
    BuildContext dialogContext,
    Map<String, dynamic> cardPayload,
    Map<String, dynamic> userSession,
  ) async {
    final source = userSession['source']?.toString().trim() ?? '';
    if (source == 'abdm-phr-login-verification') {
      await showLoggedInPhrAbhaCardPreviewDialog(
        dialogContext,
        cardPayload: cardPayload,
        userSession: userSession,
        onCardPayloadLoaded: (payload) {
          userSession['cardPayload'] = payload;
        },
        unavailableMessage:
            'ABHA card is not available for this verified profile in the current app session.',
      );
      return;
    }

    await showEnrollmentAccountAbhaCardPreviewDialog(
      dialogContext,
      cardPayload: cardPayload,
      userSession: userSession,
      onCardPayloadLoaded: (payload) {
        userSession['cardPayload'] = payload;
      },
      unavailableMessage:
          'ABHA card is not available for this verified profile in the current app session.',
    );
  }
}

class _VerificationOption {
  const _VerificationOption({
    required this.type,
    required this.label,
    required this.helper,
  });

  final String type;
  final String label;
  final String helper;
}

class _OtpMethodOption {
  const _OtpMethodOption({
    required this.value,
    required this.label,
    required this.helper,
  });

  final String value;
  final String label;
  final String helper;
}
