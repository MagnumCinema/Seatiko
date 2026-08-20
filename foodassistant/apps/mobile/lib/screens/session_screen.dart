import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/screens/menu_screen.dart';
import 'package:mobile/screens/payment_screen.dart';
import 'package:mobile/screens/waiter_screens.dart';
import 'package:mobile/theme.dart';

class SessionScreen extends StatefulWidget {
  const SessionScreen({
    super.key,
    required this.session,
    this.venue,
    this.table,
  });

  final Session session;
  final Venue? venue;
  final VenueTable? table;

  @override
  State<SessionScreen> createState() => _SessionScreenState();
}

class _SessionScreenState extends State<SessionScreen> {
  List<Order> orders = [];
  bool busy = false;

  @override
  void initState() {
    super.initState();
    _loadOrders();
  }

  Future<void> _loadOrders() async {
    try {
      final all = await ApiClient.instance.fetchOrders();
      if (mounted) {
        setState(() {
          orders = all
              .where((o) => o.sessionId == widget.session.id)
              .toList();
        });
      }
    } catch (_) {}
  }

  Future<void> _release() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('session.release'.tr()),
        content: Text('common.confirm'.tr()),
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
    if (ok != true) return;
    setState(() => busy = true);
    try {
      await ApiClient.instance.closeSession(widget.session.id);
    } catch (_) {}
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('session.released'.tr())),
    );
    Navigator.of(context).popUntil((r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    final venueName =
        widget.venue?.name.pick(locale) ?? widget.session.venueId;
    final n = widget.table?.number ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: Text('session.your_table'.tr(args: ['$n', venueName])),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () async {
                      await Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => MenuScreen(
                            venueId: widget.session.venueId,
                            venueName: venueName,
                            sessionId: widget.session.id,
                          ),
                        ),
                      );
                      _loadOrders();
                    },
                    icon: const Icon(Icons.menu_book),
                    label: Text('session.menu'.tr()),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => WaiterSessionScreen(
                            session: widget.session,
                          ),
                        ),
                      );
                    },
                    icon: const Icon(Icons.room_service_outlined),
                    label: Text('session.waiter'.tr()),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            Text(
              'session.active_order'.tr(),
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 10),
            Expanded(
              child: orders.isEmpty
                  ? Center(
                      child: Text(
                        'session.empty_orders'.tr(),
                        style: const TextStyle(color: FaColors.muted),
                      ),
                    )
                  : ListView.separated(
                      itemCount: orders.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final o = orders[i];
                        return Card(
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  o.status,
                                  style: const TextStyle(color: FaColors.gold),
                                ),
                                ...o.items.map(
                                  (it) => Text(
                                    '• ${it.name.pick(locale)} ×${it.qty} — '
                                    '${it.price * it.qty} MDL',
                                  ),
                                ),
                                Text(
                                  '${'menu.total'.tr()}: ${o.total} MDL',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => PaymentScreen(orders: orders),
                        ),
                      );
                    },
                    child: Text('session.bill'.tr()),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton(
                    onPressed: busy ? null : _release,
                    child: Text('session.release'.tr()),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
