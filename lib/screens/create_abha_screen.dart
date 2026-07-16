// ignore_for_file: unused_element

import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import '../config/hospital_config.dart';
import 'package:flutter/services.dart';
import 'package:sarita_abdm/screens/create_abha_address_screen.dart';

import '../flows/create_abha/aadhaar_linked_mobile_flow.dart';
import '../flows/create_abha/alternate_mobile_update_flow.dart';
import '../models/abha_profile.dart';
import '../services/abha_api_service.dart';
import '../utils/aadhaar_text.dart';
import '../utils/app_runtime_store.dart';
import '../utils/registered_users_store.dart';
import '../widgets/abha_card_preview_dialog.dart';
import '../widgets/desktop_workspace.dart';
import '../widgets/otp_digit_row.dart';

class CreateAbhaScreen extends StatefulWidget {
  const CreateAbhaScreen({super.key});

  @override
  State<CreateAbhaScreen> createState() => _CreateAbhaScreenState();
}

class _CreateAbhaScreenState extends State<CreateAbhaScreen> {
  static const int _resendCooldownSeconds = 60;
  static const AadhaarLinkedMobileFlow _aadhaarLinkedMobileFlow =
      AadhaarLinkedMobileFlow();
  static const AlternateMobileUpdateFlow _alternateMobileUpdateFlow =
      AlternateMobileUpdateFlow();

  final _aadhaarCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _txnCtrl = TextEditingController();
  final _otpMobileCtrl = TextEditingController();

  late final List<TextEditingController> _otpDigitCtrls;
  late final List<FocusNode> _otpFocusNodes;

  bool _otpRequested = false;
  bool _isLoading = false;
  bool _showAadhaar = false;
  bool _updatingAadhaarText = false;
  String _aadhaarRaw = '';
  String _aadhaarLinkedMobileHint = '';
  String _otpSentMessage = '';
  bool _verifyingProvidedMobile = false;
  bool _showNameSelection = false;
  AbhaProfile? _verifiedProfile;
  String _pendingEnrollmentTxnId = '';
  String? _selectedNameOption;
  Map<String, dynamic>? _pendingExistingUserFromApi;

  late final List<_ConsentItem> _consents;
  bool _nameConsentAccepted = false;

  int _resendCount = 0;
  int _resendSecondsRemaining = 0;
  Timer? _resendTimer;

  @override
  void initState() {
    super.initState();
    _otpDigitCtrls = List.generate(6, (_) => TextEditingController());
    _otpFocusNodes = List.generate(6, (_) => FocusNode());
    _consents = [
      _ConsentItem(
        label:
            'I am voluntarily sharing my Aadhaar Number/Virtual ID issued by the Unique Identification Authority of India ("UIDAI"), and my demographic information for the purpose of creating an Ayushman Bharat Health Account number ("ABHA number") and Ayushman Bharat Health Account address ("ABHA Address"). I authorize ${HospitalConfig.hospitalLegalName} to use my Aadhaar / Virtual ID for Aadhaar based authentication with UIDAI as per Aadhaar Act, 2016. I understand that UIDAI will share my e-KYC details or response of "Yes" upon successful authentication.',
      ),
      _ConsentItem(
        label:
            'I intend to create an ABHA number and ABHA address using document other than Aadhaar.',
      ),
      _ConsentItem(
        label:
            'I consent to usage of my ABHA address and ABHA number for linking of my legacy (past) government health records and records generated during this encounter.',
      ),
      _ConsentItem(
        label:
            'I authorize the sharing of all my health records with healthcare providers for providing healthcare services during this encounter.',
      ),
      _ConsentItem(
        label:
            'I consent to the anonymization and use of my health records for public health purposes.',
      ),
      _ConsentItem(
        label:
            '${HospitalConfig.hospitalLegalName} confirms that the beneficiary has been informed and explained about the above consents.',
      ),
    ];
    _syncAadhaarText();
  }

  @override
  void dispose() {
    _resendTimer?.cancel();
    _aadhaarCtrl.dispose();
    _nameCtrl.dispose();
    _txnCtrl.dispose();
    _otpMobileCtrl.dispose();
    for (final ctrl in _otpDigitCtrls) {
      ctrl.dispose();
    }
    for (final node in _otpFocusNodes) {
      node.dispose();
    }
    super.dispose();
  }

  bool get _isAadhaarValid => RegExp(r'^\d{12}$').hasMatch(_aadhaarRaw);

  bool get _allConsentsAccepted =>
      _consents.every((item) => item.accepted) && _nameConsentAccepted;

  bool get _selectAllValue => _allConsentsAccepted;

  String get _otpValue =>
      _otpDigitCtrls.map((controller) => controller.text.trim()).join();

  bool get _isOtpComplete => RegExp(r'^\d{6}$').hasMatch(_otpValue);

  bool get _hasEnteredName => _nameCtrl.text.trim().isNotEmpty;

  bool get _canRequestOtp =>
      !_isLoading && _isAadhaarValid && _hasEnteredName && _allConsentsAccepted;

  bool get _canVerifyOtp =>
      _otpRequested &&
      _txnCtrl.text.trim().isNotEmpty &&
      _isOtpComplete &&
      !_isLoading &&
      (_verifyingProvidedMobile || _isOtpMobileValid);

  bool get _canResendOtp =>
      _otpRequested &&
      !_isLoading &&
      _resendCount < 2 &&
      _resendSecondsRemaining == 0 &&
      _isAadhaarValid;

  bool get _isOtpMobileValid =>
      RegExp(r'^\d{10}$').hasMatch(_otpMobileCtrl.text.trim());

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          _showNameSelection
              ? 'Name Selection'
              : _otpRequested
              ? 'ABHA Registration'
              : 'Create ABHA',
        ),
        actions: (_otpRequested || _showNameSelection)
            ? [
                IconButton(
                  tooltip: 'Close',
                  icon: const Icon(Icons.close),
                  onPressed: _resetToConsentForm,
                ),
                const SizedBox(width: 8),
              ]
            : null,
      ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          if (_showNameSelection) {
            return _nameSelectionView();
          }
          if (_otpRequested) {
            return _otpVerificationView();
          }

          return Align(
            alignment: Alignment.topCenter,
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1220),
                child: Column(children: [_formCard()]),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _formCard() {
    return DesktopSurface(
      margin: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _aadhaarInputField(),
          const SizedBox(height: 14),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              'Please ensure that your mobile number is linked with Aadhaar, as it is required for OTP Authentication.',
              style: TextStyle(
                color: Color(0xFF364A5D),
                fontSize: 14,
                height: 1.45,
              ),
            ),
          ),
          const SizedBox(height: 28),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              'I hereby declare that:',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: Color(0xFF24364A),
              ),
            ),
          ),
          const SizedBox(height: 12),
          CheckboxListTile(
            value: _selectAllValue,
            onChanged: (value) => _toggleSelectAll(value ?? false),
            dense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 4),
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: const Color(0xFF22B565),
            title: const Text(
              'Select All',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: Color(0xFF35475A),
              ),
            ),
          ),
          const SizedBox(height: 4),
          for (var i = 0; i < _consents.length; i++)
            _consentTile(
              value: _consents[i].accepted,
              text: _consents[i].label,
              onChanged: (value) {
                setState(() {
                  _consents[i].accepted = value ?? false;
                });
              },
            ),
          const SizedBox(height: 6),
          _nameConsentRow(),
          const SizedBox(height: 24),
          _primaryButton('Generate OTP', _canRequestOtp ? _requestOtp : null),
        ],
      ),
    );
  }

  Widget _otpVerificationView() {
    return Container(
      width: double.infinity,
      height: double.infinity,
      color: const Color(0xFFF6FBF8),
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 980),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: const Color(0xFFD8E7DE)),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x120F2233),
                    blurRadius: 20,
                    offset: Offset(0, 10),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 28,
                      vertical: 22,
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            'ABHA Registration',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF23412E),
                            ),
                          ),
                        ),
                        IconButton(
                          tooltip: 'Close registration',
                          onPressed: _resetToConsentForm,
                          icon: const Icon(
                            Icons.close,
                            color: Color(0xFF64727E),
                            size: 30,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 1, color: Color(0xFFD8E7DE)),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(22, 28, 22, 24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
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
                              border: Border.all(
                                color: const Color(0xFFBFE6CD),
                              ),
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
                          const SizedBox(height: 16),
                        ],
                        const Text(
                          'Verify OTP *',
                          style: TextStyle(
                            color: Color(0xFF22B565),
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 20,
                            vertical: 22,
                          ),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: const Color(0xFF22B565),
                              width: 1.4,
                            ),
                          ),
                          child: OtpDigitRow(
                            controllers: _otpDigitCtrls,
                            focusNodes: _otpFocusNodes,
                            enabled: !_isLoading,
                            onChanged: () => setState(() {}),
                          ),
                        ),
                        if (!_verifyingProvidedMobile) ...[
                          const SizedBox(height: 20),
                          TextField(
                            controller: _otpMobileCtrl,
                            keyboardType: TextInputType.phone,
                            onChanged: (_) => setState(() {}),
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly,
                              LengthLimitingTextInputFormatter(10),
                            ],
                            decoration: InputDecoration(
                              labelText: 'Mobile Number *',
                              hintText: 'Enter 10-digit mobile number',
                              helperText: _aadhaarLinkedMobileHint.isNotEmpty
                                  ? 'Aadhaar-linked mobile: $_aadhaarLinkedMobileHint'
                                  : 'Enter the mobile number for verification and registration.',
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                                borderSide: const BorderSide(
                                  color: Color(0xFF22B565),
                                  width: 1.2,
                                ),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                                borderSide: const BorderSide(
                                  color: Color(0xFF22B565),
                                  width: 1.5,
                                ),
                              ),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                          ),
                          const SizedBox(height: 20),
                        ],
                        Container(
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
                          alignment: Alignment.centerLeft,
                          child: OutlinedButton(
                            onPressed: _canResendOtp ? _resendOtp : null,
                            style: OutlinedButton.styleFrom(
                              foregroundColor: const Color(0xFF7A8793),
                              side: const BorderSide(color: Color(0xFFD7DCE1)),
                              backgroundColor: const Color(0xFFF3F4F6),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 18,
                                vertical: 14,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                            child: Text(
                              _resendSecondsRemaining > 0
                                  ? 'Resend In ${_resendSecondsRemaining}s'
                                  : _attemptsRemaining == 0
                                  ? 'Resend limit reached'
                                  : 'Resend OTP',
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 1, color: Color(0xFFE1E6EA)),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(22, 18, 22, 24),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        SizedBox(
                          width: 220,
                          height: 56,
                          child: ElevatedButton(
                            onPressed: (_isLoading || !_canVerifyOtp)
                                ? null
                                : _verifyOtp,
                            style: ElevatedButton.styleFrom(
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                            child: _isLoading
                                ? const SizedBox(
                                    height: 20,
                                    width: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      valueColor: AlwaysStoppedAnimation<Color>(
                                        Colors.white,
                                      ),
                                    ),
                                  )
                                : const Text('Submit'),
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
    );
  }

  Widget _nameSelectionView() {
    final options = _nameOptions();

    return Container(
      width: double.infinity,
      height: double.infinity,
      color: const Color(0xFFF6FBF8),
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 900),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: const Color(0xFFD8E7DE)),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x120F2233),
                    blurRadius: 20,
                    offset: Offset(0, 10),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 28, vertical: 22),
                    child: Text(
                      'Name Selection',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF23412E),
                      ),
                    ),
                  ),
                  const Divider(height: 1, color: Color(0xFFD8E7DE)),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Select the name to continue with your ABHA creation flow.',
                          style: TextStyle(
                            color: Color(0xFF364A5D),
                            fontSize: 15,
                            height: 1.5,
                          ),
                        ),
                        const SizedBox(height: 18),
                        for (final option in options)
                          InkWell(
                            onTap: () {
                              setState(() {
                                _selectedNameOption = option;
                              });
                            },
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 10),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 14,
                              ),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: _selectedNameOption == option
                                      ? const Color(0xFF22B565)
                                      : const Color(0xFFD8E7DE),
                                  width: _selectedNameOption == option
                                      ? 1.6
                                      : 1,
                                ),
                                color: _selectedNameOption == option
                                    ? const Color(0xFFF0FBF4)
                                    : Colors.white,
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    _selectedNameOption == option
                                        ? Icons.radio_button_checked
                                        : Icons.radio_button_off,
                                    color: const Color(0xFF22B565),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Text(
                                      option,
                                      style: const TextStyle(
                                        fontSize: 15,
                                        fontWeight: FontWeight.w600,
                                        color: Color(0xFF24364A),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const Divider(height: 1, color: Color(0xFFE1E6EA)),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 18, 24, 24),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        SizedBox(
                          width: 220,
                          height: 56,
                          child: ElevatedButton(
                            onPressed:
                                (_selectedNameOption == null ||
                                    _pendingEnrollmentTxnId.trim().isEmpty)
                                ? null
                                : _continueToAddressSelection,
                            style: ElevatedButton.styleFrom(
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                            child: const Text('Continue'),
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
    );
  }

  Widget _consentTile({
    required bool value,
    required String text,
    required ValueChanged<bool?> onChanged,
  }) {
    return CheckboxListTile(
      value: value,
      onChanged: onChanged,
      dense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 4),
      controlAffinity: ListTileControlAffinity.leading,
      activeColor: const Color(0xFF22B565),
      title: Text(
        text,
        style: const TextStyle(
          color: Color(0xFF364A5D),
          fontSize: 14,
          height: 1.55,
        ),
      ),
    );
  }

  Widget _nameConsentRow() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Checkbox(
            value: _nameConsentAccepted,
            onChanged: (value) {
              setState(() {
                _nameConsentAccepted = value ?? false;
              });
            },
            activeColor: const Color(0xFF22B565),
          ),
          const Text(
            'I,',
            style: TextStyle(
              color: Color(0xFF364A5D),
              fontSize: 14,
              height: 1.5,
            ),
          ),
          const SizedBox(width: 10),
          SizedBox(
            width: 170,
            child: TextField(
              controller: _nameCtrl,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: 'Your Name',
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 16,
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Text(
              'have been explained about the consent and hereby provide my consent.',
              style: TextStyle(
                color: Color(0xFF364A5D),
                fontSize: 14,
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _aadhaarInputField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: _aadhaarCtrl,
          readOnly: false,
          keyboardType: TextInputType.number,
          onChanged: _onAadhaarChanged,
          onTap: _handleAadhaarFieldTap,
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[0-9 ]')),
          ],
          decoration: InputDecoration(
            labelText: 'Aadhaar Number *',
            labelStyle: const TextStyle(color: Color(0xFF22B565)),
            hintText: _showAadhaar ? '1234 5678 9012' : 'XXXX XXXX 9012',
            prefixIcon: const Icon(Icons.credit_card_outlined),
            suffixIcon: IconButton(
              tooltip: _showAadhaar ? 'Hide Aadhaar' : 'Show Aadhaar',
              icon: Icon(
                _showAadhaar ? Icons.visibility_off : Icons.visibility,
                color: const Color(0xFF22B565),
              ),
              onPressed: _toggleAadhaarVisibility,
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: const BorderSide(
                color: Color(0xFF22B565),
                width: 1.5,
              ),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: const BorderSide(
                color: Color(0xFF22B565),
                width: 1.2,
              ),
            ),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Only last 4 digits will be visible for security.',
          style: TextStyle(color: Color(0xFF617283), fontSize: 12),
        ),
      ],
    );
  }

  Widget _primaryButton(String text, VoidCallback? onTap) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed: (_isLoading || onTap == null) ? null : onTap,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF1B5E8C),
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        child: _isLoading
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                ),
              )
            : Text(text),
      ),
    );
  }

  void _toggleSelectAll(bool selected) {
    setState(() {
      for (final consent in _consents) {
        consent.accepted = selected;
      }
      _nameConsentAccepted = selected;
    });
  }

  void _toggleAadhaarVisibility() {
    setState(() {
      _showAadhaar = !_showAadhaar;
      _syncAadhaarText();
    });
  }

  void _handleAadhaarFieldTap() {
    if (_showAadhaar) {
      return;
    }
    final currentText = _aadhaarCtrl.text;
    if (currentText.isEmpty) {
      return;
    }
    _aadhaarCtrl.selection = TextSelection(
      baseOffset: 0,
      extentOffset: currentText.length,
    );
  }

  void _onAadhaarChanged(String value) {
    if (_updatingAadhaarText) {
      return;
    }
    final digits = normalizeAadhaarDigits(value);
    _aadhaarRaw = digits;
    _syncAadhaarText();
    setState(() {});
  }

  void _syncAadhaarText() {
    _updatingAadhaarText = true;
    _aadhaarCtrl.value = buildAadhaarEditingValue(
      digits: _aadhaarRaw,
      showFullValue: _showAadhaar,
    );
    _updatingAadhaarText = false;
  }

  String _formatAadhaar(String digits) {
    return formatAadhaarDigits(digits);
  }

  String _maskAadhaar(String digits) {
    return maskAadhaarDigits(digits);
  }

  void _clearOtpInputs() {
    for (final controller in _otpDigitCtrls) {
      controller.clear();
    }
  }

  Future<void> _requestOtp() async {
    if (!_canRequestOtp) {
      return;
    }

    setState(() => _isLoading = true);
    try {
      final txnId = await AbhaApiService.requestOtp(_aadhaarRaw);
      _clearOtpInputs();
      setState(() {
        _otpRequested = true;
        _txnCtrl.text = txnId;
        _resendCount = 0;
        _aadhaarLinkedMobileHint = _extractMaskedMobileHint();
        _otpSentMessage = _buildCreateOtpSentMessage(
          responseKey: 'Abha.requestOtp',
          registrationLabel: 'Aadhaar registered mobile number',
          fallbackValue: _aadhaarLinkedMobileHint,
        );
      });
      _startResendCooldown();

      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('OTP sent successfully to your Aadhaar-linked mobile'),
        ),
      );
      _otpFocusNodes.first.requestFocus();
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _verifyOtp() async {
    if (!_canVerifyOtp) {
      return;
    }

    if (_verifyingProvidedMobile) {
      await _verifyProvidedMobileOtp();
      return;
    }

    await _verifyAadhaarOtp();
  }

  Future<void> _verifyAadhaarOtp() async {
    setState(() => _isLoading = true);
    try {
      final enteredMobile = _otpMobileCtrl.text.trim();
      final matchesAadhaarMobile = _matchesAadhaarLinkedMobile(enteredMobile);
      final profile = await AbhaApiService.verifyOtp(
        txnId: _txnCtrl.text.trim(),
        otp: _otpValue,
        mobile: enteredMobile,
      );

      _verifiedProfile = profile as AbhaProfile?;
      _pendingEnrollmentTxnId = profile.txnId.trim().isNotEmpty
          ? profile.txnId
          : _txnCtrl.text.trim();

      if (!mounted) {
        return;
      }

      final existingUserFromVerifyResponse = _existingUserFromVerifyResponse(
        verifiedMobile: enteredMobile,
      );

      if (!matchesAadhaarMobile) {
        final mobileUpdateRequest = await _alternateMobileUpdateFlow.requestOtp(
          enrollmentTxnId: _pendingEnrollmentTxnId,
          mobile: enteredMobile,
          xToken: _aadhaarEnrollmentXToken,
          refreshToken: _aadhaarEnrollmentRefreshToken,
          fetchExistingUserFromEnrollmentProfileDetails:
              _fetchExistingUserFromEnrollmentProfileDetails,
          existingUserFromVerifyResponse: _existingUserFromVerifyResponse,
        );
        _pendingExistingUserFromApi = mobileUpdateRequest.existingUser;
        _clearOtpInputs();
        setState(() {
          _verifyingProvidedMobile = true;
          _txnCtrl.text = mobileUpdateRequest.txnId;
          _resendCount = 0;
          _otpSentMessage = _buildCreateOtpSentMessage(
            responseKey: 'Abha.requestProfileMobileUpdateOtp',
            registrationLabel: 'entered mobile number',
            fallbackValue: enteredMobile,
          );
        });
        _startResendCooldown();
        _otpFocusNodes.first.requestFocus();
        return;
      }

      final existingUserResolution = await _aadhaarLinkedMobileFlow.resolve(
        verifiedMobile: enteredMobile,
        fetchExistingUserFromEnrollmentProfileDetails:
            _fetchExistingUserFromEnrollmentProfileDetails,
        existingUserFromVerifyResponse: _existingUserFromVerifyResponse,
      );
      final existingUserFromApi =
          existingUserResolution.existingUser ?? existingUserFromVerifyResponse;
      final registeredUser = _findRegisteredExistingUser(
        apiExistingUser: existingUserFromApi,
      );
      final dialogUser = existingUserFromApi ?? registeredUser;

      if (dialogUser != null) {
        await _showExistingUserDialog(
          apiExistingUser: dialogUser,
          comparisonExistingUser: registeredUser ?? dialogUser,
        );
        return;
      }

      _openNameSelection();
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _verifyProvidedMobileOtp() async {
    setState(() => _isLoading = true);
    try {
      final resolution = await _alternateMobileUpdateFlow.verifyOtp(
        txnId: _txnCtrl.text.trim(),
        otp: _otpValue,
        xToken: _aadhaarEnrollmentXToken,
        refreshToken: _aadhaarEnrollmentRefreshToken,
        verifiedMobile: _otpMobileCtrl.text.trim(),
        pendingExistingUser: _pendingExistingUserFromApi,
        existingUserFromVerifyResponse: _existingUserFromVerifyResponse,
      );

      if (!mounted) {
        return;
      }

      final existingUserFromApi = resolution.existingUser;
      _pendingExistingUserFromApi = null;
      final registeredUser = _findRegisteredExistingUser(
        apiExistingUser: existingUserFromApi,
      );
      final dialogUser = existingUserFromApi ?? registeredUser;
      if (dialogUser != null) {
        await _showExistingUserDialog(
          apiExistingUser: dialogUser,
          comparisonExistingUser: registeredUser ?? dialogUser,
        );
        return;
      }

      _openNameSelection();
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _resendOtp() async {
    if (!_canResendOtp) {
      return;
    }

    setState(() => _isLoading = true);
    try {
      final txnId = _verifyingProvidedMobile
          ? await (() async {
              final request = await _alternateMobileUpdateFlow.requestOtp(
                enrollmentTxnId: _pendingEnrollmentTxnId,
                mobile: _otpMobileCtrl.text.trim(),
                xToken: _aadhaarEnrollmentXToken,
                refreshToken: _aadhaarEnrollmentRefreshToken,
                fetchExistingUserFromEnrollmentProfileDetails:
                    _fetchExistingUserFromEnrollmentProfileDetails,
                existingUserFromVerifyResponse: _existingUserFromVerifyResponse,
              );
              _pendingExistingUserFromApi = request.existingUser;
              return request.txnId;
            })()
          : await AbhaApiService.requestOtp(_aadhaarRaw);
      _clearOtpInputs();
      setState(() {
        _txnCtrl.text = txnId;
        _resendCount += 1;
        if (!_verifyingProvidedMobile) {
          _aadhaarLinkedMobileHint = _extractMaskedMobileHint();
        }
        _otpSentMessage = _buildCreateOtpSentMessage(
          responseKey: _verifyingProvidedMobile
              ? 'Abha.requestProfileMobileUpdateOtp'
              : 'Abha.requestOtp',
          registrationLabel: _verifyingProvidedMobile
              ? 'entered mobile number'
              : 'Aadhaar registered mobile number',
          fallbackValue: _verifyingProvidedMobile
              ? _otpMobileCtrl.text.trim()
              : _aadhaarLinkedMobileHint,
        );
      });
      _startResendCooldown();

      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('OTP resent successfully')));
      _otpFocusNodes.first.requestFocus();
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
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

  void _resetToConsentForm() {
    _resendTimer?.cancel();
    _clearOtpInputs();
    setState(() {
      _otpRequested = false;
      _verifyingProvidedMobile = false;
      _showNameSelection = false;
      _txnCtrl.clear();
      _otpMobileCtrl.clear();
      _resendCount = 0;
      _resendSecondsRemaining = 0;
      _aadhaarLinkedMobileHint = '';
      _otpSentMessage = '';
      _verifiedProfile = null;
      _pendingEnrollmentTxnId = '';
      _selectedNameOption = null;
      _pendingExistingUserFromApi = null;
    });
  }

  List<String> _nameOptions() {
    final options = <String>[];
    final verifiedName = _verifiedProfile?.name.trim() ?? '';
    final consentName = _nameCtrl.text.trim();

    if (verifiedName.isNotEmpty) {
      options.add(verifiedName);
    }
    if (consentName.isNotEmpty && !options.contains(consentName)) {
      options.add(consentName);
    }

    return options;
  }

  void _openNameSelection() {
    final options = _nameOptions();
    if (options.length <= 1) {
      _selectedNameOption = options.isNotEmpty ? options.first : null;
      _continueToAddressSelection();
      return;
    }

    setState(() {
      _showNameSelection = true;
      _otpRequested = false;
      _verifyingProvidedMobile = false;
      _selectedNameOption = options.isNotEmpty ? options.first : null;
    });
  }

  void _continueToAddressSelection() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CreateAbhaAddressScreen(txnId: _pendingEnrollmentTxnId),
      ),
    );
  }

  void _continueToAddressSelectionWithExistingUser(
    Map<String, dynamic> existingUser,
  ) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CreateAbhaAddressScreen(
          txnId: _pendingEnrollmentTxnId,
          existingUserForComparison: existingUser,
        ),
      ),
    );
  }

  Map<String, dynamic> _buildRegisteredUserPayload() {
    final rawProfile =
        AppRuntimeStore.getValue<Map<String, dynamic>>('Abha.profile') ??
        const <String, dynamic>{};
    final phrProfile =
        AppRuntimeStore.getValue<Map<String, dynamic>>('phr.profile') ??
        const <String, dynamic>{};
    final cardPayload =
        AppRuntimeStore.getValue<Map<String, dynamic>>('phr.card') ??
        const <String, dynamic>{};
    final rawAddressMap = rawProfile['addr'] is Map
        ? Map<String, dynamic>.from(rawProfile['addr'] as Map)
        : const <String, dynamic>{};

    final verifiedName = _verifiedProfile?.name.trim() ?? '';
    final verifiedAbhaNumber = _verifiedProfile?.abhaNumber.trim() ?? '';
    final selectedName = _selectedNameOption?.trim() ?? '';
    final consentName = _nameCtrl.text.trim();
    final displayName = selectedName.isNotEmpty
        ? selectedName
        : verifiedName.isNotEmpty
        ? verifiedName
        : consentName;
    final abhaAddress = _firstNonEmptyString([
      rawProfile['abhaAddr'],
      rawProfile['preferredAbhaAddress'],
      rawProfile['AbhaAddress'],
      rawProfile['phrAddress'],
      phrProfile['preferredAbhaAddress'],
      phrProfile['AbhaAddress'],
    ]);
    final abhaNumber = _firstNonEmptyString([
      verifiedAbhaNumber.isNotEmpty ? verifiedAbhaNumber : null,
      rawProfile['abhaNo'],
      rawProfile['AbhaNumber'],
      phrProfile['AbhaNumber'],
    ]);
    final uhid = _firstNonEmptyString([
      rawProfile['uhid'],
      rawProfile['healthId'],
      rawProfile['healthIdNumber'],
      phrProfile['uhid'],
      'N/A',
    ]);
    final mobile = _firstNonEmptyString([
      _otpMobileCtrl.text.trim().isNotEmpty ? _otpMobileCtrl.text.trim() : null,
      _verifiedProfile?.mobile.isNotEmpty == true
          ? _verifiedProfile!.mobile
          : null,
      rawProfile['mobile'],
      rawProfile['mob'],
      phrProfile['mobile'],
    ]);
    final gender = _firstNonEmptyString([
      _verifiedProfile?.gender.isNotEmpty == true
          ? _verifiedProfile!.gender
          : null,
      rawProfile['gender'],
      phrProfile['gender'],
    ]);
    final rawProfileDob = _bestDobFromProfile(rawProfile);
    final phrProfileDob = _bestDobFromProfile(phrProfile);
    final verifiedProfileDob = _firstNonEmptyString([
      _verifiedProfile?.dateOfBirth,
      _verifiedProfile?.yearOfBirth,
    ]);
    final dob = _firstNonEmptyString([
      rawProfileDob,
      phrProfileDob,
      verifiedProfileDob,
    ]);
    final address = _firstNonEmptyString([
      phrProfile['address'],
      rawProfile['address'],
      rawAddressMap['full'],
    ]);
    final pincode = _firstNonEmptyString([
      phrProfile['pincode'],
      rawProfile['pincode'],
      phrProfile['pinCode'],
      rawProfile['pinCode'],
      rawAddressMap['pincode'],
    ]);
    final state = _firstNonEmptyString([
      phrProfile['state'],
      rawProfile['state'],
      rawProfile['stateName'],
      rawAddressMap['state'],
    ]);
    final district = _firstNonEmptyString([
      phrProfile['district'],
      rawProfile['district'],
      rawProfile['districtName'],
      rawAddressMap['district'],
    ]);
    final imageBase64 = _firstNonEmptyString([
      phrProfile['photo'],
      rawProfile['photo'],
      rawProfile['kycPhoto'],
    ]);
    final sessionToken = _firstNonEmptyString([
      AppRuntimeStore.getValue<String>('Abha.create.enrollment.xToken') ?? '',
      AppRuntimeStore.getValue<String>('Abha.enrollment.xToken') ?? '',
    ]);
    final refreshToken = _firstNonEmptyString([
      AppRuntimeStore.getValue<String>('Abha.create.enrollment.refreshToken') ??
          '',
      AppRuntimeStore.getValue<String>('Abha.enrollment.refreshToken') ?? '',
    ]);

    return {
      'name': displayName,
      'AbhaAddress': abhaAddress,
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
      'rawProfile': rawProfile,
      'sessionToken': sessionToken,
      'refreshToken': refreshToken,
      'registeredAt': DateTime.now().toIso8601String(),
    };
  }

  Map<String, dynamic>? _existingUserFromVerifyResponse({
    required String verifiedMobile,
  }) {
    final response = AppRuntimeStore.getApiResponse('Abha.verifyOtp');
    if (response is! Map<String, dynamic>) {
      return null;
    }

    final isNewValue = response['isNew'];
    final alreadyExists =
        isNewValue == false ||
        isNewValue?.toString().toLowerCase().trim() == 'false';
    if (!alreadyExists) {
      return null;
    }

    final rawProfileSource =
        response['ABHAProfile'] ??
        response['AbhaProfile'] ??
        response['EnrolProfile'] ??
        response['enrolProfile'] ??
        response['profile'];
    final rawProfile = rawProfileSource is Map<String, dynamic>
        ? rawProfileSource
        : rawProfileSource is Map
        ? Map<String, dynamic>.from(rawProfileSource)
        : <String, dynamic>{};

    final preferredAbhaAddress = _firstNonEmptyString([
      rawProfile['preferredAbhaAddress'],
      _readFirstListString(rawProfile['phrAddress']),
      rawProfile['AbhaAddress'],
    ]);
    final abhaNumber = _firstNonEmptyString([
      rawProfile['AbhaNumber'],
      rawProfile['abhaNo'],
      rawProfile['enrolmentNumber'],
    ]);
    final uhid = _firstNonEmptyString([
      rawProfile['healthId'],
      rawProfile['healthIdNumber'],
      rawProfile['uhid'],
      'N/A',
    ]);
    final mobile = verifiedMobile.trim().isNotEmpty
        ? verifiedMobile.trim()
        : _firstNonEmptyString([
            rawProfile['mobile'],
            _verifiedProfile?.mobile,
          ]);
    final gender = _displayGender(
      _firstNonEmptyString([rawProfile['gender'], _verifiedProfile?.gender]),
    );
    final rawProfileDob = _bestDobFromProfile(rawProfile);
    final verifiedProfileDob = _firstNonEmptyString([
      _verifiedProfile?.dateOfBirth,
      _verifiedProfile?.yearOfBirth,
    ]);
    final dob = _firstNonEmptyString([rawProfileDob, verifiedProfileDob]);
    final address = _composeExistingAddress(rawProfile);
    final pincode = _firstNonEmptyString([
      rawProfile['pincode'],
      rawProfile['pinCode'],
    ]);
    final state = _firstNonEmptyString([
      rawProfile['state'],
      rawProfile['stateName'],
      rawProfile['addr'] is Map
          ? Map<String, dynamic>.from(rawProfile['addr'] as Map)['state']
          : null,
    ]);
    final district = _firstNonEmptyString([
      rawProfile['district'],
      rawProfile['districtName'],
      rawProfile['addr'] is Map
          ? Map<String, dynamic>.from(rawProfile['addr'] as Map)['district']
          : null,
    ]);
    final imageBase64 = _firstNonEmptyString([rawProfile['photo']]);

    final sessionToken = _extractSessionToken(response);
    final refreshToken = _extractRefreshToken(response);

    return {
      'name': _composeExistingName(rawProfile),
      'AbhaAddress': preferredAbhaAddress,
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
      'cardPayload':
          AppRuntimeStore.getValue<Map<String, dynamic>>('phr.card') ??
          const <String, dynamic>{},
      'rawProfile': rawProfile,
      'sessionToken': sessionToken,
      'refreshToken': refreshToken,
      'registeredAt': DateTime.now().toIso8601String(),
      'source': 'abdm-existing-account',
    };
  }

  Future<Map<String, dynamic>?> _fetchExistingUserFromEnrollmentProfileDetails({
    required String verifiedMobile,
  }) async {
    final response = AppRuntimeStore.getApiResponse('Abha.verifyOtp');
    if (response is! Map<String, dynamic>) {
      return null;
    }

    final isNewValue = response['isNew'];
    final alreadyExists =
        isNewValue == false ||
        isNewValue?.toString().toLowerCase().trim() == 'false';
    if (!alreadyExists) {
      return null;
    }

    final xToken = _extractSessionToken(response);
    final refreshToken = _extractRefreshToken(response);
    if (xToken.trim().isEmpty) {
      return null;
    }

    final profile = await AbhaApiService.fetchEnrollmentProfileDetails(
      xToken: xToken,
      refreshToken: refreshToken,
    );

    final rawProfileSource = profile['rawResponse'];
    final rawProfile = rawProfileSource is Map<String, dynamic>
        ? rawProfileSource
        : rawProfileSource is Map
        ? Map<String, dynamic>.from(rawProfileSource)
        : Map<String, dynamic>.from(profile);
    final addrMap = rawProfile['addr'] is Map
        ? Map<String, dynamic>.from(rawProfile['addr'] as Map)
        : profile['addr'] is Map
        ? Map<String, dynamic>.from(profile['addr'] as Map)
        : const <String, dynamic>{};
    final name = _firstNonEmptyString([profile['name'], rawProfile['name']]);
    final abhaAddress = _firstNonEmptyString([
      rawProfile['preferredAbhaAddress'],
      rawProfile['abhaAddr'],
      rawProfile['AbhaAddress'],
      profile['preferredAbhaAddress'],
      profile['abhaAddr'],
      profile['AbhaAddress'],
    ]);
    final abhaNumber = _firstNonEmptyString([
      rawProfile['ABHANumber'],
      rawProfile['AbhaNumber'],
      rawProfile['abhaNo'],
      profile['AbhaNumber'],
      profile['abhaNo'],
    ]);
    final uhid = _firstNonEmptyString([
      rawProfile['healthId'],
      rawProfile['healthIdNumber'],
      rawProfile['uhid'],
      profile['healthId'],
      profile['healthIdNumber'],
      profile['uhid'],
      'N/A',
    ]);
    final mobile = verifiedMobile.trim().isNotEmpty
        ? verifiedMobile.trim()
        : _firstNonEmptyString([
            rawProfile['mobile'],
            rawProfile['mob'],
            profile['mobile'],
            profile['mob'],
          ]);
    final gender = _displayGender(
      _firstNonEmptyString([rawProfile['gender'], profile['gender']]),
    );
    final dayOfBirth = _firstNonEmptyString([
      rawProfile['dayOfBirth'],
      profile['dayOfBirth'],
    ]);
    final monthOfBirth = _firstNonEmptyString([
      rawProfile['monthOfBirth'],
      profile['monthOfBirth'],
    ]);
    final yearOfBirth = _firstNonEmptyString([
      rawProfile['yearOfBirth'],
      rawProfile['yob'],
      profile['yearOfBirth'],
      profile['yob'],
    ]);
    final combinedDob =
        dayOfBirth.isNotEmpty &&
            monthOfBirth.isNotEmpty &&
            yearOfBirth.isNotEmpty
        ? '${_padDobPart(dayOfBirth)}-${_padDobPart(monthOfBirth)}-$yearOfBirth'
        : '';
    final normalizedDob = _firstNonEmptyString([
      rawProfile['dob'],
      rawProfile['dateOfBirth'],
      profile['dob'],
      profile['dateOfBirth'],
    ]);
    final dob = _firstNonEmptyString([
      combinedDob,
      normalizedDob,
      _bestDobFromProfile(rawProfile),
      _bestDobFromProfile(profile),
    ]);
    final address = _firstNonEmptyString([
      rawProfile['address'],
      profile['address'],
      addrMap['full'],
    ]);
    final pincode = _firstNonEmptyString([
      rawProfile['pincode'],
      rawProfile['pinCode'],
      profile['pincode'],
      profile['pinCode'],
      addrMap['pincode'],
    ]);
    final state = _firstNonEmptyString([
      rawProfile['stateName'],
      rawProfile['state'],
      profile['state'],
      profile['stateName'],
      addrMap['state'],
    ]);
    final district = _firstNonEmptyString([
      rawProfile['districtName'],
      rawProfile['district'],
      profile['district'],
      profile['districtName'],
      addrMap['district'],
    ]);
    final imageBase64 = _firstNonEmptyString([
      profile['photo'],
      profile['kycPhoto'],
      profile['profilePhoto'],
    ]);
    final sessionToken = _firstNonEmptyString([
      profile['sessionToken'],
      profile['token'],
      xToken,
    ]);
    final normalizedRefreshToken = _firstNonEmptyString([
      profile['refreshToken'],
      refreshToken,
    ]);
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
      'state': state,
      'district': district,
      'imageBase64': imageBase64,
      'cardPayload':
          AppRuntimeStore.getValue<Map<String, dynamic>>('phr.card') ??
          const <String, dynamic>{},
      'rawProfile': rawProfile,
      'sessionToken': sessionToken,
      'refreshToken': normalizedRefreshToken,
      'registeredAt': DateTime.now().toIso8601String(),
      'source': 'abdm-enrollment-profile-details',
    };
  }

  String _extractSessionToken(Map<String, dynamic> response) {
    final tokens = response['tokens'];
    if (tokens is Map<String, dynamic>) {
      return _firstNonEmptyString([
        tokens['token'],
        tokens['accessToken'],
        response['token'],
        response['accessToken'],
      ]);
    }
    return _firstNonEmptyString([response['token'], response['accessToken']]);
  }

  String _extractRefreshToken(Map<String, dynamic> response) {
    final tokens = response['tokens'];
    if (tokens is Map<String, dynamic>) {
      return _firstNonEmptyString([
        tokens['refreshToken'],
        response['refreshToken'],
      ]);
    }
    return _firstNonEmptyString([response['refreshToken']]);
  }

  String _composeExistingName(Map<String, dynamic> rawProfile) {
    final combined =
        [
              rawProfile['firstName'],
              rawProfile['middleName'],
              rawProfile['lastName'],
            ]
            .map((value) => value?.toString().trim() ?? '')
            .where((value) => value.isNotEmpty)
            .join(' ');
    if (combined.isNotEmpty) {
      return combined;
    }
    return _firstNonEmptyString([
      rawProfile['name'],
      rawProfile['fullName'],
      _verifiedProfile?.name,
      _nameCtrl.text.trim(),
    ]);
  }

  String _composeExistingAddress(Map<String, dynamic> rawProfile) {
    final parts =
        [
              rawProfile['address'],
              rawProfile['districtName'],
              rawProfile['district'],
              rawProfile['stateName'],
              rawProfile['state'],
            ]
            .map((value) => value?.toString().trim() ?? '')
            .where((value) => value.isNotEmpty)
            .toList();
    return parts.join(', ');
  }

  String _bestDobFromProfile(Map<String, dynamic> profile) {
    final directDob = _firstNonEmptyString([
      profile['dob'],
      profile['dateOfBirth'],
    ]);
    if (directDob.isNotEmpty) {
      return directDob;
    }

    final dobMap = profile['dob'] is Map
        ? Map<String, dynamic>.from(profile['dob'] as Map)
        : const <String, dynamic>{};
    final dayOfBirth = _padDobPart(
      _firstNonEmptyString([
        profile['dayOfBirth'],
        dobMap['d'],
        profile['day'],
      ]),
    );
    final monthOfBirth = _padDobPart(
      _firstNonEmptyString([
        profile['monthOfBirth'],
        dobMap['m'],
        profile['month'],
      ]),
    );
    final yearOfBirth = _firstNonEmptyString([
      profile['yearOfBirth'],
      profile['yob'],
      dobMap['y'],
      profile['year'],
    ]);

    final hasFullDob =
        dayOfBirth.isNotEmpty &&
        monthOfBirth.isNotEmpty &&
        yearOfBirth.isNotEmpty;
    if (hasFullDob) {
      return '$dayOfBirth-$monthOfBirth-$yearOfBirth';
    }

    return yearOfBirth;
  }

  String _padDobPart(String value) {
    final trimmedValue = value.trim();
    if (trimmedValue.isEmpty) {
      return '';
    }
    if (trimmedValue.length == 1) {
      return '0$trimmedValue';
    }
    return trimmedValue;
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

  String _readFirstListString(dynamic value) {
    if (value is List) {
      for (final item in value) {
        final text = item?.toString().trim() ?? '';
        if (text.isNotEmpty && text.toLowerCase() != 'null') {
          return text;
        }
      }
    }
    return '';
  }

  String _firstNonEmptyString(List<dynamic> values) {
    for (final value in values) {
      final text = value?.toString().trim() ?? '';
      if (text.isNotEmpty && text.toLowerCase() != 'null') {
        return text;
      }
    }
    return '';
  }

  Map<String, dynamic>? _findRegisteredExistingUser({
    Map<String, dynamic>? apiExistingUser,
  }) {
    final payload = _buildRegisteredUserPayload();
    return RegisteredUsersStore.findExistingUser(apiExistingUser ?? payload) ??
        RegisteredUsersStore.findExistingUser(payload);
  }

  Future<void> _showExistingUserDialog({
    required Map<String, dynamic> apiExistingUser,
    required Map<String, dynamic> comparisonExistingUser,
  }) async {
    final payload = _buildRegisteredUserPayload();
    final mergedRawProfileSource =
        apiExistingUser['rawProfile'] ?? payload['rawProfile'];
    final mergedRawProfile = mergedRawProfileSource is Map<String, dynamic>
        ? mergedRawProfileSource
        : mergedRawProfileSource is Map
        ? Map<String, dynamic>.from(mergedRawProfileSource)
        : <String, dynamic>{};
    final dobDayOfBirth = _firstNonEmptyString([
      mergedRawProfile['dayOfBirth'],
    ]);
    final dobMonthOfBirth = _firstNonEmptyString([
      mergedRawProfile['monthOfBirth'],
    ]);
    final dobYearOfBirth = _firstNonEmptyString([
      mergedRawProfile['yearOfBirth'],
      mergedRawProfile['yob'],
    ]);
    final combinedDob =
        dobDayOfBirth.isNotEmpty &&
            dobMonthOfBirth.isNotEmpty &&
            dobYearOfBirth.isNotEmpty
        ? '${_padDobPart(dobDayOfBirth)}-${_padDobPart(dobMonthOfBirth)}-$dobYearOfBirth'
        : '';
    final resolvedDob = _firstNonEmptyString([
      combinedDob,
      mergedRawProfile['dob'],
      mergedRawProfile['dateOfBirth'],
      apiExistingUser['dob'],
      payload['dob'],
      _bestDobFromProfile(mergedRawProfile),
    ]);
    final apiDisplayRecord = {
      ...payload,
      ...apiExistingUser,
      'dayOfBirth': dobDayOfBirth,
      'monthOfBirth': dobMonthOfBirth,
      'yearOfBirth': dobYearOfBirth,
      'dob': resolvedDob,
      'cardPayload': apiExistingUser['cardPayload'] ?? payload['cardPayload'],
      'imageBase64': _firstNonEmptyString([
        apiExistingUser['imageBase64'],
        payload['imageBase64'],
      ]),
      'rawProfile': mergedRawProfile,
      'registeredAt':
          apiExistingUser['registeredAt'] ?? DateTime.now().toIso8601String(),
    };

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        final size = MediaQuery.of(dialogContext).size;
        return Dialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(28),
          ),
          insetPadding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: 1220,
              maxHeight: size.height * 0.88,
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
                                color: const Color(0xFFFFF1F1),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                  color: const Color(0xFFF6B8C1),
                                ),
                              ),
                              child: const Text(
                                'Existing Account Found',
                                style: TextStyle(
                                  color: Color(0xFFC63849),
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.2,
                                ),
                              ),
                            ),
                            const SizedBox(height: 18),
                            const Text(
                              'This Aadhaar is already linked to an ABHA profile.',
                              style: TextStyle(
                                color: Color(0xFF17324A),
                                fontSize: 24,
                                fontWeight: FontWeight.w900,
                                height: 1.15,
                              ),
                            ),
                            const SizedBox(height: 10),
                            const Text(
                              'Review the current ABDM details below. You can keep the existing record, open the ABHA card, or create a new ABHA address and compare it afterward.',
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
                        onPressed: () => Navigator.pop(dialogContext),
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
                                    _existingUserAvatar(apiDisplayRecord),
                                    const SizedBox(height: 16),
                                    Text(
                                      apiDisplayRecord['name']?.toString() ??
                                          '-',
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
                                    value:
                                        apiDisplayRecord['name']?.toString() ??
                                        '-',
                                  ),
                                  _detailColumn(
                                    label: 'DOB',
                                    value:
                                        apiDisplayRecord['dob']?.toString() ??
                                        '-',
                                  ),
                                  _detailColumn(
                                    label: 'Gender',
                                    value:
                                        apiDisplayRecord['gender']
                                            ?.toString() ??
                                        '-',
                                  ),
                                  _detailColumn(
                                    label: 'ABHA Number',
                                    value:
                                        apiDisplayRecord['AbhaNumber']
                                            ?.toString() ??
                                        '-',
                                  ),
                                  _detailColumn(
                                    label: 'ABHA Address',
                                    value:
                                        apiDisplayRecord['AbhaAddress']
                                            ?.toString() ??
                                        '-',
                                  ),
                                  _detailColumn(
                                    label: 'Phone Number',
                                    value:
                                        apiDisplayRecord['mobile']
                                            ?.toString() ??
                                        '-',
                                  ),
                                  _detailColumn(
                                    label: 'Pincode',
                                    value:
                                        apiDisplayRecord['pincode']
                                            ?.toString() ??
                                        '-',
                                  ),
                                  _detailColumn(
                                    label: 'District',
                                    value:
                                        apiDisplayRecord['district']
                                            ?.toString() ??
                                        '-',
                                  ),
                                  _detailColumn(
                                    label: 'State',
                                    value:
                                        apiDisplayRecord['state']?.toString() ??
                                        '-',
                                  ),
                                  _detailColumn(
                                    label: 'Address',
                                    value:
                                        apiDisplayRecord['address']
                                            ?.toString() ??
                                        '-',
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
                      final createNewButton = SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: () {
                            Navigator.pop(dialogContext);
                            _continueToAddressSelectionWithExistingUser(
                              comparisonExistingUser,
                            );
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF1B5E8C),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 18),
                          ),
                          child: const Text('Create New ABHA Address'),
                        ),
                      );
                      final useExistingButton = SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed: () {
                            RegisteredUsersStore.upsert(apiDisplayRecord);
                            Navigator.pop(dialogContext);
                            Navigator.of(
                              context,
                            ).popUntil((route) => route.isFirst);
                          },
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFF2F8F5B),
                            side: const BorderSide(color: Color(0xFF9FD6B4)),
                            padding: const EdgeInsets.symmetric(vertical: 18),
                          ),
                          child: const Text('Use Existing Record'),
                        ),
                      );
                      final viewCardButton = SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: () async {
                            await _showExistingCard(apiDisplayRecord);
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF2F8F5B),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 18),
                          ),
                          child: const Text('View ABHA Card'),
                        ),
                      );

                      if (stacked) {
                        return Column(
                          children: [
                            createNewButton,
                            const SizedBox(height: 12),
                            useExistingButton,
                            const SizedBox(height: 12),
                            viewCardButton,
                          ],
                        );
                      }

                      return Row(
                        children: [
                          Expanded(child: createNewButton),
                          const SizedBox(width: 14),
                          Expanded(child: useExistingButton),
                          const SizedBox(width: 14),
                          Expanded(child: viewCardButton),
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

  Future<void> _showRegisterComparisonDialog({
    required Map<String, dynamic> existingUser,
    required Map<String, dynamic> newRecord,
  }) async {
    final comparisonFields = _comparisonFields();
    final normalizedNewRecord = _buildComparisonCandidate(
      existingUser: existingUser,
      candidate: newRecord,
    );
    final changedFields = comparisonFields
        .where(
          (field) =>
              _comparisonValue(existingUser[field.key]) !=
              _comparisonValue(normalizedNewRecord[field.key]),
        )
        .toList(growable: false);

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        final screenSize = MediaQuery.of(dialogContext).size;
        return Dialog(
          insetPadding: const EdgeInsets.all(24),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
          ),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: 1280,
              maxHeight: screenSize.height * 0.9,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.max,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(28, 24, 20, 18),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Review Updated Patient Data',
                              style: TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.w800,
                                color: Color(0xFF17324A),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              changedFields.isEmpty
                                  ? 'No differences were detected between the existing ABDM record and the new session details.'
                                  : '${changedFields.length} field${changedFields.length == 1 ? '' : 's'} changed. New values are highlighted on the right before we save them.',
                              style: const TextStyle(
                                fontSize: 15,
                                height: 1.45,
                                color: Color(0xFF526274),
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: 'Close review',
                        onPressed: () => Navigator.pop(dialogContext),
                        icon: const Icon(Icons.close, size: 30),
                      ),
                    ],
                  ),
                ),
                const Divider(height: 1, color: Color(0xFFE3EAF1)),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(24, 24, 24, 20),
                    child: Column(
                      children: [
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(18),
                            gradient: const LinearGradient(
                              colors: [Color(0xFFFFF7EA), Color(0xFFFFFCF4)],
                            ),
                            border: Border.all(color: const Color(0xFFFFC772)),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                width: 44,
                                height: 44,
                                decoration: const BoxDecoration(
                                  color: Color(0xFFFFE5BF),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(
                                  Icons.sync_alt_rounded,
                                  color: Color(0xFFC26B00),
                                ),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Existing ABDM record found for ${existingUser['AbhaNumber']?.toString().trim().isNotEmpty == true ? existingUser['AbhaNumber'] : 'this Aadhaar'}',
                                      style: const TextStyle(
                                        fontSize: 17,
                                        fontWeight: FontWeight.w800,
                                        color: Color(0xFFA05000),
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    const Text(
                                      'Please compare the current ABDM record with the new details from this session, then choose whether to keep the existing record or register with the updated values.',
                                      style: TextStyle(
                                        fontSize: 14,
                                        height: 1.5,
                                        color: Color(0xFF7B5A24),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 22),
                        LayoutBuilder(
                          builder: (context, constraints) {
                            final stacked = constraints.maxWidth < 980;
                            final existingPanel = _comparisonPanel(
                              title: 'Existing ABDM Record',
                              subtitle:
                                  'Current details already linked to this Aadhaar.',
                              accent: const Color(0xFFFFA53A),
                              background: const Color(0xFFFFFBF4),
                              user: existingUser,
                              comparisonFields: comparisonFields,
                              changedKeys: changedFields
                                  .map((field) => field.key)
                                  .toSet(),
                              highlightChanges: false,
                            );
                            final newPanel = _comparisonPanel(
                              title: 'New Session Details',
                              subtitle:
                                  'What will be saved if you continue with the new record.',
                              accent: const Color(0xFF1E88E5),
                              background: const Color(0xFFF5FAFF),
                              user: normalizedNewRecord,
                              comparisonFields: comparisonFields,
                              changedKeys: changedFields
                                  .map((field) => field.key)
                                  .toSet(),
                              highlightChanges: true,
                            );

                            if (stacked) {
                              return Column(
                                children: [
                                  existingPanel,
                                  const SizedBox(height: 18),
                                  newPanel,
                                ],
                              );
                            }

                            return Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(child: existingPanel),
                                const SizedBox(width: 18),
                                Expanded(child: newPanel),
                              ],
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                ),
                const Divider(height: 1, color: Color(0xFFE3EAF1)),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 18, 24, 24),
                  child: Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () {
                            RegisteredUsersStore.upsert(existingUser);
                            Navigator.pop(dialogContext);
                            Navigator.of(
                              context,
                            ).popUntil((route) => route.isFirst);
                          },
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFFAA3E33),
                            side: const BorderSide(color: Color(0xFFE6B5AF)),
                            padding: const EdgeInsets.symmetric(vertical: 18),
                          ),
                          child: const Text('Keep Existing'),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: () {
                            RegisteredUsersStore.upsert(normalizedNewRecord);
                            Navigator.pop(dialogContext);
                            Navigator.of(
                              context,
                            ).popUntil((route) => route.isFirst);
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF1E88E5),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 18),
                          ),
                          child: const Text('Register With New'),
                        ),
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
  }

  Map<String, dynamic> _buildComparisonCandidate({
    required Map<String, dynamic> existingUser,
    required Map<String, dynamic> candidate,
  }) {
    final result = <String, dynamic>{...existingUser, ...candidate};
    for (final field in _comparisonFields()) {
      final candidateValue = candidate[field.key]?.toString().trim() ?? '';
      final existingValue = existingUser[field.key]?.toString().trim() ?? '';
      result[field.key] = candidateValue.isNotEmpty
          ? candidateValue
          : existingValue;
    }
    result['cardPayload'] =
        candidate['cardPayload'] ?? existingUser['cardPayload'];
    result['imageBase64'] = _firstNonEmptyString([
      candidate['imageBase64'],
      existingUser['imageBase64'],
    ]);
    result['rawProfile'] =
        candidate['rawProfile'] ?? existingUser['rawProfile'];
    result['registeredAt'] = DateTime.now().toIso8601String();
    return result;
  }

  List<_ComparisonField> _comparisonFields() {
    return const [
      _ComparisonField('name', 'Name'),
      _ComparisonField('AbhaNumber', 'ABHA Number'),
      _ComparisonField('AbhaAddress', 'ABHA Address'),
      _ComparisonField('mobile', 'Phone Number'),
      _ComparisonField('gender', 'Gender'),
      _ComparisonField('dob', 'DOB'),
      _ComparisonField('address', 'Address'),
      _ComparisonField('pincode', 'Pincode'),
    ];
  }

  String _comparisonValue(Object? value) {
    return value?.toString().trim().toLowerCase().replaceAll(
          RegExp(r'\s+'),
          ' ',
        ) ??
        '';
  }

  Widget _comparisonPanel({
    required String title,
    required String subtitle,
    required Color accent,
    required Color background,
    required Map<String, dynamic> user,
    required List<_ComparisonField> comparisonFields,
    required Set<String> changedKeys,
    required bool highlightChanges,
  }) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: accent.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: accent.withValues(alpha: 0.12),
                child: Icon(
                  highlightChanges ? Icons.auto_fix_high : Icons.verified_user,
                  color: accent,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: accent,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 13,
                        height: 1.45,
                        color: Color(0xFF5A6B7B),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          ...comparisonFields.map((field) {
            final isChanged = changedKeys.contains(field.key);
            final value = user[field.key]?.toString().trim() ?? '';
            return Container(
              width: double.infinity,
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: highlightChanges && isChanged
                    ? const Color(0xFFEFF8FF)
                    : Colors.white.withValues(alpha: 0.72),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: highlightChanges && isChanged
                      ? const Color(0xFF74B6FF)
                      : const Color(0xFFE1E7EF),
                  width: highlightChanges && isChanged ? 1.4 : 1,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          field.label,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF5C6E82),
                          ),
                        ),
                      ),
                      if (highlightChanges && isChanged)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFFDDF0FF),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: const Text(
                            'Changed',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF1769AA),
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    value.isEmpty ? '-' : value,
                    style: TextStyle(
                      fontSize: 17,
                      height: 1.45,
                      fontWeight: isChanged ? FontWeight.w800 : FontWeight.w600,
                      color: const Color(0xFF1A2E44),
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _existingUserAvatar(Map<String, dynamic> existingUser) {
    final imageBase64 = existingUser['imageBase64']?.toString() ?? '';
    if (imageBase64.isNotEmpty) {
      try {
        return CircleAvatar(
          radius: 54,
          backgroundImage: MemoryImage(
            Uint8List.fromList(base64Decode(imageBase64)),
          ),
        );
      } catch (_) {}
    }

    return const CircleAvatar(
      radius: 54,
      backgroundColor: Color(0xFFE9F4EE),
      child: Icon(Icons.person, size: 46, color: Color(0xFF2F8F5B)),
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

  Future<void> _showExistingCard(Map<String, dynamic> existingUser) async {
    await showEnrollmentAccountAbhaCardPreviewDialog(
      context,
      cardPayload: existingUser['cardPayload'] is Map<String, dynamic>
          ? Map<String, dynamic>.from(existingUser['cardPayload'])
          : null,
      userSession: existingUser,
      onCardPayloadLoaded: (payload) {
        existingUser['cardPayload'] = payload;
      },
      unavailableMessage:
          'ABHA card is not available for this user in the current app session.',
    );
  }

  String _extractMaskedMobileHint() {
    final response = AppRuntimeStore.getApiResponse('Abha.requestOtp');
    if (response is Map<String, dynamic>) {
      final directValue =
          response['mobile'] ??
          response['maskedMobile'] ??
          response['maskedMobileNumber'];
      if (directValue is String && directValue.trim().isNotEmpty) {
        return directValue.trim();
      }

      final message = response['message']?.toString() ?? '';
      final match = RegExp(r'([*xX]{4,}\d{2,4})').firstMatch(message);
      if (match != null) {
        return match.group(1) ?? '';
      }
    }
    return '';
  }

  String _buildCreateOtpSentMessage({
    required String responseKey,
    required String registrationLabel,
    required String fallbackValue,
  }) {
    final response = AppRuntimeStore.getApiResponse(responseKey);
    final directMessage = _extractApiOtpMessage(response);
    if (directMessage.isNotEmpty) {
      return directMessage;
    }

    final maskedEnding = _extractMaskedOtpTarget(response).isNotEmpty
        ? _extractMaskedOtpTarget(response)
        : _maskOtpTarget(fallbackValue);
    if (maskedEnding.isEmpty) {
      return 'OTP sent to $registrationLabel';
    }
    return 'OTP sent to $registrationLabel ending with $maskedEnding';
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

  bool _matchesAadhaarLinkedMobile(String enteredMobile) {
    final digits = enteredMobile.replaceAll(RegExp(r'\D'), '');
    if (digits.length != 10) {
      return false;
    }

    final maskedHint = _aadhaarLinkedMobileHint.trim();
    if (maskedHint.isEmpty) {
      return true;
    }

    final visibleDigits = maskedHint.replaceAll(RegExp(r'[^0-9]'), '');
    if (visibleDigits.isEmpty) {
      return true;
    }

    return digits.endsWith(visibleDigits);
  }

  String get _aadhaarEnrollmentXToken {
    final explicit =
        AppRuntimeStore.getValue<String>('Abha.create.enrollment.xToken') ?? '';
    if (explicit.trim().isNotEmpty) {
      return explicit.trim();
    }

    final shared =
        AppRuntimeStore.getValue<String>('Abha.enrollment.xToken') ?? '';
    if (shared.trim().isNotEmpty) {
      return shared.trim();
    }

    final response = AppRuntimeStore.getApiResponse('Abha.verifyOtp');
    if (response is Map<String, dynamic>) {
      final tokens = response['tokens'];
      if (tokens is Map<String, dynamic>) {
        final token =
            tokens['token'] ??
            tokens['accessToken'] ??
            response['token'] ??
            response['accessToken'];
        if (token is String && token.trim().isNotEmpty) {
          return token.trim();
        }
      }

      final direct = response['token'] ?? response['accessToken'];
      if (direct is String && direct.trim().isNotEmpty) {
        return direct.trim();
      }
    }

    return '';
  }

  String get _aadhaarEnrollmentRefreshToken {
    final explicit =
        AppRuntimeStore.getValue<String>(
          'Abha.create.enrollment.refreshToken',
        ) ??
        '';
    if (explicit.trim().isNotEmpty) {
      return explicit.trim();
    }

    final shared =
        AppRuntimeStore.getValue<String>('Abha.enrollment.refreshToken') ?? '';
    if (shared.trim().isNotEmpty) {
      return shared.trim();
    }

    final response = AppRuntimeStore.getApiResponse('Abha.verifyOtp');
    if (response is Map<String, dynamic>) {
      final tokens = response['tokens'];
      if (tokens is Map<String, dynamic>) {
        final token = tokens['refreshToken'] ?? response['refreshToken'];
        if (token is String && token.trim().isNotEmpty) {
          return token.trim();
        }
      }

      final direct = response['refreshToken'];
      if (direct is String && direct.trim().isNotEmpty) {
        return direct.trim();
      }
    }

    return '';
  }

  void _showError(String message) {
    final cleaned = AbhaApiService.userFacingError(message);
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Error'),
        content: Text(cleaned.isEmpty ? message : cleaned),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }
}

class _ConsentItem {
  _ConsentItem({required this.label});

  final String label;
  bool accepted = false;
}

class _ComparisonField {
  const _ComparisonField(this.key, this.label);

  final String key;
  final String label;
}
