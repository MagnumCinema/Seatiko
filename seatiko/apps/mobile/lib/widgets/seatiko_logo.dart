import 'package:flutter/material.dart';
import 'package:mobile/theme.dart';

/// Brand emblem matching `.site-brand-mark` in seatiko/apps/web (`#E9B96E` + `#18392D` "S").
class SeatikoLogo extends StatelessWidget {
  const SeatikoLogo({super.key, this.size = 42});

  final double size;

  @override
  Widget build(BuildContext context) {
    final radius = size * 0.30;
    final smallRadius = size * 0.11;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: FaColors.gold,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(radius),
          topRight: Radius.circular(radius),
          bottomRight: Radius.circular(radius),
          bottomLeft: Radius.circular(smallRadius),
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x38E9B96E),
            blurRadius: 16,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Center(
        child: Text(
          'S',
          style: TextStyle(
            fontFamily: 'Georgia',
            fontFamilyFallback: const ['serif'],
            color: const Color(0xFF18392D),
            fontSize: size * 0.56,
            fontWeight: FontWeight.w800,
            height: 1.0,
          ),
        ),
      ),
    );
  }
}
