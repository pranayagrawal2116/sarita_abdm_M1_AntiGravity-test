import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';

class VirtualAbhaCard extends StatelessWidget {
  const VirtualAbhaCard({
    super.key,
    required this.name,
    required this.abhaAddress,
    required this.abhaNumber,
    required this.gender,
    required this.dob,
    this.mobile,
    this.photoBase64,
    this.isVirtual = true,
  });

  final String name;
  final String abhaAddress;
  final String abhaNumber;
  final String gender;
  final String dob;
  final String? mobile;
  final String? photoBase64;
  final bool isVirtual;

  @override
  Widget build(BuildContext context) {
    final String formattedAbhaNumber = _formatAbhaNumber(abhaNumber);
    final Uint8List? imageBytes = _decodePhoto(photoBase64);

    return Container(
      constraints: const BoxConstraints(maxWidth: 580, maxHeight: 340),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: const Color(0xFFE3F2FD), width: 1.5),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1F0D47A1),
            blurRadius: 28,
            offset: Offset(0, 14),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(26),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header Bar (Navy Blue)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              color: const Color(0xFF0D47A1),
              child: Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.verified_user_rounded,
                      color: Color(0xFF00A86B),
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'NATIONAL HEALTH AUTHORITY',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.8,
                          ),
                        ),
                        SizedBox(height: 2),
                        Text(
                          'Ayushman Bharat Digital Mission (ABDM)',
                          style: TextStyle(
                            color: Color(0xFFE3F2FD),
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (isVirtual)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFF00A86B),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: const Text(
                        'VIRTUAL CARD',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.4,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            // Accent bar (Medical Green)
            Container(
              height: 4,
              color: const Color(0xFF00A86B),
            ),
            // Card Body
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(20),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Color(0xFFFAFAFA),
                      Color(0xFFFFFFFF),
                    ],
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Photo Column
                    Column(
                      children: [
                        Container(
                          width: 100,
                          height: 110,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: const Color(0xFFE3F2FD), width: 1.5),
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x0F0D47A1),
                                blurRadius: 10,
                                offset: Offset(0, 4),
                              ),
                            ],
                            image: imageBytes != null
                                ? DecorationImage(
                                    image: MemoryImage(imageBytes),
                                    fit: BoxFit.cover,
                                  )
                                : null,
                          ),
                          child: imageBytes == null
                              ? const Center(
                                  child: Icon(
                                    Icons.person_rounded,
                                    size: 48,
                                    color: Color(0xFF1976D2),
                                  ),
                                )
                              : null,
                        ),
                        const SizedBox(height: 12),
                        // Mini Logo
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.favorite_rounded,
                              color: Color(0xFF00A86B),
                              size: 14,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              'ABHA',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w900,
                                color: const Color(0xFF0D47A1).withValues(alpha: 0.8),
                                letterSpacing: 0.5,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(width: 20),
                    // Details Column
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                name.toUpperCase(),
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w900,
                                  color: Color(0xFF212121),
                                  letterSpacing: -0.4,
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 8),
                              _detailRow('ABHA Number', formattedAbhaNumber, isHighlighted: true),
                              const SizedBox(height: 6),
                              _detailRow('ABHA Address', abhaAddress),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  Expanded(child: _detailRow('Gender', gender)),
                                  Expanded(child: _detailRow('DOB/YOB', dob)),
                                ],
                              ),
                              if (mobile != null && mobile!.trim().isNotEmpty && mobile != '-') ...[
                                const SizedBox(height: 6),
                                _detailRow('Mobile', mobile!),
                              ],
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    // QR Code Column
                    Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 88,
                          height: 88,
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFFE3F2FD), width: 1.5),
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x08000000),
                                blurRadius: 6,
                                offset: Offset(0, 2),
                              ),
                            ],
                          ),
                          child: CustomPaint(
                            painter: _VirtualCardQrPainter(),
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Scan & Verify',
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF5A6F82),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _detailRow(String label, String value, {bool isHighlighted = false}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: const TextStyle(
            fontSize: 9,
            fontWeight: FontWeight.w800,
            color: Color(0xFF5A6F82),
            letterSpacing: 0.2,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value.isEmpty ? '-' : value,
          style: TextStyle(
            fontSize: isHighlighted ? 15 : 13,
            fontWeight: isHighlighted ? FontWeight.w900 : FontWeight.w700,
            color: isHighlighted ? const Color(0xFF1976D2) : const Color(0xFF212121),
          ),
        ),
      ],
    );
  }

  String _formatAbhaNumber(String rawNumber) {
    final clean = rawNumber.replaceAll(RegExp(r'\D'), '');
    if (clean.length == 14) {
      return '${clean.substring(0, 2)}-${clean.substring(2, 6)}-${clean.substring(6, 10)}-${clean.substring(10, 14)}';
    }
    return rawNumber;
  }

  Uint8List? _decodePhoto(String? base64Str) {
    if (base64Str == null || base64Str.trim().isEmpty) return null;
    try {
      return base64Decode(base64Str.trim());
    } catch (_) {
      return null;
    }
  }
}

class _VirtualCardQrPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final whitePaint = Paint()..color = Colors.white;
    final blackPaint = Paint()..color = const Color(0xFF212121);
    canvas.drawRect(Offset.zero & size, whitePaint);

    final cell = size.width / 17;
    for (var row = 0; row < 17; row++) {
      for (var col = 0; col < 17; col++) {
        final inFinder = _isFinder(row, col);
        final filled = inFinder || ((row * 3 + col * 7 + row * col) % 4 == 0);
        if (!filled) {
          continue;
        }
        canvas.drawRect(
          Rect.fromLTWH(col * cell, row * cell, cell, cell),
          blackPaint,
        );
      }
    }
  }

  bool _isFinder(int row, int col) {
    // 17x17 grid finder spots in top-left, top-right, and bottom-left
    const positions = [Offset(0, 0), Offset(12, 0), Offset(0, 12)];
    for (final position in positions) {
      final r = row - position.dy.toInt();
      final c = col - position.dx.toInt();
      if (r >= 0 && r < 5 && c >= 0 && c < 5) {
        if (r == 0 || r == 4 || c == 0 || c == 4) return true;
        if (r >= 2 && r <= 2 && c >= 2 && c <= 2) return true;
      }
    }
    return false;
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
