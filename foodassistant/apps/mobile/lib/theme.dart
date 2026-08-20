import 'package:flutter/material.dart';

class FaColors {
  static const bg = Color(0xFF0F1410);
  static const surface = Color(0xFF161C16);
  static const surface2 = Color(0xFF1C241C);
  static const border = Color(0x1AFFFFFF);
  static const text = Color(0xFFF3EFE6);
  static const muted = Color(0xFF9AA690);
  static const gold = Color(0xFFC4A574);
  static const goldSoft = Color(0xFFD4B888);
  static const green = Color(0xFF3D8B5A);
  static const free = Color(0xFF34D399);
  static const occupied = Color(0xFFF87171);
  static const reserved = Color(0xFFFBBF24);
  static const yours = Color(0xFF60A5FA);
}

ThemeData buildFaTheme() {
  final base = ColorScheme.fromSeed(
    seedColor: FaColors.gold,
    brightness: Brightness.dark,
    surface: FaColors.surface,
  );
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: FaColors.bg,
    colorScheme: base.copyWith(
      primary: FaColors.gold,
      secondary: FaColors.green,
      surface: FaColors.surface,
      onSurface: FaColors.text,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: FaColors.surface,
      foregroundColor: FaColors.text,
      elevation: 0,
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      color: FaColors.surface2,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: FaColors.border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: FaColors.surface2,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: FaColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: FaColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: FaColors.gold),
      ),
      hintStyle: const TextStyle(color: FaColors.muted),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: FaColors.gold,
        foregroundColor: FaColors.bg,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: FaColors.text,
        side: const BorderSide(color: FaColors.border),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: FaColors.surface,
      indicatorColor: FaColors.gold.withValues(alpha: 0.2),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontSize: 12,
          color: selected ? FaColors.gold : FaColors.muted,
        );
      }),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return IconThemeData(
          color: selected ? FaColors.gold : FaColors.muted,
        );
      }),
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: FaColors.surface2,
      contentTextStyle: TextStyle(color: FaColors.text),
    ),
    dividerColor: FaColors.border,
  );
}
