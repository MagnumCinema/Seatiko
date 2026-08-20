import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

// Android emulator → host nginx on port 80
const apiBaseUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'http://10.0.2.2',
);

const tokenKey = 'fa_token';
const onboardedKey = 'fa_onboarded';
const cityKey = 'fa_city';

class ApiException implements Exception {
  ApiException(this.status, this.code);
  final int status;
  final String code;

  @override
  String toString() => 'ApiException($status, $code)';
}

class LocalizedString {
  LocalizedString({required this.ru, required this.en, required this.ro});

  final String ru;
  final String en;
  final String ro;

  factory LocalizedString.fromJson(dynamic json) {
    if (json is! Map<String, dynamic>) {
      return LocalizedString(ru: '', en: '', ro: '');
    }
    return LocalizedString(
      ru: json['ru'] as String? ?? '',
      en: json['en'] as String? ?? '',
      ro: json['ro'] as String? ?? '',
    );
  }

  String pick(String locale) {
    switch (locale) {
      case 'en':
        return en.isNotEmpty ? en : (ru.isNotEmpty ? ru : ro);
      case 'ro':
        return ro.isNotEmpty ? ro : (en.isNotEmpty ? en : ru);
      default:
        return ru.isNotEmpty ? ru : (en.isNotEmpty ? en : ro);
    }
  }
}

class City {
  City({
    required this.id,
    required this.slug,
    required this.name,
    required this.available,
    required this.country,
  });

  final String id;
  final String slug;
  final LocalizedString name;
  final bool available;
  final String country;

  factory City.fromJson(Map<String, dynamic> json) => City(
        id: json['id'] as String,
        slug: json['slug'] as String? ?? '',
        name: LocalizedString.fromJson(json['name']),
        available: json['available'] as bool? ?? false,
        country: json['country'] as String? ?? '',
      );
}

class Venue {
  Venue({
    required this.id,
    required this.cityId,
    required this.name,
    required this.description,
    required this.cuisine,
    required this.rating,
    required this.priceLevel,
    required this.address,
    required this.lat,
    required this.lng,
    required this.averageCheck,
    required this.openNow,
    required this.freeTables,
    required this.imageUrl,
    this.alcoholLicenseValid = false,
    this.sessionStartBeforeMin = 60,
    this.releaseBeforeMin = 15,
  });

  final String id;
  final String cityId;
  final LocalizedString name;
  final LocalizedString description;
  final List<String> cuisine;
  final double rating;
  final int priceLevel;
  final LocalizedString address;
  final double lat;
  final double lng;
  final int averageCheck;
  final bool openNow;
  final int freeTables;
  final String imageUrl;
  final bool alcoholLicenseValid;
  final int sessionStartBeforeMin;
  final int releaseBeforeMin;

  factory Venue.fromJson(Map<String, dynamic> json) => Venue(
        id: json['id'] as String,
        cityId: json['city_id'] as String? ?? '',
        name: LocalizedString.fromJson(json['name']),
        description: LocalizedString.fromJson(json['description']),
        cuisine: (json['cuisine'] as List<dynamic>? ?? [])
            .map((e) => e.toString())
            .toList(),
        rating: (json['rating'] as num?)?.toDouble() ?? 0,
        priceLevel: json['price_level'] as int? ?? 1,
        address: LocalizedString.fromJson(json['address']),
        lat: (json['lat'] as num?)?.toDouble() ?? 0,
        lng: (json['lng'] as num?)?.toDouble() ?? 0,
        averageCheck: json['average_check'] as int? ?? 0,
        openNow: json['open_now'] as bool? ?? false,
        freeTables: json['free_tables'] as int? ?? 0,
        imageUrl: json['image_url'] as String? ?? '',
        alcoholLicenseValid: json['alcohol_license_valid'] as bool? ?? false,
        sessionStartBeforeMin: json['session_start_before_min'] as int? ?? 60,
        releaseBeforeMin: json['release_before_min'] as int? ?? 15,
      );

  String priceLabel() => '€' * priceLevel.clamp(1, 3);
}

class VenueTable {
  VenueTable({
    required this.id,
    required this.venueId,
    required this.number,
    required this.seats,
    required this.status,
    this.occupiedSince,
    this.reservedFor,
    this.reservationId,
    required this.x,
    required this.y,
  });

  final String id;
  final String venueId;
  final int number;
  final int seats;
  final String status;
  final DateTime? occupiedSince;
  final DateTime? reservedFor;
  final String? reservationId;
  final double x;
  final double y;

  factory VenueTable.fromJson(Map<String, dynamic> json) => VenueTable(
        id: json['id'] as String,
        venueId: json['venue_id'] as String? ?? '',
        number: json['number'] as int? ?? 0,
        seats: json['seats'] as int? ?? 0,
        status: json['status'] as String? ?? 'FREE',
        occupiedSince: _parseTime(json['occupied_since']),
        reservedFor: _parseTime(json['reserved_for']),
        reservationId: json['reservation_id'] as String?,
        x: (json['x'] as num?)?.toDouble() ?? 0.5,
        y: (json['y'] as num?)?.toDouble() ?? 0.5,
      );
}

class User {
  User({
    required this.id,
    required this.email,
    this.phone,
    required this.firstName,
    required this.lastName,
    required this.displayName,
    required this.locale,
    this.createdAt,
  });

  final String id;
  final String email;
  final String? phone;
  final String firstName;
  final String lastName;
  final String displayName;
  final String locale;
  final DateTime? createdAt;

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] as String,
        email: json['email'] as String? ?? '',
        phone: json['phone'] as String?,
        firstName: json['first_name'] as String? ?? '',
        lastName: json['last_name'] as String? ?? '',
        displayName: json['display_name'] as String? ?? '',
        locale: json['locale'] as String? ?? 'ru',
        createdAt: _parseTime(json['created_at']),
      );
}

class AuthResponse {
  AuthResponse({required this.token, required this.user});
  final String token;
  final User user;

  factory AuthResponse.fromJson(Map<String, dynamic> json) => AuthResponse(
        token: json['token'] as String,
        user: User.fromJson(json['user'] as Map<String, dynamic>),
      );
}

class Reservation {
  Reservation({
    required this.id,
    required this.userId,
    required this.venueId,
    required this.tableId,
    required this.guests,
    required this.reservedFor,
    required this.status,
    this.arrivalConfirmedAt,
    this.createdAt,
  });

  final String id;
  final String userId;
  final String venueId;
  final String tableId;
  final int guests;
  final DateTime reservedFor;
  final String status;
  final DateTime? arrivalConfirmedAt;
  final DateTime? createdAt;

  factory Reservation.fromJson(Map<String, dynamic> json) => Reservation(
        id: json['id'] as String,
        userId: json['user_id'] as String? ?? '',
        venueId: json['venue_id'] as String? ?? '',
        tableId: json['table_id'] as String? ?? '',
        guests: json['guests'] as int? ?? 1,
        reservedFor: _parseTime(json['reserved_for']) ?? DateTime.now(),
        status: json['status'] as String? ?? '',
        arrivalConfirmedAt: _parseTime(json['arrival_confirmed_at']),
        createdAt: _parseTime(json['created_at']),
      );
}

class Session {
  Session({
    required this.id,
    required this.userId,
    required this.venueId,
    required this.tableId,
    this.reservationId,
    required this.status,
    required this.startedAt,
    this.closedAt,
  });

  final String id;
  final String userId;
  final String venueId;
  final String tableId;
  final String? reservationId;
  final String status;
  final DateTime startedAt;
  final DateTime? closedAt;

  factory Session.fromJson(Map<String, dynamic> json) => Session(
        id: json['id'] as String,
        userId: json['user_id'] as String? ?? '',
        venueId: json['venue_id'] as String? ?? '',
        tableId: json['table_id'] as String? ?? '',
        reservationId: json['reservation_id'] as String?,
        status: json['status'] as String? ?? 'ACTIVE',
        startedAt: _parseTime(json['started_at']) ?? DateTime.now(),
        closedAt: _parseTime(json['closed_at']),
      );
}

class MenuItem {
  MenuItem({
    required this.id,
    required this.venueId,
    required this.category,
    required this.name,
    required this.description,
    required this.price,
    required this.containsAlcohol,
  });

  final String id;
  final String venueId;
  final LocalizedString category;
  final LocalizedString name;
  final LocalizedString description;
  final int price;
  final bool containsAlcohol;

  factory MenuItem.fromJson(Map<String, dynamic> json) => MenuItem(
        id: json['id'] as String,
        venueId: json['venue_id'] as String? ?? '',
        category: LocalizedString.fromJson(json['category']),
        name: LocalizedString.fromJson(json['name']),
        description: LocalizedString.fromJson(json['description']),
        price: json['price'] as int? ?? 0,
        containsAlcohol: json['contains_alcohol'] as bool? ?? false,
      );
}

class OrderItem {
  OrderItem({
    required this.menuItemId,
    required this.name,
    required this.qty,
    required this.price,
  });

  final String menuItemId;
  final LocalizedString name;
  final int qty;
  final int price;

  factory OrderItem.fromJson(Map<String, dynamic> json) => OrderItem(
        menuItemId: json['menu_item_id'] as String? ?? '',
        name: LocalizedString.fromJson(json['name']),
        qty: json['qty'] as int? ?? 1,
        price: json['price'] as int? ?? 0,
      );
}

class Order {
  Order({
    required this.id,
    required this.sessionId,
    required this.userId,
    required this.venueId,
    required this.items,
    required this.status,
    required this.total,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String sessionId;
  final String userId;
  final String venueId;
  final List<OrderItem> items;
  final String status;
  final int total;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  factory Order.fromJson(Map<String, dynamic> json) => Order(
        id: json['id'] as String,
        sessionId: json['session_id'] as String? ?? '',
        userId: json['user_id'] as String? ?? '',
        venueId: json['venue_id'] as String? ?? '',
        items: (json['items'] as List<dynamic>? ?? [])
            .map((e) => OrderItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        status: json['status'] as String? ?? '',
        total: json['total'] as int? ?? 0,
        createdAt: _parseTime(json['created_at']),
        updatedAt: _parseTime(json['updated_at']),
      );
}

class HolidayCollection {
  HolidayCollection({
    required this.id,
    required this.slug,
    required this.title,
    required this.venueIds,
  });

  final String id;
  final String slug;
  final LocalizedString title;
  final List<String> venueIds;

  factory HolidayCollection.fromJson(Map<String, dynamic> json) =>
      HolidayCollection(
        id: json['id'] as String,
        slug: json['slug'] as String? ?? '',
        title: LocalizedString.fromJson(json['title']),
        venueIds: (json['venue_ids'] as List<dynamic>? ?? [])
            .map((e) => e.toString())
            .toList(),
      );
}

class WaiterCall {
  WaiterCall({
    required this.id,
    required this.sessionId,
    required this.venueId,
    required this.tableId,
    required this.reason,
    required this.status,
  });

  final String id;
  final String sessionId;
  final String venueId;
  final String tableId;
  final String reason;
  final String status;

  factory WaiterCall.fromJson(Map<String, dynamic> json) => WaiterCall(
        id: json['id'] as String,
        sessionId: json['session_id'] as String? ?? '',
        venueId: json['venue_id'] as String? ?? '',
        tableId: json['table_id'] as String? ?? '',
        reason: json['reason'] as String? ?? '',
        status: json['status'] as String? ?? '',
      );
}

DateTime? _parseTime(dynamic v) {
  if (v == null) return null;
  if (v is String && v.isNotEmpty) return DateTime.tryParse(v)?.toLocal();
  return null;
}

String formatClock(DateTime? dt) {
  if (dt == null) return '—';
  final h = dt.hour.toString().padLeft(2, '0');
  final m = dt.minute.toString().padLeft(2, '0');
  return '$h:$m';
}

class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(tokenKey);
  }

  Future<void> setToken(String? token) async {
    final prefs = await SharedPreferences.getInstance();
    if (token == null || token.isEmpty) {
      await prefs.remove(tokenKey);
    } else {
      await prefs.setString(tokenKey, token);
    }
  }

  Future<bool> isOnboarded() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(onboardedKey) ?? false;
  }

  Future<void> setOnboarded(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(onboardedKey, value);
  }

  Future<String> getCityId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(cityKey) ?? 'city-balti';
  }

  Future<void> setCityId(String id) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(cityKey, id);
  }

  Future<Map<String, dynamic>> _request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    Map<String, String>? query,
    bool auth = false,
  }) async {
    final uri = Uri.parse('$apiBaseUrl$path').replace(
      queryParameters: query?.isEmpty ?? true ? null : query,
    );
    final headers = <String, String>{
      'Accept': 'application/json',
    };
    if (body != null) headers['Content-Type'] = 'application/json';
    if (auth) {
      final token = await getToken();
      if (token != null && token.isNotEmpty) {
        headers['Authorization'] = 'Bearer $token';
      }
    }

    late http.Response response;
    final encoded = body == null ? null : jsonEncode(body);
    switch (method) {
      case 'POST':
        response = await http
            .post(uri, headers: headers, body: encoded)
            .timeout(const Duration(seconds: 12));
      case 'PATCH':
        response = await http
            .patch(uri, headers: headers, body: encoded)
            .timeout(const Duration(seconds: 12));
      default:
        response = await http
            .get(uri, headers: headers)
            .timeout(const Duration(seconds: 12));
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      var code = 'http_${response.statusCode}';
      try {
        final err = jsonDecode(response.body) as Map<String, dynamic>;
        code = err['error'] as String? ?? code;
      } catch (_) {}
      throw ApiException(response.statusCode, code);
    }

    if (response.body.isEmpty) return {};
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<List<City>> fetchCities() async {
    final data = await _request('/api/v1/cities');
    final list = data['cities'] as List<dynamic>? ?? [];
    return list.map((e) => City.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<Venue>> fetchVenues({String cityId = 'city-balti'}) async {
    final data = await _request(
      '/api/v1/venues',
      query: {'city_id': cityId},
    );
    final list = data['venues'] as List<dynamic>? ?? [];
    return list.map((e) => Venue.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Venue> fetchVenue(String id) async {
    final data = await _request('/api/v1/venues/$id');
    return Venue.fromJson(data['venue'] as Map<String, dynamic>);
  }

  Future<List<VenueTable>> fetchTables(String venueId) async {
    final data = await _request('/api/v1/venues/$venueId/tables');
    final list = data['tables'] as List<dynamic>? ?? [];
    return list
        .map((e) => VenueTable.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<MenuItem>> fetchMenu(String venueId) async {
    final data = await _request('/api/v1/venues/$venueId/menu');
    final list = (data['menu'] ?? data['items']) as List<dynamic>? ?? [];
    return list
        .map((e) => MenuItem.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<HolidayCollection>> fetchCollections() async {
    final data = await _request('/api/v1/collections');
    final list = data['collections'] as List<dynamic>? ?? [];
    return list
        .map((e) => HolidayCollection.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<Venue>> discoverAi(String query) async {
    final data = await _request(
      '/api/v1/discover/ai',
      method: 'POST',
      body: {'query': query},
    );
    final list = data['venues'] as List<dynamic>? ?? [];
    return list.map((e) => Venue.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<AuthResponse> register({
    required String email,
    required String password,
    String firstName = '',
    String lastName = '',
    String locale = 'ru',
  }) async {
    final data = await _request(
      '/api/v1/auth/register',
      method: 'POST',
      body: {
        'email': email,
        'password': password,
        'first_name': firstName,
        'last_name': lastName,
        'locale': locale,
      },
    );
    final auth = AuthResponse.fromJson(data);
    await setToken(auth.token);
    return auth;
  }

  Future<AuthResponse> login({
    required String email,
    required String password,
  }) async {
    final data = await _request(
      '/api/v1/auth/login',
      method: 'POST',
      body: {'email': email, 'password': password},
    );
    final auth = AuthResponse.fromJson(data);
    await setToken(auth.token);
    return auth;
  }

  Future<void> logout() => setToken(null);

  Future<User> fetchMe() async {
    final data = await _request('/api/v1/me', auth: true);
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<User> updateMe({
    String? firstName,
    String? lastName,
    String? displayName,
    String? locale,
  }) async {
    final body = <String, dynamic>{};
    if (firstName != null) body['first_name'] = firstName;
    if (lastName != null) body['last_name'] = lastName;
    if (displayName != null) body['display_name'] = displayName;
    if (locale != null) body['locale'] = locale;
    final data = await _request(
      '/api/v1/me',
      method: 'PATCH',
      body: body,
      auth: true,
    );
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<Reservation> createReservation({
    required String venueId,
    required String tableId,
    required int guests,
    required DateTime reservedFor,
  }) async {
    final data = await _request(
      '/api/v1/reservations',
      method: 'POST',
      body: {
        'venue_id': venueId,
        'table_id': tableId,
        'guests': guests,
        'reserved_for': reservedFor.toUtc().toIso8601String(),
      },
      auth: true,
    );
    return Reservation.fromJson(data['reservation'] as Map<String, dynamic>);
  }

  Future<List<Reservation>> fetchReservations() async {
    final data = await _request('/api/v1/reservations', auth: true);
    final list = data['reservations'] as List<dynamic>? ?? [];
    return list
        .map((e) => Reservation.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Reservation> confirmArrival(String reservationId) async {
    final data = await _request(
      '/api/v1/reservations/$reservationId/confirm-arrival',
      method: 'POST',
      body: {},
      auth: true,
    );
    return Reservation.fromJson(data['reservation'] as Map<String, dynamic>);
  }

  Future<void> watchTable({
    required String venueId,
    required String tableId,
  }) async {
    await _request(
      '/api/v1/tables/$tableId/watch',
      method: 'POST',
      body: {'venue_id': venueId},
      auth: true,
    );
  }

  /// Demo token formats: `venue-1:t1` or `venue-1/t1` or raw fields.
  Future<Session> scanQr({
    required String venueId,
    required String tableId,
    String token = 'demo',
  }) async {
    final data = await _request(
      '/api/v1/sessions/qr',
      method: 'POST',
      body: {
        'venue_id': venueId,
        'table_id': tableId,
        'token': token.isEmpty ? 'demo' : token,
      },
      auth: true,
    );
    return Session.fromJson(data['session'] as Map<String, dynamic>);
  }

  Future<Session> getSession(String id) async {
    final data = await _request('/api/v1/sessions/$id', auth: true);
    return Session.fromJson(data['session'] as Map<String, dynamic>);
  }

  Future<Session> closeSession(String id) async {
    final data = await _request(
      '/api/v1/sessions/$id/close',
      method: 'POST',
      body: {},
      auth: true,
    );
    return Session.fromJson(data['session'] as Map<String, dynamic>);
  }

  Future<Order> createOrder({
    required String sessionId,
    required List<({String menuItemId, int qty})> items,
  }) async {
    final data = await _request(
      '/api/v1/sessions/$sessionId/orders',
      method: 'POST',
      body: {
        'items': items
            .map((e) => {'menu_item_id': e.menuItemId, 'qty': e.qty})
            .toList(),
      },
      auth: true,
    );
    return Order.fromJson(data['order'] as Map<String, dynamic>);
  }

  Future<List<Order>> fetchOrders() async {
    final data = await _request('/api/v1/orders', auth: true);
    final list = data['orders'] as List<dynamic>? ?? [];
    return list.map((e) => Order.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<WaiterCall> callWaiter({
    required String sessionId,
    required String reason,
  }) async {
    final data = await _request(
      '/api/v1/sessions/$sessionId/waiter-calls',
      method: 'POST',
      body: {'reason': reason},
      auth: true,
    );
    return WaiterCall.fromJson(data['waiter_call'] as Map<String, dynamic>);
  }
}

/// Parse demo QR string like `venue-1:t1` into parts.
({String venueId, String tableId, String token}) parseQrToken(String raw) {
  final t = raw.trim();
  if (t.contains(':')) {
    final parts = t.split(':');
    return (
      venueId: parts[0],
      tableId: parts.length > 1 ? parts[1] : 't1',
      token: parts.length > 2 ? parts.sublist(2).join(':') : 'demo',
    );
  }
  if (t.contains('/')) {
    final parts = t.split('/');
    return (
      venueId: parts[0],
      tableId: parts.length > 1 ? parts[1] : 't1',
      token: 'demo',
    );
  }
  return (venueId: 'venue-1', tableId: 't1', token: t.isEmpty ? 'demo' : t);
}
