import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

class FaColors {
  // Aligned with seatiko/apps/web/src/app/premium.css (light theme tokens)
  static const bg = Color(0xFFF6F2EA);
  static const surface = Color(0xFFFFFAF2);
  static const surface2 = Color(0xFFEDE8DC);
  static const border = Color(0x1F1A2420);
  static const text = Color(0xFF1A2420);
  static const muted = Color(0xFF5C6B63);
  static const cream = Color(0xFFFFFDF8);
  static const gold = Color(0xFFE9B96E);
  static const goldSoft = Color(0xFFF2C784);
  static const clay = Color(0xFFC8683B);
  static const claySoft = Color(0xFFFAE8C8);
  static const ratingBg = Color(0xFFFAE8C8);
  static const ratingFg = Color(0xFF9B602E);
  static const green = Color(0xFF246046);
  static const greenDark = Color(0xFF153E2E);
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
      tertiary: FaColors.gold,
      surface: FaColors.surface,
      onSurface: FaColors.text,
      outline: FaColors.border,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: FaColors.bg,
      foregroundColor: FaColors.text,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: FaColors.text,
        fontSize: 19,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.4,
      ),
    ),
    cardTheme: CardThemeData(
      color: FaColors.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: FaColors.border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
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
        foregroundColor: Colors.white,
        minimumSize: const Size(0, 48),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
        textStyle: const TextStyle(
          fontSize: 14.5,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.2,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: FaColors.green,
        side: const BorderSide(color: FaColors.border),
        minimumSize: const Size(0, 48),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
        textStyle: const TextStyle(
          fontSize: 14.5,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.2,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: FaColors.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
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
    snackBarTheme: SnackBarThemeData(
      backgroundColor: FaColors.greenDark,
      contentTextStyle: const TextStyle(color: FaColors.cream),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    dividerColor: FaColors.border,
  );
}
