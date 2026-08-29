import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/screens/floor_map_screen.dart';
import 'package:mobile/screens/menu_screen.dart';
import 'package:mobile/screens/reservation_screen.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/auth_sheet.dart';
import 'package:mobile/widgets/venue_thumb.dart';
import 'package:mobile/widgets/waitlist_card.dart';

class VenueDetailScreen extends StatefulWidget {
  const VenueDetailScreen({super.key, required this.venueId});

  final String venueId;

  @override
  State<VenueDetailScreen> createState() => _VenueDetailScreenState();
}

class _VenueDetailScreenState extends State<VenueDetailScreen> {
  late Future<Venue> _future;

  @override
  void initState() {
    super.initState();
    _future = ApiClient.instance.fetchVenue(widget.venueId);
  }

  void _openMenu(Venue v, String locale) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => MenuScreen(
          venueId: v.id,
          venueName: v.name.pick(locale),
          venue: v,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    return Scaffold(
      body: FutureBuilder<Venue>(
        future: _future,
        builder: (context, snap) {
          if (!snap.hasData) {
            return const Center(
              child: CircularProgressIndicator(color: FaColors.gold),
            );
          }
          final v = snap.data!;
          return CustomScrollView(
            slivers: [
              SliverAppBar(
                expandedHeight: 180,
                pinned: true,
                flexibleSpace: FlexibleSpaceBar(
                  title: Text(
                    v.name.pick(locale),
                    style: const TextStyle(fontSize: 16),
                  ),
                  background: VenueHeroImage(imageUrl: v.imageUrl),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Text('★ ${v.rating}',
                              style: const TextStyle(color: FaColors.gold)),
                          const SizedBox(width: 12),
                          Text(v.priceLabel()),
                          const Spacer(),
                          Text(
                            v.openNow
                                ? 'venue.open'.tr()
                                : 'venue.closed'.tr(),
                            style: TextStyle(
                              color: v.openNow ? FaColors.free : FaColors.occupied,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(v.address.pick(locale),
                          style: const TextStyle(color: FaColors.muted)),
                      const SizedBox(height: 6),
                      Text(
                        'venue.avg_check'.tr(args: ['${v.averageCheck}']),
                        style: const TextStyle(color: FaColors.muted),
                      ),
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: FaColors.green.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                              color: FaColors.green.withValues(alpha: 0.4)),
                        ),
                        child: Text(
                          'map.free_tables'.tr(args: ['${v.freeTables}']),
                          style: const TextStyle(color: FaColors.free),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        v.description.pick(locale),
                        style: const TextStyle(height: 1.4),
                      ),
                      const SizedBox(height: 20),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => FloorMapScreen(
                                      venueId: v.id,
                                      venueName: v.name.pick(locale),
                                    ),
                                  ),
                                );
                              },
                              child: Text('venue.floor_map'.tr()),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: FilledButton(
                              onPressed: () async {
                                final ok = await ensureAuth(context);
                                if (!ok || !context.mounted) return;
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => ReservationScreen(
                                      venue: v,
                                    ),
                                  ),
                                );
                              },
                              child: Text('venue.book'.tr()),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: () => _openMenu(v, locale),
                        icon: const Icon(Icons.menu_book_outlined),
                        label: Text('venue.menu'.tr()),
                      ),
                      WaitlistCard(
                        venueId: v.id,
                        onChanged: () => setState(() {
                          _future = ApiClient.instance.fetchVenue(v.id);
                        }),
                      ),
                    ],
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
