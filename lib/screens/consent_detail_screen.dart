import 'package:flutter/material.dart';

import '../models/consent_request.dart';
import '../services/consent_api_service.dart';
import '../utils/consent_mode.dart';
import '../widgets/api_feedback_dialogs.dart';
import '../widgets/desktop_workspace.dart';

class ConsentDetailScreen extends StatefulWidget {
  final ConsentRequest consent;
  final ConsentMode mode;

  const ConsentDetailScreen({
    super.key,
    required this.consent,
    this.mode = ConsentMode.currentDefault,
  });

  @override
  State<ConsentDetailScreen> createState() => _ConsentDetailScreenState();
}

class _ConsentDetailScreenState extends State<ConsentDetailScreen> {
  bool _submitting = false;
  String? _lastOutcome;

  Future<void> _submit(String decision) async {
    final id = widget.consent.effectiveId;
    if (id.isEmpty) {
      if (!mounted) return;
      await showApiErrorDialog(
        context,
        "Consent request ID is missing.",
        title: "Consent Decision Failed",
      );
      return;
    }

    setState(() => _submitting = true);

    try {
      final artefactId = await ConsentApiService.submitConsentDecision(
        id,
        decision,
        raw: widget.consent.raw,
        mode: widget.mode,
      );

      if (!mounted) return;

      if (decision == "APPROVED") {
        setState(() {
          _lastOutcome = "Approved. Consent artefact ID: $artefactId";
        });

        final nextAction = await showDialog<String>(
          context: context,
          builder: (_) => AlertDialog(
            title: const Text("Consent Approved"),
            content: SelectableText(
              "Consent artefact ID: $artefactId\n\nYou can go back to the consent queue or continue into provider selection to request records.",
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop('back'),
                child: const Text("Back to Queue"),
              ),
              ElevatedButton(
                onPressed: () => Navigator.of(context).pop('provider'),
                child: const Text("Select Provider"),
              ),
            ],
          ),
        );

        if (!mounted) return;

        Navigator.pop(context, {
          'refresh': true,
          'openProviderSelection': nextAction == 'provider',
          'consentArtefactId': artefactId,
          'requester': widget.consent.requester,
          'purpose': widget.consent.purpose,
        });
      } else {
        setState(() => _lastOutcome = "Denied");
        Navigator.pop(context, {'refresh': true});
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _lastOutcome = cleanApiMessage(e));
      await showApiErrorDialog(context, e, title: "Consent Decision Failed");
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          Expanded(child: Text(value.trim().isEmpty ? "-" : value.trim())),
        ],
      ),
    );
  }

  String _dataTypesText() {
    if (widget.consent.dataTypes.isEmpty) return "-";
    return widget.consent.dataTypes.join(", ");
  }

  @override
  Widget build(BuildContext context) {
    final id = widget.consent.effectiveId;
    final desktop = MediaQuery.of(context).size.width >= 1020;

    final detailsCard = DesktopSurface(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _infoRow("Consent ID", id),
            _infoRow("Requester", widget.consent.requester),
            _infoRow("Purpose", widget.consent.purpose),
            _infoRow("HI Types", _dataTypesText()),
            _infoRow("Expiry", widget.consent.expiry),
            _infoRow("Status", widget.consent.status),
            _infoRow("Mode", widget.mode.label),
          ],
        ),
      ),
    );

    final actionsCard = DesktopSurface(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              "Decision",
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              "Approve when the requester, purpose, and data scope look correct. Approval can continue directly into provider selection for record retrieval.",
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 48,
              child: ElevatedButton(
                onPressed: _submitting ? null : () => _submit("APPROVED"),
                child: Text(
                  _submitting ? "Submitting..." : "Approve Consent",
                ),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 48,
              child: OutlinedButton(
                onPressed: _submitting ? null : () => _submit("DENIED"),
                child: const Text("Deny Consent"),
              ),
            ),
            if (_lastOutcome != null) ...[
              const SizedBox(height: 14),
              SelectableText(_lastOutcome!),
            ],
          ],
        ),
      ),
    );

    return Scaffold(
      appBar: AppBar(title: const Text("Consent Details")),
      body: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 980),
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const DesktopPageIntro(
                eyebrow: "Consent Detail",
                title: "Review one request with the context needed to decide.",
                description:
                    "Requester, purpose, data scope, and status remain visible above the decision controls so desktop review feels deliberate instead of cramped.",
                pills: ["Decision", "Requester", "Data scope"],
              ),
              if (desktop)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(flex: 3, child: detailsCard),
                    const SizedBox(width: 16),
                    Expanded(flex: 2, child: actionsCard),
                  ],
                )
              else ...[
                detailsCard,
                const SizedBox(height: 12),
                actionsCard,
              ],
              const SizedBox(height: 12),
              ExpansionTile(
                title: const Text("Raw ABDM Payload"),
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                    child: SelectableText(widget.consent.raw.toString()),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
