import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/screens/order_choice_screen.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/auth_sheet.dart';

class QrScreen extends StatefulWidget {
  const QrScreen({super.key});

  @override
  State<QrScreen> createState() => _QrScreenState();
}

class _QrScreenState extends State<QrScreen> {
  final tokenCtrl = TextEditingController(text: 'venue-1:t1');
  bool busy = false;

  @override
  void dispose() {
    tokenCtrl.dispose();
    super.dispose();
  }

  Future<void> _open() async {
    final ok = await ensureAuth(context);
    if (!ok || !mounted) return;
    setState(() => busy = true);
    try {
      final parts = parseQrToken(tokenCtrl.text);
      final session = await ApiClient.instance.scanQr(
        venueId: parts.venueId,
        tableId: parts.tableId,
        token: parts.token,
      );
      Venue? venue;
      VenueTable? table;
      try {
        venue = await ApiClient.instance.fetchVenue(session.venueId);
        final tables = await ApiClient.instance.fetchTables(session.venueId);
        table = tables.where((t) => t.id == session.tableId).firstOrNull;
      } catch (_) {}
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => OrderChoiceScreen(
            session: session,
            venue: venue,
            table: table,
          ),
        ),
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('common.error'.tr())),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('scan.title'.tr())),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: FaColors.gold.withValues(alpha: 0.4)),
                  gradient: const LinearGradient(
                    colors: [Color(0xFF1A2A1C), Color(0xFF121812)],
                  ),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.qr_code_scanner,
                      size: 96,
                      color: FaColors.gold.withValues(alpha: 0.8),
                    ),
                    const SizedBox(height: 16),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Text(
                        'scan.hint'.tr(),
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: FaColors.muted),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: tokenCtrl,
              decoration: InputDecoration(
                labelText: 'scan.token_placeholder'.tr(),
                hintText: 'venue-1:t1',
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: busy ? null : _open,
              child: busy
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text('scan.simulate'.tr()),
            ),
          ],
        ),
      ),
    );
  }
}
