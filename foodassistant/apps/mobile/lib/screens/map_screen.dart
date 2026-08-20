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

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    widget.cityName,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () async {
                    final id = await Navigator.of(context).push<String>(
                      MaterialPageRoute(
                        builder: (_) =>
                            const CitySelectScreen(replaceHome: false),
                      ),
                    );
                    if (id != null) widget.onCityChanged();
                  },
                  child: Text('map.change_city'.tr()),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              onChanged: (v) => setState(() => _query = v.toLowerCase()),
              decoration: InputDecoration(
                hintText: 'map.search'.tr(),
                prefixIcon: const Icon(Icons.search, color: FaColors.muted),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF1A2A1C), Color(0xFF243028), Color(0xFF1C241C)],
                ),
                border: Border.all(color: FaColors.border),
              ),
              child: Center(
                child: Text(
                  'map.map_label'.tr(),
                  style: const TextStyle(color: FaColors.muted),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            flex: 2,
            child: FutureBuilder<List<Venue>>(
              future: _future,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return Center(child: Text('map.loading'.tr()));
                }
                if (snap.hasError) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('errors.api'.tr()),
                        Text(apiBaseUrl,
                            style: const TextStyle(
                                fontSize: 11, color: FaColors.muted)),
                        TextButton(
                          onPressed: () => reload(_cityId),
                          child: Text('common.retry'.tr()),
                        ),
                      ],
                    ),
                  );
                }
                final venues = (snap.data ?? []).where((v) {
                  if (_query.isEmpty) return true;
                  final n = v.name.pick(locale).toLowerCase();
                  final a = v.address.pick(locale).toLowerCase();
                  return n.contains(_query) || a.contains(_query);
                }).toList();
                return RefreshIndicator(
                  color: FaColors.gold,
                  onRefresh: () async => reload(_cityId),
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    itemCount: venues.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 10),
                    itemBuilder: (context, i) {
                      final v = venues[i];
                      return Card(
                        child: ListTile(
                          contentPadding: const EdgeInsets.all(14),
                          title: Text(
                            v.name.pick(locale),
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          subtitle: Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(v.address.pick(locale),
                                    style: const TextStyle(
                                        color: FaColors.muted, fontSize: 13)),
                                const SizedBox(height: 4),
                                Text(
                                  'map.free_tables'
                                      .tr(args: ['${v.freeTables}']),
                                  style: const TextStyle(
                                      color: FaColors.free, fontSize: 13),
                                ),
                              ],
                            ),
                          ),
                          trailing: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text('★ ${v.rating}',
                                  style:
                                      const TextStyle(color: FaColors.gold)),
                              Text(v.priceLabel(),
                                  style: const TextStyle(
                                      color: FaColors.muted, fontSize: 12)),
                            ],
                          ),
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => VenueDetailScreen(venueId: v.id),
                              ),
                            );
                          },
                        ),
                      );
                    },
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
