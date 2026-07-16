import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class OtpDigitRow extends StatelessWidget {
  const OtpDigitRow({
    super.key,
    required this.controllers,
    required this.focusNodes,
    required this.onChanged,
    this.enabled = true,
  }) : assert(controllers.length == 6),
       assert(focusNodes.length == 6);

  final List<TextEditingController> controllers;
  final List<FocusNode> focusNodes;
  final VoidCallback onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const spacing = 10.0;
        const minBoxWidth = 48.0;
        const maxBoxWidth = 58.0;
        const boxHeight = 64.0;

        final availableWidth =
            constraints.maxWidth.isFinite
                ? constraints.maxWidth
                : (maxBoxWidth * 6) + (spacing * 5);
        final boxWidth = ((availableWidth - (spacing * 5)) / 6).clamp(
          minBoxWidth,
          maxBoxWidth,
        );

        return Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: List.generate(6, (index) {
            return SizedBox(
              width: boxWidth,
              height: boxHeight,
              child: TextField(
                enabled: enabled,
                controller: controllers[index],
                focusNode: focusNodes[index],
                textAlign: TextAlign.center,
                textAlignVertical: TextAlignVertical.center,
                keyboardType: TextInputType.number,
                maxLength: 1,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  height: 1.0,
                ),
                strutStyle: const StrutStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  height: 1.0,
                  forceStrutHeight: true,
                ),
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(1),
                ],
                decoration: InputDecoration(
                  counterText: '',
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(vertical: 14),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                onChanged: (value) {
                  if (value.isNotEmpty) {
                    if (index < 5) {
                      focusNodes[index + 1].requestFocus();
                    } else {
                      FocusScope.of(context).unfocus();
                    }
                  } else if (index > 0) {
                    focusNodes[index - 1].requestFocus();
                  }
                  onChanged();
                },
              ),
            );
          }),
        );
      },
    );
  }
}
