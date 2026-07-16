import 'flow_result.dart';

typedef ExistingUserFetcher =
    Future<Map<String, dynamic>?> Function({required String verifiedMobile});
typedef ExistingUserFromVerifyResponse =
    Map<String, dynamic>? Function({required String verifiedMobile});

class AadhaarLinkedMobileFlow {
  const AadhaarLinkedMobileFlow();

  Future<ExistingAccountResolution> resolve({
    required String verifiedMobile,
    required ExistingUserFetcher fetchExistingUserFromEnrollmentProfileDetails,
    required ExistingUserFromVerifyResponse existingUserFromVerifyResponse,
  }) async {
    final existingUserFromVerify = existingUserFromVerifyResponse(
      verifiedMobile: verifiedMobile,
    );
    final existingUserFromApi =
        await fetchExistingUserFromEnrollmentProfileDetails(
          verifiedMobile: verifiedMobile,
        ) ??
        existingUserFromVerify;

    return ExistingAccountResolution(existingUser: existingUserFromApi);
  }
}
