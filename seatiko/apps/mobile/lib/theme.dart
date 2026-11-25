import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

class FaColors {
  static const bg = Color(0xFFF4F1E9);
  static const surface = Color(0xFFFFFCF7);
  static const surface2 = Color(0xFFECE9DF);
  static const border = Color(0x14213F34);
  static const text = Color(0xFF18382D);
  static const muted = Color(0xFF748078);
  static const cream = Color(0xFFFFF7E9);
  static const gold = Color(0xFFD77B48);
  static const goldSoft = Color(0xFFE9B671);
  static const clay = Color(0xFFD77B48);
  static const claySoft = Color(0xFFF6E2D4);
  static const green = Color(0xFF1F6848);
  static const free = Color(0xFF2F9A62);
  static const occupied = Color(0xFFC95D52);
  static const reserved = Color(0xFFD09A35);
  static const yours = Color(0xFF3E78BD);
}

ThemeData buildFaTheme() {
  final base = ColorScheme.fromSeed(
    seedColor: FaColors.green,
    brightness: Brightness.light,
    surface: FaColors.surface,
  );
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    scaffoldBackgroundColor: FaColors.bg,
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
        TargetPlatform.android: ZoomPageTransitionsBuilder(),
      },
    ),
    colorScheme: base.copyWith(
      primary: FaColors.green,
      secondary: FaColors.clay,
      surface: FaColors.surface,
      onSurface: FaColors.text,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: FaColors.bg,
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
      fillColor: FaColors.surface,
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
        borderSide: const BorderSide(color: FaColors.green, width: 1.5),
      ),
      hintStyle: const TextStyle(color: FaColors.muted),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: FaColors.green,
        foregroundColor: FaColors.cream,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: FaColors.green,
        side: const BorderSide(color: FaColors.border),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: FaColors.surface,
      indicatorColor: FaColors.green.withValues(alpha: 0.12),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontSize: 12,
          color: selected ? FaColors.green : FaColors.muted,
        );
      }),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return IconThemeData(color: selected ? FaColors.green : FaColors.muted);
      }),
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: FaColors.green,
      contentTextStyle: TextStyle(color: FaColors.cream),
    ),
    dividerColor: FaColors.border,
  );
}
