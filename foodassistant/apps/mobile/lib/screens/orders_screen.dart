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

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    return SafeArea(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'orders.title'.tr(),
                style:
                    const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
              ),
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
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('orders.need_auth'.tr()),
                        const SizedBox(height: 12),
                        FilledButton(
                          onPressed: () async {
                            await showAuthSheet(context);
                            reload();
                          },
                          child: Text('profile.sign_in'.tr()),
                        ),
                      ],
                    ),
                  )
                : loading
                    ? const Center(
                        child:
                            CircularProgressIndicator(color: FaColors.gold),
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
      final done = r.status == 'CANCELLED' || r.status == 'NO_SHOW';
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
          ...res.map(
            (r) => Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: ListTile(
                title: Text('orders.active_res'.tr()),
                subtitle: Text(
                  '${r.venueId} · ${formatClock(r.reservedFor)} · '
                  '${r.status}',
                ),
                trailing: Text('${r.guests}'),
              ),
            ),
          ),
          ...ords.map(
            (o) => Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: ListTile(
                title: Text('${o.total} MDL · ${o.status}'),
                subtitle: Text(
                  o.items
                      .map((i) => '${i.name.pick(locale)}×${i.qty}')
                      .join(', '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
