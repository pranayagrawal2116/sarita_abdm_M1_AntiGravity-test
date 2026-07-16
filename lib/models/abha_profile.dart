class AbhaProfile {
  final String abhaNumber;
  final String name;
  final String gender;
  final String dateOfBirth;
  final String yearOfBirth;
  final String mobile;
  final String txnId;

  AbhaProfile({
    required this.abhaNumber,
    required this.name,
    required this.gender,
    this.dateOfBirth = '',
    required this.yearOfBirth,
    this.mobile = '',
    this.txnId = '',
  });

  // Legacy aliases kept so older screens can keep reading the same values
  // while we gradually normalize naming across the app.
  // ignore: non_constant_identifier_names
  String get AbhaNumber => abhaNumber;

  static String _firstNonEmptyString(List<dynamic> values) {
    for (final value in values) {
      final text = value?.toString().trim() ?? '';
      if (text.isNotEmpty && text.toLowerCase() != 'null') {
        return text;
      }
    }
    return '';
  }

  static String _padDobPart(String value) {
    final trimmedValue = value.trim();
    if (trimmedValue.isEmpty) {
      return '';
    }
    if (trimmedValue.length == 1) {
      return '0$trimmedValue';
    }
    return trimmedValue;
  }

  factory AbhaProfile.fromJson(Map<String, dynamic> json) {
    final rawAbhaNumber =
        json['AbhaNumber'] ??
        json['ABHANumber'] ??
        json['abhaNo'] ??
        json['abhaNumber'] ??
        json['healthIdNumber'] ??
        '';
    final name =
        json['name'] ??
        json['fullName'] ??
        [
          json['fName'],
          json['mName'],
          json['lName'],
        ].whereType<String>().where((part) => part.trim().isNotEmpty).join(' ');
    final gender = json['gender'] ?? json['sex'] ?? '';
    final directDob =
        (json['dob'] ?? json['dateOfBirth'] ?? '').toString().trim();
    final yearOfBirth =
        (json['yearOfBirth'] ?? json['birthYear'] ?? json['yob'] ?? '')
            .toString();
    final dayOfBirth = _padDobPart(
      _firstNonEmptyString([json['dayOfBirth'], json['day']]),
    );
    final monthOfBirth = _padDobPart(
      _firstNonEmptyString([json['monthOfBirth'], json['month']]),
    );
    final hasFullDob =
        dayOfBirth.isNotEmpty &&
        monthOfBirth.isNotEmpty &&
        yearOfBirth.trim().isNotEmpty;
    final dateOfBirth = directDob.isNotEmpty
        ? directDob
        : hasFullDob
        ? '$dayOfBirth-$monthOfBirth-$yearOfBirth'
        : '';
    final mobile =
        (json['mobile'] ??
                json['mobileNumber'] ??
                json['maskedMobile'] ??
                json['mob'] ??
                '')
            .toString();
    final txnId = json['txnId'] ?? '';

    return AbhaProfile(
      abhaNumber: rawAbhaNumber.toString(),
      name: name.toString(),
      gender: gender.toString(),
      dateOfBirth: dateOfBirth,
      yearOfBirth: yearOfBirth,
      mobile: mobile,
      txnId: txnId.toString(),
    );
  }
}
