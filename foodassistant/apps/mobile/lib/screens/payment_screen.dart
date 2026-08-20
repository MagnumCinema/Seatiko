import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/theme.dart';

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key, required this.orders});

  final List<Order> orders;

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  String? status;

  int get total =>
      widget.orders.fold(0, (s, o) => s + o.total);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('payment.title'.tr())),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '${'payment.total'.tr()}: $total MDL',
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Text(
              '${widget.orders.length} order(s)',
              style: const TextStyle(color: FaColors.muted),
            ),
            const Spacer(),
            if (status == null) ...[
              FilledButton(
                onPressed: () => setState(() => status = 'paid'),
                child: Text('payment.pay_app'.tr()),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: () => setState(() => status = 'pending'),
                child: Text('payment.pay_venue'.tr()),
              ),
            ] else ...[
              Icon(
                status == 'paid' ? Icons.check_circle : Icons.hourglass_top,
                size: 64,
                color: status == 'paid' ? FaColors.free : FaColors.gold,
              ),
              const SizedBox(height: 12),
              Text(
                status == 'paid'
                    ? 'payment.status_paid'.tr()
                    : 'payment.status_pending'.tr(),
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: () => Navigator.pop(context),
                child: Text('payment.done'.tr()),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
