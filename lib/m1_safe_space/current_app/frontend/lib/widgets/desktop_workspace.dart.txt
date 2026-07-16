import 'package:flutter/material.dart';

class DesktopPageIntro extends StatelessWidget {
  const DesktopPageIntro({
    super.key,
    required this.eyebrow,
    required this.title,
    required this.description,
    this.trailing,
    this.pills = const [],
  });

  final String eyebrow;
  final String title;
  final String description;
  final Widget? trailing;
  final List<String> pills;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.all(26),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: const LinearGradient(
          colors: [Color(0xFFF7FBFF), Color(0xFFFFFCF7)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: const Color(0xFFD8E4F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final desktop = constraints.maxWidth >= 920;
          final content = Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                eyebrow.toUpperCase(),
                style: theme.textTheme.labelLarge?.copyWith(
                  letterSpacing: 1.2,
                  color: const Color(0xFF1B5E8C),
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                title,
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: const Color(0xFF10263D),
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 10),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 760),
                child: Text(
                  description,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: const Color(0xFF4A5B70),
                    height: 1.45,
                  ),
                ),
              ),
              if (pills.isNotEmpty) ...[
                const SizedBox(height: 18),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: pills
                      .map(
                        (pill) => _InfoPill(label: pill),
                      )
                      .toList(),
                ),
              ],
            ],
          );

          if (!desktop || trailing == null) {
            return content;
          }

          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(flex: 3, child: content),
              const SizedBox(width: 24),
              Expanded(flex: 2, child: trailing!),
            ],
          );
        },
      ),
    );
  }
}

class DesktopSurface extends StatelessWidget {
  const DesktopSurface({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(20),
    this.margin,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      padding: padding,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFE0E7EF)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.035),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: child,
    );
  }
}

class _InfoPill extends StatelessWidget {
  const _InfoPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFE9F3FB),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0xFFD0E1F0)),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Color(0xFF1A4E73),
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}
