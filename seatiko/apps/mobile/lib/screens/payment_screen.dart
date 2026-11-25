import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/errors.dart';
import 'package:mobile/theme.dart';

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key, required this.orders});

  final List<Order> orders;

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  String? status;
  bool busy = false;
  List<Order> paid = [];

  int get total => widget.orders.fold(0, (s, o) => s + o.total);

  Future<void> _pay(String method) async {
    if (widget.orders.isEmpty) return;
    setState(() => busy = true);
    try {
      final results = <Order>[];
      for (final order in widget.orders) {
        results.add(
          await ApiClient.instance.payOrder(
            orderId: order.id,
            method: method,
          ),
        );
      }
      if (!mounted) return;
      setState(() {
        paid = results;
        status = method == 'app' ? 'paid' : 'pending';
      });
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
    return Scaffold(
      appBar: AppBar(title: Text('payment.title'.tr())),
      body: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: widget.orders.isEmpty
              ? Center(
                  child: Text(
                    'payment.empty_orders'.tr(),
                    style: const TextStyle(color: FaColors.muted),
                  ),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      '${'payment.total'.tr()}: $total MDL',
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${widget.orders.length} ${'orders.checks'.tr().toLowerCase()}',
                      style: const TextStyle(color: FaColors.muted),
                    ),
                    const SizedBox(height: 16),
                    ...widget.orders.map(
                      (o) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          '${o.checkNumber ?? safeShortId(o.id)} · ${o.items.map((i) => i.name.pick(locale)).join(', ')}',
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                    ),
                    const Spacer(),
                    if (status == null) ...[
                      Text(
                        'payment.gateway_notice'.tr(),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: FaColors.muted,
                          fontSize: 11,
                        ),
                      ),
                      const SizedBox(height: 10),
                      FilledButton(
                        onPressed: busy ? null : () => _pay('app'),
                        child: Text('payment.pay_app'.tr()),
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton(
                        onPressed: busy ? null : () => _pay('venue'),
                        child: Text('payment.pay_venue'.tr()),
                      ),
                    ] else ...[
                      Icon(
                        status == 'paid'
                            ? Icons.check_circle
                            : Icons.hourglass_top,
                        size: 64,
                        color: status == 'paid' ? FaColors.free : FaColors.gold,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        status == 'paid'
                            ? 'payment.status_paid'.tr()
                            : 'payment.status_pending'.tr(),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (paid.isNotEmpty && paid.first.checkNumber != null) ...[
                        const SizedBox(height: 8),
                        Text(
                          paid
                              .map((o) => o.checkNumber)
                              .whereType<String>()
                              .join(', '),
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: FaColors.muted),
                        ),
                      ],
                      const SizedBox(height: 24),
                      FilledButton(
                        onPressed: () => Navigator.pop(context, true),
                        child: Text('payment.done'.tr()),
                      ),
                    ],
                  ],
                ),
        ),
      ),
    );
  }
}
