import 'package:flutter/material.dart';
import 'package:mobile/theme.dart';

/// Brand emblem for Seatiko headers and splash screens.
class SeatikoLogo extends StatelessWidget {
  const SeatikoLogo({super.key, this.size = 42});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        color: Color(0xFF1B3B2B),
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(14),
          topRight: Radius.circular(14),
          bottomRight: Radius.circular(14),
          bottomLeft: Radius.circular(5),
        ),
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Icon(
            Icons.table_restaurant_rounded,
            color: FaColors.cream,
            size: size * 0.52,
          ),
          Positioned(
            top: size * 0.16,
            right: size * 0.2,
            child: Container(
              width: size * 0.17,
              height: size * 0.17,
              decoration: const BoxDecoration(
                color: FaColors.clay,
                shape: BoxShape.circle,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
