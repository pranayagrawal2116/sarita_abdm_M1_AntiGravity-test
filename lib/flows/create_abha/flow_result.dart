class ExistingAccountResolution {
  const ExistingAccountResolution({this.existingUser});

  final Map<String, dynamic>? existingUser;
}

class AlternateMobileOtpRequest {
  const AlternateMobileOtpRequest({
    required this.txnId,
    this.existingUser,
  });

  final String txnId;
  final Map<String, dynamic>? existingUser;
}
