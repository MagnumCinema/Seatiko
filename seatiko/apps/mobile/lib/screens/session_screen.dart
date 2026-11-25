import 'dart:async';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/api.dart';
import 'package:mobile/errors.dart';
import 'package:mobile/screens/menu_screen.dart';
import 'package:mobile/screens/payment_screen.dart';
import 'package:mobile/screens/waiter_screens.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/shimmer.dart';

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
  bool loading = true;
  Object? error;
  bool busy = false;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _loadOrders();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 12),
      (_) => _loadOrders(silent: true),
    );
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadOrders({bool silent = false}) async {
    if (!silent) {
      setState(() {
        loading = true;
        error = null;
      });
    }
    try {
      final all = await ApiClient.instance.fetchOrders();
      if (mounted) {
        setState(() {
          orders = all
              .where((o) => o.sessionId == widget.session.id)
              .toList();
          loading = false;
          error = null;
        });
      }
    } catch (e) {
      if (mounted && !silent) {
        setState(() {
          error = e;
          loading = false;
        });
      }
    }
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'SUBMITTED':
        return 'order.status.submitted'.tr();
      case 'PREPARING':
        return 'order.status.preparing'.tr();
      case 'READY':
        return 'order.status.ready'.tr();
      case 'SERVED':
        return 'order.status.served'.tr();
      case 'PAID':
        return 'order.status.paid'.tr();
      case 'CANCELLED':
        return 'order.status.cancelled'.tr();
      default:
        return status;
    }
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
    if (ok != true || !mounted) return;
    setState(() => busy = true);
    try {
      await ApiClient.instance.closeSession(widget.session.id);
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('session.released'.tr())),
      );
      Navigator.of(context).popUntil((r) => r.isFirst);
    } on ApiException catch (e) {
      if (e.code == 'session_closed' || e.status == 404) {
        await ApiClient.instance.setActiveSessionId(null);
        if (!mounted) return;
        Navigator.of(context).popUntil((r) => r.isFirst);
        return;
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(apiErrorText(e))),
        );
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
    final venueName =
        widget.venue?.name.pick(locale) ?? widget.session.venueId;
    final n = widget.table?.number ?? 0;
    final unpaidOrders = orders
        .where((o) => o.status != 'PAID' && o.status != 'CANCELLED')
        .toList();

    return Scaffold(
      appBar: AppBar(
        title: Text('session.your_table'.tr(args: ['$n', venueName])),
      ),
      body: SafeArea(
        top: false,
        child: Padding(
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
                child: loading
                    ? const CardListShimmer()
                    : error != null
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(apiErrorText(error!)),
                            const SizedBox(height: 8),
                            TextButton(
                              onPressed: _loadOrders,
                              child: Text('common.retry'.tr()),
                            ),
                          ],
                        ),
                      )
                    : orders.isEmpty
                    ? Center(
                        child: Text(
                          'session.empty_orders'.tr(),
                          style: const TextStyle(color: FaColors.muted),
                        ),
                      )
                    : RefreshIndicator(
                        color: FaColors.gold,
                        onRefresh: _loadOrders,
                        child: ListView.separated(
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
                                      _statusLabel(o.status),
                                      style: const TextStyle(
                                        color: FaColors.gold,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    ...o.items.map(
                                      (it) => Text(
                                        '• ${it.name.pick(locale)} ×${it.qty} — ${it.price * it.qty} MDL',
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${'menu.total'.tr()}: ${o.total} MDL',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                      ),
              ),
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      onPressed: unpaidOrders.isEmpty
                          ? null
                          : () async {
                              final paid = await Navigator.of(context).push<bool>(
                                MaterialPageRoute(
                                  builder: (_) =>
                                      PaymentScreen(orders: unpaidOrders),
                                ),
                              );
                              if (paid == true) _loadOrders();
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
      ),
    );
  }
}
