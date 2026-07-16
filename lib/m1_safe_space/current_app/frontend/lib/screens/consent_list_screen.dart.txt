import 'package:flutter/material.dart';

import '../models/consent_request.dart';
import '../services/consent_api_service.dart';
import '../utils/consent_mode.dart';
import '../widgets/api_feedback_dialogs.dart';
import '../widgets/desktop_workspace.dart';
import 'consent_detail_screen.dart';
import 'hip_selection_screen.dart';

class ConsentListScreen extends StatefulWidget {
  const ConsentListScreen({super.key, this.mode = ConsentMode.currentDefault});

  final ConsentMode mode;

  @override
  State<ConsentListScreen> createState() => _ConsentListScreenState();
}

class _ConsentListScreenState extends State<ConsentListScreen> {
  late ConsentMode _mode;
  bool _loading = false;
  String? _error;
  List<ConsentRequest> _items = const [];

  @override
  void initState() {
    super.initState();
    _mode = widget.mode;
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final items = await ConsentApiService.fetchConsentRequests(mode: _mode);
      if (!mounted) return;
      setState(() {
        _items = items;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = cleanApiMessage(e);
      });
      await showApiErrorDialog(context, e, title: "Consent API Failed");
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _openDetail(ConsentRequest consent) async {
    final result = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(
        builder: (_) => ConsentDetailScreen(consent: consent, mode: _mode),
      ),
    );

    if (!mounted || result == null) return;

    final shouldRefresh = result['refresh'] == true;
    final shouldOpenProviderSelection = result['openProviderSelection'] == true;
    final consentArtefactId = result['consentArtefactId']?.toString() ?? '';

    if (shouldRefresh) {
      await _load();
    }

    if (!mounted) return;

    if (shouldOpenProviderSelection && consentArtefactId.isNotEmpty) {
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => HipSelectionScreen(
            consentArtefactId: consentArtefactId,
            requesterName: result['requester']?.toString(),
            purpose: result['purpose']?.toString(),
          ),
        ),
      );
    }
  }

  String _subtitle(ConsentRequest item) {
    final parts = <String>[
      item.purpose.trim(),
      if (item.expiry.trim().isNotEmpty) "Expiry: ${item.expiry.trim()}",
      "Status: ${item.status.trim().isEmpty ? 'UNKNOWN' : item.status.trim()}",
    ];
    return parts.join('\n');
  }

  @override
  Widget build(BuildContext context) {
    final desktop = MediaQuery.of(context).size.width >= 1080;

    return Scaffold(
      appBar: AppBar(title: const Text("Consent Requests")),
      body: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1120),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                child: DesktopPageIntro(
                  eyebrow: "Consent Review",
                  title:
                      "Review ABDM consent requests in a cleaner desktop queue.",
                  description:
                      "Switch modes, scan request status quickly, and move approved consents straight into provider selection without losing the larger list context.",
                  pills: const [
                    "Consent inbox",
                    "Mode switch",
                    "Review queue",
                    "Provider handoff",
                  ],
                  trailing: desktop ? _summaryPanel() : null,
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 10),
                child: DesktopSurface(
                  child: DropdownButtonFormField<ConsentMode>(
                    initialValue: _mode,
                    decoration: const InputDecoration(
                      labelText: "Consent API Mode",
                    ),
                    items: ConsentMode.values
                        .map(
                          (mode) => DropdownMenuItem<ConsentMode>(
                            value: mode,
                            child: Text(mode.label),
                          ),
                        )
                        .toList(),
                    onChanged: (mode) {
                      if (mode == null) return;
                      setState(() => _mode = mode);
                      _load();
                    },
                  ),
                ),
              ),
              Expanded(
                child: RefreshIndicator(onRefresh: _load, child: _buildBody()),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _summaryPanel() {
    final approvedCount = _items
        .where((item) => item.status.toUpperCase().contains('APPROV'))
        .length;
    final pendingCount = _items.length - approvedCount;

    return DesktopSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "Queue snapshot",
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              color: const Color(0xFF10263D),
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 10),
          Text("Mode: ${_mode.label}"),
          const SizedBox(height: 6),
          Text("Requests loaded: ${_items.length}"),
          const SizedBox(height: 6),
          Text("Pending or not approved: $pendingCount"),
          const SizedBox(height: 6),
          Text("Approved: $approvedCount"),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_loading && _items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null && _items.isEmpty) {
      return ListView(
        children: [
          Padding(
            padding: const EdgeInsets.all(20),
            child: DesktopSurface(
              child: Column(
                children: [
                  Text(_error!, textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: _load,
                    child: const Text("Retry Consent Fetch"),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }

    if (_items.isEmpty) {
      return ListView(
        children: const [
          Padding(
            padding: EdgeInsets.all(20),
            child: DesktopSurface(
              child: Text(
                "No consent requests found yet.",
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ],
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      itemCount: _items.length,
      separatorBuilder: (context, index) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final item = _items[index];
        final id = item.effectiveId;
        final status = item.status.trim().isEmpty ? 'UNKNOWN' : item.status.trim();

        return DesktopSurface(
          padding: EdgeInsets.zero,
          child: ListTile(
            title: Text(item.requester),
            subtitle: Text(_subtitle(item)),
            trailing: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  status,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: status.toUpperCase().contains('APPROV')
                        ? Colors.green.shade700
                        : const Color(0xFF1B5E8C),
                  ),
                ),
                const SizedBox(height: 4),
                const Icon(Icons.chevron_right),
              ],
            ),
            onTap: () => _openDetail(item),
            isThreeLine: true,
            leading: CircleAvatar(
              child: Text(
                id.isNotEmpty ? id.substring(0, 1).toUpperCase() : "?",
              ),
            ),
          ),
        );
      },
    );
  }
}
