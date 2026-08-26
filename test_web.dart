import 'dart:io';
void main() {
  dynamic x = null;
  try {
    if (x is File) {
      print('is File');
    } else {
      print('is not File');
    }
  } catch (e) {
    print('Error: $e');
  }
}
