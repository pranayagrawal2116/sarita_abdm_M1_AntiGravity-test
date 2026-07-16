import 'package:flutter/material.dart';

import '../models/hip.dart';
import '../services/hiu_api_service.dart';
import '../widgets/api_feedback_dialogs.dart';
import '../widgets/desktop_workspace.dart';
import 'health_records_screen.dart';

class HipSelectionScreen extends StatefulWidget {
  final String consentArtefactId;
  final String? requesterName;
  final String? purpose;

  const HipSelectionScreen({
    super.key,
    required this.consentArtefactId,
    this.requesterName,
    this.purpose,
  });

  @override
  State<HipSelectionScreen> createState() => _HipSelectionScreenState();
}

class _HipSelectionScreenState extends State<HipSelectionScreen> {
  bool _loading = false;
  bool _requesting = false;
  String? _error;
  String? _activeHipId;
  List<Hip> _hips = const [];

  @override
  void initState() {
    super.initState();
    _loadHips();
  }

  Future<void> _loadHips() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final hips = await HiuApiService.fetchHips();
      if (!mounted) return;
      setState(() {
        _hips = hips;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = cleanApiMessage(e);
      });
      await showApiErrorDialog(context, e, title: "Provider Fetch Failed");
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _requestRecords(Hip hip) async {
    setState(() {
      _requesting = true;
      _activeHipId = hip.id;
    });

    try {
      await HiuApiService.requestData(hip.id, widget.consentArtefactId);
      if (!mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => HealthRecordsScreen(
            hipId: hip.id,
            hipName: hip.name,
            consentArtefactId: widget.consentArtefactId,
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      await showApiErrorDialog(context, e, title: "Record Request Failed");
    } finally {
      if (mounted) {
        setState(() {
          _requesting = false;
          _activeHipId = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final desktop = MediaQuery.of(context).size.width >= 1080;

    return Scaffold(
      appBar: AppBar(title: const Text("Select Provider")),
      body: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1140),
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              DesktopPageIntro(
                eyebrow: "HIP Selection",
                title:
                    "Choose the provider that will fulfill the consented request.",
                description:
                    "This step is tuned for desktop scanning so you can compare providers quickly before requesting records from the approved consent flow.",
                pills: const [
                  "Provider list",
                  "Consent artefact",
                  "Record fetch",
                ],
                trailing: desktop ? _summaryCard() : null,
              ),
              if (!desktop) ...[
                _summaryCard(),
                const SizedBox(height: 16),
              ],
              if (_loading && _hips.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(32),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_error != null && _hips.isEmpty)
                DesktopSurface(
                  child: Column(
                    children: [
                      Text(_error!, textAlign: TextAlign.center),
                      const SizedBox(height: 12),
                      OutlinedButton(
                        onPressed: _loadHips,
                        child: const Text("Retry Provider Fetch"),
                      ),
                    ],
                  ),
                )
              else if (_hips.isEmpty)
                const DesktopSurface(
                  child: Text(
                    "No providers were returned for this request yet.",
                    textAlign: TextAlign.center,
                  ),
                )
              else
                ..._hips.map((hip) {
                  final isActive = _activeHipId == hip.id;

                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: DesktopSurface(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  hip.name,
                                  style: Theme.of(context).textTheme.titleLarge
                                      ?.copyWith(fontWeight: FontWeight.w800),
                                ),
                                const SizedBox(height: 6),
                                Text("Type: ${hip.type}"),
                                const SizedBox(height: 4),
                                SelectableText("HIP ID: ${hip.id}"),
                              ],
                            ),
                          ),
                          const SizedBox(width: 16),
                          SizedBox(
                            height: 48,
                            child: ElevatedButton.icon(
                              onPressed: _requesting
                                  ? null
                                  : () => _requestRecords(hip),
                              icon: isActive && _requesting
                                  ? const SizedBox(
                                      height: 18,
                                      width: 18,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : const Icon(Icons.chevron_right),
                              label: Text(
                                isActive && _requesting
                                    ? "Requesting..."
                                    : "Request Records",
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }),
            ],
          ),
        ),
      ),
    );
  }

  Widget _summaryCard() {
    return DesktopSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "Approved consent context",
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          SelectableText("Consent artefact ID: ${widget.consentArtefactId}"),
          if ((widget.requesterName ?? '').trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text("Requester: ${widget.requesterName!.trim()}"),
          ],
          if ((widget.purpose ?? '').trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text("Purpose: ${widget.purpose!.trim()}"),
          ],
          const SizedBox(height: 12),
          const Text(
            "Choose one provider below to start the health-record request using this approved consent.",
          ),
        ],
      ),
    );
  }
}
