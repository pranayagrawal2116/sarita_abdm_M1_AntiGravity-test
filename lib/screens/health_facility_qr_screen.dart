import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../config/hospital_config.dart';

class HealthFacilityQrScreen extends StatefulWidget {
  const HealthFacilityQrScreen({super.key});

  @override
  State<HealthFacilityQrScreen> createState() => _HealthFacilityQrScreenState();
}

class _HealthFacilityQrScreenState extends State<HealthFacilityQrScreen> {
  final TextEditingController _qrValueController = TextEditingController();

  @override
  void dispose() {
    _qrValueController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Health Facility QR Input")),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  "Paste Health Facility QR Data",
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 12),
                Text(
                  "This desktop build uses a paste-based workflow instead of a live camera scanner. You can use the built-in ${HospitalConfig.hospitalName} facility QR for HIP ID ${HospitalConfig.hipId}, or paste the QR text / decoded payload manually.",
                  style: const TextStyle(
                    color: Color(0xFF5C6C7A),
                    fontSize: 15,
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FBFD),
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(color: const Color(0xFFD7E4F0)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        '${HospitalConfig.hospitalName} Default Facility QR',
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 8),
                      SelectableText(
                        'HIP ID: ${HospitalConfig.hipId}',
                        style: const TextStyle(
                          color: Color(0xFF17324A),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 14),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(18),
                        child: Image.network(
                          HospitalConfig.facilityQrImageUrl.toString(),
                          height: 240,
                          fit: BoxFit.contain,
                          errorBuilder: (context, error, stackTrace) {
                            return Container(
                              height: 240,
                              alignment: Alignment.center,
                              color: Colors.white,
                              child: const Padding(
                                padding: EdgeInsets.all(20),
                                child: Text(
                                  'QR preview could not be loaded here, but the default facility QR payload is ready to use below.',
                                  textAlign: TextAlign.center,
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                      const SizedBox(height: 12),
                      SelectableText(
                        HospitalConfig.facilityQrRaw,
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 12.5,
                          color: Color(0xFF516270),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 12,
                        runSpacing: 12,
                        children: [
                          OutlinedButton.icon(
                            onPressed: () async {
                              await Clipboard.setData(
                                ClipboardData(
                                  text: HospitalConfig.facilityQrRaw,
                                ),
                              );
                            },
                            icon: const Icon(Icons.copy_rounded),
                            label: const Text('Copy Default QR Payload'),
                          ),
                          ElevatedButton.icon(
                            onPressed: () {
                              Navigator.pop(context, {
                                "raw": HospitalConfig.facilityQrRaw,
                                "hipId": HospitalConfig.hipId,
                              });
                            },
                            icon: const Icon(
                              Icons.check_circle_outline_rounded,
                            ),
                            label: const Text('Use Default Facility QR'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: _qrValueController,
                  minLines: 8,
                  maxLines: 12,
                  decoration: const InputDecoration(
                    labelText: "QR Content",
                    hintText:
                        "Paste the scanned QR text, URL, or JSON payload here",
                    border: OutlineInputBorder(),
                    alignLabelWithHint: true,
                  ),
                ),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  alignment: WrapAlignment.end,
                  children: [
                    OutlinedButton.icon(
                      onPressed: () async {
                        final data = await Clipboard.getData(
                          Clipboard.kTextPlain,
                        );
                        final text = data?.text?.trim() ?? '';
                        if (text.isEmpty || !mounted) return;
                        setState(() {
                          _qrValueController.text = text;
                          _qrValueController.selection =
                              TextSelection.collapsed(
                                offset: _qrValueController.text.length,
                              );
                        });
                      },
                      icon: const Icon(Icons.content_paste_rounded),
                      label: const Text("Paste From Clipboard"),
                    ),
                    OutlinedButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text("Cancel"),
                    ),
                    ElevatedButton.icon(
                      onPressed: () {
                        final raw = _qrValueController.text.trim();
                        if (raw.isEmpty) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text(
                                "Paste QR content before continuing.",
                              ),
                            ),
                          );
                          return;
                        }
                        final parsed = _extractHipId(raw);
                        Navigator.pop(context, {"raw": raw, "hipId": parsed});
                      },
                      icon: const Icon(Icons.qr_code_2_rounded),
                      label: const Text("Use QR Data"),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _extractHipId(String raw) {
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) {
        return _extractHipIdFromMap(decoded);
      }
    } catch (_) {}

    final uri = Uri.tryParse(raw);
    if (uri != null) {
      final queryValue =
          uri.queryParameters['hipId'] ??
          uri.queryParameters['hip_id'] ??
          uri.queryParameters['providerId'] ??
          uri.queryParameters['facilityId'];
      if (queryValue != null && queryValue.trim().isNotEmpty) {
        return queryValue.trim();
      }
    }

    return raw;
  }

  String _extractHipIdFromMap(Map<String, dynamic> json) {
    const candidates = [
      ['hipId'],
      ['hip_id'],
      ['providerId'],
      ['facilityId'],
      ['id'],
      ['hip', 'id'],
      ['facility', 'id'],
      ['provider', 'id'],
      ['identifier'],
    ];

    for (final path in candidates) {
      dynamic current = json;
      for (final key in path) {
        if (current is Map<String, dynamic>) {
          current = current[key];
        } else {
          current = null;
          break;
        }
      }

      final text = current?.toString().trim() ?? '';
      if (text.isNotEmpty) {
        return text;
      }
    }

    return json.toString();
  }
}
