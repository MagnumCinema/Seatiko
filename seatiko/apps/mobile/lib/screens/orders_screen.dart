import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/auth_sheet.dart';

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
  bool loading = true;
  bool authed = false;

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
          orders = [];
          reservations = [];
        });
      }
      return;
    }
    setState(() {
      authed = true;
      loading = true;
    });
    try {
      final o = await ApiClient.instance.fetchOrders();
      final r = await ApiClient.instance.fetchReservations();
      if (mounted) {
        setState(() {
          orders = o;
          reservations = r;
          loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => loading = false);
    }
  }

  int get spentTotal => orders
      .where((o) => o.status == 'PAID')
      .fold(0, (sum, o) => sum + o.total);

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    return SafeArea(
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
                              await showAuthSheet(context);
                              reload();
                            },
                            child: Text('auth.switch_register'.tr()),
                          ),
                        ],
                      ),
                    ),
                  )
                : loading
                    ? const Center(
                        child: CircularProgressIndicator(color: FaColors.gold),
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
    final res = reservations.where((r) {
      final done =
          r.status == 'CANCELLED' ||
          r.status == 'NO_SHOW' ||
          r.status == 'COMPLETED';
      return active ? !done : done;
    }).toList();
    final ords = orders.where((o) {
      final done = o.status == 'PAID' || o.status == 'CANCELLED';
      return active ? !done : done;
    }).toList();

    if (res.isEmpty && ords.isEmpty) {
      return Center(
        child: Text(
          'orders.empty'.tr(),
          style: const TextStyle(color: FaColors.muted),
        ),
      );
    }

    return RefreshIndicator(
      color: FaColors.gold,
      onRefresh: reload,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (res.isNotEmpty) ...[
            Text(
              'orders.bookings'.tr(),
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                color: FaColors.muted,
              ),
            ),
            const SizedBox(height: 8),
            ...res.map((r) {
              final venue =
                  r.venueName?.pick(locale).isNotEmpty == true
                  ? r.venueName!.pick(locale)
                  : r.venueId;
              final table = r.tableNumber > 0
                  ? ' · ${'orders.table'.tr()} ${r.tableNumber}'
                  : '';
              return Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  leading: const Icon(Icons.event_seat_outlined),
                  title: Text(venue),
                  subtitle: Text(
                    '${formatClock(r.reservedFor)} · ${r.guests} ${'orders.guests'.tr()} · ${r.status}$table',
                  ),
                  onTap: () => _showReservation(r, locale),
                ),
              );
            }),
            const SizedBox(height: 8),
          ],
          if (ords.isNotEmpty) ...[
            Text(
              'orders.checks'.tr(),
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                color: FaColors.muted,
              ),
            ),
            const SizedBox(height: 8),
            ...ords.map((o) {
              final venue =
                  o.venueName?.pick(locale).isNotEmpty == true
                  ? o.venueName!.pick(locale)
                  : o.venueId;
              return Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  leading: const Icon(Icons.receipt_long_outlined),
                  title: Text('$venue · ${o.total} MDL'),
                  subtitle: Text(
                    '${o.checkNumber ?? o.id.substring(0, 8)} · ${o.status}',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _showReceipt(o, locale),
                ),
              );
            }),
          ],
        ],
      ),
    );
  }

  void _showReservation(Reservation r, String locale) {
    final venue =
        r.venueName?.pick(locale).isNotEmpty == true
        ? r.venueName!.pick(locale)
        : r.venueId;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: FaColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              venue,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Text('${'orders.when'.tr()}: ${formatClock(r.reservedFor)}'),
            Text('${'orders.guests'.tr()}: ${r.guests}'),
            if (r.tableNumber > 0)
              Text('${'orders.table'.tr()}: ${r.tableNumber}'),
            Text('${'orders.status'.tr()}: ${r.status}'),
            const SizedBox(height: 16),
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: Text('common.close'.tr()),
            ),
          ],
        ),
      ),
    );
  }

  void _showReceipt(Order o, String locale) {
    final venue =
        o.venueName?.pick(locale).isNotEmpty == true
        ? o.venueName!.pick(locale)
        : o.venueId;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: FaColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
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
    );
  }
}
