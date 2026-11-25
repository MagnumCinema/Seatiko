import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/api.dart';
import 'package:mobile/errors.dart';
import 'package:mobile/screens/menu_screen.dart';
import 'package:mobile/screens/reservation_screen.dart';
import 'package:mobile/screens/session_screen.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/auth_sheet.dart';
import 'package:mobile/widgets/shimmer.dart';

class OrdersTab extends StatefulWidget {
  const OrdersTab({super.key});

  @override
  State<OrdersTab> createState() => OrdersTabState();
}

class OrdersTabState extends State<OrdersTab>
    with SingleTickerProviderStateMixin {
  late TabController tabs;
  List<Order> orders = [];
  List<Reservation> reservations = [];
  List<WaitlistEntry> waitlist = [];
  List<EventInquiry> inquiries = [];
  Session? activeSession;
  Venue? sessionVenue;
  VenueTable? sessionTable;
  bool loading = true;
  bool authed = false;
  Object? error;

  @override
  void initState() {
    super.initState();
    tabs = TabController(length: 2, vsync: this);
    reload();
  }

  @override
  void dispose() {
    tabs.dispose();
    super.dispose();
  }

  Future<void> reload() async {
    final token = await ApiClient.instance.getToken();
    if (token == null || token.isEmpty) {
      if (mounted) {
        setState(() {
          authed = false;
          loading = false;
          error = null;
          orders = [];
          reservations = [];
          waitlist = [];
          inquiries = [];
          activeSession = null;
          sessionVenue = null;
          sessionTable = null;
        });
      }
      return;
    }
    setState(() {
      authed = true;
      loading = true;
      error = null;
    });
    try {
      final results = await Future.wait([
        ApiClient.instance.fetchOrders(),
        ApiClient.instance.fetchReservations(),
        ApiClient.instance.fetchMyWaitlist().catchError((_) => <WaitlistEntry>[]),
        ApiClient.instance.listEventInquiries().catchError((_) => <EventInquiry>[]),
        ApiClient.instance.fetchActiveSession(),
      ]);
      final o = results[0] as List<Order>;
      final r = results[1] as List<Reservation>;
      final w = results[2] as List<WaitlistEntry>;
      final inq = results[3] as List<EventInquiry>;
      final sess = results[4] as Session?;
      Venue? sVenue;
      VenueTable? sTable;
      if (sess != null) {
        try {
          sVenue = await ApiClient.instance.fetchVenue(sess.venueId);
          final tables = await ApiClient.instance.fetchTables(sess.venueId);
          sTable = tables.where((t) => t.id == sess.tableId).firstOrNull;
        } catch (_) {}
      }
      if (mounted) {
        setState(() {
          orders = o;
          reservations = r;
          waitlist = w;
          inquiries = inq;
          activeSession = sess;
          sessionVenue = sVenue;
          sessionTable = sTable;
          loading = false;
        });
      }
    } on ApiException catch (e) {
      if (e.status == 401) {
        if (mounted) {
          setState(() {
            authed = false;
            loading = false;
            error = null;
          });
        }
        return;
      }
      if (mounted) {
        setState(() {
          error = e;
          loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e;
          loading = false;
        });
      }
    }
  }

  int get spentTotal => orders
      .where((o) => o.status == 'PAID')
      .fold(0, (sum, o) => sum + o.total);

  Future<void> _clearHistory() async {
    try {
      final cleared = await ApiClient.instance.clearHistoryReservations();
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('orders.history_cleared'.tr(args: ['$cleared']))),
      );
      reload();
    } catch (e) {
      if (mounted) {
        HapticFeedback.heavyImpact();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(apiErrorText(e))),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'orders.title'.tr(),
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                if (authed && spentTotal > 0)
                  Text(
                    '${'orders.spent'.tr()}: $spentTotal MDL',
                    style: const TextStyle(
                      color: FaColors.gold,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
              ],
            ),
          ),
          TabBar(
            controller: tabs,
            labelColor: FaColors.gold,
            unselectedLabelColor: FaColors.muted,
            indicatorColor: FaColors.gold,
            tabs: [
              Tab(text: 'orders.active'.tr()),
              Tab(text: 'orders.history'.tr()),
            ],
          ),
          Expanded(
            child: !authed
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'orders.need_auth'.tr(),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'auth.body'.tr(),
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: FaColors.muted),
                          ),
                          const SizedBox(height: 16),
                          FilledButton(
                            onPressed: () async {
                              await showAuthSheet(context);
                              reload();
                            },
                            child: Text('profile.sign_in'.tr()),
                          ),
                          TextButton(
                            onPressed: () async {
                              await showAuthSheet(context, register: true);
                              reload();
                            },
                            child: Text('auth.switch_register'.tr()),
                          ),
                        ],
                      ),
                    ),
                  )
                : loading
                ? const CardListShimmer()
                : error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            apiErrorText(error!),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 12),
                          FilledButton(
                            onPressed: reload,
                            child: Text('common.retry'.tr()),
                          ),
                        ],
                      ),
                    ),
                  )
                : TabBarView(
                    controller: tabs,
                    children: [
                      _list(locale, active: true),
                      _list(locale, active: false),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _list(String locale, {required bool active}) {
    final bottomPad = MediaQuery.paddingOf(context).bottom + 96;
    final res = reservations.where((r) {
      final done = r.status == 'CANCELLED' ||
          r.status == 'NO_SHOW' ||
          r.status == 'COMPLETED';
      return active ? !done : done;
    }).toList();
    final ords = orders.where((o) {
      final done = o.status == 'PAID' || o.status == 'CANCELLED';
      return active ? !done : done;
    }).toList();
    final wList = waitlist.where((w) => active ? w.isActive : !w.isActive).toList();
    final inqList = inquiries.where((i) {
      final done = i.status == 'CLOSED' || i.status == 'CANCELLED';
      return active ? !done : done;
    }).toList();

    final hasSession = active && activeSession != null;

    if (!hasSession &&
        res.isEmpty &&
        ords.isEmpty &&
        wList.isEmpty &&
        inqList.isEmpty) {
      return RefreshIndicator(
        color: FaColors.gold,
        onRefresh: reload,
        child: ListView(
          padding: EdgeInsets.fromLTRB(16, 48, 16, bottomPad),
          children: [
            Center(
              child: Text(
                'orders.empty'.tr(),
                style: const TextStyle(color: FaColors.muted),
              ),
            ),
          ],
        ),
      );
    }

    final items = <Widget>[];
    if (hasSession) {
      items.add(
        Card(
          color: FaColors.green.withValues(alpha: 0.1),
          margin: const EdgeInsets.only(bottom: 14),
          child: ListTile(
            leading: const Icon(Icons.qr_code_2_rounded, color: FaColors.green),
            title: Text('orders.session'.tr()),
            subtitle: Text(
              '${sessionVenue?.name.pick(locale) ?? activeSession!.venueId}'
              '${sessionTable != null ? ' · ${'orders.table'.tr()} ${sessionTable!.number}' : ''}',
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () async {
              HapticFeedback.selectionClick();
              await Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => SessionScreen(
                    session: activeSession!,
                    venue: sessionVenue,
                    table: sessionTable,
                  ),
                ),
              );
              reload();
            },
          ),
        ),
      );
    }
    if (!active && res.isNotEmpty) {
      items.add(
        Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            onPressed: _clearHistory,
            icon: const Icon(Icons.delete_sweep_outlined, size: 18),
            label: Text('orders.clear_history'.tr()),
          ),
        ),
      );
    }
    if (wList.isNotEmpty) {
      items.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(
            'waitlist.live_queue'.tr(),
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              color: FaColors.muted,
            ),
          ),
        ),
      );
      for (final w in wList) {
        items.add(
          Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              leading: const Icon(Icons.groups_outlined),
              title: Text(w.venueName?.pick(locale) ?? w.venueId),
              subtitle: Text('${w.guests} ${'orders.guests'.tr()} · ${w.status}'),
              trailing: w.isActive
                  ? TextButton(
                      onPressed: () async {
                        try {
                          await ApiClient.instance.leaveWaitlist(w.id);
                          HapticFeedback.mediumImpact();
                          reload();
                        } catch (e) {
                          if (mounted) {
                            HapticFeedback.heavyImpact();
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(apiErrorText(e))),
                            );
                          }
                        }
                      },
                      child: Text('waitlist.leave'.tr()),
                    )
                  : null,
            ),
          ),
        );
      }
      items.add(const SizedBox(height: 8));
    }
    if (res.isNotEmpty) {
      items.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(
            'orders.bookings'.tr(),
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              color: FaColors.muted,
            ),
          ),
        ),
      );
      for (final r in res) {
        final venue = r.venueName?.pick(locale).isNotEmpty == true
            ? r.venueName!.pick(locale)
            : r.venueId;
        final table = r.tableNumber > 0
            ? ' · ${'orders.table'.tr()} ${r.tableNumber}'
            : '';
        items.add(
          Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              leading: const Icon(Icons.event_seat_outlined),
              title: Text(venue),
              subtitle: Text(
                '${formatDateTime(r.reservedFor)} · ${r.guests} ${'orders.guests'.tr()} · ${r.status}$table',
              ),
              trailing: r.preorder != null
                  ? const Icon(Icons.restaurant_menu, size: 18, color: FaColors.gold)
                  : const Icon(Icons.chevron_right),
              onTap: () {
                HapticFeedback.selectionClick();
                _showReservation(r, locale);
              },
            ),
          ),
        );
      }
      items.add(const SizedBox(height: 8));
    }
    if (ords.isNotEmpty) {
      items.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(
            'orders.checks'.tr(),
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              color: FaColors.muted,
            ),
          ),
        ),
      );
      for (final o in ords) {
        final venue = o.venueName?.pick(locale).isNotEmpty == true
            ? o.venueName!.pick(locale)
            : o.venueId;
        items.add(
          Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              leading: const Icon(Icons.receipt_long_outlined),
              title: Text('$venue · ${o.total} MDL'),
              subtitle: Text(
                '${o.checkNumber ?? safeShortId(o.id)} · ${o.status}',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                HapticFeedback.selectionClick();
                _showReceipt(o, locale);
              },
            ),
          ),
        );
      }
    }
    if (inqList.isNotEmpty) {
      items.add(
        Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 8),
          child: Text(
            'orders.events'.tr(),
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              color: FaColors.muted,
            ),
          ),
        ),
      );
      for (final inq in inqList) {
        items.add(
          Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              leading: const Icon(Icons.celebration_outlined),
              title: Text(inq.venueName?.pick(locale) ?? inq.venueId),
              subtitle: Text(
                '${formatDateTime(inq.preferredDate)} · ${inq.guestCount} ${'orders.guests'.tr()} · ${inq.status}',
              ),
            ),
          ),
        );
      }
    }

    return RefreshIndicator(
      color: FaColors.gold,
      onRefresh: reload,
      child: ListView.builder(
        padding: EdgeInsets.fromLTRB(16, 16, 16, bottomPad),
        itemCount: items.length,
        itemBuilder: (_, i) => items[i],
      ),
    );
  }

  void _showReservation(Reservation r, String locale) {
    final venue = r.venueName?.pick(locale).isNotEmpty == true
        ? r.venueName!.pick(locale)
        : r.venueId;
    final canModify = r.status == 'CONFIRMED';
    final isDone = r.status == 'CANCELLED' ||
        r.status == 'NO_SHOW' ||
        r.status == 'COMPLETED';
    final lessThanTwoHours =
        r.reservedFor.difference(DateTime.now()) < const Duration(hours: 2);

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: FaColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
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
                venue,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              Text('${'orders.when'.tr()}: ${formatDateTime(r.reservedFor)}'),
              Text('${'orders.guests'.tr()}: ${r.guests}'),
              if (r.tableNumber > 0)
                Text('${'orders.table'.tr()}: ${r.tableNumber}'),
              Text('${'orders.status'.tr()}: ${r.status}'),
              if (r.notes.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    '${'reservation.notes'.tr()}: ${r.notes}',
                    style: const TextStyle(color: FaColors.muted),
                  ),
                ),
              if (r.preorder != null) ...[
                const Divider(height: 20),
                Text(
                  'orders.preorder_items'.tr(),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 6),
                ...r.preorder!.items.map(
                  (it) => Text(
                    '• ${it.name.pick(locale)} ×${it.qty} (${it.price * it.qty} MDL)',
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${'menu.total'.tr()}: ${r.preorder!.total} MDL',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ],
              const SizedBox(height: 16),
              if (canModify) ...[
                OutlinedButton(
                  onPressed: () async {
                    Navigator.pop(ctx);
                    try {
                      final v = await ApiClient.instance.fetchVenue(r.venueId);
                      if (!mounted) return;
                      final changed = await Navigator.of(context).push<bool>(
                        MaterialPageRoute(
                          builder: (_) => ReservationScreen(
                            venue: v,
                            existingReservation: r,
                          ),
                        ),
                      );
                      if (changed == true) reload();
                    } catch (e) {
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text(apiErrorText(e))),
                        );
                      }
                    }
                  },
                  child: Text('orders.edit_booking'.tr()),
                ),
                const SizedBox(height: 8),
                if (r.preorder == null || !r.preorder!.kitchenDue)
                  OutlinedButton(
                    onPressed: () async {
                      Navigator.pop(ctx);
                      final changed = await Navigator.of(context).push<bool>(
                        MaterialPageRoute(
                          builder: (_) => MenuScreen(
                            venueId: r.venueId,
                            venueName: venue,
                            reservationId: r.id,
                            preorderMode: true,
                          ),
                        ),
                      );
                      if (changed == true) reload();
                    },
                    child: Text(
                      r.preorder == null
                          ? 'reservation.preorder'.tr()
                          : 'orders.edit_preorder'.tr(),
                    ),
                  ),
                if (r.preorder != null && !r.preorder!.kitchenDue) ...[
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () async {
                      try {
                        await ApiClient.instance.cancelPreorder(r.id);
                        if (!ctx.mounted) return;
                        Navigator.pop(ctx);
                        reload();
                      } catch (e) {
                        if (ctx.mounted) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            SnackBar(content: Text(apiErrorText(e))),
                          );
                        }
                      }
                    },
                    child: Text(
                      'orders.cancel_preorder'.tr(),
                      style: const TextStyle(color: FaColors.occupied),
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: FaColors.occupied,
                  ),
                  onPressed: () async {
                    final confirm = await showDialog<bool>(
                      context: ctx,
                      builder: (dCtx) => AlertDialog(
                        title: Text('orders.cancel_booking'.tr()),
                        content: Text(
                          lessThanTwoHours
                              ? 'orders.cancel_late_warn'.tr()
                              : 'common.confirm'.tr(),
                        ),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(dCtx, false),
                            child: Text('common.cancel'.tr()),
                          ),
                          FilledButton(
                            onPressed: () => Navigator.pop(dCtx, true),
                            child: Text('common.confirm'.tr()),
                          ),
                        ],
                      ),
                    );
                    if (confirm != true || !ctx.mounted) return;
                    try {
                      await ApiClient.instance.cancelReservation(r.id);
                      if (!ctx.mounted) return;
                      Navigator.pop(ctx);
                      reload();
                    } catch (e) {
                      if (ctx.mounted) {
                        ScaffoldMessenger.of(ctx).showSnackBar(
                          SnackBar(content: Text(apiErrorText(e))),
                        );
                      }
                    }
                  },
                  child: Text('orders.cancel_booking'.tr()),
                ),
              ],
              if (isDone) ...[
                OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: FaColors.occupied,
                  ),
                  onPressed: () async {
                    try {
                      await ApiClient.instance.deleteReservation(r.id);
                      if (!ctx.mounted) return;
                      Navigator.pop(ctx);
                      reload();
                    } catch (e) {
                      if (ctx.mounted) {
                        ScaffoldMessenger.of(ctx).showSnackBar(
                          SnackBar(content: Text(apiErrorText(e))),
                        );
                      }
                    }
                  },
                  child: Text('orders.delete_booking'.tr()),
                ),
              ],
              const SizedBox(height: 6),
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: Text('common.close'.tr()),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showReceipt(Order o, String locale) {
    final venue = o.venueName?.pick(locale).isNotEmpty == true
        ? o.venueName!.pick(locale)
        : o.venueId;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: FaColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
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
                'orders.receipt'.tr(),
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 4),
              Text(venue, style: const TextStyle(color: FaColors.muted)),
              if (o.checkNumber != null)
                Text(
                  o.checkNumber!,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              const Divider(height: 24),
              ...o.items.map(
                (i) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Expanded(child: Text('${i.name.pick(locale)} ×${i.qty}')),
                      Text('${i.price * i.qty} MDL'),
                    ],
                  ),
                ),
              ),
              const Divider(height: 24),
              Row(
                children: [
                  Text(
                    'menu.total'.tr(),
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const Spacer(),
                  Text(
                    '${o.total} MDL',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                '${'orders.status'.tr()}: ${o.status}'
                '${o.paymentMethod != null ? ' · ${o.paymentMethod}' : ''}',
                style: const TextStyle(color: FaColors.muted, fontSize: 12),
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: Text('common.close'.tr()),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
