import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/errors.dart';
import 'package:mobile/screens/floor_map_screen.dart';
import 'package:mobile/screens/menu_screen.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/restaurant_floor_plan.dart';

class ReservationScreen extends StatefulWidget {
  const ReservationScreen({
    super.key,
    required this.venue,
    this.preselectedTable,
    this.existingReservation,
  });

  final Venue venue;
  final VenueTable? preselectedTable;
  final Reservation? existingReservation;

  @override
  State<ReservationScreen> createState() => _ReservationScreenState();
}

class _ReservationScreenState extends State<ReservationScreen> {
  late DateTime selectedDate;
  DateTime? selectedSlot;
  late int durationMin;
  late int guests;
  VenueTable? table;
  final notesCtrl = TextEditingController();
  late Future<({List<VenueTable> tables, List<VenueScheduleSlot> slots})>
  _loadFuture;
  bool busy = false;

  bool get isEditing => widget.existingReservation != null;

  @override
  void initState() {
    super.initState();
    final existing = widget.existingReservation;
    table = widget.preselectedTable;
    guests = existing?.guests ?? 2;
    durationMin = existing?.durationMin ?? widget.venue.visitDurationMin;
    if (existing != null) {
      notesCtrl.text = existing.notes;
      selectedDate = DateTime(
        existing.reservedFor.year,
        existing.reservedFor.month,
        existing.reservedFor.day,
      );
      selectedSlot = existing.reservedFor;
    } else {
      final now = DateTime.now();
      selectedDate = DateTime(now.year, now.month, now.day);
    }
    _reloadData();
  }

  @override
  void dispose() {
    notesCtrl.dispose();
    super.dispose();
  }

  void _reloadData() {
    setState(() {
      _loadFuture = _fetchData();
    });
  }

  Future<({List<VenueTable> tables, List<VenueScheduleSlot> slots})>
  _fetchData() async {
    final results = await Future.wait([
      ApiClient.instance.fetchTables(widget.venue.id),
      ApiClient.instance
          .fetchVenueSchedule(widget.venue.id)
          .catchError((_) => <VenueScheduleSlot>[]),
    ]);
    final tables = results[0] as List<VenueTable>;
    final slots = results[1] as List<VenueScheduleSlot>;
    if (table == null && widget.existingReservation != null) {
      table = tables
          .where((t) => t.id == widget.existingReservation!.tableId)
          .firstOrNull;
    }
    return (tables: tables, slots: slots);
  }

  List<DateTime> _generateSlots(List<VenueScheduleSlot> schedule) {
    final step = widget.venue.bookingIntervalMin.clamp(15, 120);
    final now = DateTime.now();
    final dayStart = DateTime(
      selectedDate.year,
      selectedDate.month,
      selectedDate.day,
      10,
      0,
    );
    final dayEnd = DateTime(
      selectedDate.year,
      selectedDate.month,
      selectedDate.day,
      22,
      30,
    );
    final out = <DateTime>[];
    var cursor = dayStart;
    while (!cursor.isAfter(dayEnd)) {
      final end = cursor.add(Duration(minutes: durationMin));
      final inFuture = cursor.isAfter(now.add(const Duration(minutes: 15)));
      var overlaps = false;
      if (table != null) {
        for (final s in schedule) {
          if (s.tableId != table!.id) continue;
          if (isEditing && s.id == widget.existingReservation!.id) continue;
          if (cursor.isBefore(s.endsAt) && end.isAfter(s.startsAt)) {
            overlaps = true;
            break;
          }
        }
      }
      if (inFuture && !overlaps) {
        out.add(cursor);
      }
      cursor = cursor.add(Duration(minutes: step));
    }
    return out;
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
    final messenger = ScaffoldMessenger.of(context);
    if (table == null) {
      await _pickTable();
      if (table == null || !mounted) return;
    }
    final slot = selectedSlot;
    if (slot == null) {
      messenger.showSnackBar(
        SnackBar(content: Text('reservation.pick_slot_hint'.tr())),
      );
      return;
    }
    setState(() => busy = true);
    try {
      final Reservation res;
      if (isEditing) {
        res = await ApiClient.instance.updateReservation(
          widget.existingReservation!.id,
          tableId: table!.id,
          guests: guests,
          reservedFor: slot,
          notes: notesCtrl.text.trim(),
        );
      } else {
        res = await ApiClient.instance.createReservation(
          venueId: widget.venue.id,
          tableId: table!.id,
          guests: guests,
          reservedFor: slot,
          durationMin: durationMin,
          notes: notesCtrl.text.trim(),
        );
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('reservation.success'.tr())),
      );
      if (preorder) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => MenuScreen(
              venueId: widget.venue.id,
              venueName: widget.venue.name.pick(context.locale.languageCode),
              reservationId: res.id,
              preorderMode: true,
              venue: widget.venue,
            ),
          ),
        );
      } else {
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(apiErrorText(e))),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    final maxDur = widget.venue.maxVisitDurationMin.clamp(60, 360);
    final durations = <int>[];
    for (var d = 60; d <= maxDur; d += 30) {
      durations.add(d);
    }
    if (!durations.contains(durationMin)) {
      durations.add(durationMin);
      durations.sort();
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(
          isEditing
              ? 'reservation.edit_title'.tr()
              : 'reservation.title'.tr(),
        ),
      ),
      body: SafeArea(
        top: false,
        child: FutureBuilder<({List<VenueTable> tables, List<VenueScheduleSlot> slots})>(
          future: _loadFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(
                child: CircularProgressIndicator(color: FaColors.clay),
              );
            }
            if (snapshot.hasError || !snapshot.hasData) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        snapshot.hasError
                            ? apiErrorText(snapshot.error!)
                            : 'common.error'.tr(),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: _reloadData,
                        child: Text('common.retry'.tr()),
                      ),
                    ],
                  ),
                ),
              );
            }

            final data = snapshot.data!;
            final slots = _generateSlots(data.slots);
            if (selectedSlot != null &&
                !slots.any((s) => s.isAtSameMomentAs(selectedSlot!))) {
              selectedSlot = slots.firstOrNull;
            }
            selectedSlot ??= slots.firstOrNull;

            return ListView(
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
                                ? 'reservation.tap_free_table'.tr()
                                : 'reservation.selected_table'.tr(
                                    args: ['${table!.number}', '${table!.seats}'],
                                  ),
                            style: const TextStyle(
                              color: FaColors.muted,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    TextButton.icon(
                      onPressed: _pickTable,
                      icon: const Icon(Icons.open_in_full_rounded, size: 15),
                      label: Text(
                        'reservation.open_floor'.tr(),
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: 280,
                  child: RestaurantFloorPlan(
                    compact: true,
                    tables: data.tables,
                    locale: locale,
                    selectedTableId: table?.id,
                    onTableTap: (candidate) {
                      if (candidate.status == 'FREE' ||
                          (isEditing &&
                              candidate.id ==
                                  widget.existingReservation!.tableId)) {
                        setState(() => table = candidate);
                      } else {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                              candidate.status == 'RESERVED'
                                  ? 'reservation.table_already_reserved'.tr()
                                  : 'reservation.table_occupied_now'.tr(),
                            ),
                          ),
                        );
                      }
                    },
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 12,
                  runSpacing: 6,
                  children: [
                    _FloorLegend(
                      color: FaColors.free,
                      label: 'table.status_free'.tr(),
                    ),
                    _FloorLegend(
                      color: FaColors.reserved,
                      label: 'table.status_reserved'.tr(),
                    ),
                    _FloorLegend(
                      color: FaColors.occupied,
                      label: 'table.status_occupied'.tr(),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                const Divider(color: FaColors.border),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('reservation.date'.tr()),
                  subtitle: Text(
                    '${selectedDate.day.toString().padLeft(2, '0')}.${selectedDate.month.toString().padLeft(2, '0')}.${selectedDate.year}',
                  ),
                  trailing: const Icon(Icons.calendar_today_outlined, color: FaColors.gold),
                  onTap: () async {
                    final date = await showDatePicker(
                      context: context,
                      firstDate: DateTime.now(),
                      lastDate: DateTime.now().add(const Duration(days: 60)),
                      initialDate: selectedDate,
                    );
                    if (date == null || !mounted) return;
                    setState(() {
                      selectedDate = date;
                      selectedSlot = null;
                    });
                  },
                ),
                const SizedBox(height: 8),
                Text(
                  'reservation.duration'.tr(),
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: durations.map((d) {
                      final active = d == durationMin;
                      final hrs = d ~/ 60;
                      final mins = d % 60;
                      final label = mins == 0 ? '${hrs}h' : '${hrs}h ${mins}m';
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(label),
                          selected: active,
                          onSelected: (_) => setState(() => durationMin = d),
                        ),
                      );
                    }).toList(),
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  'reservation.time'.tr(),
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                if (slots.isEmpty)
                  Text(
                    'reservation.no_slots'.tr(),
                    style: const TextStyle(color: FaColors.muted),
                  )
                else
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: slots.map((s) {
                      final active =
                          selectedSlot != null &&
                          s.isAtSameMomentAs(selectedSlot!);
                      return ChoiceChip(
                        label: Text(formatClock(s)),
                        selected: active,
                        onSelected: (_) => setState(() => selectedSlot = s),
                      );
                    }).toList(),
                  ),
                const SizedBox(height: 12),
                const Divider(color: FaColors.border),
                Text('reservation.guests'.tr()),
                Row(
                  children: [
                    IconButton(
                      onPressed: guests > 1
                          ? () => setState(() => guests--)
                          : null,
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
                      onPressed: guests < 12
                          ? () => setState(() => guests++)
                          : null,
                      icon: const Icon(Icons.add_circle_outline),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: notesCtrl,
                  maxLines: 2,
                  decoration: InputDecoration(
                    labelText: 'reservation.notes'.tr(),
                    hintText: 'reservation.notes_hint'.tr(),
                  ),
                ),
                const SizedBox(height: 14),
                ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  title: Text(
                    'venue.booking_rules'.tr(),
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Text(
                        'venue.rule_hold'.tr(
                          args: [
                            '${widget.venue.holdMinutes}',
                            '${widget.venue.maxLateArrivalMin}',
                          ],
                        ),
                        style: const TextStyle(
                          color: FaColors.muted,
                          fontSize: 12,
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'reservation.preorder_hint'.tr(),
                  style: const TextStyle(color: FaColors.muted, fontSize: 13),
                ),
                const SizedBox(height: 18),
                if (!isEditing && widget.venue.allowPreorder) ...[
                  OutlinedButton(
                    onPressed: busy ? null : () => _confirm(preorder: true),
                    child: Text('reservation.preorder'.tr()),
                  ),
                  const SizedBox(height: 10),
                ],
                FilledButton(
                  onPressed: busy ? null : () => _confirm(preorder: false),
                  child: busy
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(
                          isEditing
                              ? 'common.save'.tr()
                              : 'reservation.confirm_book'.tr(),
                        ),
                ),
              ],
            );
          },
        ),
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
