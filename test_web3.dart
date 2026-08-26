import 'dart:io';
void main() {
  try {
    print(Platform.resolvedExecutable);
  } catch (e) {
    print('Error: $e');
  }
}
