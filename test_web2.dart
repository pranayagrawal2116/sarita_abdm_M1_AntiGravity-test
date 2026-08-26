import 'dart:io';
void main() {
  try {
    print(Directory.current);
  } catch (e) {
    print('Error: $e');
  }
}
