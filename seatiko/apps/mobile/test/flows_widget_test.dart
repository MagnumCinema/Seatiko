import 'dart:convert';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/api.dart';
import 'package:mobile/screens/floor_map_screen.dart';
import 'package:mobile/screens/menu_screen.dart';
import 'package:mobile/screens/orders_screen.dart';
import 'package:mobile/screens/profile_screen.dart';
import 'package:mobile/screens/reservation_screen.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/auth_sheet.dart';
import 'package:shared_preferences/shared_preferences.dart';

http.Response _jsonResponse(Object data, [int status = 200]) =>
    http.Response.bytes(
      utf8.encode(jsonEncode(data)),
      status,
      headers: const {'content-type': 'application/json; charset=utf-8'},
    );

Venue _sampleVenue() => Venue(
  id: 'v1',
  cityId: 'city-balti',
  name: LocalizedString(ru: 'Оскар', en: 'Oscar', ro: 'Oscar'),
  description: LocalizedString(
    ru: 'Описание',
    en: 'Description',
    ro: 'Descriere',
  ),
  cuisine: const ['european'],
  rating: 4.8,
  priceLevel: 2,
  address: LocalizedString(ru: 'ул. Мира 1', en: 'Mira 1', ro: 'Mira 1'),
  lat: 47.76,
  lng: 27.92,
  averageCheck: 250,
  openNow: true,
  freeTables: 3,
  imageUrl: '',
);

Map<String, dynamic> _venueJson() => {
  'id': 'v1',
  'city_id': 'city-balti',
  'name': {'ru': 'Оскар', 'en': 'Oscar', 'ro': 'Oscar'},
  'description': {'ru': 'Описание', 'en': 'Desc', 'ro': 'Desc'},
  'cuisine': ['european'],
  'rating': 4.8,
  'price_level': 2,
  'address': {'ru': 'ул. Мира 1', 'en': 'Mira 1', 'ro': 'Mira 1'},
  'lat': 47.76,
  'lng': 27.92,
  'average_check': 250,
  'open_now': true,
  'free_tables': 3,
  'image_url': '',
};

Future<void> _pumpLocalized(
  WidgetTester tester,
  Widget home, {
  Locale locale = const Locale('en'),
  EdgeInsets viewInsets = EdgeInsets.zero,
}) async {
  await tester.pumpWidget(
    EasyLocalization(
      key: UniqueKey(),
      supportedLocales: const [Locale('ru'), Locale('en'), Locale('ro')],
      path: 'assets/translations',
      fallbackLocale: const Locale('en'),
      startLocale: locale,
      saveLocale: false,
      assetLoader: const RootBundleAssetLoader(),
      child: Builder(
        builder: (context) => MaterialApp(
          theme: buildFaTheme(),
          locale: context.locale,
          supportedLocales: context.supportedLocales,
          localizationsDelegates: context.localizationDelegates,
          builder: (ctx, child) {
            final mq = MediaQuery.of(ctx);
            return MediaQuery(
              data: mq.copyWith(viewInsets: viewInsets),
              child: child ?? const SizedBox.shrink(),
            );
          },
          home: home,
        ),
      ),
    ),
  );
  // Allow EasyLocalization async bundle load + async API futures to flush.
  await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const secureChannel = MethodChannel(
    'plugins.it_nomads.com/flutter_secure_storage',
  );
  final secureStore = <String, String>{};

  setUpAll(() async {
    EasyLocalization.logger.enableLevels = [];
    SharedPreferences.setMockInitialValues({});
    await EasyLocalization.ensureInitialized();
  });

  setUp(() async {
    rootBundle.clear();
    secureStore.clear();
    SharedPreferences.setMockInitialValues({});
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(secureChannel, (call) async {
          final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
          final key = args['key'] as String?;
          switch (call.method) {
            case 'read':
              return key != null ? secureStore[key] : null;
            case 'write':
              if (key != null && args['value'] is String) {
                secureStore[key] = args['value'] as String;
              }
              return null;
            case 'delete':
              if (key != null) secureStore.remove(key);
              return null;
            case 'deleteAll':
              secureStore.clear();
              return null;
            case 'containsKey':
              return key != null && secureStore.containsKey(key);
            default:
              return null;
          }
        });
    await ApiClient.instance.logout();
  });

  tearDown(() async {
    ApiClient.testHttpClient = null;
    await ApiClient.instance.logout();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(secureChannel, null);
  });

  testWidgets(
    'AuthSheet handles small screen + keyboard without overflow and validates form',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(320, 480));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      ApiClient.testHttpClient = MockClient((req) async {
        if (req.url.path == '/api/v1/auth/providers') {
          return _jsonResponse({'google': {'enabled': false, 'client_id': ''}});
        }
        return _jsonResponse({});
      });

      await _pumpLocalized(
        tester,
        Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showAuthSheet(context),
                child: const Text('open'),
              ),
            ),
          ),
        ),
        viewInsets: const EdgeInsets.only(bottom: 220),
      );

      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      // Switch to register mode on compact 320x480 + 220px keyboard.
      await tester.tap(find.text('auth.switch_register'.tr()));
      await tester.pumpAndSettle();

      // Submit invalid email shows localized validation without overflow.
      await tester.enterText(find.byType(TextField).first, 'invalid');
      await tester.tap(find.byType(FilledButton).first);
      await tester.pumpAndSettle();

      expect(find.text('error.invalid_email'.tr()), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'MenuScreen preorder cart updates quantities and blocks unverified 18+ items',
    (tester) async {
      await ApiClient.instance.setToken('tok-1');
      ApiClient.testHttpClient = MockClient((req) async {
        if (req.url.path == '/api/v1/me/venues/v1/preorder-menu') {
          return _jsonResponse({
            'menu': [
              {
                'id': 'm-pasta',
                'venue_id': 'v1',
                'category': {'en': 'Main'},
                'name': {'en': 'Pasta Carbonara'},
                'description': {'en': 'Classic pasta'},
                'price': 140,
                'contains_alcohol': false,
                'orderable': true,
              },
              {
                'id': 'm-wine',
                'venue_id': 'v1',
                'category': {'en': 'Drinks'},
                'name': {'en': 'House Merlot'},
                'description': {'en': 'Red wine'},
                'price': 220,
                'contains_alcohol': true,
                'requires_age_18': true,
                'orderable': false,
                'blocked_reason': 'age_verification_required',
              },
            ],
          });
        }
        return _jsonResponse({}, 404);
      });

      await _pumpLocalized(
        tester,
        MenuScreen(
          venueId: 'v1',
          venueName: 'Oscar',
          reservationId: 'res-1',
          preorderMode: true,
          venue: _sampleVenue(),
        ),
      );

      expect(find.text('Pasta Carbonara'), findsOneWidget);
      expect(find.text('House Merlot'), findsOneWidget);

      // Tap 'Add' on Pasta Carbonara -> qty becomes 1 and + / - icons appear
      await tester.tap(find.text('menu.add'.tr()).first);
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.add_circle_outline), findsAtLeastNWidgets(1));
      expect(find.textContaining('140 MDL'), findsAtLeastNWidgets(2));

      // Decrement to remove from cart
      await tester.tap(find.byIcon(Icons.remove_circle_outline).first);
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.remove_circle_outline), findsNothing);

      // Blocked 18+ drink displays age restriction label and disables Add button
      expect(
        find.text('18+ · ${'age18.preorder_blocked'.tr()}'),
        findsOneWidget,
      );
      final addButtons = tester
          .widgetList<TextButton>(find.widgetWithText(TextButton, 'menu.add'.tr()))
          .toList();
      expect(addButtons.any((b) => b.onPressed == null), isTrue);
    },
  );

  testWidgets(
    'ReservationScreen loads slots/tables and FloorMapScreen opens table sheet',
    (tester) async {
      await ApiClient.instance.setToken('tok-1');
      final futureSlot = DateTime.now().add(const Duration(days: 1));
      final futureReserved = DateTime(
        futureSlot.year,
        futureSlot.month,
        futureSlot.day,
        19,
        0,
      ).toUtc().toIso8601String();

      ApiClient.testHttpClient = MockClient((req) async {
        if (req.url.path == '/api/v1/venues/v1/tables') {
          return _jsonResponse({
            'tables': [
              {
                'id': 't-free',
                'venue_id': 'v1',
                'number': 1,
                'seats': 4,
                'status': 'FREE',
                'x': 0.25,
                'y': 0.35,
                'zone': 'hall',
              },
              {
                'id': 't-occ',
                'venue_id': 'v1',
                'number': 2,
                'seats': 2,
                'status': 'OCCUPIED',
                'occupied_since': '2026-11-25T10:00:00Z',
                'x': 0.70,
                'y': 0.35,
                'zone': 'hall',
              },
              {
                'id': 't-res',
                'venue_id': 'v1',
                'number': 3,
                'seats': 6,
                'status': 'RESERVED',
                'reserved_for': futureReserved,
                'x': 0.50,
                'y': 0.70,
                'zone': 'terrace',
              },
            ],
          });
        }
        if (req.url.path == '/api/v1/venues/v1/schedule') {
          return _jsonResponse({'slots': []});
        }
        if (req.url.path == '/api/v1/venues/v1') {
          return _jsonResponse({'venue': _venueJson()});
        }
        if (req.url.path == '/api/v1/reservations') {
          return _jsonResponse({'reservations': []});
        }
        return _jsonResponse({});
      });

      await _pumpLocalized(tester, ReservationScreen(venue: _sampleVenue()));

      expect(find.text('Oscar'), findsOneWidget);
      expect(tester.takeException(), isNull);

      // Mount FloorMapScreen and tap semantic hit target for Table #1
      await _pumpLocalized(
        tester,
        const FloorMapScreen(venueId: 'v1', venueName: 'Oscar'),
      );

      final tableLabel = 'floor.table_semantics'.tr(args: ['1', '4']);
      await tester.tap(find.bySemanticsLabel(tableLabel).first);
      await tester.pumpAndSettle();
      expect(find.text('table.status_free'.tr()), findsAtLeastNWidgets(1));
      expect(find.text('table.book_this'.tr()), findsOneWidget);

      await tester.tap(find.text('common.close'.tr()));
      await tester.pumpAndSettle();
    },
  );

  for (final locale in const [Locale('ru'), Locale('en'), Locale('ro')]) {
    testWidgets(
      'OrdersTab and ProfileTab render without overflow in ${locale.languageCode}',
      (tester) async {
        await tester.binding.setSurfaceSize(const Size(360, 640));
        addTearDown(() => tester.binding.setSurfaceSize(null));

        await ApiClient.instance.setToken('tok-locale');
        ApiClient.testHttpClient = MockClient((req) async {
          switch (req.url.path) {
            case '/api/v1/me':
              return _jsonResponse({
                'user': {
                  'id': 'u1',
                  'email': 'ion@seatiko.md',
                  'first_name': 'Ion',
                  'last_name': 'Popa',
                  'display_name': 'Ion Popa',
                  'locale': locale.languageCode,
                  'diet_preferences': ['vegetarian'],
                  'favorite_venues': ['v1'],
                  'has_password': true,
                },
              });
            case '/api/v1/orders':
              return _jsonResponse({
                'orders': [
                  {
                    'id': 'ord-1',
                    'session_id': 's-1',
                    'user_id': 'u1',
                    'venue_id': 'v1',
                    'status': 'SUBMITTED',
                    'total': 180,
                    'check_number': 'CHK-101',
                    'venue_name': {'ru': 'Оскар', 'en': 'Oscar', 'ro': 'Oscar'},
                    'items': [],
                  },
                ],
              });
            case '/api/v1/reservations':
              return _jsonResponse({
                'reservations': [
                  {
                    'id': 'res-1',
                    'user_id': 'u1',
                    'venue_id': 'v1',
                    'table_id': 't1',
                    'table_number': 4,
                    'guests': 2,
                    'reserved_for': '2026-12-01T19:00:00Z',
                    'status': 'CONFIRMED',
                    'venue_name': {'ru': 'Оскар', 'en': 'Oscar', 'ro': 'Oscar'},
                  },
                ],
              });
            case '/api/v1/waitlist':
              return _jsonResponse({'waitlist': []});
            case '/api/v1/event-inquiries':
              return _jsonResponse({'inquiries': []});
            case '/api/v1/venues/v1':
              return _jsonResponse({'venue': _venueJson()});
            default:
              return _jsonResponse({});
          }
        });

        await _pumpLocalized(
          tester,
          const Scaffold(body: OrdersTab()),
          locale: locale,
        );
        expect(find.textContaining('CHK-101'), findsOneWidget);
        expect(tester.takeException(), isNull);

        await _pumpLocalized(
          tester,
          const Scaffold(body: ProfileTab()),
          locale: locale,
        );
        expect(find.text('Ion Popa'), findsAtLeastNWidgets(1));
        expect(tester.takeException(), isNull);
      },
    );
  }
}
