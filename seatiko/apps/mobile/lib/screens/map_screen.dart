import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:mobile/api.dart';
import 'package:mobile/screens/city_select_screen.dart';
import 'package:mobile/screens/venue_detail_screen.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/venue_thumb.dart';

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
  Future<List<Venue>>? _future;
  String _query = '';
  String _cityId = 'city-balti';
  String? _selectedVenueId;
  bool _openOnly = false;

  @override
  void initState() {
    super.initState();
    _cityId = widget.cityId;
    reload(_cityId);
  }

  void reload(String cityId) {
    _cityId = cityId;
    setState(() {
      _future = ApiClient.instance.fetchVenues(cityId: cityId);
    });
  }

  Future<void> _changeCity() async {
    final id = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => const CitySelectScreen(replaceHome: false),
      ),
    );
    if (id != null) widget.onCityChanged();
  }

  void _openVenue(Venue venue) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => VenueDetailScreen(venueId: venue.id)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: const BoxDecoration(
                    color: FaColors.green,
                    borderRadius: BorderRadius.only(
                      topLeft: Radius.circular(14),
                      topRight: Radius.circular(14),
                      bottomRight: Radius.circular(14),
                      bottomLeft: Radius.circular(5),
                    ),
                  ),
                  child: const Center(
                    child: Text(
                      'F',
                      style: TextStyle(
                        color: FaColors.cream,
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
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
                            'map.city'.tr().toUpperCase(),
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
                IconButton.filledTonal(
                  onPressed: () {},
                  icon: const Icon(Icons.notifications_none_rounded),
                  tooltip: 'Notifications',
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: TextField(
              onChanged: (value) =>
                  setState(() => _query = value.toLowerCase()),
              decoration: InputDecoration(
                hintText: 'map.search'.tr(),
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: const Icon(Icons.tune_rounded, size: 20),
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
                  label: 'Открыто сейчас',
                  selected: _openOnly,
                  onTap: () => setState(() => _openOnly = !_openOnly),
                ),
                const _FilterChip(label: 'Свободные столы'),
                const _FilterChip(label: 'Рейтинг 4.5+'),
                const _FilterChip(label: 'До 300 MDL'),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: FutureBuilder<List<Venue>>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const _MapLoading();
                }
                if (snapshot.hasError) {
                  return _MapError(onRetry: () => reload(_cityId));
                }

                final venues = (snapshot.data ?? []).where((venue) {
                  if (_openOnly && !venue.openNow) return false;
                  if (_query.isEmpty) return true;
                  final haystack = [
                    venue.name.pick(locale),
                    venue.address.pick(locale),
                    ...venue.cuisine,
                  ].join(' ').toLowerCase();
                  return haystack.contains(_query);
                }).toList();

                final selected =
                    venues.where((v) => v.id == _selectedVenueId).firstOrNull ??
                    venues.firstOrNull;

                return RefreshIndicator(
                  color: FaColors.green,
                  onRefresh: () async => reload(_cityId),
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                    children: [
                      _RestaurantMap(
                        venues: venues,
                        selected: selected,
                        locale: locale,
                        onSelect: (venue) =>
                            setState(() => _selectedVenueId = venue.id),
                        onOpen: _openVenue,
                      ),
                      const SizedBox(height: 22),
                      Row(
                        children: [
                          const Expanded(
                            child: Text(
                              'Рядом с вами',
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -0.5,
                              ),
                            ),
                          ),
                          Text(
                            '${venues.length} мест',
                            style: const TextStyle(
                              color: FaColors.muted,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      if (venues.isEmpty)
                        const _EmptyMap()
                      else
                        ...venues.map(
                          (venue) => _VenueCard(
                            venue: venue,
                            locale: locale,
                            selected: venue.id == selected?.id,
                            onTap: () => _openVenue(venue),
                          ),
                        ),
                    ],
                  ),
                );
              },
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
    required this.selected,
    required this.locale,
    required this.onSelect,
    required this.onOpen,
  });

  final List<Venue> venues;
  final Venue? selected;
  final String locale;
  final ValueChanged<Venue> onSelect;
  final ValueChanged<Venue> onOpen;

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
    if (oldIds != newIds) {
      _scheduleSync(fitBounds: true);
    } else if (oldWidget.selected?.id != widget.selected?.id) {
      _scheduleSelectionUpdate();
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

  void _scheduleSelectionUpdate() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _updateSelection();
    });
  }

  void _onCircleTapped(Circle circle) => _selectVenue(circle.data);

  void _onSymbolTapped(Symbol symbol) => _selectVenue(symbol.data);

  void _selectVenue(Map<String, dynamic>? data) {
    final venueId = data?['venueId'] as String?;
    final venue = widget.venues.where((item) => item.id == venueId).firstOrNull;
    if (venue == null) return;
    widget.onSelect(venue);
    _controller?.animateCamera(
      CameraUpdate.newLatLngZoom(LatLng(venue.lat, venue.lng), 15.2),
      duration: const Duration(milliseconds: 520),
    );
  }

  Future<void> _syncMarkers({required bool fitBounds}) async {
    final controller = _controller;
    if (controller == null || !_styleReady) return;
    final generation = ++_syncGeneration;

    await controller.clearSymbols();
    await controller.clearCircles();
    if (!mounted || generation != _syncGeneration) return;

    _circles.clear();
    if (widget.venues.isEmpty) return;

    final circles = await controller.addCircles(
      [
        for (final venue in widget.venues)
          CircleOptions(
            geometry: LatLng(venue.lat, venue.lng),
            circleRadius: venue.id == widget.selected?.id ? 19 : 16,
            circleColor: venue.id == widget.selected?.id
                ? '#D77B48'
                : '#1F6848',
            circleStrokeWidth: 3,
            circleStrokeColor: '#FFF7E9',
            circleOpacity: .98,
          ),
      ],
      [
        for (final venue in widget.venues) {'venueId': venue.id},
      ],
    );
    if (!mounted || generation != _syncGeneration) return;

    for (var index = 0; index < widget.venues.length; index++) {
      _circles[widget.venues[index].id] = circles[index];
    }

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
            textHaloColor: '#1F6848',
            textHaloWidth: .3,
          ),
      ],
      [
        for (final venue in widget.venues) {'venueId': venue.id},
      ],
    );

    if (fitBounds && mounted && generation == _syncGeneration) {
      await _fitVenues();
    }
  }

  Future<void> _updateSelection() async {
    final controller = _controller;
    if (controller == null) return;
    for (final entry in _circles.entries) {
      final active = entry.key == widget.selected?.id;
      await controller.updateCircle(
        entry.value,
        CircleOptions(
          circleRadius: active ? 19 : 16,
          circleColor: active ? '#D77B48' : '#1F6848',
        ),
      );
    }
  }

  Future<void> _fitVenues() async {
    final controller = _controller;
    if (controller == null || widget.venues.isEmpty) return;
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

  @override
  void dispose() {
    _syncGeneration++;
    _controller?.onCircleTapped.remove(_onCircleTapped);
    _controller?.onSymbolTapped.remove(_onSymbolTapped);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
              initialCameraPosition: const CameraPosition(
                target: _balti,
                zoom: 13.6,
              ),
              onMapCreated: _onMapCreated,
              onStyleLoadedCallback: _onStyleLoaded,
              compassEnabled: false,
              rotateGesturesEnabled: false,
              tiltGesturesEnabled: false,
              minMaxZoomPreference: const MinMaxZoomPreference(10, 19),
              logoEnabled: false,
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
              ],
            ),
          ),
          if (widget.selected != null)
            Positioned(
              left: 14,
              right: 14,
              bottom: 14,
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () => widget.onOpen(widget.selected!),
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    padding: const EdgeInsets.all(13),
                    decoration: BoxDecoration(
                      color: FaColors.surface.withValues(alpha: .94),
                      borderRadius: BorderRadius.circular(16),
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
                                '${widget.selected!.freeTables} свободных столов · ~${widget.selected!.averageCheck} MDL',
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
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: selected
                    ? FaColors.clay.withValues(alpha: .42)
                    : FaColors.border,
              ),
            ),
            child: Row(
              children: [
                VenueThumb(
                  imageUrl: venue.imageUrl,
                  priceLevel: venue.priceLevel,
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
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          Text(
                            '★ ${venue.rating}',
                            style: const TextStyle(
                              color: FaColors.clay,
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Text(
                        venue.cuisine.take(2).join(' · '),
                        style: const TextStyle(
                          color: FaColors.muted,
                          fontSize: 10,
                        ),
                      ),
                      const SizedBox(height: 9),
                      Row(
                        children: [
                          Container(
                            width: 7,
                            height: 7,
                            decoration: const BoxDecoration(
                              color: FaColors.free,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              '${venue.freeTables} свободных столов',
                              style: const TextStyle(
                                color: FaColors.green,
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          Text(
                            '~${venue.averageCheck} MDL',
                            style: const TextStyle(
                              color: FaColors.muted,
                              fontSize: 10,
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

class _MapLoading extends StatelessWidget {
  const _MapLoading();
  @override
  Widget build(BuildContext context) =>
      const Center(child: CircularProgressIndicator());
}

class _MapError extends StatelessWidget {
  const _MapError({required this.onRetry});
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.cloud_off_rounded, size: 42, color: FaColors.muted),
        const SizedBox(height: 12),
        Text('errors.api'.tr()),
        TextButton(onPressed: onRetry, child: Text('common.retry'.tr())),
      ],
    ),
  );
}

class _EmptyMap extends StatelessWidget {
  const _EmptyMap();
  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.symmetric(vertical: 28),
    child: Center(
      child: Text(
        'По выбранным фильтрам ничего не найдено',
        style: TextStyle(color: FaColors.muted),
      ),
    ),
  );
}
