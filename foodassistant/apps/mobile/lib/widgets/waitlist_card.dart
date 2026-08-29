import 'dart:async';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/auth_sheet.dart';

/// Virtual queue for a venue: shows the guest's live spot, or lets them join
/// when nothing is free.
class WaitlistCard extends StatefulWidget {
  const WaitlistCard({super.key, required this.venueId, this.onChanged});

  final String venueId;
  final VoidCallback? onChanged;

  @override
  State<WaitlistCard> createState() => _WaitlistCardState();
}

class _WaitlistCardState extends State<WaitlistCard> {
  static const _pollInterval = Duration(seconds: 20);

  WaitlistSummary? _summary;
  WaitlistEntry? _entry;
  Timer? _timer;
  int _guests = 2;
  bool _busy = false;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _refresh();
    _timer = Timer.periodic(_pollInterval, (_) => _refresh());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    try {
      final summary = await ApiClient.instance.fetchWaitlistSummary(
        widget.venueId,
      );
      if (!mounted) return;
      setState(() {
        _summary = summary;
        _loaded = true;
      });
    } catch (_) {
      if (mounted) setState(() => _loaded = true);
    }

    final token = await ApiClient.instance.getToken();
    if (token == null || token.isEmpty) {
      if (mounted) setState(() => _entry = null);
      return;
    }
    try {
      final mine = await ApiClient.instance.fetchMyWaitlist();
      if (!mounted) return;
      WaitlistEntry? active;
      for (final item in mine) {
        if (item.venueId == widget.venueId && item.isActive) {
          active = item;
          break;
        }
      }
      setState(() => _entry = active);
    } catch (_) {
      if (mounted) setState(() => _entry = null);
    }
  }

  String _waitLabel(int minutes) {
    if (minutes < 60) return 'waitlist.wait_min'.tr(args: ['$minutes']);
    final hours = minutes ~/ 60;
    final rest = minutes % 60;
    return rest == 0
        ? 'waitlist.wait_hour'.tr(args: ['$hours'])
        : 'waitlist.wait_hour_min'.tr(args: ['$hours', '$rest']);
  }

  Future<void> _join() async {
    final ok = await ensureAuth(context);
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      final entry = await ApiClient.instance.joinWaitlist(
        venueId: widget.venueId,
        guests: _guests,
      );
      if (!mounted) return;
      setState(() => _entry = entry);
      widget.onChanged?.call();
      await _refresh();
    } on ApiException catch (e) {
      if (!mounted) return;
      final message = e.status == 409
          ? 'waitlist.already'.tr()
          : 'waitlist.error'.tr();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      await _refresh();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _leave() async {
    final entry = _entry;
    if (entry == null) return;
    setState(() => _busy = true);
    try {
      await ApiClient.instance.leaveWaitlist(entry.id);
      if (!mounted) return;
      setState(() => _entry = null);
      widget.onChanged?.call();
      await _refresh();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('waitlist.error'.tr())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded) return const SizedBox.shrink();
    final entry = _entry;
    final summary = _summary;

    // Only useful when the room is full, or when a queue has already formed.
    if (entry == null &&
        (summary == null || (summary.freeTables > 0 && summary.waiting == 0))) {
      return const SizedBox.shrink();
    }

    final ready = entry?.isReady ?? false;
    return Container(
      margin: const EdgeInsets.only(top: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ready
            ? FaColors.free.withValues(alpha: 0.12)
            : FaColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: ready
              ? FaColors.free.withValues(alpha: 0.5)
              : FaColors.border,
        ),
      ),
      child: entry == null
          ? _joinView(summary!)
          : _statusView(entry, ready),
    );
  }

  Widget _joinView(WaitlistSummary summary) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                summary.freeTables > 0
                    ? 'waitlist.live_queue'.tr()
                    : 'waitlist.no_tables'.tr(),
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
              ),
            ),
            if (summary.waiting > 0)
              Text(
                'waitlist.in_queue'.tr(args: ['${summary.waiting}']),
                style: const TextStyle(color: FaColors.muted, fontSize: 12),
              ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          summary.quotedWaitMin > 0
              ? '${'waitlist.join_hint'.tr()} ${_waitLabel(summary.quotedWaitMin)}'
              : 'waitlist.join_hint_soon'.tr(),
          style: const TextStyle(color: FaColors.muted, height: 1.4),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Text('waitlist.guests'.tr()),
            const Spacer(),
            IconButton(
              onPressed: _guests > 1 ? () => setState(() => _guests--) : null,
              icon: const Icon(Icons.remove_circle_outline),
            ),
            Text('$_guests', style: const TextStyle(fontWeight: FontWeight.w700)),
            IconButton(
              onPressed: _guests < 20 ? () => setState(() => _guests++) : null,
              icon: const Icon(Icons.add_circle_outline),
            ),
          ],
        ),
        FilledButton(
          onPressed: _busy ? null : _join,
          child: Text('waitlist.join'.tr()),
        ),
      ],
    );
  }

  Widget _statusView(WaitlistEntry entry, bool ready) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                ready ? 'waitlist.ready_title'.tr() : 'waitlist.waiting_title'.tr(),
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
              ),
            ),
            if (!ready && entry.position > 0)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: FaColors.free.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  '№${entry.position}',
                  style: const TextStyle(
                    color: FaColors.free,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          ready
              ? (entry.tableNumber > 0
                    ? 'waitlist.ready_table'.tr(args: ['${entry.tableNumber}'])
                    : 'waitlist.ready_hint'.tr())
              : '${entry.quotedWaitMin > 0 ? _waitLabel(entry.quotedWaitMin) : 'waitlist.wait_soon'.tr()} · ${'waitlist.guests_n'.tr(args: ['${entry.guests}'])}',
          style: const TextStyle(color: FaColors.muted, height: 1.4),
        ),
        const SizedBox(height: 12),
        OutlinedButton(
          onPressed: _busy ? null : _leave,
          child: Text('waitlist.leave'.tr()),
        ),
      ],
    );
  }
}
