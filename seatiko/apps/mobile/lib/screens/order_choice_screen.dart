import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/screens/session_screen.dart';
import 'package:mobile/screens/waiter_screens.dart';
import 'package:mobile/theme.dart';

class OrderChoiceScreen extends StatelessWidget {
  const OrderChoiceScreen({
    super.key,
    required this.session,
    this.venue,
    this.table,
  });

  final Session session;
  final Venue? venue;
  final VenueTable? table;

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    final venueName = venue?.name.pick(locale) ?? session.venueId;
    final tableNo = table?.number ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: Text('table.title'.tr(args: ['$tableNo'])),
      ),
      body: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                venueName,
                style: const TextStyle(color: FaColors.muted),
              ),
              const SizedBox(height: 12),
              Text(
                'order_choice.sub'.tr(),
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 28),
              FilledButton.icon(
                onPressed: () {
                  Navigator.of(context).pushReplacement(
                    MaterialPageRoute(
                      builder: (_) => SessionScreen(
                        session: session,
                        venue: venue,
                        table: table,
                      ),
                    ),
                  );
                },
                icon: const Icon(Icons.menu_book_outlined),
                label: Text('order_choice.app'.tr()),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () {
                  Navigator.of(context).pushReplacement(
                    MaterialPageRoute(
                      builder: (_) => WaiterInitialScreen(
                        session: session,
                        venue: venue,
                        table: table,
                      ),
                    ),
                  );
                },
                icon: const Icon(Icons.room_service_outlined),
                label: Text('order_choice.waiter'.tr()),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
