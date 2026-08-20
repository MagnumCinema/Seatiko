import 'dart:convert';

import 'package:http/http.dart' as http;

const apiBaseUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'http://10.0.2.2:8080', // Android emulator → host
);

class LocalizedString {
  LocalizedString({required this.ru, required this.en, required this.ro});

  final String ru;
  final String en;
  final String ro;

  factory LocalizedString.fromJson(Map<String, dynamic> json) {
    return LocalizedString(
      ru: json['ru'] as String? ?? '',
      en: json['en'] as String? ?? '',
      ro: json['ro'] as String? ?? '',
    );
  }

  String pick(String locale) {
    switch (locale) {
      case 'en':
        return en.isNotEmpty ? en : ru;
      case 'ro':
        return ro.isNotEmpty ? ro : en;
      default:
        return ru.isNotEmpty ? ru : en;
    }
  }
}

class Venue {
  Venue({
    required this.id,
    required this.name,
    required this.address,
    required this.rating,
    required this.freeTables,
    required this.openNow,
    required this.priceLevel,
  });

  final String id;
  final LocalizedString name;
  final LocalizedString address;
  final double rating;
  final int freeTables;
  final bool openNow;
  final int priceLevel;

  factory Venue.fromJson(Map<String, dynamic> json) {
    return Venue(
      id: json['id'] as String,
      name: LocalizedString.fromJson(json['name'] as Map<String, dynamic>),
      address: LocalizedString.fromJson(json['address'] as Map<String, dynamic>),
      rating: (json['rating'] as num).toDouble(),
      freeTables: json['free_tables'] as int? ?? 0,
      openNow: json['open_now'] as bool? ?? false,
      priceLevel: json['price_level'] as int? ?? 1,
    );
  }
}

Future<List<Venue>> fetchVenues({String cityId = 'city-balti'}) async {
  final uri = Uri.parse('$apiBaseUrl/api/v1/venues?city_id=$cityId');
  final response = await http.get(uri).timeout(const Duration(seconds: 8));
  if (response.statusCode != 200) {
    throw Exception('venues_http_${response.statusCode}');
  }
  final body = jsonDecode(response.body) as Map<String, dynamic>;
  final list = body['venues'] as List<dynamic>;
  return list
      .map((e) => Venue.fromJson(e as Map<String, dynamic>))
      .toList();
}
