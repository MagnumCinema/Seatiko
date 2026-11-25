import 'dart:async';
import 'dart:math' as math;

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:mobile/api.dart';
import 'package:mobile/errors.dart';
import 'package:mobile/screens/city_select_screen.dart';
import 'package:mobile/screens/notifications_sheet.dart';
import 'package:mobile/screens/venue_detail_screen.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/seatiko_logo.dart';
import 'package:mobile/widgets/shimmer.dart';
import 'package:mobile/widgets/venue_thumb.dart';
import 'package:url_launcher/url_launcher.dart';

class _MapBundle {
  const _MapBundle({
    required this.venues,
    required this.places,
    required this.attribution,
    this.center,
  });

  final List<Venue> venues;
  final List<MapPlace> places;
  final String attribution;
  final MapCoordinates? center;
}

class MapTab extends StatefulWidget {
  const MapTab({
    super.key,
    required this.cityId,
    required this.cityName,
    required this.onCityChanged,
  });

  final String cityId;
  final String cityName;
  final VoidCallback onCityChanged;

  @override
  State<MapTab> createState() => MapTabState();
}

class MapTabState extends State<MapTab> {
  _MapBundle? _bundle;
  bool _loading = true;
  Object? _error;

  List<Venue> _filteredVenues = const [];
  List<MapPlace> _filteredOpenPlaces = const [];

  String _query = '';
  Timer? _searchDebounce;
  String _cityId = 'city-balti';
  String? _selectedVenueId;
  bool _openOnly = false;
  bool _freeTablesOnly = false;
  bool _rating45Only = false;
  bool _budget300Only = false;
  bool _nearbyOnly = false;
  bool _partnersOnly = false;
  int? _maxBudget;
  final Set<String> _selectedCuisines = {};
  double? _userLat;
  double? _userLng;
  int _unreadNotifications = 0;

  @override
  void initState() {
    super.initState();
    _cityId = widget.cityId;
    reload(_cityId);
    _refreshUnread();
    ApiClient.instance.authVersion.addListener(_refreshUnread);
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    ApiClient.instance.authVersion.removeListener(_refreshUnread);
    super.dispose();
  }

  Future<void> _refreshUnread() async {
    final token = await ApiClient.instance.getToken();
    if (token == null || token.isEmpty) {
      if (mounted && _unreadNotifications != 0) {
        setState(() => _unreadNotifications = 0);
      }
      return;
    }
    try {
      final res = await ApiClient.instance.fetchNotifications(limit: 1);
      if (mounted) setState(() => _unreadNotifications = res.unread);
    } catch (_) {}
  }

  Future<void> reload(String cityId) async {
    _cityId = cityId;
    final locale = mounted ? context.locale.languageCode : 'ru';
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final bundle = await _fetchBundle(cityId, locale);
      if (!mounted) return;
      _bundle = bundle;
      _recomputeFilters(locale);
      setState(() {
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e;
      });
    }
  }

  Future<_MapBundle> _fetchBundle(String cityId, String locale) async {
    final venuesFuture = ApiClient.instance.fetchVenues(cityId: cityId);
    final placesFuture = ApiClient.instance
        .fetchMapPlaces(
          cityId: cityId,
          locale: locale,
          includeGoogle: true,
        )
        .catchError(
          (_) => MapPlacesResponse(
            cityId: cityId,
            country: 'MD',
            center: const MapCoordinates(lat: 47.7622, lng: 27.9289),
            bounds: const MapBounds(
              south: 47.7,
              west: 27.8,
              north: 47.82,
              east: 28.0,
            ),
            places: const [],
            databaseCount: 0,
            openDataCount: 0,
            attribution: '',
          ),
        );
    unawaited(
      ApiClient.instance.fetchMapConfig().catchError(
        (_) => MapConfig(
          cities: const [],
          countryBounds: const MapBounds(
            south: 45,
            west: 26,
            north: 49,
            east: 30,
          ),
        ),
      ),
    );

    final results = await Future.wait([venuesFuture, placesFuture]);
    final venues = results[0] as List<Venue>;
    final placesResp = results[1] as MapPlacesResponse;
    return _MapBundle(
      venues: venues,
      places: placesResp.places,
      attribution: placesResp.attribution,
      center: placesResp.center,
    );
  }

  void _recomputeFilters([String? localeOverride]) {
    final bundle = _bundle;
    if (bundle == null) return;
    final locale = localeOverride ?? (mounted ? context.locale.languageCode : 'ru');
    final q = _query;

    _filteredVenues = bundle.venues.where((venue) {
      if (_openOnly && !venue.openNow) return false;
      if (_freeTablesOnly && venue.freeTables <= 0) return false;
      if (_rating45Only && venue.rating < 4.5) return false;
      if (_maxBudget != null && venue.averageCheck > _maxBudget!) return false;
      if (_nearbyOnly && _userLat != null && _userLng != null) {
        if (_distanceKm(_userLat!, _userLng!, venue.lat, venue.lng) > 3.0) {
          return false;
        }
      }
      if (_selectedCuisines.isNotEmpty) {
        final hay = [
          venue.name.pick(locale),
          ...venue.cuisine,
        ].join(' ').toLowerCase();
        if (!_selectedCuisines.any((c) => hay.contains(c.replaceAll('_', ' ')))) {
          return false;
        }
      }
      if (q.isEmpty) return true;
      final haystack = [
        venue.name.pick(locale),
        venue.address.pick(locale),
        ...venue.cuisine,
      ].join(' ').toLowerCase();
      return haystack.contains(q);
    }).toList();

    _filteredOpenPlaces = _partnersOnly
        ? const <MapPlace>[]
        : bundle.places.where((p) {
            if (p.inDatabase) return false;
            if (_openOnly && p.openNow == false) return false;
            if (_freeTablesOnly) return false;
            if (_rating45Only && (p.rating ?? 0) < 4.5) return false;
            if (_nearbyOnly && _userLat != null && _userLng != null) {
              if (_distanceKm(_userLat!, _userLng!, p.lat, p.lng) > 3.0) {
                return false;
              }
            }
            if (q.isEmpty) return true;
            final h = [
              p.name.pick(locale),
              p.address.pick(locale),
              ...p.cuisine,
            ].join(' ').toLowerCase();
            return h.contains(q);
          }).toList();
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 260), () {
      if (!mounted) return;
      _query = value.trim().toLowerCase();
      setState(() {
        _recomputeFilters();
      });
    });
  }

  Future<bool> _ensureLocation() async {
    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('map.location_disabled'.tr())),
          );
        }
        return false;
      }
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('map.location_denied'.tr()),
              action: perm == LocationPermission.deniedForever
                  ? SnackBarAction(
                      label: 'common.settings'.tr(),
                      onPressed: Geolocator.openAppSettings,
                    )
                  : null,
            ),
          );
        }
        return false;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 6),
        ),
      );
      if (mounted) {
        setState(() {
          _userLat = pos.latitude;
          _userLng = pos.longitude;
          _recomputeFilters();
        });
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> _toggleNearby() async {
    HapticFeedback.selectionClick();
    if (_nearbyOnly) {
      setState(() {
        _nearbyOnly = false;
        _recomputeFilters();
      });
      return;
    }
    final ok = await _ensureLocation();
    if (ok && mounted) {
      setState(() {
        _nearbyOnly = true;
        _recomputeFilters();
      });
    }
  }

  double _distanceKm(double lat1, double lng1, double lat2, double lng2) {
    const r = 6371.0;
    final dLat = (lat2 - lat1) * math.pi / 180;
    final dLng = (lng2 - lng1) * math.pi / 180;
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1 * math.pi / 180) *
            math.cos(lat2 * math.pi / 180) *
            math.sin(dLng / 2) *
            math.sin(dLng / 2);
    return 2 * r * math.asin(math.sqrt(a));
  }

  Future<void> _changeCity() async {
    HapticFeedback.selectionClick();
    final id = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => const CitySelectScreen(replaceHome: false),
      ),
    );
    if (id != null) widget.onCityChanged();
  }

  void _openVenue(Venue venue) {
    HapticFeedback.selectionClick();
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => VenueDetailScreen(venueId: venue.id)),
    );
  }

  Future<void> _launchSafe(
    Uri uri, {
    LaunchMode mode = LaunchMode.platformDefault,
  }) async {
    HapticFeedback.selectionClick();
    try {
      final ok = await launchUrl(uri, mode: mode);
      if (!ok && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('common.error'.tr())),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('common.error'.tr())),
        );
      }
    }
  }

  void _openPlaceSheet(MapPlace place, String locale) {
    HapticFeedback.selectionClick();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: FaColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (ctx) => SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: FaColors.muted.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Text(
                place.name.pick(locale),
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 4),
              Text(
                place.address.pick(locale),
                style: const TextStyle(color: FaColors.muted),
              ),
              if (place.openingHours != null &&
                  place.openingHours!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(place.openingHours!, style: const TextStyle(fontSize: 13)),
              ],
              if (place.phone != null && place.phone!.isNotEmpty) ...[
                const SizedBox(height: 8),
                InkWell(
                  onTap: () => _launchSafe(Uri.parse('tel:${place.phone}')),
                  child: Text(
                    place.phone!,
                    style: const TextStyle(
                      color: FaColors.green,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: () {
                  final url = Uri.parse(
                    'https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}',
                  );
                  _launchSafe(url, mode: LaunchMode.externalApplication);
                },
                icon: const Icon(Icons.directions_outlined),
                label: Text('venue.route'.tr()),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _openFiltersSheet() {
    HapticFeedback.selectionClick();
    var openOnly = _openOnly;
    var freeTables = _freeTablesOnly;
    var rating45 = _rating45Only;
    var nearby = _nearbyOnly;
    var partnersOnly = _partnersOnly;
    var maxBudget = (_maxBudget ?? 1000).toDouble();
    final cuisines = Set<String>.from(_selectedCuisines);
    const allCuisines = [
      'moldovan',
      'italian',
      'asian',
      'european',
      'japanese',
      'grill',
      'cafe_sweets',
    ];

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: FaColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: FaColors.muted.withValues(alpha: 0.4),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'map.filters_title'.tr(),
                        style: const TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () {
                        HapticFeedback.selectionClick();
                        setModalState(() {
                          openOnly = false;
                          freeTables = false;
                          rating45 = false;
                          nearby = false;
                          partnersOnly = false;
                          maxBudget = 1000;
                          cuisines.clear();
                        });
                      },
                      child: Text('discover.wizard.filters_clear'.tr()),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('map.chip_open_now'.tr()),
                  value: openOnly,
                  onChanged: (v) => setModalState(() => openOnly = v),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('map.chip_free_tables'.tr()),
                  value: freeTables,
                  onChanged: (v) => setModalState(() => freeTables = v),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('map.chip_rating_45'.tr()),
                  value: rating45,
                  onChanged: (v) => setModalState(() => rating45 = v),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('map.chip_nearby'.tr()),
                  value: nearby,
                  onChanged: (v) => setModalState(() => nearby = v),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('map.partners_only'.tr()),
                  value: partnersOnly,
                  onChanged: (v) => setModalState(() => partnersOnly = v),
                ),
                const SizedBox(height: 12),
                Text(
                  '${'map.max_check'.tr()}: ${maxBudget.round()} MDL',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                Slider(
                  value: maxBudget,
                  min: 100,
                  max: 1000,
                  divisions: 18,
                  activeColor: FaColors.green,
                  onChanged: (v) => setModalState(() => maxBudget = v),
                ),
                const SizedBox(height: 8),
                Text(
                  'discover.wizard.step.cuisine'.tr(),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: allCuisines.map((c) {
                    final on = cuisines.contains(c);
                    return FilterChip(
                      label: Text('discover.cuisine.$c'.tr()),
                      selected: on,
                      onSelected: (v) {
                        setModalState(() {
                          if (v) {
                            cuisines.add(c);
                          } else {
                            cuisines.remove(c);
                          }
                        });
                      },
                    );
                  }).toList(),
                ),
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: () async {
                    if (nearby && _userLat == null) {
                      final ok = await _ensureLocation();
                      if (!ok) nearby = false;
                    }
                    if (!ctx.mounted) return;
                    HapticFeedback.selectionClick();
                    setState(() {
                      _openOnly = openOnly;
                      _freeTablesOnly = freeTables;
                      _rating45Only = rating45;
                      _nearbyOnly = nearby;
                      _partnersOnly = partnersOnly;
                      _maxBudget = maxBudget < 1000 ? maxBudget.round() : null;
                      _budget300Only = _maxBudget != null && _maxBudget! <= 300;
                      _selectedCuisines
                        ..clear()
                        ..addAll(cuisines);
                      _recomputeFilters();
                    });
                    Navigator.pop(ctx);
                  },
                  child: Text('common.apply'.tr()),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    final bottomPad = MediaQuery.paddingOf(context).bottom + 96;
    final selected = _filteredVenues
            .where((v) => v.id == _selectedVenueId)
            .firstOrNull ??
        _filteredVenues.firstOrNull;

    return SafeArea(
      bottom: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 12),
            child: Row(
              children: [
                const SeatikoLogo(size: 40),
                const SizedBox(width: 12),
                Expanded(
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: _changeCity,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'map.city_label'.tr().toUpperCase(),
                            style: const TextStyle(
                              color: FaColors.muted,
                              fontSize: 10,
                              letterSpacing: 1.2,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  widget.cityName,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 19,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: -0.4,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 4),
                              const Icon(
                                Icons.keyboard_arrow_down_rounded,
                                size: 20,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    IconButton.filledTonal(
                      onPressed: () {
                        HapticFeedback.selectionClick();
                        showNotificationsSheet(
                          context,
                          onUnreadChanged: _refreshUnread,
                        );
                      },
                      icon: const Icon(Icons.notifications_none_rounded),
                      tooltip: 'notifications.title'.tr(),
                    ),
                    if (_unreadNotifications > 0)
                      Positioned(
                        right: 4,
                        top: 4,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 5,
                            vertical: 1,
                          ),
                          decoration: BoxDecoration(
                            color: FaColors.clay,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            _unreadNotifications > 9
                                ? '9+'
                                : '$_unreadNotifications',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: TextField(
              onChanged: _onSearchChanged,
              decoration: InputDecoration(
                hintText: 'map.search'.tr(),
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: IconButton(
                  tooltip: 'map.filters_title'.tr(),
                  onPressed: _openFiltersSheet,
                  icon: const Icon(Icons.tune_rounded, size: 20),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 36,
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              scrollDirection: Axis.horizontal,
              children: [
                _FilterChip(
                  label: 'map.chip_open_now'.tr(),
                  selected: _openOnly,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(() {
                      _openOnly = !_openOnly;
                      _recomputeFilters();
                    });
                  },
                ),
                _FilterChip(
                  label: 'map.chip_free_tables'.tr(),
                  selected: _freeTablesOnly,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(() {
                      _freeTablesOnly = !_freeTablesOnly;
                      _recomputeFilters();
                    });
                  },
                ),
                _FilterChip(
                  label: 'map.chip_rating_45'.tr(),
                  selected: _rating45Only,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(() {
                      _rating45Only = !_rating45Only;
                      _recomputeFilters();
                    });
                  },
                ),
                _FilterChip(
                  label: 'map.chip_budget_300'.tr(),
                  selected: _budget300Only,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(() {
                      _budget300Only = !_budget300Only;
                      _maxBudget = _budget300Only ? 300 : null;
                      _recomputeFilters();
                    });
                  },
                ),
                _FilterChip(
                  label: 'map.chip_nearby'.tr(),
                  selected: _nearbyOnly,
                  onTap: _toggleNearby,
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          if (_loading && _bundle != null)
            const LinearProgressIndicator(
              minHeight: 2,
              color: FaColors.green,
              backgroundColor: Colors.transparent,
            ),
          Expanded(
            child: _bundle == null && _loading
                ? const VenueListShimmer()
                : _bundle == null && _error != null
                ? _MapError(
                    message: apiErrorText(_error!),
                    onRetry: () => reload(_cityId),
                  )
                : RefreshIndicator(
                    color: FaColors.green,
                    onRefresh: () async {
                      await reload(_cityId);
                      await _refreshUnread();
                    },
                    child: CustomScrollView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      slivers: [
                        SliverPadding(
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          sliver: SliverToBoxAdapter(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                _RestaurantMap(
                                  venues: _filteredVenues,
                                  openPlaces: _filteredOpenPlaces,
                                  selected: selected,
                                  locale: locale,
                                  initialCenter: _bundle?.center,
                                  userLat: _userLat,
                                  userLng: _userLng,
                                  onLocateMe: _ensureLocation,
                                  onSelect: (venue) {
                                    HapticFeedback.selectionClick();
                                    setState(() => _selectedVenueId = venue.id);
                                  },
                                  onOpen: _openVenue,
                                  onOpenPlace: (p) => _openPlaceSheet(p, locale),
                                ),
                                if (_bundle != null &&
                                    _bundle!.attribution.isNotEmpty) ...[
                                  const SizedBox(height: 6),
                                  Text(
                                    _bundle!.attribution,
                                    style: const TextStyle(
                                      color: FaColors.muted,
                                      fontSize: 10,
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 18),
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        'map.nearby_title'.tr(),
                                        style: const TextStyle(
                                          fontSize: 20,
                                          fontWeight: FontWeight.w800,
                                          letterSpacing: -0.5,
                                        ),
                                      ),
                                    ),
                                    Text(
                                      'map.places_count'.tr(
                                        args: ['${_filteredVenues.length}'],
                                      ),
                                      style: const TextStyle(
                                        color: FaColors.muted,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                              ],
                            ),
                          ),
                        ),
                        if (_filteredVenues.isEmpty)
                          const SliverToBoxAdapter(child: _EmptyMap())
                        else
                          SliverPadding(
                            padding: EdgeInsets.fromLTRB(20, 0, 20, bottomPad),
                            sliver: SliverList.builder(
                              itemCount: _filteredVenues.length,
                              itemBuilder: (context, index) {
                                final venue = _filteredVenues[index];
                                return _VenueCard(
                                  venue: venue,
                                  locale: locale,
                                  selected: venue.id == selected?.id,
                                  onTap: () => _openVenue(venue),
                                );
                              },
                            ),
                          ),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({required this.label, this.selected = false, this.onTap});

  final String label;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(99),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 13),
          decoration: BoxDecoration(
            color: selected ? FaColors.green : FaColors.surface,
            borderRadius: BorderRadius.circular(99),
            border: Border.all(
              color: selected ? FaColors.green : FaColors.border,
            ),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              color: selected ? FaColors.cream : FaColors.muted,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}

class _RestaurantMap extends StatefulWidget {
  const _RestaurantMap({
    required this.venues,
    required this.openPlaces,
    required this.selected,
    required this.locale,
    required this.initialCenter,
    required this.userLat,
    required this.userLng,
    required this.onLocateMe,
    required this.onSelect,
    required this.onOpen,
    required this.onOpenPlace,
  });

  final List<Venue> venues;
  final List<MapPlace> openPlaces;
  final Venue? selected;
  final String locale;
  final MapCoordinates? initialCenter;
  final double? userLat;
  final double? userLng;
  final Future<bool> Function() onLocateMe;
  final ValueChanged<Venue> onSelect;
  final ValueChanged<Venue> onOpen;
  final ValueChanged<MapPlace> onOpenPlace;

  @override
  State<_RestaurantMap> createState() => _RestaurantMapState();
}

class _RestaurantMapState extends State<_RestaurantMap> {
  static const _styleUrl = 'https://tiles.openfreemap.org/styles/liberty';
  static const _balti = LatLng(47.7622, 27.9289);

  MapLibreMapController? _controller;
  final Map<String, Circle> _circles = {};
  bool _styleReady = false;
  int _syncGeneration = 0;

  @override
  void didUpdateWidget(covariant _RestaurantMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_styleReady) return;

    final oldIds = oldWidget.venues.map((venue) => venue.id).join('|');
    final newIds = widget.venues.map((venue) => venue.id).join('|');
    final oldOpen = oldWidget.openPlaces.length;
    final newOpen = widget.openPlaces.length;
    if (oldIds != newIds ||
        oldOpen != newOpen ||
        oldWidget.userLat != widget.userLat) {
      _scheduleSync(fitBounds: oldIds != newIds);
    } else if (oldWidget.selected?.id != widget.selected?.id) {
      _scheduleSelectionUpdate(oldWidget.selected?.id, widget.selected?.id);
    }
  }

  void _onMapCreated(MapLibreMapController controller) {
    _controller = controller;
    controller.onCircleTapped.add(_onCircleTapped);
    controller.onSymbolTapped.add(_onSymbolTapped);
  }

  void _onStyleLoaded() {
    _styleReady = true;
    _scheduleSync(fitBounds: true);
  }

  void _scheduleSync({required bool fitBounds}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _syncMarkers(fitBounds: fitBounds);
    });
  }

  void _scheduleSelectionUpdate(String? oldId, String? newId) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _updateSelection(oldId, newId);
    });
  }

  void _onCircleTapped(Circle circle) => _handleTap(circle.data);

  void _onSymbolTapped(Symbol symbol) => _handleTap(symbol.data);

  void _handleTap(Map<String, dynamic>? data) {
    final venueId = data?['venueId'] as String?;
    if (venueId != null) {
      final venue =
          widget.venues.where((item) => item.id == venueId).firstOrNull;
      if (venue == null) return;
      widget.onSelect(venue);
      _controller?.animateCamera(
        CameraUpdate.newLatLngZoom(LatLng(venue.lat, venue.lng), 15.2),
        duration: const Duration(milliseconds: 520),
      );
      return;
    }
    final placeId = data?['placeId'] as String?;
    if (placeId != null) {
      final place =
          widget.openPlaces.where((item) => item.id == placeId).firstOrNull;
      if (place != null) widget.onOpenPlace(place);
    }
  }

  Future<void> _syncMarkers({required bool fitBounds}) async {
    final controller = _controller;
    if (controller == null || !_styleReady) return;
    final generation = ++_syncGeneration;

    await controller.clearSymbols();
    await controller.clearCircles();
    if (!mounted || generation != _syncGeneration) return;

    _circles.clear();

    final circleOpts = <CircleOptions>[];
    final circleData = <Map<String, dynamic>>[];

    for (final p in widget.openPlaces.take(80)) {
      circleOpts.add(
        CircleOptions(
          geometry: LatLng(p.lat, p.lng),
          circleRadius: 7,
          circleColor: '#5C6B63',
          circleStrokeWidth: 2,
          circleStrokeColor: '#FFFDF8',
          circleOpacity: 0.78,
        ),
      );
      circleData.add({'placeId': p.id});
    }

    for (final venue in widget.venues) {
      final active = venue.id == widget.selected?.id;
      circleOpts.add(
        CircleOptions(
          geometry: LatLng(venue.lat, venue.lng),
          circleRadius: active ? 19 : 16,
          circleColor: active ? '#C8683B' : '#246046',
          circleStrokeWidth: 3,
          circleStrokeColor: '#FFFDF8',
          circleOpacity: .98,
        ),
      );
      circleData.add({'venueId': venue.id});
    }

    if (widget.userLat != null && widget.userLng != null) {
      circleOpts.add(
        CircleOptions(
          geometry: LatLng(widget.userLat!, widget.userLng!),
          circleRadius: 9,
          circleColor: '#3E78BD',
          circleStrokeWidth: 3,
          circleStrokeColor: '#FFFFFF',
          circleOpacity: 1.0,
        ),
      );
      circleData.add({'userLocation': true});
    }

    if (circleOpts.isEmpty) return;

    final circles = await controller.addCircles(circleOpts, circleData);
    if (!mounted || generation != _syncGeneration) return;

    for (var i = 0; i < circleData.length && i < circles.length; i++) {
      final vId = circleData[i]['venueId'] as String?;
      if (vId != null) _circles[vId] = circles[i];
    }

    if (widget.venues.isNotEmpty) {
      await controller.addSymbols(
        [
          for (var index = 0; index < widget.venues.length; index++)
            SymbolOptions(
              geometry: LatLng(
                widget.venues[index].lat,
                widget.venues[index].lng,
              ),
              textField: '${index + 1}',
              textSize: 10,
              textColor: '#FFFFFF',
              textHaloColor: '#246046',
              textHaloWidth: .3,
            ),
        ],
        [
          for (final venue in widget.venues) {'venueId': venue.id},
        ],
      );
    }

    if (fitBounds && mounted && generation == _syncGeneration) {
      await _fitVenues();
    }
  }

  Future<void> _updateSelection(String? oldId, String? newId) async {
    final controller = _controller;
    if (controller == null) return;
    if (oldId != null && _circles.containsKey(oldId)) {
      await controller.updateCircle(
        _circles[oldId]!,
        const CircleOptions(circleRadius: 16, circleColor: '#246046'),
      );
    }
    if (newId != null && _circles.containsKey(newId)) {
      await controller.updateCircle(
        _circles[newId]!,
        const CircleOptions(circleRadius: 19, circleColor: '#C8683B'),
      );
    }
  }

  Future<void> _fitVenues() async {
    final controller = _controller;
    if (controller == null) return;
    if (widget.venues.isEmpty) {
      final c = widget.initialCenter;
      if (c != null) {
        await controller.animateCamera(
          CameraUpdate.newLatLngZoom(LatLng(c.lat, c.lng), 13.4),
        );
      }
      return;
    }
    if (widget.venues.length == 1) {
      final venue = widget.venues.first;
      await controller.animateCamera(
        CameraUpdate.newLatLngZoom(LatLng(venue.lat, venue.lng), 15),
      );
      return;
    }

    final latitudes = widget.venues.map((venue) => venue.lat);
    final longitudes = widget.venues.map((venue) => venue.lng);
    final bounds = LatLngBounds(
      southwest: LatLng(
        latitudes.reduce((a, b) => a < b ? a : b),
        longitudes.reduce((a, b) => a < b ? a : b),
      ),
      northeast: LatLng(
        latitudes.reduce((a, b) => a > b ? a : b),
        longitudes.reduce((a, b) => a > b ? a : b),
      ),
    );
    await controller.animateCamera(
      CameraUpdate.newLatLngBounds(
        bounds,
        left: 46,
        top: 44,
        right: 46,
        bottom: 128,
      ),
      duration: const Duration(milliseconds: 420),
    );
  }

  void _zoomIn() => _controller?.animateCamera(CameraUpdate.zoomIn());

  void _zoomOut() => _controller?.animateCamera(CameraUpdate.zoomOut());

  Future<void> _centerOnUser() async {
    HapticFeedback.selectionClick();
    final ok = await widget.onLocateMe();
    if (!ok || widget.userLat == null || widget.userLng == null) return;
    await _controller?.animateCamera(
      CameraUpdate.newLatLngZoom(
        LatLng(widget.userLat!, widget.userLng!),
        14.6,
      ),
    );
  }

  @override
  void dispose() {
    _syncGeneration++;
    _controller?.onCircleTapped.remove(_onCircleTapped);
    _controller?.onSymbolTapped.remove(_onSymbolTapped);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final initTarget = widget.initialCenter != null
        ? LatLng(widget.initialCenter!.lat, widget.initialCenter!.lng)
        : _balti;
    return Container(
      height: 330,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: const Color(0xFFE5E5DA),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: FaColors.border),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14244135),
            blurRadius: 30,
            offset: Offset(0, 14),
          ),
        ],
      ),
      child: Stack(
        children: [
          Positioned.fill(
            child: MapLibreMap(
              styleString: _styleUrl,
              initialCameraPosition: CameraPosition(
                target: initTarget,
                zoom: 13.6,
              ),
              onMapCreated: _onMapCreated,
              onStyleLoadedCallback: _onStyleLoaded,
              gestureRecognizers: <Factory<OneSequenceGestureRecognizer>>{
                Factory<OneSequenceGestureRecognizer>(
                  () => EagerGestureRecognizer(),
                ),
              },
              compassEnabled: false,
              rotateGesturesEnabled: false,
              tiltGesturesEnabled: false,
              minMaxZoomPreference: const MinMaxZoomPreference(10, 19),
              logoEnabled: true,
              attributionButtonPosition: AttributionButtonPosition.topLeft,
              annotationOrder: const [
                AnnotationType.circle,
                AnnotationType.symbol,
              ],
              annotationConsumeTapEvents: const [
                AnnotationType.circle,
                AnnotationType.symbol,
              ],
              foregroundLoadColor: const Color(0xFFE5E5DA),
            ),
          ),
          Positioned(
            right: 14,
            top: 14,
            child: Column(
              children: [
                _MapControl(icon: Icons.add_rounded, onTap: _zoomIn),
                const SizedBox(height: 5),
                _MapControl(icon: Icons.remove_rounded, onTap: _zoomOut),
                const SizedBox(height: 5),
                _MapControl(
                  icon: Icons.my_location_rounded,
                  onTap: _centerOnUser,
                ),
              ],
            ),
          ),
          Positioned(
            left: 14,
            right: 14,
            bottom: 14,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              switchInCurve: Curves.easeOutCubic,
              switchOutCurve: Curves.easeInCubic,
              transitionBuilder: (child, anim) => FadeTransition(
                opacity: anim,
                child: SlideTransition(
                  position: Tween<Offset>(
                    begin: const Offset(0, 0.14),
                    end: Offset.zero,
                  ).animate(anim),
                  child: child,
                ),
              ),
              child: widget.selected == null
                  ? const SizedBox.shrink()
                  : Material(
                      key: ValueKey(widget.selected!.id),
                      color: Colors.transparent,
                      child: InkWell(
                        onTap: () => widget.onOpen(widget.selected!),
                        borderRadius: BorderRadius.circular(16),
                        child: Container(
                          padding: const EdgeInsets.all(13),
                          decoration: BoxDecoration(
                            color: FaColors.surface.withValues(alpha: .95),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: FaColors.border),
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x1A1D392F),
                                blurRadius: 20,
                                offset: Offset(0, 8),
                              ),
                            ],
                          ),
                          child: Row(
                            children: [
                              VenueThumb(
                                imageUrl: widget.selected!.imageUrl,
                                size: 42,
                                radius: 12,
                                priceLevel: widget.selected!.priceLevel,
                              ),
                              const SizedBox(width: 11),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      widget.selected!.name.pick(widget.locale),
                                      style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                    const SizedBox(height: 3),
                                    Text(
                                      '${'map.free_tables'.tr(args: ['${widget.selected!.freeTables}'])} · ~${widget.selected!.averageCheck} MDL',
                                      style: const TextStyle(
                                        color: FaColors.muted,
                                        fontSize: 10,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const Icon(Icons.arrow_forward_rounded, size: 18),
                            ],
                          ),
                        ),
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MapControl extends StatelessWidget {
  const _MapControl({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: FaColors.surface,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: SizedBox(width: 36, height: 36, child: Icon(icon, size: 18)),
      ),
    );
  }
}

class _VenueCard extends StatelessWidget {
  const _VenueCard({
    required this.venue,
    required this.locale,
    required this.selected,
    required this.onTap,
  });
  final Venue venue;
  final String locale;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: FaColors.surface,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: selected
                    ? FaColors.clay.withValues(alpha: .5)
                    : FaColors.border,
              ),
            ),
            child: Row(
              children: [
                VenueThumb(
                  imageUrl: venue.imageUrl,
                  priceLevel: venue.priceLevel,
                  heroTag: 'venue-cover-${venue.id}',
                ),
                const SizedBox(width: 13),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              venue.name.pick(locale),
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.3,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 7,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: FaColors.ratingBg,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              '★ ${venue.rating}',
                              style: const TextStyle(
                                color: FaColors.ratingFg,
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Text(
                        venue.cuisine.take(2).join(' · '),
                        style: const TextStyle(
                          color: FaColors.muted,
                          fontSize: 11,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 7,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: venue.freeTables > 0
                                  ? const Color(0xFF175F43)
                                  : FaColors.occupied.withValues(alpha: 0.14),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              'map.free_tables'.tr(args: ['${venue.freeTables}']),
                              style: TextStyle(
                                color: venue.freeTables > 0
                                    ? FaColors.cream
                                    : FaColors.occupied,
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          const Spacer(),
                          Text(
                            '~${venue.averageCheck} MDL',
                            style: const TextStyle(
                              color: FaColors.muted,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MapError extends StatelessWidget {
  const _MapError({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_rounded, size: 42, color: FaColors.muted),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          TextButton(onPressed: onRetry, child: Text('common.retry'.tr())),
        ],
      ),
    ),
  );
}

class _EmptyMap extends StatelessWidget {
  const _EmptyMap();
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 28),
    child: Center(
      child: Text(
        'map.empty'.tr(),
        style: const TextStyle(color: FaColors.muted),
      ),
    ),
  );
}
