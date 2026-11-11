import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/screens/reservation_screen.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/auth_sheet.dart';
import 'package:mobile/widgets/restaurant_floor_plan.dart';

class FloorMapScreen extends StatefulWidget {
  const FloorMapScreen({
    super.key,
    required this.venueId,
    required this.venueName,
    this.selectMode = false,
  });

  final String venueId;
  final String venueName;
  final bool selectMode;

  @override
  State<FloorMapScreen> createState() => _FloorMapScreenState();
}

class _FloorMapScreenState extends State<FloorMapScreen> {
  late Future<List<VenueTable>> _future;
  Venue? venue;

  @override
  void initState() {
    super.initState();
    _reload();
    ApiClient.instance.fetchVenue(widget.venueId).then((v) {
      if (mounted) setState(() => venue = v);
    });
  }

  void _reload() {
    setState(() {
      _future = ApiClient.instance.fetchTables(widget.venueId);
    });
  }

  Future<void> _openTable(VenueTable t) async {
    if (widget.selectMode && t.status == 'FREE') {
      Navigator.pop(context, t);
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: FaColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _TableSheet(
        table: t,
        venueId: widget.venueId,
        venueName: widget.venueName,
        venue: venue,
        onChanged: _reload,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.venueName),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(
              child: Text(
                'floor.today'.tr(),
                style: const TextStyle(color: FaColors.muted),
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: FutureBuilder<List<VenueTable>>(
              future: _future,
              builder: (context, snap) {
                if (!snap.hasData) {
                  return const Center(
                    child: CircularProgressIndicator(color: FaColors.gold),
                  );
                }
                final tables = snap.data!;
                return Padding(
                  padding: const EdgeInsets.all(16),
                  child: RestaurantFloorPlan(
                    tables: tables,
                    locale: context.locale.languageCode,
                    onTableTap: _openTable,
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            child: Wrap(
              spacing: 12,
              runSpacing: 8,
              children: [
                _leg(RestaurantFloorPlan.tableTan, 'floor.leg_free'.tr()),
                _leg(RestaurantFloorPlan.tableOccupied, 'floor.leg_occ'.tr()),
                _leg(RestaurantFloorPlan.tableReserved, 'floor.leg_res'.tr()),
                _leg(RestaurantFloorPlan.olive, 'floor.leg_yours'.tr()),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _leg(Color c, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(color: c, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: const TextStyle(fontSize: 12, color: FaColors.muted),
        ),
      ],
    );
  }
}

class _TableSheet extends StatelessWidget {
  const _TableSheet({
    required this.table,
    required this.venueId,
    required this.venueName,
    required this.venue,
    required this.onChanged,
  });

  final VenueTable table;
  final String venueId;
  final String venueName;
  final Venue? venue;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final t = table;
    String statusLabel;
    switch (t.status) {
      case 'FREE':
        statusLabel = 'table.status_free'.tr();
      case 'OCCUPIED':
        statusLabel = 'table.status_occupied'.tr();
      case 'RESERVED':
        statusLabel = 'table.status_reserved'.tr();
      default:
        statusLabel = 'table.status_yours'.tr();
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'table.title'.tr(args: ['${t.number}']),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(
            statusLabel,
            textAlign: TextAlign.center,
            style: const TextStyle(color: FaColors.gold),
          ),
          const SizedBox(height: 8),
          Text(
            'table.seats'.tr(args: ['${t.seats}']),
            textAlign: TextAlign.center,
            style: const TextStyle(color: FaColors.muted),
          ),
          const SizedBox(height: 16),
          if (t.status == 'OCCUPIED') ...[
            Text('table.arrived_at'.tr(args: [formatClock(t.occupiedSince)])),
            const SizedBox(height: 4),
            Text(
              'table.arrived_hint'.tr(),
              style: const TextStyle(color: FaColors.muted, fontSize: 13),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () async {
                final ok = await ensureAuth(context);
                if (!ok || !context.mounted) return;
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: Text('table.notify_confirm_title'.tr()),
                    content: Text(
                      'table.notify_confirm_body'.tr(args: ['${t.number}']),
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(ctx, false),
                        child: Text('common.cancel'.tr()),
                      ),
                      FilledButton(
                        onPressed: () => Navigator.pop(ctx, true),
                        child: Text('common.confirm'.tr()),
                      ),
                    ],
                  ),
                );
                if (confirm != true || !context.mounted) return;
                try {
                  await ApiClient.instance.watchTable(
                    venueId: venueId,
                    tableId: t.id,
                  );
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('table.notify_set'.tr())),
                    );
                    Navigator.pop(context);
                  }
                } catch (_) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('common.error'.tr())),
                    );
                  }
                }
              },
              child: Text('table.notify_free'.tr()),
            ),
          ],
          if (t.status == 'RESERVED') ...[
            Text('table.reserved_for'.tr(args: [formatClock(t.reservedFor)])),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () async {
                final ok = await ensureAuth(context);
                if (!ok || !context.mounted) return;
                final time = formatClock(t.reservedFor);
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: Text('table.im_coming_confirm_title'.tr()),
                    content: Text(
                      'table.im_coming_confirm_body'.tr(args: [time]),
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(ctx, false),
                        child: Text('common.cancel'.tr()),
                      ),
                      FilledButton(
                        onPressed: () => Navigator.pop(ctx, true),
                        child: Text('table.im_coming_ok'.tr()),
                      ),
                    ],
                  ),
                );
                if (confirm != true || !context.mounted) return;
                try {
                  if (t.reservationId != null) {
                    await ApiClient.instance.confirmArrival(t.reservationId!);
                  }
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('table.im_coming_set'.tr(args: [time])),
                      ),
                    );
                    Navigator.pop(context);
                  }
                } catch (_) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('common.error'.tr())),
                    );
                  }
                }
              },
              child: Text('table.im_coming'.tr()),
            ),
          ],
          if (t.status == 'FREE') ...[
            FilledButton(
              onPressed: () async {
                final ok = await ensureAuth(context);
                if (!ok || !context.mounted) return;
                Venue? v = venue;
                v ??= await ApiClient.instance.fetchVenue(venueId);
                if (!context.mounted) return;
                Navigator.pop(context);
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) =>
                        ReservationScreen(venue: v!, preselectedTable: t),
                  ),
                );
              },
              child: Text('table.book_this'.tr()),
            ),
          ],
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('common.close'.tr()),
          ),
        ],
      ),
    );
  }
}
