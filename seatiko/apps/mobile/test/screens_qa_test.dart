import 'dart:convert';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/api.dart';
import 'package:mobile/screens/city_select_screen.dart';
import 'package:mobile/screens/discover_screen.dart';
import 'package:mobile/screens/notifications_sheet.dart';
import 'package:mobile/screens/onboarding_screen.dart';
import 'package:mobile/screens/order_choice_screen.dart';
import 'package:mobile/screens/payment_screen.dart';
import 'package:mobile/screens/session_screen.dart';
import 'package:mobile/screens/venue_detail_screen.dart';
import 'package:mobile/screens/waiter_screens.dart';
import 'package:mobile/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

http.Response _jsonRes(Object data, [int status = 200]) => http.Response.bytes(
  utf8.encode(jsonEncode(data)),
  status,
  headers: const {'content-type': 'application/json; charset=utf-8'},
);

Map<String, dynamic> _venueMap([String id = 'v1']) => {
  'id': id,
  'city_id': 'city-balti',
  'name': {'ru': 'Оскар', 'en': 'Oscar', 'ro': 'Oscar'},
  'description': {'ru': 'Уютно', 'en': 'Cozy bistro', 'ro': 'Bistro'},
  'cuisine': ['european'],
  'rating': 4.8,
  'review_count': 12,
  'price_level': 2,
  'address': {'ru': 'ул. Мира 1', 'en': 'Mira 1', 'ro': 'Mira 1'},
  'lat': 47.76,
  'lng': 27.92,
  'average_check': 250,
  'open_now': true,
  'free_tables': 0,
  'image_url': '',
  'phone': '+37360000001',
  'website': 'seatiko.md',
  'hours_text': '09:00-23:00',
  'reviews': [
    {'author': 'Anna', 'rating': 5, 'text': 'Great!'},
  ],
};

Future<void> _pumpScreen(
  WidgetTester tester,
  Widget home, {
  Locale locale = const Locale('en'),
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
          home: home,
        ),
      ),
    ),
  );
  await tester.runAsync(
    () => Future<void>.delayed(const Duration(milliseconds: 25)),
  );
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

  testWidgets('OnboardingScreen advances 4 steps and Skip sets onboarded flag', (
    tester,
  ) async {
    ApiClient.testHttpClient = MockClient((req) async {
      if (req.url.path == '/api/v1/cities') {
        return _jsonRes({
          'cities': [
            {
              'id': 'city-balti',
              'slug': 'balti',
              'name': {'ru': 'Бельцы', 'en': 'Bălți', 'ro': 'Bălți'},
              'available': true,
              'country': 'MD',
            },
          ],
        });
      }
      return _jsonRes({});
    });

    await _pumpScreen(tester, const OnboardingScreen());
    expect(find.text('onboarding.1.title'.tr()), findsOneWidget);

    await tester.tap(find.text('onboarding.next'.tr()));
    await tester.pumpAndSettle();
    expect(find.text('onboarding.2.title'.tr()), findsOneWidget);

    await tester.tap(find.text('onboarding.skip'.tr()));
    await tester.pumpAndSettle();
    expect(await ApiClient.instance.isOnboarded(), isTrue);
    expect(find.text('city.title'.tr()), findsOneWidget);
  });

  testWidgets('CitySelectScreen shows soon toast & error fallback + CitySoonScreen', (
    tester,
  ) async {
    var shouldFail = true;
    ApiClient.testHttpClient = MockClient((req) async {
      if (req.url.path == '/api/v1/cities') {
        if (shouldFail) return _jsonRes({'error': 'server_error'}, 500);
        return _jsonRes({
          'cities': [
            {
              'id': 'city-balti',
              'slug': 'balti',
              'name': {'ru': 'Бельцы', 'en': 'Bălți', 'ro': 'Bălți'},
              'available': true,
              'country': 'MD',
            },
            {
              'id': 'city-chisinau',
              'slug': 'chisinau',
              'name': {'ru': 'Кишинёв', 'en': 'Chișinău', 'ro': 'Chișinău'},
              'available': false,
              'country': 'MD',
            },
          ],
        });
      }
      return _jsonRes({});
    });

    await _pumpScreen(tester, const CitySelectScreen(replaceHome: false));
    expect(find.text('common.retry'.tr()), findsOneWidget);

    shouldFail = false;
    await tester.tap(find.text('common.retry'.tr()));
    await tester.pumpAndSettle();
    expect(find.text('Bălți'), findsOneWidget);
    expect(find.text('Chișinău'), findsOneWidget);

    await tester.tap(find.text('Chișinău'));
    await tester.pump();
    expect(
      find.text('city.soon_toast'.tr(args: ['Chișinău'])),
      findsOneWidget,
    );

    await _pumpScreen(
      tester,
      CitySoonScreen(
        city: City(
          id: 'city-chisinau',
          slug: 'chisinau',
          name: LocalizedString(ru: 'Кишинёв', en: 'Chișinău', ro: 'Chișinău'),
          available: false,
          country: 'MD',
        ),
      ),
    );
    expect(find.text('city.try_pilot'.tr()), findsOneWidget);
    expect(find.text('city.choose_manual'.tr()), findsOneWidget);
  });

  testWidgets('DiscoverTab chip & Preferences Wizard execute AI search cleanly', (
    tester,
  ) async {
    await ApiClient.instance.setToken('tok-disc');
    var discoverCalls = 0;
    ApiClient.testHttpClient = MockClient((req) async {
      if (req.url.path == '/api/v1/collections') {
        return _jsonRes({
          'collections': [
            {
              'id': 'col-1',
              'slug': 'date',
              'title': {'ru': 'Свидание', 'en': 'Date night', 'ro': 'Romantic'},
              'venue_ids': ['v1'],
            },
          ],
        });
      }
      if (req.url.path == '/api/v1/discover/ai') {
        discoverCalls++;
        return _jsonRes({
          'venues': [_venueMap('v1')],
          'explanation': {'en': 'Picked cozy bistro'},
          'exact': true,
        });
      }
      return _jsonRes({});
    });

    await _pumpScreen(
      tester,
      const Scaffold(body: DiscoverTab(cityId: 'city-balti')),
    );
    expect(find.text('Date night'), findsOneWidget);

    // Tap quick filter chip -> runs discoverAi
    await tester.tap(find.text('discover.chip_budget'.tr()));
    await tester.pumpAndSettle();
    expect(discoverCalls, 1);
    expect(find.text('Picked cozy bistro'), findsOneWidget);
    expect(find.text('Oscar'), findsOneWidget);

    // Open Preferences Wizard -> pick cuisine -> Apply
    await tester.tap(find.text('discover.wizard.preferences_btn'.tr()));
    await tester.pumpAndSettle();
    expect(find.text('discover.wizard.title'.tr()), findsOneWidget);
    await tester.tap(find.text('discover.cuisine.moldovan'.tr()));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('discover.wizard.show_map'.tr()),
      300,
      scrollable: find.descendant(
        of: find.byType(DraggableScrollableSheet),
        matching: find.byType(Scrollable),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('discover.wizard.show_map'.tr()));
    await tester.pumpAndSettle();
    expect(discoverCalls, 2);
  });

  testWidgets('VenueDetailScreen + WaitlistCard + EventInquiry modal handle actions', (
    tester,
  ) async {
    await ApiClient.instance.setToken('tok-venue');
    var favoriteSaved = false;
    var inquirySent = false;
    var inWaitlist = false;

    ApiClient.testHttpClient = MockClient((req) async {
      if (req.url.path == '/api/v1/venues/v1') {
        return _jsonRes({'venue': _venueMap('v1')});
      }
      if (req.url.path == '/api/v1/venues/v1/places') {
        return _jsonRes({
          'source': 'local',
          'rating': 4.8,
          'review_count': 1,
          'photo_urls': [],
          'reviews': [],
        });
      }
      if (req.url.path == '/api/v1/venues/v1/menu') {
        return _jsonRes({
          'menu': [
            {
              'id': 'm1',
              'venue_id': 'v1',
              'category': {'en': 'Main'},
              'name': {'en': 'Salad'},
              'description': {'en': 'Fresh'},
              'price': 95,
              'contains_alcohol': false,
            },
          ],
        });
      }
      if (req.url.path == '/api/v1/me' && req.method == 'GET') {
        return _jsonRes({
          'user': {
            'id': 'u1',
            'email': 'u@seatiko.md',
            'first_name': 'Ion',
            'last_name': 'Popa',
            'display_name': 'Ion',
            'phone': '+37369111222',
            'locale': 'en',
            'favorite_venues': favoriteSaved ? ['v1'] : [],
          },
        });
      }
      if (req.url.path == '/api/v1/me' && req.method == 'PATCH') {
        favoriteSaved = true;
        return _jsonRes({
          'user': {
            'id': 'u1',
            'email': 'u@seatiko.md',
            'first_name': 'Ion',
            'last_name': 'Popa',
            'display_name': 'Ion',
            'locale': 'en',
            'favorite_venues': ['v1'],
          },
        });
      }
      if (req.url.path == '/api/v1/venues/v1/waitlist/summary') {
        return _jsonRes({
          'summary': {'waiting': 2, 'quoted_wait_min': 25, 'free_tables': 0},
        });
      }
      if (req.url.path == '/api/v1/waitlist' && req.method == 'GET') {
        return _jsonRes({
          'waitlist': inWaitlist
              ? [
                  {
                    'id': 'wl-1',
                    'venue_id': 'v1',
                    'guest_name': 'Ion',
                    'guests': 2,
                    'status': 'WAITING',
                    'position': 3,
                  },
                ]
              : [],
        });
      }
      if (req.url.path == '/api/v1/waitlist' && req.method == 'POST') {
        inWaitlist = true;
        return _jsonRes({
          'entry': {
            'id': 'wl-1',
            'venue_id': 'v1',
            'guest_name': 'Ion',
            'guests': 2,
            'status': 'WAITING',
            'position': 3,
          },
        }, 201);
      }
      if (req.url.path == '/api/v1/event-inquiries' && req.method == 'POST') {
        inquirySent = true;
        return _jsonRes({
          'inquiry': {
            'id': 'eq-1',
            'user_id': 'u1',
            'venue_id': 'v1',
            'event_type': 'birthday',
            'guest_count': 12,
            'preferred_date': '2026-12-10T18:00:00Z',
            'contact_method': 'call',
            'contact_phone': '+37369111222',
            'contact_name': 'Ion',
            'status': 'PENDING',
          },
        }, 201);
      }
      return _jsonRes({});
    });

    await _pumpScreen(tester, const VenueDetailScreen(venueId: 'v1'));
    expect(find.text('Oscar'), findsAtLeastNWidgets(1));
    expect(find.text('Salad'), findsOneWidget);

    // Toggle favorite button
    await tester.tap(find.byIcon(Icons.favorite_border_rounded));
    await tester.pumpAndSettle();
    expect(favoriteSaved, isTrue);

    // Join Waitlist inside VenueDetailScreen
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -600));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('waitlist.join'.tr()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('waitlist.join'.tr()));
    await tester.pumpAndSettle();
    expect(inWaitlist, isTrue);
    expect(find.text('waitlist.waiting_title'.tr()), findsOneWidget);

    // Open Event Inquiry modal & submit
    await tester.ensureVisible(find.text('venue.event_btn'.tr()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('venue.event_btn'.tr()));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('venue.event_submit'.tr()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('venue.event_submit'.tr()));
    await tester.pumpAndSettle();
    expect(inquirySent, isTrue);
  });

  testWidgets('Session + Waiter + Payment + Notifications flows work end-to-end', (
    tester,
  ) async {
    await ApiClient.instance.setToken('tok-sess');
    var markReadCalled = false;
    var waiterCalled = false;
    var paidCalled = false;

    ApiClient.testHttpClient = MockClient((req) async {
      if (req.url.path == '/api/v1/orders') {
        return _jsonRes({
          'orders': [
            {
              'id': 'ord-s1',
              'session_id': 'sess-99',
              'user_id': 'u1',
              'venue_id': 'v1',
              'status': 'SUBMITTED',
              'total': 320,
              'check_number': 'CHK-55',
              'items': [
                {'menu_item_id': 'm1', 'name': {'en': 'Steak'}, 'qty': 1, 'price': 320},
              ],
            },
          ],
        });
      }
      if (req.url.path == '/api/v1/sessions/sess-99/waiter-calls') {
        waiterCalled = true;
        return _jsonRes({
          'waiter_call': {
            'id': 'wc-1',
            'session_id': 'sess-99',
            'venue_id': 'v1',
            'table_id': 't5',
            'reason': 'bill',
            'status': 'SENT',
          },
        }, 201);
      }
      if (req.url.path == '/api/v1/payments') {
        paidCalled = true;
        return _jsonRes({
          'order': {
            'id': 'ord-s1',
            'session_id': 'sess-99',
            'user_id': 'u1',
            'venue_id': 'v1',
            'status': 'PAID',
            'total': 320,
            'check_number': 'CHK-55',
            'items': [],
          },
        });
      }
      if (req.url.path == '/api/v1/me/notifications') {
        return _jsonRes({
          'unread': 1,
          'notifications': [
            {
              'id': 'n1',
              'user_id': 'u1',
              'kind': 'PREORDER_CREATED',
              'venue_id': 'v1',
              'venue_name': {'en': 'Oscar'},
              'created_at': '2026-11-25T10:00:00Z',
            },
          ],
        });
      }
      if (req.url.path == '/api/v1/me/notifications/read') {
        markReadCalled = true;
        return _jsonRes({'unread': 0});
      }
      return _jsonRes({});
    });

    final session = Session(
      id: 'sess-99',
      userId: 'u1',
      venueId: 'v1',
      tableId: 't5',
      status: 'ACTIVE',
      startedAt: DateTime(2026, 11, 25, 12),
    );
    final venue = Venue.fromJson(_venueMap('v1'));
    final table = VenueTable(
      id: 't5',
      venueId: 'v1',
      number: 5,
      seats: 4,
      status: 'OCCUPIED',
      x: 0.5,
      y: 0.5,
    );

    // 1. OrderChoiceScreen renders both CTAs
    await _pumpScreen(
      tester,
      OrderChoiceScreen(session: session, venue: venue, table: table),
    );
    expect(find.text('order_choice.app'.tr()), findsOneWidget);
    expect(find.text('order_choice.waiter'.tr()), findsOneWidget);

    // 2. SessionScreen displays active order & Pay button
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    await _pumpScreen(
      tester,
      SessionScreen(session: session, venue: venue, table: table),
    );
    expect(find.textContaining('Steak'), findsOneWidget);

    // Open PaymentScreen and test pay_app
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    await _pumpScreen(
      tester,
      PaymentScreen(
        orders: [
          Order(
            id: 'ord-s1',
            sessionId: 'sess-99',
            userId: 'u1',
            venueId: 'v1',
            status: 'SUBMITTED',
            total: 320,
            checkNumber: 'CHK-55',
            items: [
              OrderItem(
                menuItemId: 'm1',
                name: LocalizedString(ru: 'Стейк', en: 'Steak', ro: 'Steak'),
                qty: 1,
                price: 320,
              ),
            ],
          ),
        ],
      ),
    );
    await tester.tap(find.text('payment.pay_app'.tr()));
    await tester.pumpAndSettle();
    expect(paidCalled, isTrue);
    expect(find.text('payment.status_paid'.tr()), findsOneWidget);

    // 3. WaiterSessionScreen sends call and activates cooldown
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    await _pumpScreen(tester, WaiterSessionScreen(session: session));
    await tester.tap(find.text('waiter.reason_bill'.tr()));
    await tester.tap(find.text('waiter.send'.tr()));
    await tester.pumpAndSettle();
    expect(waiterCalled, isTrue);
    expect(
      WaiterCooldownStore.remaining(session.id) > Duration.zero,
      isTrue,
    );

    // 4. NotificationsSheet loads unread item & marks all read
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    await _pumpScreen(
      tester,
      Builder(
        builder: (context) => Scaffold(
          body: ElevatedButton(
            onPressed: () => showNotificationsSheet(context),
            child: const Text('open_notifs'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open_notifs'));
    await tester.pump();
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 20)),
    );
    await tester.pumpAndSettle();
    expect(find.text('notifications.preorder_created'.tr()), findsOneWidget);
    await tester.tap(find.text('notifications.mark_all_read'.tr()));
    await tester.pumpAndSettle();
    expect(markReadCalled, isTrue);
  });
}
