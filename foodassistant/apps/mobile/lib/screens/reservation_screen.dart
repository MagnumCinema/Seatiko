import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/screens/floor_map_screen.dart';
import 'package:mobile/screens/menu_screen.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/restaurant_floor_plan.dart';

class ReservationScreen extends StatefulWidget {
  const ReservationScreen({
    super.key,
    required this.venue,
    this.preselectedTable,
  });

  final Venue venue;
  final VenueTable? preselectedTable;

  @override
  State<ReservationScreen> createState() => _ReservationScreenState();
}

class _ReservationScreenState extends State<ReservationScreen> {
  late DateTime reservedFor;
  int guests = 2;
  VenueTable? table;
  late Future<List<VenueTable>> tablesFuture;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    table = widget.preselectedTable;
    tablesFuture = ApiClient.instance.fetchTables(widget.venue.id);
    final d = DateTime.now().add(const Duration(hours: 1, minutes: 30));
    reservedFor = DateTime(
      d.year,
      d.month,
      d.day,
      d.hour,
      (d.minute ~/ 15) * 15,
    );
  }

  Future<void> _pickTable() async {
    final locale = context.locale.languageCode;
    final selected = await Navigator.of(context).push<VenueTable>(
      MaterialPageRoute(
        builder: (_) => FloorMapScreen(
          venueId: widget.venue.id,
          venueName: widget.venue.name.pick(locale),
          selectMode: true,
        ),
      ),
    );
    if (selected != null) setState(() => table = selected);
  }

  Future<void> _confirm({required bool preorder}) async {
    if (table == null) {
      await _pickTable();
      if (table == null) return;
    }
    setState(() => busy = true);
    try {
      await ApiClient.instance.createReservation(
        venueId: widget.venue.id,
        tableId: table!.id,
        guests: guests,
        reservedFor: reservedFor,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('reservation.success'.tr())));
      if (preorder) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => MenuScreen(
              venueId: widget.venue.id,
              venueName: widget.venue.name.pick(context.locale.languageCode),
              sessionId: null,
              preorderMode: true,
            ),
          ),
        );
      } else {
        Navigator.of(context).popUntil((r) => r.isFirst);
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('common.error'.tr())));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    return Scaffold(
      appBar: AppBar(title: Text('reservation.title'.tr())),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _row('reservation.venue'.tr(), widget.venue.name.pick(locale)),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'floor.select_table'.tr(),
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      table == null
                          ? 'Нажмите на свободный стол на плане'
                          : 'Стол №${table!.number} · ${table!.seats} мест',
                      style: const TextStyle(
                        color: FaColors.muted,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              TextButton.icon(
                onPressed: _pickTable,
                icon: const Icon(Icons.open_in_full_rounded, size: 15),
                label: const Text('Открыть', style: TextStyle(fontSize: 11)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 300,
            child: FutureBuilder<List<VenueTable>>(
              future: tablesFuture,
              builder: (context, snapshot) {
                if (!snapshot.hasData) {
                  return const Center(
                    child: CircularProgressIndicator(color: FaColors.clay),
                  );
                }
                return RestaurantFloorPlan(
                  compact: true,
                  tables: snapshot.data!,
                  locale: context.locale.languageCode,
                  selectedTableId: table?.id,
                  onTableTap: (candidate) {
                    if (candidate.status == 'FREE') {
                      setState(() => table = candidate);
                    } else {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            candidate.status == 'RESERVED'
                                ? 'Этот стол уже забронирован'
                                : 'Сейчас этот стол занят',
                          ),
                        ),
                      );
                    }
                  },
                );
              },
            ),
          ),
          const SizedBox(height: 10),
          const Wrap(
            spacing: 12,
            runSpacing: 6,
            children: [
              _FloorLegend(color: FaColors.free, label: 'Свободен'),
              _FloorLegend(color: FaColors.reserved, label: 'Забронирован'),
              _FloorLegend(color: FaColors.occupied, label: 'Занят'),
            ],
          ),
          const SizedBox(height: 16),
          const Divider(color: FaColors.border),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text('reservation.time'.tr()),
            subtitle: Text(
              '${reservedFor.day}.${reservedFor.month}.${reservedFor.year} '
              '${formatClock(reservedFor)}',
            ),
            trailing: const Icon(Icons.schedule, color: FaColors.gold),
            onTap: () async {
              final date = await showDatePicker(
                context: context,
                firstDate: DateTime.now(),
                lastDate: DateTime.now().add(const Duration(days: 60)),
                initialDate: reservedFor,
              );
              if (date == null || !context.mounted) return;
              final time = await showTimePicker(
                context: context,
                initialTime: TimeOfDay.fromDateTime(reservedFor),
              );
              if (time == null || !mounted) return;
              setState(() {
                reservedFor = DateTime(
                  date.year,
                  date.month,
                  date.day,
                  time.hour,
                  time.minute,
                );
              });
            },
          ),
          const Divider(color: FaColors.border),
          Text('reservation.guests'.tr()),
          Row(
            children: [
              IconButton(
                onPressed: guests > 1 ? () => setState(() => guests--) : null,
                icon: const Icon(Icons.remove_circle_outline),
              ),
              Text(
                '$guests',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
              IconButton(
                onPressed: guests < 12 ? () => setState(() => guests++) : null,
                icon: const Icon(Icons.add_circle_outline),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            'reservation.preorder_hint'.tr(),
            style: const TextStyle(color: FaColors.muted, fontSize: 13),
          ),
          const SizedBox(height: 20),
          OutlinedButton(
            onPressed: busy ? null : () => _confirm(preorder: true),
            child: Text('reservation.preorder'.tr()),
          ),
          const SizedBox(height: 10),
          FilledButton(
            onPressed: busy ? null : () => _confirm(preorder: false),
            child: busy
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text('reservation.confirm_book'.tr()),
          ),
        ],
      ),
    );
  }

  Widget _row(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: FaColors.muted)),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }
}

class _FloorLegend extends StatelessWidget {
  const _FloorLegend({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 5),
        Text(
          label,
          style: const TextStyle(color: FaColors.muted, fontSize: 10),
        ),
      ],
    );
  }
}
