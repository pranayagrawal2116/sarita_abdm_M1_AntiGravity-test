import 'app_runtime_store.dart';

class RegisteredUsersStore {
  RegisteredUsersStore._();

  static const String _uhidByAbhaNumberKey = 'registry.uhidByAbhaNumber';
  static const String _uhidSerialByDayKey = 'registry.uhidSerialByDay';

  static List<Map<String, dynamic>> users() {
    final stored = AppRuntimeStore.getValue<List<dynamic>>('registry.users');
    if (stored == null) {
      return const <Map<String, dynamic>>[];
    }

    final rawUsers = stored
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
    final coalescedUsers = _coalesceUsers(rawUsers);
    return _ensureStableUhidsForUsers(coalescedUsers, persist: false);
  }

  static Map<String, dynamic>? findExistingUser(
    Map<String, dynamic> candidate,
  ) {
    final abhaNumber = _clean(candidate['AbhaNumber']);
    final abhaAddress = _clean(candidate['AbhaAddress']).toLowerCase();
    final mobile = _digits(candidate['mobile']);

    for (final user in users()) {
      for (final profile in _profilesFor(user)) {
        final userAbhaNumber = _clean(profile['AbhaNumber']);
        final userAbhaAddress = _clean(profile['AbhaAddress']).toLowerCase();
        final userMobile = _digits(profile['mobile']);

        final matchesAbhaNumber =
            abhaNumber.isNotEmpty && userAbhaNumber == abhaNumber;
        final matchesAbhaAddress =
            abhaAddress.isNotEmpty && userAbhaAddress == abhaAddress;
        final matchesMobile = mobile.isNotEmpty && userMobile == mobile;

        if (matchesAbhaNumber || matchesAbhaAddress || matchesMobile) {
          return {...Map<String, dynamic>.from(user), ...profile};
        }
      }
    }

    return null;
  }

  static void upsert(Map<String, dynamic> candidate) {
    final nextUser = Map<String, dynamic>.from(candidate);

    final nextUsers = users().toList(growable: true);
    final existingIndex = _matchingUserIndex(nextUsers, nextUser);

    if (existingIndex >= 0) {
      final existingUser = Map<String, dynamic>.from(nextUsers[existingIndex]);
      final mergedProfiles = _mergeProfiles(existingUser, nextUser);
      final mergedUser = _mergeUser(existingUser, nextUser, mergedProfiles);
      nextUsers[existingIndex] = {
        ...mergedUser,
        'id': existingUser['id']?.toString() ?? _recordId(mergedUser),
      };
    } else {
      final initialProfiles = _mergeProfiles(
        const <String, dynamic>{},
        nextUser,
      );
      final mergedUser = _mergeUser(
        const <String, dynamic>{},
        nextUser,
        initialProfiles,
      );
      mergedUser['id'] = _recordId(mergedUser);
      nextUsers.insert(0, mergedUser);
    }

    final usersWithStableUhids = _ensureStableUhidsForUsers(
      nextUsers,
      persist: true,
    );
    AppRuntimeStore.setValue('registry.users', usersWithStableUhids);
  }

  static String _recordId(Map<String, dynamic> user) {
    final abhaAddress = _clean(user['AbhaAddress']).toLowerCase();
    if (abhaAddress.isNotEmpty) {
      return 'address:$abhaAddress';
    }

    final mobile = _digits(user['mobile']);
    final normalizedName = _normalizedName(user['name']);
    if (mobile.isNotEmpty && normalizedName.isNotEmpty) {
      return 'person:$mobile:$normalizedName';
    }

    final abhaNumber = _clean(user['AbhaNumber']);
    if (abhaNumber.isNotEmpty) {
      return 'abha:$abhaNumber';
    }

    if (mobile.isNotEmpty) {
      return 'mobile:$mobile';
    }

    return 'fallback:${DateTime.now().microsecondsSinceEpoch}';
  }

  static String _clean(Object? value) => value?.toString().trim() ?? '';

  static String _digits(Object? value) =>
      value?.toString().replaceAll(RegExp(r'[^0-9]'), '') ?? '';

  static List<Map<String, dynamic>> _profilesFor(Map<String, dynamic> user) {
    final profiles = <Map<String, dynamic>>[];
    final linkedProfiles = user['linkedProfiles'];
    if (linkedProfiles is List) {
      profiles.addAll(
        linkedProfiles.whereType<Map>().map(
          (item) => Map<String, dynamic>.from(item),
        ),
      );
    }

    if (profiles.isEmpty) {
      profiles.add(_snapshotFrom(user));
    }

    return profiles;
  }

  static List<Map<String, dynamic>> _mergeProfiles(
    Map<String, dynamic> existingUser,
    Map<String, dynamic> nextUser,
  ) {
    final mergedProfilesByKey = <String, Map<String, dynamic>>{};
    final orderedKeys = <String>[];

    void absorbProfile(Map<String, dynamic> profile, {required bool prefer}) {
      final normalizedProfile = Map<String, dynamic>.from(profile);
      final profileKey = _profileKey(normalizedProfile);
      final currentProfile = mergedProfilesByKey[profileKey];

      if (currentProfile == null) {
        mergedProfilesByKey[profileKey] = normalizedProfile;
        orderedKeys.add(profileKey);
        return;
      }

      mergedProfilesByKey[profileKey] = prefer
          ? {...currentProfile, ...normalizedProfile}
          : {...normalizedProfile, ...currentProfile};
    }

    final incomingProfiles = _profilesFor(nextUser);
    final existingProfiles = _profilesFor(existingUser);

    for (final incomingProfile in incomingProfiles) {
      absorbProfile(incomingProfile, prefer: true);
    }
    for (final existingProfile in existingProfiles) {
      absorbProfile(existingProfile, prefer: false);
    }

    return orderedKeys
        .map((profileKey) => mergedProfilesByKey[profileKey]!)
        .toList(growable: false);
  }

  static List<String> _addressListFromProfiles(
    List<Map<String, dynamic>> profiles, {
    List<dynamic>? existingHistory,
    List<dynamic>? incomingHistory,
  }) {
    final seen = <String>{};
    final values = <String>[];

    void absorbAddress(Object? rawAddress) {
      final address = _clean(rawAddress);
      if (address.isEmpty) {
        return;
      }
      final key = address.toLowerCase();
      if (seen.add(key)) {
        values.add(address);
      }
    }

    for (final profile in profiles) {
      absorbAddress(profile['AbhaAddress']);
    }

    if (existingHistory != null) {
      for (final rawAddress in existingHistory) {
        absorbAddress(rawAddress);
      }
    }

    if (incomingHistory != null) {
      for (final rawAddress in incomingHistory) {
        absorbAddress(rawAddress);
      }
    }

    return values;
  }

  static List<String> _abhaNumberListFromProfiles(
    List<Map<String, dynamic>> profiles,
  ) {
    final seen = <String>{};
    final values = <String>[];
    for (final profile in profiles) {
      final abhaNumber = _clean(profile['AbhaNumber']);
      if (abhaNumber.isEmpty) {
        continue;
      }
      if (seen.add(abhaNumber)) {
        values.add(abhaNumber);
      }
    }
    return values;
  }

  static Map<String, dynamic> _snapshotFrom(Map<String, dynamic> user) {
    return {
      'name': user['name'],
      'AbhaAddress': user['AbhaAddress'],
      'AbhaNumber': user['AbhaNumber'],
      'uhid': user['uhid'],
      'mobile': user['mobile'],
      'gender': user['gender'],
      'dob': user['dob'],
      'address': user['address'],
      'pincode': user['pincode'],
      'district': user['district'],
      'state': user['state'],
      'imageBase64': user['imageBase64'],
      'cardPayload': user['cardPayload'],
      'rawProfile': user['rawProfile'],
      'sessionToken': user['sessionToken'],
      'refreshToken': user['refreshToken'],
      'source': user['source'],
      'registeredAt': user['registeredAt'],
    };
  }

  static List<Map<String, dynamic>> _ensureStableUhidsForUsers(
    List<Map<String, dynamic>> users, {
    required bool persist,
  }) {
    final uhidByAbhaNumber = _loadUhidByAbhaNumber();
    final uhidSerialByDay = _loadUhidSerialByDay();

    final normalizedUsers = users.map((user) {
      final normalizedUser = Map<String, dynamic>.from(user);
      final normalizedProfiles = _profilesFor(normalizedUser).map((profile) {
        return _ensureStableUhidForProfile(
          profile,
          uhidByAbhaNumber,
          uhidSerialByDay,
        );
      }).toList(growable: false);

      final bestProfile = _bestPrimaryProfile(normalizedProfiles);
      normalizedUser.addAll(bestProfile);
      normalizedUser['linkedProfiles'] = normalizedProfiles;
      final existingAddressHistory = normalizedUser['AbhaAddresses'] is List
          ? List<dynamic>.from(normalizedUser['AbhaAddresses'] as List)
          : <dynamic>[];
      normalizedUser['AbhaAddresses'] = _addressListFromProfiles(
        normalizedProfiles,
        existingHistory: existingAddressHistory,
      );
      normalizedUser['AbhaNumbers'] = _abhaNumberListFromProfiles(
        normalizedProfiles,
      );
      normalizedUser['uhid'] = _bestValue(
        normalizedUser['uhid'],
        bestProfile['uhid'],
      );
      normalizedUser['id'] =
          normalizedUser['id']?.toString() ?? _recordId(normalizedUser);
      return normalizedUser;
    }).toList(growable: false);

    if (persist) {
      AppRuntimeStore.setValue(_uhidByAbhaNumberKey, uhidByAbhaNumber);
      AppRuntimeStore.setValue(_uhidSerialByDayKey, uhidSerialByDay);
    }

    return normalizedUsers;
  }

  static Map<String, dynamic> _ensureStableUhidForProfile(
    Map<String, dynamic> profile,
    Map<String, dynamic> uhidByAbhaNumber,
    Map<String, dynamic> uhidSerialByDay,
  ) {
    final normalizedProfile = Map<String, dynamic>.from(profile);
    final abhaNumber = _normalizedAbhaNumberKey(normalizedProfile['AbhaNumber']);
    final existingUhid = _clean(normalizedProfile['uhid']);

    if (abhaNumber.isEmpty) {
      return normalizedProfile;
    }

    final storedUhid = _clean(uhidByAbhaNumber[abhaNumber]);
    if (storedUhid.isNotEmpty) {
      normalizedProfile['uhid'] = storedUhid;
      return normalizedProfile;
    }

    if (_hasUsefulValue(existingUhid)) {
      uhidByAbhaNumber[abhaNumber] = existingUhid;
      normalizedProfile['uhid'] = existingUhid;
      return normalizedProfile;
    }

    final generatedUhid = _generateNextUhid(uhidSerialByDay);
    uhidByAbhaNumber[abhaNumber] = generatedUhid;
    normalizedProfile['uhid'] = generatedUhid;
    return normalizedProfile;
  }

  static Map<String, dynamic> _loadUhidByAbhaNumber() {
    final stored = AppRuntimeStore.getValue<Map<String, dynamic>>(
      _uhidByAbhaNumberKey,
    );
    if (stored == null) {
      return <String, dynamic>{};
    }
    return Map<String, dynamic>.from(stored);
  }

  static Map<String, dynamic> _loadUhidSerialByDay() {
    final stored = AppRuntimeStore.getValue<Map<String, dynamic>>(
      _uhidSerialByDayKey,
    );
    if (stored == null) {
      return <String, dynamic>{};
    }
    return Map<String, dynamic>.from(stored);
  }

  static String _generateNextUhid(Map<String, dynamic> uhidSerialByDay) {
    final now = DateTime.now();
    final day = now.day.toString().padLeft(2, '0');
    final month = now.month.toString().padLeft(2, '0');
    final year = (now.year % 100).toString().padLeft(2, '0');
    final datePart = '$day$month$year';

    final currentSerialValue = uhidSerialByDay[datePart];
    final currentSerial = currentSerialValue is int
        ? currentSerialValue
        : int.tryParse(currentSerialValue?.toString() ?? '') ?? 0;
    final nextSerial = currentSerial + 1;
    uhidSerialByDay[datePart] = nextSerial;

    final serialPart = nextSerial.toString().padLeft(2, '0');
    return 'SHC$datePart$serialPart';
  }

  static String _profileKey(Map<String, dynamic> profile) {
    final abhaNumber = _clean(profile['AbhaNumber']);
    final abhaAddress = _clean(profile['AbhaAddress']).toLowerCase();
    if (abhaAddress.isNotEmpty && abhaNumber.isNotEmpty) {
      return 'address:$abhaAddress|abha:$abhaNumber';
    }

    if (abhaNumber.isNotEmpty) {
      return 'abha:$abhaNumber';
    }

    if (abhaAddress.isNotEmpty) {
      return 'address:$abhaAddress';
    }

    final mobile = _digits(profile['mobile']);
    final normalizedName = _normalizedName(profile['name']);
    if (mobile.isNotEmpty && normalizedName.isNotEmpty) {
      return 'person:$mobile:$normalizedName';
    }

    if (mobile.isNotEmpty) {
      return 'mobile:$mobile';
    }

    return 'fallback:${DateTime.now().microsecondsSinceEpoch}';
  }

  static List<Map<String, dynamic>> _coalesceUsers(
    List<Map<String, dynamic>> inputUsers,
  ) {
    final coalescedUsers = <Map<String, dynamic>>[];
    for (final user in inputUsers) {
      final incomingUser = Map<String, dynamic>.from(user);
      final existingIndex = _matchingUserIndex(coalescedUsers, incomingUser);
      if (existingIndex >= 0) {
        final existingUser = Map<String, dynamic>.from(
          coalescedUsers[existingIndex],
        );
        final mergedProfiles = _mergeProfiles(existingUser, incomingUser);
        final mergedUser = _mergeUser(existingUser, incomingUser, mergedProfiles);
        mergedUser['id'] =
            existingUser['id']?.toString() ?? _recordId(mergedUser);
        coalescedUsers[existingIndex] = mergedUser;
      } else {
        final mergedProfiles = _mergeProfiles(
          const <String, dynamic>{},
          incomingUser,
        );
        final mergedUser = _mergeUser(
          const <String, dynamic>{},
          incomingUser,
          mergedProfiles,
        );
        mergedUser['id'] =
            incomingUser['id']?.toString() ?? _recordId(mergedUser);
        coalescedUsers.add(mergedUser);
      }
    }
    return coalescedUsers;
  }

  static int _matchingUserIndex(
    List<Map<String, dynamic>> existingUsers,
    Map<String, dynamic> candidate,
  ) {
    final candidateProfiles = _profilesFor(candidate);
    for (var index = 0; index < existingUsers.length; index++) {
      final existingProfiles = _profilesFor(existingUsers[index]);
      for (final candidateProfile in candidateProfiles) {
        for (final existingProfile in existingProfiles) {
          if (_profilesMatch(existingProfile, candidateProfile)) {
            return index;
          }
        }
      }
    }
    return -1;
  }

  static bool _profilesMatch(
    Map<String, dynamic> existingProfile,
    Map<String, dynamic> candidateProfile,
  ) {
    final existingAddress = _clean(existingProfile['AbhaAddress']).toLowerCase();
    final candidateAddress = _clean(candidateProfile['AbhaAddress'])
        .toLowerCase();
    if (existingAddress.isNotEmpty &&
        candidateAddress.isNotEmpty &&
        existingAddress == candidateAddress) {
      return true;
    }

    final existingAbhaNumber = _clean(existingProfile['AbhaNumber']);
    final candidateAbhaNumber = _clean(candidateProfile['AbhaNumber']);
    if (existingAbhaNumber.isNotEmpty &&
        candidateAbhaNumber.isNotEmpty &&
        existingAbhaNumber == candidateAbhaNumber) {
      return true;
    }

    final existingMobile = _digits(existingProfile['mobile']);
    final candidateMobile = _digits(candidateProfile['mobile']);
    final existingName = _normalizedName(existingProfile['name']);
    final candidateName = _normalizedName(candidateProfile['name']);
    if (existingMobile.isNotEmpty &&
        candidateMobile.isNotEmpty &&
        existingName.isNotEmpty &&
        candidateName.isNotEmpty &&
        existingMobile == candidateMobile &&
        existingName == candidateName) {
      return true;
    }

    final existingDob = _normalizedDob(existingProfile['dob']);
    final candidateDob = _normalizedDob(candidateProfile['dob']);
    if (existingMobile.isNotEmpty &&
        candidateMobile.isNotEmpty &&
        existingDob.isNotEmpty &&
        candidateDob.isNotEmpty &&
        existingMobile == candidateMobile &&
        existingDob == candidateDob) {
      return true;
    }

    return false;
  }

  static Map<String, dynamic> _mergeUser(
    Map<String, dynamic> existingUser,
    Map<String, dynamic> nextUser,
    List<Map<String, dynamic>> mergedProfiles,
  ) {
    final bestProfile = _bestPrimaryProfile(mergedProfiles);
    return {
      ...existingUser,
      ...nextUser,
      ...bestProfile,
      'linkedProfiles': mergedProfiles,
      'AbhaAddresses': _addressListFromProfiles(
        mergedProfiles,
        existingHistory: existingUser['AbhaAddresses'] is List
            ? List<dynamic>.from(existingUser['AbhaAddresses'] as List)
            : <dynamic>[],
        incomingHistory: nextUser['AbhaAddresses'] is List
            ? List<dynamic>.from(nextUser['AbhaAddresses'] as List)
            : <dynamic>[],
      ),
      'AbhaNumbers': _abhaNumberListFromProfiles(mergedProfiles),
      'source': _bestValue(existingUser['source'], nextUser['source']),
      'registeredAt': _bestValue(
        existingUser['registeredAt'],
        nextUser['registeredAt'],
      ),
    };
  }

  static Map<String, dynamic> _bestPrimaryProfile(
    List<Map<String, dynamic>> profiles,
  ) {
    if (profiles.isEmpty) {
      return const <String, dynamic>{};
    }

    final sortedProfiles = profiles.toList(growable: false)
      ..sort((leftProfile, rightProfile) {
        final rightAccuracyScore = _profileAccuracyScore(rightProfile);
        final leftAccuracyScore = _profileAccuracyScore(leftProfile);
        final accuracyComparison = rightAccuracyScore.compareTo(
          leftAccuracyScore,
        );
        if (accuracyComparison != 0) {
          return accuracyComparison;
        }

        final rightTimestamp = _registeredAtTimestamp(rightProfile);
        final leftTimestamp = _registeredAtTimestamp(leftProfile);
        return rightTimestamp.compareTo(leftTimestamp);
      });
    return Map<String, dynamic>.from(sortedProfiles.first);
  }

  static int _profileAccuracyScore(Map<String, dynamic> profile) {
    var score = 0;
    score += _hasUsefulValue(profile['name']) ? 5 : 0;
    score += _hasUsefulValue(profile['AbhaAddress']) ? 6 : 0;
    score += _looksLikeAbhaNumber(profile['AbhaNumber']) ? 8 : 0;
    score += _hasUsefulValue(profile['mobile']) ? 5 : 0;
    score += _looksLikeFullDob(profile['dob']) ? 5 : 0;
    score += _looksLikeFullAddress(profile['address']) ? 6 : 0;
    score += _looksLikePincode(profile['pincode']) ? 4 : 0;
    score += _hasUsefulValue(profile['district']) ? 2 : 0;
    score += _hasUsefulValue(profile['state']) ? 2 : 0;
    score += _hasUsefulValue(profile['imageBase64']) ? 3 : 0;
    score += _hasUsefulValue(profile['cardPayload']) ? 3 : 0;
    score += _hasUsefulValue(profile['sessionToken']) ? 2 : 0;
    return score;
  }

  static int _registeredAtTimestamp(Map<String, dynamic> profile) {
    final registeredAt = _clean(profile['registeredAt']);
    if (registeredAt.isEmpty) {
      return 0;
    }

    final parsedDateTime = DateTime.tryParse(registeredAt);
    if (parsedDateTime == null) {
      return 0;
    }
    return parsedDateTime.millisecondsSinceEpoch;
  }

  static bool _hasUsefulValue(Object? value) {
    final text = _clean(value);
    if (text.isEmpty) {
      return false;
    }
    final normalizedText = text.toUpperCase();
    return normalizedText != 'N/A' && normalizedText != '-';
  }

  static bool _looksLikeAbhaNumber(Object? value) {
    final text = _clean(value);
    return RegExp(r'^\d{2}-\d{4}-\d{4}-\d{4}$').hasMatch(text);
  }

  static String _normalizedAbhaNumberKey(Object? value) {
    final text = _clean(value);
    return text.replaceAll(RegExp(r'\s+'), '').toUpperCase();
  }

  static bool _looksLikeFullDob(Object? value) {
    final text = _clean(value);
    return text.contains('-') || text.contains('/');
  }

  static bool _looksLikeFullAddress(Object? value) {
    final text = _clean(value);
    return text.length >= 15;
  }

  static bool _looksLikePincode(Object? value) {
    return RegExp(r'^\d{6}$').hasMatch(_clean(value));
  }

  static String _normalizedName(Object? value) {
    return _clean(value).toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
  }

  static String _normalizedDob(Object? value) {
    return _clean(value).replaceAll(RegExp(r'[^0-9]'), '');
  }

  static Object? _bestValue(Object? leftValue, Object? rightValue) {
    final leftText = _clean(leftValue);
    final rightText = _clean(rightValue);
    final leftUseful = _hasUsefulValue(leftValue);
    final rightUseful = _hasUsefulValue(rightValue);

    if (!leftUseful && rightUseful) {
      return rightValue;
    }
    if (leftUseful && !rightUseful) {
      return leftValue;
    }
    if (!leftUseful && !rightUseful) {
      return rightText.isNotEmpty ? rightValue : leftValue;
    }

    if (_looksLikeFullDob(rightValue) && !_looksLikeFullDob(leftValue)) {
      return rightValue;
    }
    if (_looksLikeFullAddress(rightValue) && !_looksLikeFullAddress(leftValue)) {
      return rightValue;
    }
    if (_looksLikePincode(rightValue) && !_looksLikePincode(leftValue)) {
      return rightValue;
    }
    if (_looksLikeAbhaNumber(rightValue) && !_looksLikeAbhaNumber(leftValue)) {
      return rightValue;
    }

    if (rightText.length > leftText.length) {
      return rightValue;
    }

    return leftValue;
  }
}
