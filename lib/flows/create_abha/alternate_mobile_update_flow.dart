import '../../services/abha_api_service.dart';
import 'aadhaar_linked_mobile_flow.dart';
import 'flow_result.dart';

class AlternateMobileUpdateFlow {
  const AlternateMobileUpdateFlow();

  Future<AlternateMobileOtpRequest> requestOtp({
    required String enrollmentTxnId,
    required String mobile,
    required String xToken,
    required String refreshToken,
    required ExistingUserFetcher fetchExistingUserFromEnrollmentProfileDetails,
    required ExistingUserFromVerifyResponse existingUserFromVerifyResponse,
  }) async {
    final existingUserResolution = await const AadhaarLinkedMobileFlow().resolve(
      verifiedMobile: mobile,
      fetchExistingUserFromEnrollmentProfileDetails:
          fetchExistingUserFromEnrollmentProfileDetails,
      existingUserFromVerifyResponse: existingUserFromVerifyResponse,
    );

    final mobileUpdateResponse = await AbhaApiService.requestProfileMobileUpdateOtp(
      txnId: enrollmentTxnId,
      mobile: mobile,
      xToken: xToken,
      refreshToken: refreshToken,
    );
    final mobileTxnId = mobileUpdateResponse['txnId']?.toString().trim() ?? '';
    if (mobileTxnId.isEmpty) {
      throw Exception('Failed to request mobile update OTP.');
    }

    return AlternateMobileOtpRequest(
      txnId: mobileTxnId,
      existingUser: existingUserResolution.existingUser,
    );
  }

  Future<ExistingAccountResolution> verifyOtp({
    required String txnId,
    required String otp,
    required String xToken,
    required String refreshToken,
    required String verifiedMobile,
    Map<String, dynamic>? pendingExistingUser,
    required ExistingUserFromVerifyResponse existingUserFromVerifyResponse,
  }) async {
    final result = await AbhaApiService.verifyProfileMobileUpdateOtp(
      txnId: txnId,
      otp: otp,
      xToken: xToken,
      refreshToken: refreshToken,
    );

    final verified =
        result['verified'] == true ||
        (result['authResult']?.toString().toLowerCase() == 'success');
    if (!verified) {
      throw Exception(
        result['message']?.toString() ??
            'Provided mobile number verification failed.',
      );
    }

    return ExistingAccountResolution(
      existingUser:
          pendingExistingUser ??
          existingUserFromVerifyResponse(verifiedMobile: verifiedMobile),
    );
  }
}
