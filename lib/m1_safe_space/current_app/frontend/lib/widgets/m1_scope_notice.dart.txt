import 'package:flutter/material.dart';

class M1ScopeNotice extends StatelessWidget {
  const M1ScopeNotice({
    super.key,
    this.title = "Available In Later Milestones",
    this.message =
        "This section belongs to ABDM consent and data-sharing flows, which are outside the strict M1 scope. For M1, please continue with ABHA creation, login, profile/card, and patient verification flows only.",
  });

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 640),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(message, style: Theme.of(context).textTheme.bodyLarge),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
