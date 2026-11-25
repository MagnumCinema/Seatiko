import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/api.dart';
import 'package:mobile/errors.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const secureChannel = MethodChannel(
    'plugins.it_nomads.com/flutter_secure_storage',
  );
  final secureStore = <String, String>{};

  setUp(() async {
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
            case 'readAll':
              return Map<String, String>.from(secureStore);
            default:
              return null;
          }
        });
    ApiClient.instance.onUnauthorized = null;
    await ApiClient.instance.logout();
  });

  tearDown(() {
    ApiClient.testHttpClient = null;
    ApiClient.instance.onUnauthorized = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(secureChannel, null);
  });

  group('parseQrToken', () {
    test('parses colon-delimited and slash-delimited tokens', () {
      expect(
        parseQrToken('v-1:t-4'),
        (venueId: 'v-1', tableId: 't-4', token: 'demo'),
      );
      expect(
        parseQrToken('v-1:t-4:secret99'),
        (venueId: 'v-1', tableId: 't-4', token: 'secret99'),
      );
      expect(
        parseQrToken('v-2/t-7'),
        (venueId: 'v-2', tableId: 't-7', token: 'demo'),
      );
      expect(
        parseQrToken('v-2/t-7/tok-abc'),
        (venueId: 'v-2', tableId: 't-7', token: 'tok-abc'),
      );
    });

    test('parses Seatiko https and custom-scheme URLs', () {
      expect(
        parseQrToken('https://seatiko.md/qr?venue_id=v10&table_id=t3&token=xyz'),
        (venueId: 'v10', tableId: 't3', token: 'xyz'),
      );
      expect(
        parseQrToken('https://seatiko.md/table/v11/t5'),
        (venueId: 'v11', tableId: 't5', token: 'demo'),
      );
      expect(
        parseQrToken('seatiko://qr/v12/t8/tok42'),
        (venueId: 'v12', tableId: 't8', token: 'tok42'),
      );
      expect(
        parseQrToken('/table/v13/t9/qtok'),
        (venueId: 'v13', tableId: 't9', token: 'qtok'),
      );
    });

    test('throws invalid_qr_token FormatException on malformed inputs', () {
      for (final raw in [
        '',
        '   ',
        'single-token',
        'venue:',
        ':table',
        '/',
        'https://seatiko.md/qr?venue_id=v1',
        'https://seatiko.md/unknown/path',
      ]) {
        expect(
          () => parseQrToken(raw),
          throwsA(
            isA<FormatException>().having(
              (e) => e.message,
              'message',
              'invalid_qr_token',
            ),
          ),
        );
      }
    });
  });

  group('apiErrorKey & safeShortId', () {
    test('maps API business codes, 401, QR FormatException and network errors', () {
      expect(
        apiErrorKey(ApiException(409, 'active_reservation_exists')),
        'error.active_reservation',
      );
      expect(
        apiErrorKey(ApiException(409, 'table_not_free')),
        'error.table_not_free',
      );
      expect(
        apiErrorKey(ApiException(403, 'age_verification_required')),
        'error.age_verification_required',
      );
      expect(
        apiErrorKey(ApiException(401, 'unmapped_auth_code')),
        'error.unauthorized',
      );
      expect(
        apiErrorKey(ApiException(500, 'unexpected')),
        'common.error',
      );
      expect(
        apiErrorKey(const FormatException('invalid_qr_token')),
        'error.invalid_qr_token',
      );
      expect(
        apiErrorKey(const SocketException('offline')),
        'error.network',
      );
      expect(
        apiErrorKey(TimeoutException('timeout')),
        'error.network',
      );
      expect(apiErrorKey(StateError('x')), 'common.error');
    });

    test('safeShortId truncates without throwing on short ids', () {
      expect(safeShortId('abc'), 'abc');
      expect(safeShortId('1234567890abcdef'), '12345678');
    });
  });

  group('Model parsing', () {
    test('parses City, Venue, VenueTable, MenuItem, Reservation, Order, User, MapPlacesResponse', () {
      final city = City.fromJson({
        'id': 'city-balti',
        'slug': 'balti',
        'name': {'ru': 'Бельцы', 'en': 'Balti', 'ro': 'Bălți'},
        'available': true,
        'country': 'MD',
        'center': {'lat': 47.76, 'lng': 27.92},
        'bounds': {'south': 47.7, 'west': 27.8, 'north': 47.8, 'east': 28.0},
      });
      expect(city.name.pick('ro'), 'Bălți');
      expect(city.bounds?.contains(47.75, 27.9), isTrue);

      final venue = Venue.fromJson({
        'id': 'v1',
        'city_id': 'city-balti',
        'name': {'ru': 'Оскар', 'en': 'Oscar', 'ro': 'Oscar'},
        'description': {'ru': 'Уютно', 'en': 'Cozy', 'ro': 'Confort'},
        'cuisine': ['moldovan'],
        'rating': 4.8,
        'review_count': 42,
        'price_level': 2,
        'address': {'ru': 'ул. Мира 1'},
        'lat': 47.76,
        'lng': 27.92,
        'average_check': 250,
        'open_now': true,
        'free_tables': 4,
        'image_url': '/img/v1.jpg',
        'photo_urls': ['/img/v1.jpg', '/img/v2.jpg'],
      });
      expect(venue.galleryUrls, ['/img/v1.jpg', '/img/v2.jpg']);
      expect(venue.priceLabel(), '€€');

      final table = VenueTable.fromJson({
        'id': 't1',
        'venue_id': 'v1',
        'number': 7,
        'seats': 4,
        'status': 'RESERVED',
        'reserved_for': '2026-12-01T18:00:00Z',
        'x': 0.4,
        'y': 0.6,
        'zone': 'Терраса',
      });
      expect(table.zone, 'terrace');
      expect(table.reservedFor, isNotNull);

      final blockedWine = MenuItem.fromJson({
        'id': 'm-wine',
        'venue_id': 'v1',
        'category': {'en': 'Wine'},
        'name': {'en': 'Merlot'},
        'description': {'en': 'Dry red'},
        'price': 180,
        'contains_alcohol': true,
        'requires_age_18': true,
        'orderable': false,
        'blocked_reason': 'age_verification_required',
      });
      expect(blockedWine.is18Plus, isTrue);
      expect(blockedWine.orderable, isFalse);
      expect(blockedWine.blockedReason, 'age_verification_required');

      final mapPlaces = MapPlacesResponse.fromJson({
        'city_id': 'city-balti',
        'country': 'MD',
        'center': {'lat': 47.76, 'lng': 27.92},
        'bounds': {'south': 47.7, 'west': 27.8, 'north': 47.8, 'east': 28.0},
        'places': [
          {
            'id': 'p1',
            'name': 'Place 1',
            'lat': 47.761,
            'lng': 27.921,
            'address': 'Str. Independentei',
            'in_database': true,
            'bookable': true,
            'venue_id': 'v1',
            'free_tables': 3,
          },
        ],
        'source': {
          'database_count': 1,
          'open_data_count': 2,
          'attribution': 'Seatiko + OSM',
        },
        'filters': {'matched': 1, 'total': 3},
      });
      expect(mapPlaces.places, hasLength(1));
      expect(mapPlaces.places.first.bookable, isTrue);
      expect(mapPlaces.matchedCount, 1);

      final user = User.fromJson({
        'id': 'u1',
        'email': 'guest@seatiko.md',
        'first_name': 'Ion',
        'last_name': 'Popa',
        'display_name': 'Ion',
        'locale': 'ro',
        'adult_preorder_allowed': true,
        'adult_verification': {
          'verified_at': '2026-10-10T10:00:00Z',
          'verified_by_staff_id': 'st-1',
          'verified_by_staff_role': 'waiter',
          'verified_by_staff_display_name': 'Ana',
          'verified_at_venue_id': 'v1',
        },
      });
      expect(user.adultVerification?.verifiedByStaffDisplayName, 'Ana');
    });
  });

  group('ApiClient HTTP & Token Storage', () {
    test('login persists token in secure storage and fetchMapPlaces sends expected params', () async {
      final calls = <http.Request>[];
      ApiClient.testHttpClient = MockClient((req) async {
        calls.add(req);
        if (req.url.path == '/api/v1/auth/login') {
          return http.Response(
            jsonEncode({
              'token': 'jwt-secret-123',
              'user': {
                'id': 'u1',
                'email': 'u@seatiko.md',
                'first_name': 'A',
                'last_name': 'B',
                'display_name': 'AB',
                'locale': 'en',
              },
            }),
            200,
          );
        }
        if (req.url.path == '/api/v1/map/places') {
          return http.Response(
            jsonEncode({
              'city_id': 'city-balti',
              'country': 'MD',
              'center': {'lat': 47.76, 'lng': 27.92},
              'bounds': {'south': 47.7, 'west': 27.8, 'north': 47.8, 'east': 28.0},
              'places': [],
              'source': {'database_count': 0, 'open_data_count': 0, 'attribution': ''},
            }),
            200,
          );
        }
        return http.Response('{}', 404);
      });

      final auth = await ApiClient.instance.login(
        email: 'u@seatiko.md',
        password: 'password123',
      );
      expect(auth.token, 'jwt-secret-123');
      expect(secureStore[tokenKey], 'jwt-secret-123');

      final places = await ApiClient.instance.fetchMapPlaces(
        cityId: 'city-balti',
        locale: 'ro',
        bookableOnly: true,
        query: 'pizza',
      );
      expect(places.cityId, 'city-balti');
      final mapReq = calls.last;
      expect(mapReq.url.queryParameters['city_id'], 'city-balti');
      expect(mapReq.url.queryParameters['lang'], 'ro');
      expect(mapReq.url.queryParameters['bookable_only'], 'true');
      expect(mapReq.url.queryParameters['q'], 'pizza');
    });

    test('401 on authenticated request clears token and invokes onUnauthorized', () async {
      await ApiClient.instance.setToken('valid-token');
      await ApiClient.instance.setActiveSessionId('sess-99');
      var unauthorizedFired = 0;
      ApiClient.instance.onUnauthorized = () => unauthorizedFired++;

      ApiClient.testHttpClient = MockClient((req) async {
        expect(req.headers['Authorization'], 'Bearer valid-token');
        return http.Response(
          jsonEncode({'error': 'invalid_token'}),
          401,
        );
      });

      await expectLater(
        () => ApiClient.instance.fetchMe(),
        throwsA(
          isA<ApiException>().having((e) => e.status, 'status', 401),
        ),
      );
      expect(unauthorizedFired, 1);
      expect(secureStore[tokenKey], isNull);
      expect(await ApiClient.instance.getToken(), isNull);
      expect(await ApiClient.instance.getActiveSessionId(), isNull);
    });

    test('migrates legacy SharedPreferences token into secure storage', () async {
      await ApiClient.instance.logout();
      SharedPreferences.setMockInitialValues({tokenKey: 'legacy-prefs-tok'});

      final resolved = await ApiClient.instance.getToken();
      expect(resolved, 'legacy-prefs-tok');
      expect(secureStore[tokenKey], 'legacy-prefs-tok');
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString(tokenKey), isNull);
    });

    test('zonesFromTables, zoneLabel, mediaUrl, WaitlistEntry and DiscoverResult parsing', () {
      expect(mediaUrl(''), '');
      expect(mediaUrl('https://cdn.seatiko.md/a.jpg'), 'https://cdn.seatiko.md/a.jpg');
      expect(mediaUrl('/uploads/v.png'), endsWith('/uploads/v.png'));

      final tables = [
        VenueTable.fromJson({'id': 't1', 'zone': 'street', 'number': 1, 'seats': 2, 'x': 0.2, 'y': 0.2}),
        VenueTable.fromJson({'id': 't2', 'zone': 'Зал', 'number': 2, 'seats': 4, 'x': 0.5, 'y': 0.5}),
        VenueTable.fromJson({'id': 't3', 'zone': 'vip', 'number': 3, 'seats': 6, 'x': 0.8, 'y': 0.8}),
      ];
      expect(zonesFromTables(tables), ['hall', 'street', 'vip']);
      expect(zoneLabel('hall', 'ru'), 'Зал');
      expect(zoneLabel('street', 'ro'), 'Stradă');
      expect(zoneLabel('terrace', 'en'), 'Terrace');

      final wl = WaitlistEntry.fromJson({
        'id': 'w1',
        'venue_id': 'v1',
        'guest_name': 'Ion',
        'guests': 3,
        'status': 'READY',
        'position': 1,
        'table_number': 7,
      });
      expect(wl.isActive, isTrue);
      expect(wl.isReady, isTrue);

      final disc = DiscoverResult.fromJson({
        'venues': [],
        'explanation': {'en': 'Great match', 'ru': 'Отлично'},
        'exact': false,
        'prefs': {
          'cuisine': ['moldovan'],
          'budget': {'min': 100, 'max': 400},
        },
      }, locale: 'en');
      expect(disc.explanation, 'Great match');
      expect(disc.exact, isFalse);
      expect(disc.prefs?.budgetMax, 400);
    });

    test('createReservation, payOrder, callWaiter, markNotificationsRead and deleteAccount', () async {
      await ApiClient.instance.setToken('tok-ops');
      final requests = <String>[];
      ApiClient.testHttpClient = MockClient((req) async {
        requests.add('${req.method} ${req.url.path}');
        switch ('${req.method} ${req.url.path}') {
          case 'POST /api/v1/reservations':
            return http.Response(
              jsonEncode({
                'reservation': {
                  'id': 'r1',
                  'user_id': 'u1',
                  'venue_id': 'v1',
                  'table_id': 't1',
                  'guests': 2,
                  'reserved_for': '2026-12-01T19:00:00Z',
                  'status': 'CONFIRMED',
                },
              }),
              201,
            );
          case 'POST /api/v1/payments':
            return http.Response(
              jsonEncode({
                'order': {
                  'id': 'o1',
                  'session_id': 's1',
                  'user_id': 'u1',
                  'venue_id': 'v1',
                  'items': [],
                  'status': 'PAID',
                  'total': 200,
                  'check_number': 'CHK-9',
                },
              }),
              200,
            );
          case 'POST /api/v1/sessions/s1/waiter-calls':
            return http.Response(
              jsonEncode({
                'waiter_call': {
                  'id': 'wc1',
                  'session_id': 's1',
                  'venue_id': 'v1',
                  'table_id': 't1',
                  'reason': 'bill',
                  'status': 'SENT',
                },
              }),
              201,
            );
          case 'POST /api/v1/me/notifications/read':
            return http.Response(jsonEncode({'unread': 0}), 200);
          case 'DELETE /api/v1/me':
            return http.Response('{}', 200);
          default:
            return http.Response(jsonEncode({'error': 'not_found'}), 404);
        }
      });

      final r = await ApiClient.instance.createReservation(
        venueId: 'v1',
        tableId: 't1',
        guests: 2,
        reservedFor: DateTime.utc(2026, 12, 1, 19),
      );
      expect(r.status, 'CONFIRMED');

      final paid = await ApiClient.instance.payOrder(orderId: 'o1', method: 'app');
      expect(paid.status, 'PAID');
      expect(paid.checkNumber, 'CHK-9');

      final wc = await ApiClient.instance.callWaiter(sessionId: 's1', reason: 'bill');
      expect(wc.reason, 'bill');

      final unread = await ApiClient.instance.markNotificationsRead();
      expect(unread, 0);

      await ApiClient.instance.deleteAccount('secret123');
      expect(await ApiClient.instance.getToken(), isNull);
      expect(requests, [
        'POST /api/v1/reservations',
        'POST /api/v1/payments',
        'POST /api/v1/sessions/s1/waiter-calls',
        'POST /api/v1/me/notifications/read',
        'DELETE /api/v1/me',
      ]);
    });
  });
}
