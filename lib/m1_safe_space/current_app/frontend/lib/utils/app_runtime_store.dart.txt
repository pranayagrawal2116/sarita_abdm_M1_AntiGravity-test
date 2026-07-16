import 'dart:collection';

import 'package:flutter/foundation.dart';

class AppRuntimeStore {
  AppRuntimeStore._();

  static final ValueNotifier<int> revision = ValueNotifier<int>(0);

  static final Map<String, dynamic> _values = <String, dynamic>{};
  static final Map<String, dynamic> _apiResponses = <String, dynamic>{};
  static final Map<String, DateTime> _updatedAt = <String, DateTime>{};

  static UnmodifiableMapView<String, dynamic> get values =>
      UnmodifiableMapView<String, dynamic>(Map<String, dynamic>.from(_values));

  static UnmodifiableMapView<String, dynamic> get apiResponses =>
      UnmodifiableMapView<String, dynamic>(
        Map<String, dynamic>.from(_apiResponses),
      );

  static UnmodifiableMapView<String, DateTime> get updatedAt =>
      UnmodifiableMapView<String, DateTime>(
        Map<String, DateTime>.from(_updatedAt),
      );

  static T? getValue<T>(String key) {
    final value = _values[key];
    if (value is T) {
      return value;
    }
    return null;
  }

  static dynamic getApiResponse(String key) => _apiResponses[key];

  static bool containsKey(String key) => _values.containsKey(key);

  static void setValue(String key, dynamic value) {
    _values[key] = _clone(value);
    _touch(key);
  }

  static void setValues(Map<String, dynamic> values) {
    values.forEach((key, value) {
      _values[key] = _clone(value);
      _updatedAt[key] = DateTime.now();
    });
    revision.value++;
  }

  static void setApiResponse(
    String key,
    dynamic response, {
    Map<String, dynamic>? extraValues,
  }) {
    final normalized = _clone(response);
    _apiResponses[key] = normalized;
    _updatedAt['api.$key'] = DateTime.now();
    _values['api.$key'] = normalized;
    _values['api.last.key'] = key;
    _values['api.last.response'] = normalized;
    _flatten('api.$key', normalized);

    if (extraValues != null && extraValues.isNotEmpty) {
      extraValues.forEach((extraKey, value) {
        _values[extraKey] = _clone(value);
        _updatedAt[extraKey] = DateTime.now();
      });
    }

    revision.value++;
  }

  static void _touch(String key) {
    _updatedAt[key] = DateTime.now();
    revision.value++;
  }

  static void _flatten(String prefix, dynamic value) {
    if (value is Map) {
      value.forEach((key, nestedValue) {
        final nestedKey = '$prefix.$key';
        _values[nestedKey] = _clone(nestedValue);
        _updatedAt[nestedKey] = DateTime.now();
        _flatten(nestedKey, nestedValue);
      });
      return;
    }

    if (value is List) {
      for (var i = 0; i < value.length; i++) {
        final nestedKey = '$prefix[$i]';
        final nestedValue = value[i];
        _values[nestedKey] = _clone(nestedValue);
        _updatedAt[nestedKey] = DateTime.now();
        _flatten(nestedKey, nestedValue);
      }
    }
  }

  static dynamic _clone(dynamic value) {
    if (value is Map) {
      return Map<String, dynamic>.fromEntries(
        value.entries.map(
          (entry) => MapEntry(entry.key.toString(), _clone(entry.value)),
        ),
      );
    }

    if (value is List) {
      return value.map(_clone).toList(growable: false);
    }

    return value;
  }
}
