import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/theme.dart';

void main() {
  test('Seatiko theme uses warm light hospitality palette', () {
    final theme = buildFaTheme();
    expect(theme.brightness, Brightness.light);
    expect(theme.scaffoldBackgroundColor, FaColors.bg);
    expect(theme.colorScheme.primary, FaColors.green);
  });
}
