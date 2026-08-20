import 'dart:math' as math;

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/screens/city_select_screen.dart';
import 'package:mobile/screens/venue_detail_screen.dart';
import 'package:mobile/theme.dart';

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
    setState(() => _future = ApiClient.instance.fetchVenues(cityId: cityId));
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

class _RestaurantMap extends StatelessWidget {
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

  Offset _position(Venue venue) {
    if (venues.length <= 1) return const Offset(.52, .48);
    final lats = venues.map((v) => v.lat).toList();
    final lngs = venues.map((v) => v.lng).toList();
    final minLat = lats.reduce(math.min);
    final maxLat = lats.reduce(math.max);
    final minLng = lngs.reduce(math.min);
    final maxLng = lngs.reduce(math.max);
    final latSpan = math.max(maxLat - minLat, .004);
    final lngSpan = math.max(maxLng - minLng, .006);
    return Offset(
      .14 + ((venue.lng - minLng) / lngSpan) * .72,
      .17 + (1 - (venue.lat - minLat) / latSpan) * .62,
    );
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
      child: LayoutBuilder(
        builder: (context, constraints) {
          return Stack(
            children: [
              Positioned.fill(child: CustomPaint(painter: _CityMapPainter())),
              const Positioned(
                left: 22,
                top: 20,
                child: Text(
                  'BĂLȚI',
                  style: TextStyle(
                    color: Color(0x26254338),
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 4,
                  ),
                ),
              ),
              for (var index = 0; index < venues.length; index++)
                Builder(
                  builder: (context) {
                    final venue = venues[index];
                    final pos = _position(venue);
                    final active = venue.id == selected?.id;
                    return Positioned(
                      left: pos.dx * constraints.maxWidth - (active ? 31 : 23),
                      top: pos.dy * constraints.maxHeight - (active ? 31 : 23),
                      child: _MapPin(
                        index: index + 1,
                        active: active,
                        label: venue.name.pick(locale),
                        onTap: () => onSelect(venue),
                      ),
                    );
                  },
                ),
              Positioned(
                right: 14,
                top: 14,
                child: Column(
                  children: [
                    _MapControl(icon: Icons.add_rounded, onTap: () {}),
                    const SizedBox(height: 5),
                    _MapControl(icon: Icons.remove_rounded, onTap: () {}),
                  ],
                ),
              ),
              if (selected != null)
                Positioned(
                  left: 14,
                  right: 14,
                  bottom: 14,
                  child: Material(
                    color: Colors.transparent,
                    child: InkWell(
                      onTap: () => onOpen(selected!),
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
                            Container(
                              width: 42,
                              height: 42,
                              decoration: BoxDecoration(
                                color: FaColors.claySoft,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(
                                Icons.restaurant_rounded,
                                color: FaColors.clay,
                                size: 20,
                              ),
                            ),
                            const SizedBox(width: 11),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    selected!.name.pick(locale),
                                    style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    '${selected!.freeTables} свободных столов · ~${selected!.averageCheck} MDL',
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
          );
        },
      ),
    );
  }
}

class _MapPin extends StatelessWidget {
  const _MapPin({
    required this.index,
    required this.active,
    required this.label,
    required this.onTap,
  });
  final int index;
  final bool active;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          width: active ? 62 : 46,
          height: active ? 62 : 46,
          decoration: BoxDecoration(
            color: active ? FaColors.clay : FaColors.green,
            shape: BoxShape.circle,
            border: Border.all(color: FaColors.cream, width: 4),
            boxShadow: const [
              BoxShadow(
                color: Color(0x38213E33),
                blurRadius: 14,
                offset: Offset(0, 7),
              ),
            ],
          ),
          child: Center(
            child: Text(
              '$index',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ),
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

class _CityMapPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final grid = Paint()
      ..color = const Color(0x10234338)
      ..strokeWidth = 1;
    for (double x = 15; x < size.width; x += 34) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), grid);
    }
    for (double y = 12; y < size.height; y += 34) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }

    final park = Paint()..color = const Color(0xFFCADFC5);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(size.width * .65, 22, size.width * .27, 72),
        const Radius.circular(28),
      ),
      park,
    );

    final river = Paint()
      ..color = const Color(0xFFBBD6D2)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 19;
    final riverPath = Path()
      ..moveTo(-8, size.height * .12)
      ..cubicTo(
        size.width * .2,
        size.height * .25,
        0,
        size.height * .65,
        size.width * .18,
        size.height * 1.08,
      );
    canvas.drawPath(riverPath, river);

    final road = Paint()
      ..color = const Color(0xFFFAF8F1)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 8
      ..strokeCap = StrokeCap.round;
    final roadThin = Paint()
      ..color = const Color(0xFFFAF8F1)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(
      Offset(size.width * .12, size.height * .32),
      Offset(size.width * .93, size.height * .53),
      road,
    );
    canvas.drawLine(
      Offset(size.width * .18, size.height * .72),
      Offset(size.width * .88, size.height * .18),
      road,
    );
    canvas.drawLine(
      Offset(size.width * .38, -10),
      Offset(size.width * .57, size.height + 10),
      roadThin,
    );
    canvas.drawLine(
      Offset(size.width * .06, size.height * .58),
      Offset(size.width * .88, size.height * .8),
      roadThin,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
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
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(15),
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: venue.priceLevel >= 3
                          ? const [Color(0xFF7D4C37), Color(0xFF2E493C)]
                          : const [Color(0xFFE6B17E), Color(0xFF43735D)],
                    ),
                  ),
                  child: const Icon(
                    Icons.restaurant_menu_rounded,
                    color: Colors.white,
                    size: 27,
                  ),
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
