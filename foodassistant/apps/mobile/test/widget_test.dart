import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/theme.dart';

void main() {
  test('FoodAssistant theme uses dark green surface', () {
    final theme = buildFaTheme();
    expect(theme.brightness, Brightness.dark);
    expect(theme.scaffoldBackgroundColor, FaColors.bg);
  });
}
