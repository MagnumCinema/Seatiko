import 'dart:async';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/errors.dart';
import 'package:mobile/screens/reservation_screen.dart';
import 'package:mobile/screens/session_screen.dart';
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
  Set<String> _yoursTableIds = {};
  Map<String, Reservation> _myReservationsByTable = {};
  Session? _activeSession;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _reload();
    ApiClient.instance.fetchVenue(widget.venueId).then((v) {
      if (mounted) setState(() => venue = v);
    }).catchError((_) {});
    _pollTimer = Timer.periodic(
      const Duration(seconds: 20),
      (_) => _reload(silent: true),
    );
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  void _reload({bool silent = false}) {
    final future = ApiClient.instance.fetchTables(widget.venueId);
    if (!silent) {
      setState(() {
        _future = future;
      });
    } else {
      future.then((tables) {
        if (mounted) {
          setState(() {
            _future = Future.value(tables);
          });
        }
      }).catchError((_) {});
    }
    _refreshMine();
  }

  Future<void> _refreshMine() async {
    final token = await ApiClient.instance.getToken();
    if (token == null || token.isEmpty) {
      if (mounted) {
        setState(() {
          _yoursTableIds = {};
          _myReservationsByTable = {};
          _activeSession = null;
        });
      }
      return;
    }
    try {
      final results = await Future.wait([
        ApiClient.instance.fetchReservations(),
        ApiClient.instance.fetchActiveSession(),
      ]);
      final resList = results[0] as List<Reservation>;
      final session = results[1] as Session?;
      final yours = <String>{};
      final byTable = <String, Reservation>{};
      for (final r in resList) {
        if (r.venueId != widget.venueId) continue;
        if (r.status == 'CONFIRMED' || r.status == 'CHECKED_IN') {
          if (r.tableId.isNotEmpty) {
            yours.add(r.tableId);
            byTable[r.tableId] = r;
          }
          for (final tid in r.tableIds) {
            yours.add(tid);
            byTable[tid] = r;
          }
        }
      }
      if (session != null && session.venueId == widget.venueId) {
        yours.add(session.tableId);
      }
      if (mounted) {
        setState(() {
          _yoursTableIds = yours;
          _myReservationsByTable = byTable;
          _activeSession =
              (session != null && session.venueId == widget.venueId)
              ? session
              : null;
        });
      }
    } catch (_) {}
  }

  Future<void> _openTable(VenueTable t) async {
    if (widget.selectMode && t.status == 'FREE') {
      Navigator.pop(context, t);
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: FaColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _TableSheet(
        table: t,
        venueId: widget.venueId,
        venueName: widget.venueName,
        venue: venue,
        isYours: _yoursTableIds.contains(t.id),
        myReservation: _myReservationsByTable[t.id],
        activeSession:
            (_activeSession != null && _activeSession!.tableId == t.id)
            ? _activeSession
            : null,
        onChanged: () => _reload(),
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
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Expanded(
              child: FutureBuilder<List<VenueTable>>(
                future: _future,
                builder: (context, snap) {
                  if (snap.connectionState != ConnectionState.done) {
                    return const Center(
                      child: CircularProgressIndicator(color: FaColors.gold),
                    );
                  }
                  if (snap.hasError || !snap.hasData) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              snap.hasError
                                  ? apiErrorText(snap.error!)
                                  : 'common.error'.tr(),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 12),
                            FilledButton(
                              onPressed: () => _reload(),
                              child: Text('common.retry'.tr()),
                            ),
                          ],
                        ),
                      ),
                    );
                  }
                  final tables = snap.data!;
                  return Padding(
                    padding: const EdgeInsets.all(16),
                    child: RestaurantFloorPlan(
                      tables: tables,
                      locale: context.locale.languageCode,
                      yoursTableIds: _yoursTableIds,
                      onTableTap: _openTable,
                    ),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
              child: Wrap(
                spacing: 12,
                runSpacing: 8,
                children: [
                  _leg(RestaurantFloorPlan.tableTan, 'floor.leg_free'.tr()),
                  _leg(RestaurantFloorPlan.tableOccupied, 'floor.leg_occ'.tr()),
                  _leg(RestaurantFloorPlan.tableReserved, 'floor.leg_res'.tr()),
                  _leg(FaColors.yours, 'floor.leg_yours'.tr()),
                  _leg(
                    RestaurantFloorPlan.tableCleaning,
                    'table.status_cleaning'.tr(),
                  ),
                ],
              ),
            ),
          ],
        ),
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

class _TableSheet extends StatefulWidget {
  const _TableSheet({
    required this.table,
    required this.venueId,
    required this.venueName,
    required this.venue,
    required this.isYours,
    required this.myReservation,
    required this.activeSession,
    required this.onChanged,
  });

  final VenueTable table;
  final String venueId;
  final String venueName;
  final Venue? venue;
  final bool isYours;
  final Reservation? myReservation;
  final Session? activeSession;
  final VoidCallback onChanged;

  @override
  State<_TableSheet> createState() => _TableSheetState();
}

class _TableSheetState extends State<_TableSheet> {
  bool _busy = false;

  String _countdownLabel(DateTime? target) {
    if (target == null) return '';
    final diff = target.difference(DateTime.now());
    if (diff.isNegative) return '';
    final mins = diff.inMinutes;
    if (mins < 60) return '$mins min';
    final h = mins ~/ 60;
    final m = mins % 60;
    return m == 0 ? '${h}h' : '${h}h ${m}m';
  }

  Future<void> _confirmArrivalFlow(Reservation res) async {
    final maxLate = (widget.venue?.maxLateArrivalMin ?? 30).clamp(
      widget.venue?.holdMinutes ?? 15,
      60,
    );
    final now = DateTime.now();
    final reservedFor = res.reservedFor;

    final options = <({String label, DateTime? arrival, bool enabled})>[
      (
        label: 'table.arrival_now'.tr(),
        arrival: now,
        enabled: now.isBefore(reservedFor.add(Duration(minutes: maxLate))),
      ),
      (
        label: 'table.arrival_ontime'.tr(args: [formatClock(reservedFor)]),
        arrival: reservedFor,
        enabled: reservedFor.isAfter(now.subtract(const Duration(minutes: 10))),
      ),
      (
        label: 'table.arrival_plus_15'.tr(),
        arrival: reservedFor.add(const Duration(minutes: 15)),
        enabled: 15 <= maxLate,
      ),
      (
        label: 'table.arrival_plus_20'.tr(),
        arrival: reservedFor.add(const Duration(minutes: 20)),
        enabled: 20 <= maxLate,
      ),
    ];

    int selectedIdx = options.indexWhere((o) => o.enabled);
    if (selectedIdx < 0) selectedIdx = 0;

    final chosen = await showDialog<DateTime?>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text('table.im_coming_confirm_title'.tr()),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'table.im_coming_confirm_body'.tr(
                  args: [formatClock(reservedFor)],
                ),
              ),
              const SizedBox(height: 12),
              ...List.generate(options.length, (i) {
                final opt = options[i];
                final isSelected = selectedIdx == i;
                return ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  enabled: opt.enabled,
                  onTap: opt.enabled
                      ? () => setDialogState(() => selectedIdx = i)
                      : null,
                  leading: Icon(
                    isSelected
                        ? Icons.radio_button_checked
                        : Icons.radio_button_off,
                    color: opt.enabled ? FaColors.green : FaColors.muted,
                  ),
                  title: Text(opt.label),
                );
              }),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: Text('common.cancel'.tr()),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, options[selectedIdx].arrival),
              child: Text('table.im_coming_ok'.tr()),
            ),
          ],
        ),
      ),
    );
    if (chosen == null || !mounted) return;
    setState(() => _busy = true);
    try {
      final updated = await ApiClient.instance.confirmArrival(
        res.id,
        expectedArrival: chosen,
      );
      if (!mounted) return;
      widget.onChanged();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'table.im_coming_set'.tr(
              args: [formatClock(updated.expectedArrival ?? reservedFor)],
            ),
          ),
        ),
      );
      Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(apiErrorText(e))),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.table;
    String statusLabel;
    if (widget.isYours) {
      statusLabel = 'table.status_yours'.tr();
    } else {
      switch (t.status) {
        case 'FREE':
          statusLabel = 'table.status_free'.tr();
        case 'OCCUPIED':
          statusLabel = 'table.status_occupied'.tr();
        case 'RESERVED':
          statusLabel = 'table.status_reserved'.tr();
        case 'CLEANING':
          statusLabel = 'table.status_cleaning'.tr();
        default:
          statusLabel = t.status;
      }
    }

    final countdown = _countdownLabel(t.reservedFor);
    final sessionStartBefore = widget.venue?.sessionStartBeforeMin ?? 60;
    final releaseBefore = widget.venue?.releaseBeforeMin ?? 15;

    return SafeArea(
      top: false,
      child: Padding(
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
              'table.title'.tr(args: ['${t.number}']),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            Text(
              statusLabel,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: widget.isYours ? FaColors.yours : FaColors.gold,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'table.seats'.tr(args: ['${t.seats}']),
              textAlign: TextAlign.center,
              style: const TextStyle(color: FaColors.muted),
            ),
            const SizedBox(height: 16),
            if (widget.isYours && widget.activeSession != null) ...[
              FilledButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => SessionScreen(
                        session: widget.activeSession!,
                        venue: widget.venue,
                        table: t,
                      ),
                    ),
                  );
                },
                icon: const Icon(Icons.restaurant_menu_rounded),
                label: Text('table.go_session'.tr()),
              ),
            ] else if (widget.isYours && widget.myReservation != null) ...[
              Text(
                'table.reserved_for'.tr(
                  args: [formatClock(widget.myReservation!.reservedFor)],
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              if (widget.myReservation!.status == 'CONFIRMED')
                FilledButton(
                  onPressed: _busy
                      ? null
                      : () => _confirmArrivalFlow(widget.myReservation!),
                  child: Text('table.im_coming'.tr()),
                ),
            ] else if (t.status == 'OCCUPIED') ...[
              Text('table.arrived_at'.tr(args: [formatClock(t.occupiedSince)])),
              const SizedBox(height: 4),
              Text(
                'table.arrived_hint'.tr(),
                style: const TextStyle(color: FaColors.muted, fontSize: 13),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _busy
                    ? null
                    : () async {
                        final ok = await ensureAuth(context);
                        if (!ok || !context.mounted) return;
                        final confirm = await showDialog<bool>(
                          context: context,
                          builder: (ctx) => AlertDialog(
                            title: Text('table.notify_confirm_title'.tr()),
                            content: Text(
                              'table.notify_confirm_body'.tr(
                                args: ['${t.number}'],
                              ),
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
                        setState(() => _busy = true);
                        try {
                          await ApiClient.instance.watchTable(
                            venueId: widget.venueId,
                            tableId: t.id,
                          );
                          if (context.mounted) {
                            widget.onChanged();
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('table.notify_set'.tr())),
                            );
                            Navigator.pop(context);
                          }
                        } catch (e) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(apiErrorText(e))),
                            );
                          }
                        } finally {
                          if (mounted) setState(() => _busy = false);
                        }
                      },
                child: Text('table.notify_free'.tr()),
              ),
            ] else if (t.status == 'RESERVED') ...[
              Text('table.reserved_for'.tr(args: [formatClock(t.reservedFor)])),
              if (countdown.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  'table.until_booking'.tr(args: [countdown]),
                  style: const TextStyle(
                    color: FaColors.gold,
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
              ],
              const SizedBox(height: 6),
              Text(
                'table.rules_before_booking'.tr(
                  args: ['$sessionStartBefore', '$releaseBefore'],
                ),
                style: const TextStyle(color: FaColors.muted, fontSize: 12),
              ),
              if (widget.myReservation != null &&
                  widget.myReservation!.status == 'CONFIRMED') ...[
                const SizedBox(height: 14),
                FilledButton(
                  onPressed: _busy
                      ? null
                      : () => _confirmArrivalFlow(widget.myReservation!),
                  child: Text('table.im_coming'.tr()),
                ),
              ],
            ] else if (t.status == 'CLEANING') ...[
              Text(
                'table.cleaning_hint'.tr(),
                textAlign: TextAlign.center,
                style: const TextStyle(color: FaColors.muted, fontSize: 13),
              ),
            ] else if (t.status == 'FREE') ...[
              FilledButton(
                onPressed: () async {
                  final ok = await ensureAuth(context);
                  if (!ok || !context.mounted) return;
                  Venue? v = widget.venue;
                  v ??= await ApiClient.instance.fetchVenue(widget.venueId);
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
      ),
    );
  }
}
