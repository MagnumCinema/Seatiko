import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

const _apiUrlOverride = String.fromEnvironment('API_URL', defaultValue: '');
const apiEnv = String.fromEnvironment('API_ENV', defaultValue: '');

const _prodApiUrl = 'https://api.seatiko.md';
const _stagingApiUrl = 'https://staging-api.seatiko.md';

String get apiBaseUrl {
  final override = _apiUrlOverride.trim().replaceFirst(RegExp(r'/+$'), '');
  if (override.isNotEmpty) return override;

  switch (apiEnv.toLowerCase()) {
    case 'prod':
    case 'production':
      return _prodApiUrl;
    case 'staging':
      return _stagingApiUrl;
    case 'dev':
      if (!kIsWeb && Platform.isAndroid) return 'http://10.0.2.2';
      return 'http://localhost';
    default:
      if (kDebugMode) {
        if (!kIsWeb && Platform.isAndroid) return 'http://10.0.2.2';
        return 'http://localhost';
      }
      return _prodApiUrl;
  }
}

String mediaUrl(String url) {
  final trimmed = url.trim();
  if (trimmed.isEmpty) return '';
  if (RegExp(r'^https?://', caseSensitive: false).hasMatch(trimmed)) {
    return trimmed;
  }
  final path = trimmed.startsWith('/') ? trimmed : '/$trimmed';
  return '$apiBaseUrl$path';
}

String get bookingSourcePlatform =>
    (!kIsWeb && Platform.isIOS) ? 'IOS' : 'ANDROID';

const tokenKey = 'fa_token';
const onboardedKey = 'fa_onboarded';
const cityKey = 'fa_city';
const activeSessionKey = 'fa_active_session_id';
const discoverAiGuestCountKey = 'fa_discover_guest_ai_count';
const discoverAiGuestDateKey = 'fa_discover_guest_ai_date';
const localPaymentsKey = 'fa_local_payments';

class ApiException implements Exception {
  ApiException(this.status, this.code, [this.message]);
  final int status;
  final String code;
  final String? message;

  @override
  String toString() => 'ApiException($status, $code)';
}

class LocalizedString {
  LocalizedString({required this.ru, required this.en, required this.ro});

  final String ru;
  final String en;
  final String ro;

  factory LocalizedString.fromJson(dynamic json) {
    if (json is String) {
      return LocalizedString(ru: json, en: json, ro: json);
    }
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

class MapCoordinates {
  const MapCoordinates({required this.lat, required this.lng});
  final double lat;
  final double lng;

  factory MapCoordinates.fromJson(Map<String, dynamic> json) => MapCoordinates(
    lat: (json['lat'] as num?)?.toDouble() ?? 0,
    lng: (json['lng'] as num?)?.toDouble() ?? 0,
  );
}

class MapBounds {
  const MapBounds({
    required this.south,
    required this.west,
    required this.north,
    required this.east,
  });

  final double south;
  final double west;
  final double north;
  final double east;

  factory MapBounds.fromJson(Map<String, dynamic> json) => MapBounds(
    south: (json['south'] as num?)?.toDouble() ?? 0,
    west: (json['west'] as num?)?.toDouble() ?? 0,
    north: (json['north'] as num?)?.toDouble() ?? 0,
    east: (json['east'] as num?)?.toDouble() ?? 0,
  );

  bool contains(double lat, double lng) =>
      lat >= south && lat <= north && lng >= west && lng <= east;
}

class City {
  City({
    required this.id,
    required this.slug,
    required this.name,
    required this.available,
    required this.country,
    this.center,
    this.bounds,
  });

  final String id;
  final String slug;
  final LocalizedString name;
  final bool available;
  final String country;
  final MapCoordinates? center;
  final MapBounds? bounds;

  factory City.fromJson(Map<String, dynamic> json) => City(
    id: json['id'] as String,
    slug: json['slug'] as String? ?? '',
    name: LocalizedString.fromJson(json['name']),
    available: json['available'] as bool? ?? false,
    country: json['country'] as String? ?? '',
    center: json['center'] is Map<String, dynamic>
        ? MapCoordinates.fromJson(json['center'] as Map<String, dynamic>)
        : null,
    bounds: json['bounds'] is Map<String, dynamic>
        ? MapBounds.fromJson(json['bounds'] as Map<String, dynamic>)
        : null,
  );
}

class VenueReview {
  VenueReview({
    required this.author,
    required this.rating,
    required this.text,
    this.relativeTime = '',
    this.source = '',
    this.profileUrl = '',
  });

  final String author;
  final double rating;
  final String text;
  final String relativeTime;
  final String source;
  final String profileUrl;

  factory VenueReview.fromJson(Map<String, dynamic> json) => VenueReview(
    author: json['author'] as String? ?? '',
    rating: (json['rating'] as num?)?.toDouble() ?? 0,
    text: json['text'] as String? ?? '',
    relativeTime: json['relative_time'] as String? ?? '',
    source: json['source'] as String? ?? '',
    profileUrl: json['profile_url'] as String? ?? '',
  );
}

class VenuePlaces {
  VenuePlaces({
    required this.source,
    this.googlePlaceId = '',
    required this.rating,
    required this.reviewCount,
    required this.photoUrls,
    required this.reviews,
    required this.liveGoogle,
  });

  final String source;
  final String googlePlaceId;
  final double rating;
  final int reviewCount;
  final List<String> photoUrls;
  final List<VenueReview> reviews;
  final bool liveGoogle;

  factory VenuePlaces.fromJson(Map<String, dynamic> json) => VenuePlaces(
    source: json['source'] as String? ?? 'local',
    googlePlaceId: json['google_place_id'] as String? ?? '',
    rating: (json['rating'] as num?)?.toDouble() ?? 0,
    reviewCount: (json['review_count'] as num?)?.toInt() ?? 0,
    photoUrls: (json['photo_urls'] as List<dynamic>? ?? [])
        .map((e) => e.toString())
        .toList(),
    reviews: (json['reviews'] as List<dynamic>? ?? [])
        .map((e) => VenueReview.fromJson(e as Map<String, dynamic>))
        .toList(),
    liveGoogle: json['live_google'] as bool? ?? false,
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
    this.reviewCount = 0,
    required this.priceLevel,
    required this.address,
    required this.lat,
    required this.lng,
    required this.averageCheck,
    required this.openNow,
    required this.freeTables,
    required this.imageUrl,
    this.photoUrls = const [],
    this.phone = '',
    this.website = '',
    this.hoursText = '',
    this.reviews = const [],
    this.alcoholLicenseValid = false,
    this.sessionStartBeforeMin = 60,
    this.releaseBeforeMin = 15,
    this.bookingIntervalMin = 30,
    this.holdMinutes = 15,
    this.maxLateArrivalMin = 30,
    this.visitDurationMin = 90,
    this.maxVisitDurationMin = 180,
    this.allowPreorder = true,
    this.preorderLeadMin = 30,
  });

  final String id;
  final String cityId;
  final LocalizedString name;
  final LocalizedString description;
  final List<String> cuisine;
  final double rating;
  final int reviewCount;
  final int priceLevel;
  final LocalizedString address;
  final double lat;
  final double lng;
  final int averageCheck;
  final bool openNow;
  final int freeTables;
  final String imageUrl;
  final List<String> photoUrls;
  final String phone;
  final String website;
  final String hoursText;
  final List<VenueReview> reviews;
  final bool alcoholLicenseValid;
  final int sessionStartBeforeMin;
  final int releaseBeforeMin;
  final int bookingIntervalMin;
  final int holdMinutes;
  final int maxLateArrivalMin;
  final int visitDurationMin;
  final int maxVisitDurationMin;
  final bool allowPreorder;
  final int preorderLeadMin;

  List<String> get galleryUrls {
    final out = <String>[];
    if (imageUrl.trim().isNotEmpty) out.add(imageUrl.trim());
    for (final u in photoUrls) {
      final t = u.trim();
      if (t.isNotEmpty && !out.contains(t)) out.add(t);
    }
    return out;
  }

  factory Venue.fromJson(Map<String, dynamic> json) => Venue(
    id: json['id'] as String,
    cityId: json['city_id'] as String? ?? '',
    name: LocalizedString.fromJson(json['name']),
    description: LocalizedString.fromJson(json['description']),
    cuisine: (json['cuisine'] as List<dynamic>? ?? [])
        .map((e) => e.toString())
        .toList(),
    rating: (json['rating'] as num?)?.toDouble() ?? 0,
    reviewCount: (json['review_count'] as num?)?.toInt() ?? 0,
    priceLevel: (json['price_level'] as num?)?.toInt() ?? 1,
    address: LocalizedString.fromJson(json['address']),
    lat: (json['lat'] as num?)?.toDouble() ?? 0,
    lng: (json['lng'] as num?)?.toDouble() ?? 0,
    averageCheck: (json['average_check'] as num?)?.toInt() ?? 0,
    openNow: json['open_now'] as bool? ?? false,
    freeTables: (json['free_tables'] as num?)?.toInt() ?? 0,
    imageUrl: json['image_url'] as String? ?? '',
    photoUrls: (json['photo_urls'] as List<dynamic>? ?? [])
        .map((e) => e.toString())
        .toList(),
    phone: json['phone'] as String? ?? '',
    website: json['website'] as String? ?? '',
    hoursText: json['hours_text'] as String? ?? '',
    reviews: (json['reviews'] as List<dynamic>? ?? [])
        .map((e) => VenueReview.fromJson(e as Map<String, dynamic>))
        .toList(),
    alcoholLicenseValid: json['alcohol_license_valid'] as bool? ?? false,
    sessionStartBeforeMin:
        (json['session_start_before_min'] as num?)?.toInt() ?? 60,
    releaseBeforeMin: (json['release_before_min'] as num?)?.toInt() ?? 15,
    bookingIntervalMin:
        (json['booking_interval_min'] as num?)?.toInt() ?? 30,
    holdMinutes: (json['hold_minutes'] as num?)?.toInt() ?? 15,
    maxLateArrivalMin:
        (json['max_late_arrival_min'] as num?)?.toInt() ?? 30,
    visitDurationMin: (json['visit_duration_min'] as num?)?.toInt() ?? 90,
    maxVisitDurationMin:
        (json['max_visit_duration_min'] as num?)?.toInt() ?? 180,
    allowPreorder: json['allow_preorder'] as bool? ?? true,
    preorderLeadMin: (json['preorder_lead_min'] as num?)?.toInt() ?? 30,
  );

  String priceLabel() => '€' * priceLevel.clamp(1, 3);
}

class MapPlace {
  MapPlace({
    required this.id,
    required this.name,
    required this.lat,
    required this.lng,
    required this.address,
    this.rating,
    this.inDatabase = false,
    this.bookable = false,
    this.venueId,
    this.freeTables = 0,
    this.openNow,
    this.cuisine = const [],
    this.priceLevel,
    this.averageCheck,
    this.website,
    this.phone,
    this.openingHours,
    this.category,
    this.sources = const [],
  });

  final String id;
  final LocalizedString name;
  final double lat;
  final double lng;
  final LocalizedString address;
  final double? rating;
  final bool inDatabase;
  final bool bookable;
  final String? venueId;
  final int freeTables;
  final bool? openNow;
  final List<String> cuisine;
  final int? priceLevel;
  final int? averageCheck;
  final String? website;
  final String? phone;
  final String? openingHours;
  final String? category;
  final List<String> sources;

  factory MapPlace.fromJson(Map<String, dynamic> json) => MapPlace(
    id: json['id'] as String? ?? '',
    name: LocalizedString.fromJson(json['name']),
    lat: (json['lat'] as num?)?.toDouble() ?? 0,
    lng: (json['lng'] as num?)?.toDouble() ?? 0,
    address: LocalizedString.fromJson(json['address']),
    rating: (json['rating'] as num?)?.toDouble(),
    inDatabase: json['in_database'] as bool? ?? false,
    bookable: json['bookable'] as bool? ?? false,
    venueId: json['venue_id'] as String?,
    freeTables: (json['free_tables'] as num?)?.toInt() ?? 0,
    openNow: json['open_now'] as bool?,
    cuisine: (json['cuisine'] as List<dynamic>? ?? [])
        .map((e) => e.toString())
        .toList(),
    priceLevel: (json['price_level'] as num?)?.toInt(),
    averageCheck: (json['average_check'] as num?)?.toInt(),
    website: json['website'] as String?,
    phone: json['phone'] as String?,
    openingHours:
        (json['opening_hours'] ?? json['hours_text']) as String?,
    category: json['category'] as String?,
    sources: (json['sources'] as List<dynamic>? ?? [])
        .map((e) => e.toString())
        .toList(),
  );
}

class MapPlacesResponse {
  MapPlacesResponse({
    required this.cityId,
    required this.country,
    required this.center,
    required this.bounds,
    required this.places,
    required this.databaseCount,
    required this.openDataCount,
    required this.attribution,
    this.matchedCount,
    this.totalCount,
  });

  final String cityId;
  final String country;
  final MapCoordinates center;
  final MapBounds bounds;
  final List<MapPlace> places;
  final int databaseCount;
  final int openDataCount;
  final String attribution;
  final int? matchedCount;
  final int? totalCount;

  factory MapPlacesResponse.fromJson(Map<String, dynamic> json) {
    final source = json['source'] as Map<String, dynamic>? ?? {};
    final filters = json['filters'] as Map<String, dynamic>?;
    return MapPlacesResponse(
      cityId: json['city_id'] as String? ?? '',
      country: json['country'] as String? ?? 'MD',
      center: MapCoordinates.fromJson(
        json['center'] as Map<String, dynamic>? ?? {},
      ),
      bounds: MapBounds.fromJson(
        json['bounds'] as Map<String, dynamic>? ?? {},
      ),
      places: (json['places'] as List<dynamic>? ?? [])
          .map((e) => MapPlace.fromJson(e as Map<String, dynamic>))
          .toList(),
      databaseCount: (source['database_count'] as num?)?.toInt() ?? 0,
      openDataCount: (source['open_data_count'] as num?)?.toInt() ?? 0,
      attribution: source['attribution'] as String? ?? '',
      matchedCount: (filters?['matched'] as num?)?.toInt(),
      totalCount: (filters?['total'] as num?)?.toInt(),
    );
  }
}

class MapConfig {
  MapConfig({
    required this.cities,
    required this.countryBounds,
  });

  final List<City> cities;
  final MapBounds countryBounds;

  factory MapConfig.fromJson(Map<String, dynamic> json) => MapConfig(
    cities: (json['cities'] as List<dynamic>? ?? [])
        .map((e) => City.fromJson(e as Map<String, dynamic>))
        .toList(),
    countryBounds: MapBounds.fromJson(
      json['country_bounds'] as Map<String, dynamic>? ?? {},
    ),
  );
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
    this.zone = 'hall',
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
  final String zone;

  factory VenueTable.fromJson(Map<String, dynamic> json) => VenueTable(
    id: json['id'] as String,
    venueId: json['venue_id'] as String? ?? '',
    number: (json['number'] as num?)?.toInt() ?? 0,
    seats: (json['seats'] as num?)?.toInt() ?? 0,
    status: json['status'] as String? ?? 'FREE',
    occupiedSince: _parseTime(json['occupied_since']),
    reservedFor: _parseTime(json['reserved_for']),
    reservationId: json['reservation_id'] as String?,
    x: (json['x'] as num?)?.toDouble() ?? 0.5,
    y: (json['y'] as num?)?.toDouble() ?? 0.5,
    zone: _normalizeZone(json['zone'] as String?),
  );
}

class VenueScheduleSlot {
  VenueScheduleSlot({
    required this.id,
    required this.tableId,
    required this.tableNumber,
    required this.startsAt,
    required this.endsAt,
    required this.kind,
  });

  final String id;
  final String tableId;
  final int tableNumber;
  final DateTime startsAt;
  final DateTime endsAt;
  final String kind;

  factory VenueScheduleSlot.fromJson(Map<String, dynamic> json) =>
      VenueScheduleSlot(
        id: json['id'] as String? ?? '',
        tableId: json['table_id'] as String? ?? '',
        tableNumber: (json['table_number'] as num?)?.toInt() ?? 0,
        startsAt: _parseTime(json['starts_at']) ?? DateTime.now(),
        endsAt: _parseTime(json['ends_at']) ?? DateTime.now(),
        kind: json['kind'] as String? ?? 'RESERVATION',
      );
}

class ApiAvailabilitySlot {
  ApiAvailabilitySlot({
    required this.startsAt,
    required this.tableId,
    required this.tableNumber,
  });

  final DateTime startsAt;
  final String tableId;
  final int tableNumber;

  factory ApiAvailabilitySlot.fromJson(Map<String, dynamic> json) =>
      ApiAvailabilitySlot(
        startsAt: _parseTime(json['starts_at']) ?? DateTime.now(),
        tableId: json['table_id'] as String? ?? '',
        tableNumber: (json['table_number'] as num?)?.toInt() ?? 0,
      );
}

class ApiVenueAvailability {
  ApiVenueAvailability({
    required this.venueId,
    required this.durationMin,
    required this.fits,
    required this.exact,
    required this.slots,
    required this.laterToday,
  });

  final String venueId;
  final int durationMin;
  final bool fits;
  final bool exact;
  final List<ApiAvailabilitySlot> slots;
  final List<ApiAvailabilitySlot> laterToday;

  factory ApiVenueAvailability.fromJson(Map<String, dynamic> json) =>
      ApiVenueAvailability(
        venueId: json['venue_id'] as String? ?? '',
        durationMin: (json['duration_min'] as num?)?.toInt() ?? 90,
        fits: json['fits'] as bool? ?? false,
        exact: json['exact'] as bool? ?? false,
        slots: (json['slots'] as List<dynamic>? ?? [])
            .map((e) => ApiAvailabilitySlot.fromJson(e as Map<String, dynamic>))
            .toList(),
        laterToday: (json['later_today'] as List<dynamic>? ?? [])
            .map((e) => ApiAvailabilitySlot.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

String _normalizeZone(String? zone) {
  final raw = (zone ?? 'hall').trim().toLowerCase();
  switch (raw) {
    case '':
    case 'зал':
    case 'hall':
    case 'indoor':
    case 'main':
      return 'hall';
    case 'улица':
    case 'street':
    case 'outside':
      return 'street';
    case 'терраса':
    case 'terrace':
    case 'patio':
    case 'веранда':
      return 'terrace';
    case 'сад':
    case 'garden':
      return 'garden';
    case 'бар':
    case 'bar':
      return 'bar';
    default:
      return raw.replaceAll(RegExp(r'[^a-z0-9_-]'), '');
  }
}

String zoneLabel(String zone, String locale) {
  switch (_normalizeZone(zone)) {
    case 'hall':
      return locale == 'en'
          ? 'Hall'
          : locale == 'ro'
          ? 'Sală'
          : 'Зал';
    case 'street':
      return locale == 'en'
          ? 'Street'
          : locale == 'ro'
          ? 'Stradă'
          : 'Улица';
    case 'terrace':
      return locale == 'en'
          ? 'Terrace'
          : locale == 'ro'
          ? 'Terasă'
          : 'Терраса';
    case 'garden':
      return locale == 'en'
          ? 'Garden'
          : locale == 'ro'
          ? 'Grădină'
          : 'Сад';
    case 'bar':
      return locale == 'ru' ? 'Бар' : 'Bar';
    default:
      final z = _normalizeZone(zone);
      if (z.isEmpty) {
        return locale == 'en'
            ? 'Hall'
            : locale == 'ro'
            ? 'Sală'
            : 'Зал';
      }
      return z[0].toUpperCase() + z.substring(1);
  }
}

List<String> zonesFromTables(List<VenueTable> tables) {
  const order = ['hall', 'terrace', 'street', 'garden', 'bar'];
  final seen = <String>{};
  for (final t in tables) {
    seen.add(_normalizeZone(t.zone));
  }
  if (seen.isEmpty) seen.add('hall');
  final ordered = order.where(seen.contains).toList();
  final custom = seen.where((z) => !order.contains(z)).toList()..sort();
  return [...ordered, ...custom];
}

class AdultVerification {
  AdultVerification({
    this.verifiedAt,
    required this.verifiedByStaffId,
    required this.verifiedByStaffRole,
    required this.verifiedByStaffDisplayName,
    required this.verifiedAtVenueId,
    this.idDocumentChecked = false,
    this.idDocumentType = '',
    this.revokedAt,
  });

  final DateTime? verifiedAt;
  final String verifiedByStaffId;
  final String verifiedByStaffRole;
  final String verifiedByStaffDisplayName;
  final String verifiedAtVenueId;
  final bool idDocumentChecked;
  final String idDocumentType;
  final DateTime? revokedAt;

  factory AdultVerification.fromJson(Map<String, dynamic> json) =>
      AdultVerification(
        verifiedAt: _parseTime(json['verified_at']),
        verifiedByStaffId: json['verified_by_staff_id'] as String? ?? '',
        verifiedByStaffRole: json['verified_by_staff_role'] as String? ?? '',
        verifiedByStaffDisplayName:
            json['verified_by_staff_display_name'] as String? ?? '',
        verifiedAtVenueId: json['verified_at_venue_id'] as String? ?? '',
        idDocumentChecked: json['id_document_checked'] as bool? ?? false,
        idDocumentType: json['id_document_type'] as String? ?? '',
        revokedAt: _parseTime(json['revoked_at']),
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
    this.role = 'guest',
    this.dietPreferences = const [],
    this.favoriteVenues = const [],
    this.avatarUrl = '',
    this.hasPassword = true,
    this.adultPreorderAllowed = false,
    this.adultVerification,
    this.createdAt,
  });

  final String id;
  final String email;
  final String? phone;
  final String firstName;
  final String lastName;
  final String displayName;
  final String locale;
  final String role;
  final List<String> dietPreferences;
  final List<String> favoriteVenues;
  final String avatarUrl;
  final bool hasPassword;
  final bool adultPreorderAllowed;
  final AdultVerification? adultVerification;
  final DateTime? createdAt;

  factory User.fromJson(Map<String, dynamic> json) => User(
    id: json['id'] as String,
    email: json['email'] as String? ?? '',
    phone: json['phone'] as String?,
    firstName: json['first_name'] as String? ?? '',
    lastName: json['last_name'] as String? ?? '',
    displayName: json['display_name'] as String? ?? '',
    locale: json['locale'] as String? ?? 'ru',
    role: json['role'] as String? ?? 'guest',
    dietPreferences: (json['diet_preferences'] as List<dynamic>? ?? [])
        .map((e) => e.toString())
        .toList(),
    favoriteVenues: (json['favorite_venues'] as List<dynamic>? ?? [])
        .map((e) => e.toString())
        .toList(),
    avatarUrl: json['avatar_url'] as String? ?? '',
    hasPassword: json['has_password'] as bool? ?? true,
    adultPreorderAllowed: json['adult_preorder_allowed'] as bool? ?? false,
    adultVerification: json['adult_verification'] is Map<String, dynamic>
        ? AdultVerification.fromJson(
            json['adult_verification'] as Map<String, dynamic>,
          )
        : null,
    createdAt: _parseTime(json['created_at']),
  );
}

class AuthProviders {
  AuthProviders({required this.googleEnabled, required this.googleClientId});
  final bool googleEnabled;
  final String googleClientId;

  factory AuthProviders.fromJson(Map<String, dynamic> json) {
    final g = json['google'] as Map<String, dynamic>? ?? {};
    return AuthProviders(
      googleEnabled: g['enabled'] as bool? ?? false,
      googleClientId: g['client_id'] as String? ?? '',
    );
  }
}

class ConnectedIdentity {
  ConnectedIdentity({
    required this.provider,
    required this.email,
    this.createdAt,
  });

  final String provider;
  final String email;
  final DateTime? createdAt;

  factory ConnectedIdentity.fromJson(Map<String, dynamic> json) =>
      ConnectedIdentity(
        provider: json['provider'] as String? ?? 'google',
        email: json['email'] as String? ?? '',
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
    this.tableIds = const [],
    this.tableNumbers = const [],
    required this.guests,
    required this.reservedFor,
    this.durationMin = 90,
    required this.status,
    this.notes = '',
    this.source = 'ANDROID',
    this.arrivalConfirmedAt,
    this.expectedArrival,
    this.createdAt,
    this.preorder,
    this.venueName,
    this.tableNumber = 0,
  });

  final String id;
  final String userId;
  final String venueId;
  final String tableId;
  final List<String> tableIds;
  final List<int> tableNumbers;
  final int guests;
  final DateTime reservedFor;
  final int durationMin;
  final String status;
  final String notes;
  final String source;
  final DateTime? arrivalConfirmedAt;
  final DateTime? expectedArrival;
  final DateTime? createdAt;
  final Order? preorder;
  final LocalizedString? venueName;
  final int tableNumber;

  factory Reservation.fromJson(Map<String, dynamic> json) => Reservation(
    id: json['id'] as String,
    userId: json['user_id'] as String? ?? '',
    venueId: json['venue_id'] as String? ?? '',
    tableId: json['table_id'] as String? ?? '',
    tableIds: (json['table_ids'] as List<dynamic>? ?? [])
        .map((e) => e.toString())
        .toList(),
    tableNumbers: (json['table_numbers'] as List<dynamic>? ?? [])
        .map((e) => (e as num).toInt())
        .toList(),
    guests: (json['guests'] as num?)?.toInt() ?? 1,
    reservedFor: _parseTime(json['reserved_for']) ?? DateTime.now(),
    durationMin: (json['duration_min'] as num?)?.toInt() ?? 90,
    status: json['status'] as String? ?? '',
    notes: json['notes'] as String? ?? '',
    source: json['source'] as String? ?? '',
    arrivalConfirmedAt: _parseTime(json['arrival_confirmed_at']),
    expectedArrival: _parseTime(json['expected_arrival']),
    createdAt: _parseTime(json['created_at']),
    preorder: json['preorder'] is Map<String, dynamic>
        ? Order.fromJson(json['preorder'] as Map<String, dynamic>)
        : null,
    venueName: json['venue_name'] != null
        ? LocalizedString.fromJson(json['venue_name'])
        : null,
    tableNumber: (json['table_number'] as num?)?.toInt() ?? 0,
  );
}

class EventInquiry {
  EventInquiry({
    required this.id,
    required this.userId,
    required this.venueId,
    this.venueName,
    required this.eventType,
    required this.guestCount,
    required this.preferredDate,
    required this.contactMethod,
    required this.contactPhone,
    required this.contactName,
    this.notes = '',
    required this.status,
    this.adminPhone,
    this.adminTelegram,
    this.createdAt,
  });

  final String id;
  final String userId;
  final String venueId;
  final LocalizedString? venueName;
  final String eventType;
  final int guestCount;
  final DateTime preferredDate;
  final String contactMethod;
  final String contactPhone;
  final String contactName;
  final String notes;
  final String status;
  final String? adminPhone;
  final String? adminTelegram;
  final DateTime? createdAt;

  factory EventInquiry.fromJson(Map<String, dynamic> json) => EventInquiry(
    id: json['id'] as String? ?? '',
    userId: json['user_id'] as String? ?? '',
    venueId: json['venue_id'] as String? ?? '',
    venueName: json['venue_name'] != null
        ? LocalizedString.fromJson(json['venue_name'])
        : null,
    eventType: json['event_type'] as String? ?? 'other',
    guestCount: (json['guest_count'] as num?)?.toInt() ?? 1,
    preferredDate: _parseTime(json['preferred_date']) ?? DateTime.now(),
    contactMethod: json['contact_method'] as String? ?? 'call',
    contactPhone: json['contact_phone'] as String? ?? '',
    contactName: json['contact_name'] as String? ?? '',
    notes: json['notes'] as String? ?? '',
    status: json['status'] as String? ?? 'PENDING',
    adminPhone: json['admin_phone'] as String?,
    adminTelegram: json['admin_telegram'] as String?,
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

  bool get isActive => status == 'ACTIVE';

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
    this.ingredients,
    this.allergens = const [],
    required this.price,
    this.weightG,
    this.volumeMl,
    this.imageUrl = '',
    required this.containsAlcohol,
    this.requiresAge18 = false,
    this.tags = const [],
    this.position = 0,
    this.stopped = false,
    this.orderable = true,
    this.blockedReason,
  });

  final String id;
  final String venueId;
  final LocalizedString category;
  final LocalizedString name;
  final LocalizedString description;
  final LocalizedString? ingredients;
  final List<String> allergens;
  final int price;
  final int? weightG;
  final int? volumeMl;
  final String imageUrl;
  final bool containsAlcohol;
  final bool requiresAge18;
  final List<String> tags;
  final int position;
  final bool stopped;
  final bool orderable;
  final String? blockedReason;

  bool get is18Plus => requiresAge18 || containsAlcohol;

  factory MenuItem.fromJson(Map<String, dynamic> json) => MenuItem(
    id: json['id'] as String,
    venueId: json['venue_id'] as String? ?? '',
    category: LocalizedString.fromJson(json['category']),
    name: LocalizedString.fromJson(json['name']),
    description: LocalizedString.fromJson(json['description']),
    ingredients: json['ingredients'] != null
        ? LocalizedString.fromJson(json['ingredients'])
        : null,
    allergens: (json['allergens'] as List<dynamic>? ?? [])
        .map((e) => e.toString())
        .toList(),
    price: (json['price'] as num?)?.toInt() ?? 0,
    weightG: (json['weight_g'] as num?)?.toInt(),
    volumeMl: (json['volume_ml'] as num?)?.toInt(),
    imageUrl: json['image_url'] as String? ?? '',
    containsAlcohol: json['contains_alcohol'] as bool? ?? false,
    requiresAge18: json['requires_age_18'] as bool? ?? false,
    tags: (json['tags'] as List<dynamic>? ?? [])
        .map((e) => e.toString())
        .toList(),
    position: (json['position'] as num?)?.toInt() ?? 0,
    stopped: json['stopped'] as bool? ?? false,
    orderable: json['orderable'] as bool? ?? !(json['stopped'] as bool? ?? false),
    blockedReason: json['blocked_reason'] as String?,
  );
}

class OrderItem {
  OrderItem({
    required this.menuItemId,
    required this.name,
    required this.qty,
    required this.price,
    this.requiresAge18 = false,
    this.containsAlcohol = false,
    this.ageCheck,
    this.unavailable = false,
  });

  final String menuItemId;
  final LocalizedString name;
  final int qty;
  final int price;
  final bool requiresAge18;
  final bool containsAlcohol;
  final String? ageCheck;
  final bool unavailable;

  factory OrderItem.fromJson(Map<String, dynamic> json) => OrderItem(
    menuItemId: json['menu_item_id'] as String? ?? '',
    name: LocalizedString.fromJson(json['name']),
    qty: (json['qty'] as num?)?.toInt() ?? 1,
    price: (json['price'] as num?)?.toInt() ?? 0,
    requiresAge18: json['requires_age_18'] as bool? ?? false,
    containsAlcohol: json['contains_alcohol'] as bool? ?? false,
    ageCheck: json['age_check'] as String?,
    unavailable: json['unavailable'] as bool? ?? false,
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
    this.checkNumber,
    this.paymentMethod,
    this.paidAt,
    this.venueName,
    this.preorder = false,
    this.reservationId,
    this.kitchenAt,
    this.kitchenDue = false,
    this.adultItemsRemovedAt,
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
  final String? checkNumber;
  final String? paymentMethod;
  final DateTime? paidAt;
  final LocalizedString? venueName;
  final bool preorder;
  final String? reservationId;
  final DateTime? kitchenAt;
  final bool kitchenDue;
  final DateTime? adultItemsRemovedAt;

  factory Order.fromJson(Map<String, dynamic> json) => Order(
    id: json['id'] as String,
    sessionId: json['session_id'] as String? ?? '',
    userId: json['user_id'] as String? ?? '',
    venueId: json['venue_id'] as String? ?? '',
    items: (json['items'] as List<dynamic>? ?? [])
        .map((e) => OrderItem.fromJson(e as Map<String, dynamic>))
        .toList(),
    status: json['status'] as String? ?? '',
    total: (json['total'] as num?)?.toInt() ?? 0,
    createdAt: _parseTime(json['created_at']),
    updatedAt: _parseTime(json['updated_at']),
    checkNumber: json['check_number'] as String?,
    paymentMethod: json['payment_method'] as String?,
    paidAt: _parseTime(json['paid_at']),
    venueName: json['venue_name'] != null
        ? LocalizedString.fromJson(json['venue_name'])
        : null,
    preorder: json['preorder'] as bool? ?? false,
    reservationId: json['reservation_id'] as String?,
    kitchenAt: _parseTime(json['kitchen_at']),
    kitchenDue: json['kitchen_due'] as bool? ?? false,
    adultItemsRemovedAt: _parseTime(json['adult_items_removed_at']),
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

class DiscoverAiPrefs {
  const DiscoverAiPrefs({
    this.cuisine = const [],
    this.restaurantType = const [],
    this.budgetMin,
    this.budgetMax,
    this.occasion = const [],
    this.practical = const [],
  });

  final List<String> cuisine;
  final List<String> restaurantType;
  final int? budgetMin;
  final int? budgetMax;
  final List<String> occasion;
  final List<String> practical;

  bool get isEmpty =>
      cuisine.isEmpty &&
      restaurantType.isEmpty &&
      budgetMin == null &&
      budgetMax == null &&
      occasion.isEmpty &&
      practical.isEmpty;

  Map<String, dynamic> toJson() => {
    'cuisine': cuisine,
    'restaurant_type': restaurantType,
    if (budgetMin != null && budgetMax != null)
      'budget': {'min': budgetMin, 'max': budgetMax},
    'occasion': occasion,
    'practical': practical,
  };

  factory DiscoverAiPrefs.fromJson(Map<String, dynamic> json) {
    final b = json['budget'] as Map<String, dynamic>?;
    return DiscoverAiPrefs(
      cuisine: (json['cuisine'] as List<dynamic>? ?? [])
          .map((e) => e.toString())
          .toList(),
      restaurantType: (json['restaurant_type'] as List<dynamic>? ?? [])
          .map((e) => e.toString())
          .toList(),
      budgetMin: (b?['min'] as num?)?.toInt(),
      budgetMax: (b?['max'] as num?)?.toInt(),
      occasion: (json['occasion'] as List<dynamic>? ?? [])
          .map((e) => e.toString())
          .toList(),
      practical: (json['practical'] as List<dynamic>? ?? [])
          .map((e) => e.toString())
          .toList(),
    );
  }
}

class DiscoverRankedItem {
  DiscoverRankedItem({
    required this.venueId,
    required this.score,
    required this.reasons,
  });

  final String venueId;
  final double score;
  final List<String> reasons;

  factory DiscoverRankedItem.fromJson(Map<String, dynamic> json) =>
      DiscoverRankedItem(
        venueId: json['venue_id'] as String? ?? '',
        score: (json['score'] as num?)?.toDouble() ?? 0,
        reasons: (json['reasons'] as List<dynamic>? ?? [])
            .map((e) => e.toString())
            .toList(),
      );
}

class DiscoverResult {
  DiscoverResult({
    required this.venues,
    this.ranked = const [],
    this.prefs,
    this.queryString = '',
    this.exact = true,
    this.source = 'rules',
    this.explanation = '',
  });

  final List<Venue> venues;
  final List<DiscoverRankedItem> ranked;
  final DiscoverAiPrefs? prefs;
  final String queryString;
  final bool exact;
  final String source;
  final String explanation;

  factory DiscoverResult.fromJson(
    Map<String, dynamic> json, {
    String locale = 'ru',
  }) {
    final rawExp = json['explanation'];
    final explanation = rawExp is Map<String, dynamic>
        ? LocalizedString.fromJson(rawExp).pick(locale)
        : (rawExp as String? ?? '');
    return DiscoverResult(
      venues: (json['venues'] as List<dynamic>? ?? [])
          .map((e) => Venue.fromJson(e as Map<String, dynamic>))
          .toList(),
      ranked: (json['ranked'] as List<dynamic>? ?? [])
          .map((e) => DiscoverRankedItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      prefs: json['prefs'] is Map<String, dynamic>
          ? DiscoverAiPrefs.fromJson(json['prefs'] as Map<String, dynamic>)
          : null,
      queryString: json['query_string'] as String? ?? '',
      exact: json['exact'] as bool? ?? true,
      source: json['source'] as String? ?? 'rules',
      explanation: explanation,
    );
  }
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

class WaitlistEntry {
  WaitlistEntry({
    required this.id,
    required this.venueId,
    required this.guestName,
    required this.guests,
    required this.status,
    required this.createdAt,
    this.zone = '',
    this.position = 0,
    this.quotedWaitMin = 0,
    this.tableNumber = 0,
    this.venueName,
  });

  final String id;
  final String venueId;
  final String guestName;
  final int guests;
  final String status;
  final DateTime? createdAt;
  final String zone;
  final int position;
  final int quotedWaitMin;
  final int tableNumber;
  final LocalizedString? venueName;

  bool get isActive => status == 'WAITING' || status == 'READY';
  bool get isReady => status == 'READY';

  factory WaitlistEntry.fromJson(Map<String, dynamic> json) => WaitlistEntry(
    id: json['id'] as String,
    venueId: json['venue_id'] as String? ?? '',
    guestName: json['guest_name'] as String? ?? '',
    guests: (json['guests'] as num?)?.toInt() ?? 0,
    status: json['status'] as String? ?? '',
    createdAt: _parseTime(json['created_at']),
    zone: json['zone'] as String? ?? '',
    position: (json['position'] as num?)?.toInt() ?? 0,
    quotedWaitMin: (json['quoted_wait_min'] as num?)?.toInt() ?? 0,
    tableNumber: (json['table_number'] as num?)?.toInt() ?? 0,
    venueName: json['venue_name'] == null
        ? null
        : LocalizedString.fromJson(json['venue_name']),
  );
}

class WaitlistSummary {
  WaitlistSummary({
    required this.waiting,
    required this.quotedWaitMin,
    required this.freeTables,
  });

  final int waiting;
  final int quotedWaitMin;
  final int freeTables;

  factory WaitlistSummary.fromJson(Map<String, dynamic> json) =>
      WaitlistSummary(
        waiting: (json['waiting'] as num?)?.toInt() ?? 0,
        quotedWaitMin: (json['quoted_wait_min'] as num?)?.toInt() ?? 0,
        freeTables: (json['free_tables'] as num?)?.toInt() ?? 0,
      );
}

class AppNotification {
  AppNotification({
    required this.id,
    required this.userId,
    required this.kind,
    this.venueId,
    this.venueName,
    this.reservationId,
    this.orderId,
    this.at,
    this.createdAt,
    this.readAt,
  });

  final String id;
  final String userId;
  final String kind;
  final String? venueId;
  final LocalizedString? venueName;
  final String? reservationId;
  final String? orderId;
  final DateTime? at;
  final DateTime? createdAt;
  final DateTime? readAt;

  bool get isUnread => readAt == null;

  factory AppNotification.fromJson(Map<String, dynamic> json) =>
      AppNotification(
        id: json['id'] as String? ?? '',
        userId: json['user_id'] as String? ?? '',
        kind: json['kind'] as String? ?? '',
        venueId: json['venue_id'] as String?,
        venueName: json['venue_name'] != null
            ? LocalizedString.fromJson(json['venue_name'])
            : null,
        reservationId: json['reservation_id'] as String?,
        orderId: json['order_id'] as String?,
        at: _parseTime(json['at']),
        createdAt: _parseTime(json['created_at']),
        readAt: _parseTime(json['read_at']),
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

String formatDateTime(DateTime? dt) {
  if (dt == null) return '—';
  final d = dt.day.toString().padLeft(2, '0');
  final mo = dt.month.toString().padLeft(2, '0');
  return '$d.$mo.${dt.year} ${formatClock(dt)}';
}

class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  @visibleForTesting
  static http.Client? testHttpClient;

  static http.Client get _client => testHttpClient ?? http.Client();

  static const _secureStorage = FlutterSecureStorage(
    aOptions: AndroidOptions(),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );

  String? _cachedToken;
  VoidCallback? onUnauthorized;
  final ValueNotifier<int> authVersion = ValueNotifier<int>(0);

  Future<String?> getToken() async {
    if (_cachedToken != null) return _cachedToken;
    try {
      final secure = await _secureStorage.read(key: tokenKey);
      if (secure != null && secure.isNotEmpty) {
        _cachedToken = secure;
        return secure;
      }
      // One-time migration from legacy SharedPreferences storage.
      final prefs = await SharedPreferences.getInstance();
      final legacy = prefs.getString(tokenKey);
      if (legacy != null && legacy.isNotEmpty) {
        await _secureStorage.write(key: tokenKey, value: legacy);
        await prefs.remove(tokenKey);
        _cachedToken = legacy;
        return legacy;
      }
    } catch (_) {
      final prefs = await SharedPreferences.getInstance();
      final fallback = prefs.getString(tokenKey);
      _cachedToken = fallback;
      return fallback;
    }
    return null;
  }

  Future<void> setToken(String? token) async {
    final normalized = (token == null || token.isEmpty) ? null : token;
    _cachedToken = normalized;
    try {
      if (normalized == null) {
        await _secureStorage.delete(key: tokenKey);
      } else {
        await _secureStorage.write(key: tokenKey, value: normalized);
      }
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(tokenKey);
    } catch (_) {
      final prefs = await SharedPreferences.getInstance();
      if (normalized == null) {
        await prefs.remove(tokenKey);
      } else {
        await prefs.setString(tokenKey, normalized);
      }
    }
    authVersion.value++;
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

  Future<String?> getActiveSessionId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(activeSessionKey);
  }

  Future<void> setActiveSessionId(String? id) async {
    final prefs = await SharedPreferences.getInstance();
    if (id == null || id.isEmpty) {
      await prefs.remove(activeSessionKey);
    } else {
      await prefs.setString(activeSessionKey, id);
    }
  }

  Future<int> getGuestDiscoverAiCountToday() async {
    final prefs = await SharedPreferences.getInstance();
    final today = DateTime.now().toIso8601String().substring(0, 10);
    if (prefs.getString(discoverAiGuestDateKey) != today) {
      await prefs.setString(discoverAiGuestDateKey, today);
      await prefs.setInt(discoverAiGuestCountKey, 0);
      return 0;
    }
    return prefs.getInt(discoverAiGuestCountKey) ?? 0;
  }

  Future<int> incrementGuestDiscoverAiCountToday() async {
    final current = await getGuestDiscoverAiCountToday();
    final prefs = await SharedPreferences.getInstance();
    final next = current + 1;
    await prefs.setInt(discoverAiGuestCountKey, next);
    return next;
  }

  Future<List<String>> getLocalPaymentPreviews() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getStringList(localPaymentsKey) ?? [];
  }

  Future<void> setLocalPaymentPreviews(List<String> items) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(localPaymentsKey, items);
  }

  Future<Map<String, dynamic>> _request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    Map<String, String>? query,
    bool auth = false,
  }) async {
    final uri = Uri.parse('$apiBaseUrl$path').replace(
      queryParameters: query == null || query.isEmpty ? null : query,
    );
    final headers = <String, String>{'Accept': 'application/json'};
    if (body != null) headers['Content-Type'] = 'application/json';
    if (auth) {
      final token = await getToken();
      if (token != null && token.isNotEmpty) {
        headers['Authorization'] = 'Bearer $token';
      }
    }

    late http.Response response;
    final encoded = body == null ? null : jsonEncode(body);
    final client = _client;
    try {
      switch (method) {
        case 'POST':
          response = await client
              .post(uri, headers: headers, body: encoded)
              .timeout(const Duration(seconds: 12));
        case 'PUT':
          response = await client
              .put(uri, headers: headers, body: encoded)
              .timeout(const Duration(seconds: 12));
        case 'PATCH':
          response = await client
              .patch(uri, headers: headers, body: encoded)
              .timeout(const Duration(seconds: 12));
        case 'DELETE':
          response = await client
              .delete(uri, headers: headers, body: encoded)
              .timeout(const Duration(seconds: 12));
        default:
          response = await client
              .get(uri, headers: headers)
              .timeout(const Duration(seconds: 12));
      }
    } finally {
      if (testHttpClient == null) {
        client.close();
      }
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      var code = 'http_${response.statusCode}';
      String? message;
      try {
        final err = jsonDecode(response.body) as Map<String, dynamic>;
        code = err['error'] as String? ?? code;
        message = err['message'] as String?;
      } catch (_) {}
      if (response.statusCode == 401 && auth) {
        await setToken(null);
        await setActiveSessionId(null);
        onUnauthorized?.call();
      }
      throw ApiException(response.statusCode, code, message);
    }

    if (response.body.isEmpty) return {};
    final decoded = jsonDecode(response.body);
    if (decoded is Map<String, dynamic>) return decoded;
    return {};
  }

  Future<List<City>> fetchCities() async {
    final data = await _request('/api/v1/cities');
    final list = data['cities'] as List<dynamic>? ?? [];
    return list.map((e) => City.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<Venue>> fetchVenues({String cityId = 'city-balti'}) async {
    final data = await _request('/api/v1/venues', query: {'city_id': cityId});
    final list = data['venues'] as List<dynamic>? ?? [];
    return list.map((e) => Venue.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<MapConfig> fetchMapConfig() async {
    final data = await _request('/api/v1/map/config');
    return MapConfig.fromJson(data);
  }

  Future<MapPlacesResponse> fetchMapPlaces({
    required String cityId,
    required String locale,
    bool includeGoogle = true,
    MapBounds? bounds,
    String? query,
    bool bookableOnly = false,
    Map<String, String>? filterParams,
    double? nearLat,
    double? nearLng,
  }) async {
    final qp = <String, String>{
      'city_id': cityId,
      'lang': ['ru', 'en', 'ro'].contains(locale) ? locale : 'en',
      'include_google': includeGoogle ? 'true' : 'false',
      if (bookableOnly) 'bookable_only': 'true',
      if (bounds != null)
        'bounds': '${bounds.south},${bounds.west},${bounds.north},${bounds.east}',
      if (query != null && query.trim().isNotEmpty) 'q': query.trim(),
      if (nearLat != null && nearLng != null) 'lat': '$nearLat',
      if (nearLat != null && nearLng != null) 'lng': '$nearLng',
      ...?filterParams,
    };
    final data = await _request('/api/v1/map/places', query: qp);
    return MapPlacesResponse.fromJson(data);
  }

  Future<Venue> fetchVenue(String id) async {
    final data = await _request('/api/v1/venues/$id');
    return Venue.fromJson(data['venue'] as Map<String, dynamic>);
  }

  Future<VenuePlaces> fetchVenuePlaces(String id) async {
    final data = await _request('/api/v1/venues/$id/places');
    return VenuePlaces.fromJson(data);
  }

  Future<List<VenueTable>> fetchTables(String venueId) async {
    final data = await _request('/api/v1/venues/$venueId/tables');
    final list = data['tables'] as List<dynamic>? ?? [];
    return list
        .map((e) => VenueTable.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<VenueScheduleSlot>> fetchVenueSchedule(String venueId) async {
    final data = await _request('/api/v1/venues/$venueId/schedule');
    final list = data['slots'] as List<dynamic>? ?? [];
    return list
        .map((e) => VenueScheduleSlot.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<ApiVenueAvailability>> fetchAvailability({
    String cityId = 'city-balti',
    DateTime? at,
    String? date,
    required int guests,
    required int durationMin,
    int limit = 8,
  }) async {
    final qp = <String, String>{
      'city_id': cityId,
      'guests': '$guests',
      'duration_min': '$durationMin',
      'limit': '$limit',
      if (at != null) 'at': at.toUtc().toIso8601String(),
      if (at == null && date != null && date.isNotEmpty) 'date': date,
    };
    final data = await _request('/api/v1/availability', query: qp);
    final list = data['venues'] as List<dynamic>? ?? [];
    return list
        .map((e) => ApiVenueAvailability.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<MenuItem>> fetchMenu(String venueId) async {
    final data = await _request('/api/v1/venues/$venueId/menu');
    final list = (data['menu'] ?? data['items']) as List<dynamic>? ?? [];
    return list
        .map((e) => MenuItem.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<MenuItem>> fetchPreorderMenu(String venueId) async {
    final data = await _request(
      '/api/v1/me/venues/$venueId/preorder-menu',
      auth: true,
    );
    final list = data['menu'] as List<dynamic>? ?? [];
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

  Future<DiscoverResult> discoverAi({
    required String query,
    String? cityId,
    String? locale,
    DiscoverAiPrefs? prefs,
    List<String>? filters,
  }) async {
    final data = await _request(
      '/api/v1/discover/ai',
      method: 'POST',
      body: {
        'query': query,
        if (cityId != null && cityId.isNotEmpty) 'city_id': cityId,
        if (locale != null && locale.isNotEmpty) 'locale': locale,
        if (prefs != null) 'prefs': prefs.toJson(),
        if (filters != null && filters.isNotEmpty) 'filters': filters,
      },
    );
    return DiscoverResult.fromJson(data, locale: locale ?? 'ru');
  }

  Future<AuthProviders> fetchAuthProviders() async {
    final data = await _request('/api/v1/auth/providers');
    return AuthProviders.fromJson(data);
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

  Future<AuthResponse> googleSignIn({
    required String credential,
    String? nonce,
    String? locale,
  }) async {
    final data = await _request(
      '/api/v1/auth/google',
      method: 'POST',
      body: {
        'credential': credential,
        if (nonce != null && nonce.isNotEmpty) 'nonce': nonce,
        if (locale != null && locale.isNotEmpty) 'locale': locale,
      },
    );
    final auth = AuthResponse.fromJson(data);
    await setToken(auth.token);
    return auth;
  }

  Future<void> logout() async {
    await setActiveSessionId(null);
    await setToken(null);
  }

  Future<User> fetchMe() async {
    final data = await _request('/api/v1/me', auth: true);
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<User> updateMe({
    String? firstName,
    String? lastName,
    String? displayName,
    String? phone,
    String? locale,
    List<String>? dietPreferences,
    List<String>? favoriteVenues,
  }) async {
    final body = <String, dynamic>{};
    if (firstName != null) body['first_name'] = firstName;
    if (lastName != null) body['last_name'] = lastName;
    if (displayName != null) body['display_name'] = displayName;
    if (phone != null) body['phone'] = phone;
    if (locale != null) body['locale'] = locale;
    if (dietPreferences != null) body['diet_preferences'] = dietPreferences;
    if (favoriteVenues != null) body['favorite_venues'] = favoriteVenues;
    final data = await _request(
      '/api/v1/me',
      method: 'PATCH',
      body: body,
      auth: true,
    );
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<User> updateEmail(String email) async {
    final data = await _request(
      '/api/v1/me/email',
      method: 'PATCH',
      body: {'email': email},
      auth: true,
    );
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<void> updatePassword({
    String? oldPassword,
    required String newPassword,
  }) async {
    await _request(
      '/api/v1/me/password',
      method: 'PATCH',
      body: {
        if (oldPassword != null && oldPassword.isNotEmpty)
          'old_password': oldPassword,
        'new_password': newPassword,
      },
      auth: true,
    );
  }

  Future<void> deleteAccount(String? password) async {
    await _request(
      '/api/v1/me',
      method: 'DELETE',
      body: {
        if (password != null && password.isNotEmpty) 'password': password,
      },
      auth: true,
    );
    await logout();
  }

  Future<User> uploadAvatar(String filePath) async {
    final uri = Uri.parse('$apiBaseUrl/api/v1/me/avatar');
    final request = http.MultipartRequest('POST', uri);
    final token = await getToken();
    if (token != null && token.isNotEmpty) {
      request.headers['Authorization'] = 'Bearer $token';
    }
    request.headers['Accept'] = 'application/json';
    request.files.add(await http.MultipartFile.fromPath('file', filePath));
    final streamed = await request.send().timeout(const Duration(seconds: 20));
    final response = await http.Response.fromStream(streamed);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      var code = 'http_${response.statusCode}';
      try {
        final err = jsonDecode(response.body) as Map<String, dynamic>;
        code = err['error'] as String? ?? code;
      } catch (_) {}
      if (response.statusCode == 401) {
        await logout();
        onUnauthorized?.call();
      }
      throw ApiException(response.statusCode, code);
    }
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<User> deleteAvatar() async {
    final data = await _request(
      '/api/v1/me/avatar',
      method: 'DELETE',
      auth: true,
    );
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<List<ConnectedIdentity>> listIdentities() async {
    final data = await _request('/api/v1/me/identities', auth: true);
    final list = data['identities'] as List<dynamic>? ?? [];
    return list
        .map((e) => ConnectedIdentity.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<({List<AppNotification> notifications, int unread})> fetchNotifications({
    int limit = 30,
  }) async {
    final data = await _request(
      '/api/v1/me/notifications',
      query: {'limit': '$limit'},
      auth: true,
    );
    final list = data['notifications'] as List<dynamic>? ?? [];
    return (
      notifications: list
          .map((e) => AppNotification.fromJson(e as Map<String, dynamic>))
          .toList(),
      unread: (data['unread'] as num?)?.toInt() ?? 0,
    );
  }

  Future<int> markNotificationsRead({List<String>? ids}) async {
    final data = await _request(
      '/api/v1/me/notifications/read',
      method: 'POST',
      body: ids == null ? {} : {'ids': ids},
      auth: true,
    );
    return (data['unread'] as num?)?.toInt() ?? 0;
  }

  Future<Reservation> createReservation({
    required String venueId,
    required String tableId,
    List<String>? tableIds,
    required int guests,
    required DateTime reservedFor,
    int? durationMin,
    String? notes,
  }) async {
    final data = await _request(
      '/api/v1/reservations',
      method: 'POST',
      body: {
        'venue_id': venueId,
        'table_id': tableId,
        if (tableIds != null && tableIds.isNotEmpty) 'table_ids': tableIds,
        'guests': guests,
        'reserved_for': reservedFor.toUtc().toIso8601String(),
        if (durationMin != null && durationMin > 0) 'duration_min': durationMin,
        if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
        'source': bookingSourcePlatform,
      },
      auth: true,
    );
    return Reservation.fromJson(data['reservation'] as Map<String, dynamic>);
  }

  Future<Reservation> updateReservation(
    String reservationId, {
    String? tableId,
    List<String>? tableIds,
    int? guests,
    DateTime? reservedFor,
    String? notes,
  }) async {
    final data = await _request(
      '/api/v1/reservations/$reservationId',
      method: 'PATCH',
      body: {
        'table_id': ?tableId,
        if (tableIds != null && tableIds.isNotEmpty) 'table_ids': tableIds,
        'guests': ?guests,
        if (reservedFor != null)
          'reserved_for': reservedFor.toUtc().toIso8601String(),
        if (notes != null) 'notes': notes.trim(),
      },
      auth: true,
    );
    return Reservation.fromJson(data['reservation'] as Map<String, dynamic>);
  }

  Future<Reservation> cancelReservation(String reservationId) async {
    final data = await _request(
      '/api/v1/reservations/$reservationId/cancel',
      method: 'POST',
      auth: true,
    );
    return Reservation.fromJson(data['reservation'] as Map<String, dynamic>);
  }

  Future<void> deleteReservation(String reservationId) async {
    await _request(
      '/api/v1/reservations/$reservationId',
      method: 'DELETE',
      auth: true,
    );
  }

  Future<int> clearHistoryReservations() async {
    final data = await _request(
      '/api/v1/reservations/history',
      method: 'DELETE',
      auth: true,
    );
    return (data['cleared'] as num?)?.toInt() ?? 0;
  }

  Future<List<Reservation>> fetchReservations() async {
    final data = await _request('/api/v1/reservations', auth: true);
    final list = data['reservations'] as List<dynamic>? ?? [];
    return list
        .map((e) => Reservation.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Reservation> confirmArrival(
    String reservationId, {
    DateTime? expectedArrival,
  }) async {
    final data = await _request(
      '/api/v1/reservations/$reservationId/confirm-arrival',
      method: 'POST',
      body: expectedArrival != null
          ? {'expected_arrival': expectedArrival.toUtc().toIso8601String()}
          : {},
      auth: true,
    );
    return Reservation.fromJson(data['reservation'] as Map<String, dynamic>);
  }

  Future<Order> fetchPreorder(String reservationId) async {
    final data = await _request(
      '/api/v1/reservations/$reservationId/preorder',
      auth: true,
    );
    return Order.fromJson(data['order'] as Map<String, dynamic>);
  }

  Future<Order> savePreorder(
    String reservationId,
    List<({String menuItemId, int qty})> items,
  ) async {
    final data = await _request(
      '/api/v1/reservations/$reservationId/preorder',
      method: 'PUT',
      body: {
        'items': items
            .map((e) => {'menu_item_id': e.menuItemId, 'qty': e.qty})
            .toList(),
      },
      auth: true,
    );
    return Order.fromJson(data['order'] as Map<String, dynamic>);
  }

  Future<Order> cancelPreorder(String reservationId) async {
    final data = await _request(
      '/api/v1/reservations/$reservationId/preorder',
      method: 'DELETE',
      auth: true,
    );
    return Order.fromJson(data['order'] as Map<String, dynamic>);
  }

  Future<EventInquiry> createEventInquiry({
    required String venueId,
    required String eventType,
    required int guestCount,
    required DateTime preferredDate,
    required String contactMethod,
    required String contactPhone,
    required String contactName,
    String? notes,
  }) async {
    final data = await _request(
      '/api/v1/event-inquiries',
      method: 'POST',
      body: {
        'venue_id': venueId,
        'event_type': eventType,
        'guest_count': guestCount,
        'preferred_date': preferredDate.toUtc().toIso8601String(),
        'contact_method': contactMethod,
        'contact_phone': contactPhone,
        'contact_name': contactName,
        if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
      },
      auth: true,
    );
    return EventInquiry.fromJson(data['inquiry'] as Map<String, dynamic>);
  }

  Future<List<EventInquiry>> listEventInquiries() async {
    final data = await _request('/api/v1/event-inquiries', auth: true);
    final list = data['inquiries'] as List<dynamic>? ?? [];
    return list
        .map((e) => EventInquiry.fromJson(e as Map<String, dynamic>))
        .toList();
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

  Future<WaitlistSummary> fetchWaitlistSummary(String venueId) async {
    final data = await _request('/api/v1/venues/$venueId/waitlist/summary');
    return WaitlistSummary.fromJson(data['summary'] as Map<String, dynamic>);
  }

  Future<WaitlistEntry> joinWaitlist({
    required String venueId,
    required int guests,
    String? phone,
    String? zone,
    String? note,
  }) async {
    final data = await _request(
      '/api/v1/waitlist',
      method: 'POST',
      body: {
        'venue_id': venueId,
        'guests': guests,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
        if (zone != null && zone.isNotEmpty) 'zone': zone,
        if (note != null && note.isNotEmpty) 'note': note,
        'source': bookingSourcePlatform,
      },
      auth: true,
    );
    return WaitlistEntry.fromJson(data['entry'] as Map<String, dynamic>);
  }

  Future<List<WaitlistEntry>> fetchMyWaitlist() async {
    final data = await _request('/api/v1/waitlist', auth: true);
    final list = data['waitlist'] as List<dynamic>? ?? [];
    return list
        .map((e) => WaitlistEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<WaitlistEntry> leaveWaitlist(String id) async {
    final data = await _request(
      '/api/v1/waitlist/$id',
      method: 'DELETE',
      auth: true,
    );
    return WaitlistEntry.fromJson(data['entry'] as Map<String, dynamic>);
  }

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
    final session = Session.fromJson(data['session'] as Map<String, dynamic>);
    await setActiveSessionId(session.id);
    return session;
  }

  Future<Session> getSession(String id) async {
    final data = await _request('/api/v1/sessions/$id', auth: true);
    return Session.fromJson(data['session'] as Map<String, dynamic>);
  }

  Future<Session?> fetchActiveSession() async {
    final id = await getActiveSessionId();
    if (id == null || id.isEmpty) return null;
    try {
      final s = await getSession(id);
      if (!s.isActive) {
        await setActiveSessionId(null);
        return null;
      }
      return s;
    } on ApiException catch (e) {
      if (e.status == 404 || e.status == 403 || e.status == 401) {
        await setActiveSessionId(null);
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<Session> closeSession(String id) async {
    final data = await _request(
      '/api/v1/sessions/$id/close',
      method: 'POST',
      body: {},
      auth: true,
    );
    await setActiveSessionId(null);
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

  Future<Order> payOrder({
    required String orderId,
    required String method,
  }) async {
    final data = await _request(
      '/api/v1/payments',
      method: 'POST',
      body: {'order_id': orderId, 'method': method},
      auth: true,
    );
    return Order.fromJson(data['order'] as Map<String, dynamic>);
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

/// Strictly parse table QR strings (`venue:table[:token]`, `venue/table[/token]`,
/// or URLs such as `https://seatiko.md/qr?venue_id=...&table_id=...&token=...`).
/// Throws [FormatException('invalid_qr_token')] on malformed input.
({String venueId, String tableId, String token}) parseQrToken(String raw) {
  final t = raw.trim();
  if (t.isEmpty) {
    throw const FormatException('invalid_qr_token');
  }

  if (t.contains('://') || t.startsWith('/')) {
    final uri = Uri.tryParse(t);
    if (uri != null) {
      final qVenue = (uri.queryParameters['venue_id'] ?? uri.queryParameters['venue'])?.trim() ?? '';
      final qTable = (uri.queryParameters['table_id'] ?? uri.queryParameters['table'])?.trim() ?? '';
      final qToken = uri.queryParameters['token']?.trim() ?? '';
      if (qVenue.isNotEmpty && qTable.isNotEmpty) {
        return (
          venueId: qVenue,
          tableId: qTable,
          token: qToken.isEmpty ? 'demo' : qToken,
        );
      }
      final segs = [
        if (uri.scheme != 'http' &&
            uri.scheme != 'https' &&
            (uri.host == 'qr' || uri.host == 'table' || uri.host == 's'))
          uri.host,
        ...uri.pathSegments.where((s) => s.isNotEmpty),
      ];
      if (segs.length >= 2) {
        final idx = segs.indexOf('table');
        if (idx != -1 && segs.length >= idx + 3) {
          return (
            venueId: segs[idx + 1],
            tableId: segs[idx + 2],
            token: qToken.isNotEmpty
                ? qToken
                : (segs.length > idx + 3 ? segs[idx + 3] : 'demo'),
          );
        }
        if (segs.length >= 3 && (segs[0] == 'qr' || segs[0] == 's')) {
          return (
            venueId: segs[1],
            tableId: segs[2],
            token: qToken.isNotEmpty
                ? qToken
                : (segs.length > 3 ? segs[3] : 'demo'),
          );
        }
      }
    }
    throw const FormatException('invalid_qr_token');
  }

  if (t.contains(':')) {
    final parts = t.split(':').map((e) => e.trim()).toList();
    if (parts.length >= 2 && parts[0].isNotEmpty && parts[1].isNotEmpty) {
      final tok = parts.length > 2 ? parts.sublist(2).join(':').trim() : '';
      return (
        venueId: parts[0],
        tableId: parts[1],
        token: tok.isEmpty ? 'demo' : tok,
      );
    }
    throw const FormatException('invalid_qr_token');
  }

  if (t.contains('/')) {
    final parts = t.split('/').map((e) => e.trim()).toList();
    if (parts.length >= 2 && parts[0].isNotEmpty && parts[1].isNotEmpty) {
      final tok = parts.length > 2 ? parts.sublist(2).join('/').trim() : '';
      return (
        venueId: parts[0],
        tableId: parts[1],
        token: tok.isEmpty ? 'demo' : tok,
      );
    }
    throw const FormatException('invalid_qr_token');
  }

  throw const FormatException('invalid_qr_token');
}
