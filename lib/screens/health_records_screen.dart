import 'package:flutter/material.dart';

import '../models/health_record.dart';
import '../services/hiu_api_service.dart';
import '../widgets/api_feedback_dialogs.dart';
import '../widgets/desktop_workspace.dart';

class HealthRecordsScreen extends StatefulWidget {
  const HealthRecordsScreen({
    super.key,
    this.hipId,
    this.hipName,
    this.consentArtefactId,
  });

  final String? hipId;
  final String? hipName;
  final String? consentArtefactId;

  @override
  State<HealthRecordsScreen> createState() => _HealthRecordsScreenState();
}

class _HealthRecordsScreenState extends State<HealthRecordsScreen> {
  bool _loading = false;
  String? _error;
  List<HealthRecord> _records = const [];

  @override
  void initState() {
    super.initState();
    _loadRecords();
  }

  Future<void> _loadRecords() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final records = await HiuApiService.fetchRecords();
      if (!mounted) return;
      setState(() {
        _records = records;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = cleanApiMessage(e);
      });
      await showApiErrorDialog(context, e, title: "Health Records Failed");
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final desktop = MediaQuery.of(context).size.width >= 1080;

    return Scaffold(
      appBar: AppBar(title: const Text("Health Records")),
      body: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1160),
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              DesktopPageIntro(
                eyebrow: "Health Records",
                title: "Review retrieved records in a cleaner desktop list.",
                description:
                    "Provider, type, and date are arranged for desktop scanning, with full content opening on demand.",
                pills: const ["Record list", "Provider", "Detail view"],
                trailing: desktop ? _contextCard() : null,
              ),
              if (!desktop) ...[
                _contextCard(),
                const SizedBox(height: 16),
              ],
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  OutlinedButton.icon(
                    onPressed: _loading ? null : _loadRecords,
                    icon: const Icon(Icons.refresh),
                    label: const Text("Refresh Records"),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (_loading && _records.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(32),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_error != null && _records.isEmpty)
                DesktopSurface(
                  child: Column(
                    children: [
                      Text(_error!, textAlign: TextAlign.center),
                      const SizedBox(height: 12),
                      OutlinedButton(
                        onPressed: _loadRecords,
                        child: const Text("Retry Records Fetch"),
                      ),
                    ],
                  ),
                )
              else if (_records.isEmpty)
                const DesktopSurface(
                  child: Text(
                    "No health records are available yet for this request.",
                    textAlign: TextAlign.center,
                  ),
                )
              else
                ..._records.map((record) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: DesktopSurface(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            record.type,
                            style: Theme.of(context).textTheme.titleLarge
                                ?.copyWith(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 12,
                            runSpacing: 8,
                            children: [
                              Text("Provider: ${record.provider}"),
                              Text("Date: ${record.date}"),
                              SelectableText("Record ID: ${record.id}"),
                            ],
                          ),
                          const SizedBox(height: 14),
                          SizedBox(
                            height: 44,
                            child: OutlinedButton(
                              onPressed: () {
                                showDialog(
                                  context: context,
                                  builder: (_) => AlertDialog(
                                    title: Text(record.type),
                                    content: SingleChildScrollView(
                                      child: SelectableText(record.content),
                                    ),
                                    actions: [
                                      TextButton(
                                        onPressed: () =>
                                            Navigator.of(context).pop(),
                                        child: const Text("Close"),
                                      ),
                                    ],
                                  ),
                                );
                              },
                              child: const Text("View Record Detail"),
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

  Widget _contextCard() {
    return DesktopSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "Request context",
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          if ((widget.hipName ?? '').trim().isNotEmpty)
            Text("Provider: ${widget.hipName!.trim()}"),
          if ((widget.hipId ?? '').trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            SelectableText("HIP ID: ${widget.hipId!.trim()}"),
          ],
          if ((widget.consentArtefactId ?? '').trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            SelectableText(
              "Consent artefact ID: ${widget.consentArtefactId!.trim()}",
            ),
          ],
        ],
      ),
    );
  }
}
