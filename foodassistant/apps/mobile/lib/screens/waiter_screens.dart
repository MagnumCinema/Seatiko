import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/screens/menu_screen.dart';
import 'package:mobile/screens/payment_screen.dart';
import 'package:mobile/screens/session_screen.dart';
import 'package:mobile/theme.dart';

class WaiterInitialScreen extends StatefulWidget {
  const WaiterInitialScreen({
    super.key,
    required this.session,
    this.venue,
    this.table,
  });

  final Session session;
  final Venue? venue;
  final VenueTable? table;

  @override
  State<WaiterInitialScreen> createState() => _WaiterInitialScreenState();
}

class _WaiterInitialScreenState extends State<WaiterInitialScreen> {
  bool busy = false;

  Future<void> _call() async {
    setState(() => busy = true);
    try {
      await ApiClient.instance.callWaiter(
        sessionId: widget.session.id,
        reason: 'initial',
      );
    } catch (_) {}
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('waiter.coming'.tr())),
    );
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => SessionScreen(
          session: widget.session,
          venue: widget.venue,
          table: widget.table,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    final venueName = widget.venue?.name.pick(locale) ?? widget.session.venueId;
    final n = widget.table?.number ?? 0;

    return Scaffold(
      appBar: AppBar(title: Text('waiter.initial_title'.tr())),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'waiter.initial_sub'.tr(),
              style: const TextStyle(color: FaColors.muted, height: 1.4),
            ),
            const SizedBox(height: 20),
            Text(
              'session.your_table'.tr(args: ['$n', venueName]),
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            const Spacer(),
            FilledButton.icon(
              onPressed: busy ? null : _call,
              icon: const Icon(Icons.room_service),
              label: Text('waiter.initial_call'.tr()),
            ),
            const SizedBox(height: 10),
            OutlinedButton(
              onPressed: () {
                Navigator.of(context).pushReplacement(
                  MaterialPageRoute(
                    builder: (_) => SessionScreen(
                      session: widget.session,
                      venue: widget.venue,
                      table: widget.table,
                    ),
                  ),
                );
              },
              child: Text('order_choice.app'.tr()),
            ),
          ],
        ),
      ),
    );
  }
}

class WaiterSessionScreen extends StatefulWidget {
  const WaiterSessionScreen({
    super.key,
    required this.session,
  });

  final Session session;

  @override
  State<WaiterSessionScreen> createState() => _WaiterSessionScreenState();
}

class _WaiterSessionScreenState extends State<WaiterSessionScreen> {
  String reason = 'order';
  bool busy = false;

  final reasons = const [
    ('order', 'waiter.reason_order'),
    ('bill', 'waiter.reason_bill'),
    ('question', 'waiter.reason_question'),
    ('other', 'waiter.reason_other'),
  ];

  Future<void> _send() async {
    setState(() => busy = true);
    try {
      await ApiClient.instance.callWaiter(
        sessionId: widget.session.id,
        reason: reason,
      );
    } catch (_) {}
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('waiter.coming'.tr())),
    );
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('waiter.session_title'.tr())),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'waiter.session_sub'.tr(),
              style: const TextStyle(color: FaColors.muted),
            ),
            const SizedBox(height: 16),
            ...reasons.map(
              (r) => ListTile(
                onTap: () => setState(() => reason = r.$1),
                leading: Icon(
                  reason == r.$1
                      ? Icons.radio_button_checked
                      : Icons.radio_button_off,
                  color: FaColors.gold,
                ),
                title: Text(r.$2.tr()),
              ),
            ),
            const Spacer(),
            FilledButton(
              onPressed: busy ? null : _send,
              child: Text('waiter.send'.tr()),
            ),
          ],
        ),
      ),
    );
  }
}

// Re-export helper used by order_choice — keep file focused.
void openMenuFromSession(
  BuildContext context, {
  required Session session,
  Venue? venue,
}) {
  final locale = Localizations.localeOf(context).languageCode;
  Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => MenuScreen(
        venueId: session.venueId,
        venueName: venue?.name.pick(locale) ?? session.venueId,
        sessionId: session.id,
      ),
    ),
  );
}

void openPaymentFromSession(
  BuildContext context, {
  required List<Order> orders,
}) {
  Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => PaymentScreen(orders: orders),
    ),
  );
}
