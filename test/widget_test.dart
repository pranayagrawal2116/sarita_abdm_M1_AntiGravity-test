import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:sarita_abdm/config/hospital_config.dart';
import 'package:sarita_abdm/main.dart';

void main() {
  testWidgets('App shell smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());

    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));

    expect(app.title, HospitalConfig.appTitle);
    expect(app.debugShowCheckedModeBanner, isFalse);
  });
}
