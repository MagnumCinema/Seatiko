import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/screens/order_choice_screen.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/auth_sheet.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

class QrScreen extends StatefulWidget {
  const QrScreen({super.key});

  @override
  State<QrScreen> createState() => _QrScreenState();
}

class _QrScreenState extends State<QrScreen> {
  final tokenCtrl = TextEditingController(text: 'venue-1:t1');
  final controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const [BarcodeFormat.qrCode],
  );
  bool busy = false;
  bool manual = false;
  String? cameraError;

  @override
  void dispose() {
    tokenCtrl.dispose();
    controller.dispose();
    super.dispose();
  }

  Future<void> _open(String raw) async {
    if (busy) return;
    final ok = await ensureAuth(context);
    if (!ok || !mounted) return;
    setState(() => busy = true);
    try {
      final parts = parseQrToken(raw);
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
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('scan.invalid'.tr())));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void _onDetect(BarcodeCapture capture) {
    if (busy) return;
    for (final barcode in capture.barcodes) {
      final value = barcode.rawValue?.trim();
      if (value != null && value.isNotEmpty) {
        _open(value);
        return;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('scan.title'.tr()),
        actions: [
          IconButton(
            tooltip: 'scan.torch'.tr(),
            onPressed: () => controller.toggleTorch(),
            icon: const Icon(Icons.flashlight_on_outlined),
          ),
          IconButton(
            tooltip: 'scan.manual'.tr(),
            onPressed: () => setState(() => manual = !manual),
            icon: Icon(manual ? Icons.qr_code_scanner : Icons.keyboard),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: _viewfinder()),
            const SizedBox(height: 16),
            Text(
              cameraError ?? 'scan.hint'.tr(),
              textAlign: TextAlign.center,
              style: TextStyle(
                color: cameraError == null ? FaColors.muted : FaColors.occupied,
              ),
            ),
            if (manual) ...[
              const SizedBox(height: 16),
              TextField(
                controller: tokenCtrl,
                decoration: InputDecoration(
                  labelText: 'scan.token_placeholder'.tr(),
                  hintText: 'venue-1:t1',
                ),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: busy ? null : () => _open(tokenCtrl.text),
                child: busy
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text('scan.simulate'.tr()),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _viewfinder() {
    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: controller,
            onDetect: _onDetect,
            errorBuilder: (context, error) {
              return Container(
                color: FaColors.surface2,
                alignment: Alignment.center,
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(
                      Icons.no_photography_outlined,
                      size: 64,
                      color: FaColors.muted,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'scan.no_camera'.tr(),
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: FaColors.muted),
                    ),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: () => setState(() => manual = true),
                      child: Text('scan.manual'.tr()),
                    ),
                  ],
                ),
              );
            },
          ),
          IgnorePointer(
            child: Center(
              child: Container(
                width: 220,
                height: 220,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: FaColors.gold, width: 3),
                ),
              ),
            ),
          ),
          if (busy)
            Container(
              color: Colors.black45,
              alignment: Alignment.center,
              child: const CircularProgressIndicator(color: FaColors.gold),
            ),
        ],
      ),
    );
  }
}
