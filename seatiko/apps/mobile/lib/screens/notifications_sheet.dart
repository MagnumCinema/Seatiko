import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/errors.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/auth_sheet.dart';

Future<void> showNotificationsSheet(
  BuildContext context, {
  VoidCallback? onUnreadChanged,
}) async {
  final ok = await ensureAuth(context);
  if (!ok || !context.mounted) return;
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: FaColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (ctx) => _NotificationsSheet(onUnreadChanged: onUnreadChanged),
  );
}

class _NotificationsSheet extends StatefulWidget {
  const _NotificationsSheet({this.onUnreadChanged});
  final VoidCallback? onUnreadChanged;

  @override
  State<_NotificationsSheet> createState() => _NotificationsSheetState();
}

class _NotificationsSheetState extends State<_NotificationsSheet> {
  bool _loading = true;
  Object? _error;
  List<AppNotification> _items = [];
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.fetchNotifications(limit: 40);
      if (!mounted) return;
      setState(() {
        _items = res.notifications;
        _unread = res.unread;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  Future<void> _markAllRead() async {
    try {
      final unread = await ApiClient.instance.markNotificationsRead();
      if (!mounted) return;
      setState(() {
        _unread = unread;
        _items = _items
            .map(
              (n) => AppNotification(
                id: n.id,
                userId: n.userId,
                kind: n.kind,
                venueId: n.venueId,
                venueName: n.venueName,
                reservationId: n.reservationId,
                orderId: n.orderId,
                at: n.at,
                createdAt: n.createdAt,
                readAt: n.readAt ?? DateTime.now(),
              ),
            )
            .toList();
      });
      widget.onUnreadChanged?.call();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(apiErrorText(e))),
      );
    }
  }

  String _kindLabel(String kind) {
    switch (kind) {
      case 'PREORDER_CREATED':
        return 'notifications.preorder_created'.tr();
      case 'PREORDER_UPDATED':
        return 'notifications.preorder_updated'.tr();
      case 'PREORDER_CANCELLED':
        return 'notifications.preorder_cancelled'.tr();
      case 'PREORDER_PREPARING':
        return 'notifications.preorder_preparing'.tr();
      case 'PREORDER_ADULT_REMOVED':
        return 'notifications.preorder_adult_removed'.tr();
      case 'PREORDER_AGE_REFUSED':
        return 'notifications.preorder_age_refused'.tr();
      case 'ADULT_GRANTED':
        return 'notifications.adult_granted'.tr();
      case 'ADULT_REVOKED':
        return 'notifications.adult_revoked'.tr();
      default:
        return kind;
    }
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    return SafeArea(
      top: false,
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.65,
        minChildSize: 0.4,
        maxChildSize: 0.9,
        builder: (context, scrollController) => Column(
          children: [
            const SizedBox(height: 10),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: FaColors.muted.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 12, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'notifications.title'.tr(),
                      style: const TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  if (_unread > 0)
                    TextButton(
                      onPressed: _markAllRead,
                      child: Text('notifications.mark_all_read'.tr()),
                    ),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: _loading
                  ? const Center(
                      child: CircularProgressIndicator(color: FaColors.green),
                    )
                  : _error != null
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(apiErrorText(_error!)),
                          const SizedBox(height: 8),
                          TextButton(
                            onPressed: _load,
                            child: Text('common.retry'.tr()),
                          ),
                        ],
                      ),
                    )
                  : _items.isEmpty
                  ? Center(
                      child: Text(
                        'notifications.empty'.tr(),
                        style: const TextStyle(color: FaColors.muted),
                      ),
                    )
                  : ListView.separated(
                      controller: scrollController,
                      padding: const EdgeInsets.all(16),
                      itemCount: _items.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final n = _items[index];
                        final venue = n.venueName?.pick(locale) ?? '';
                        return Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: n.isUnread
                                ? FaColors.green.withValues(alpha: 0.08)
                                : FaColors.surface2,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: n.isUnread
                                  ? FaColors.green.withValues(alpha: 0.28)
                                  : FaColors.border,
                            ),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(
                                n.isUnread
                                    ? Icons.notifications_active_rounded
                                    : Icons.notifications_none_rounded,
                                size: 20,
                                color: n.isUnread
                                    ? FaColors.green
                                    : FaColors.muted,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      _kindLabel(n.kind),
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 13,
                                      ),
                                    ),
                                    if (venue.isNotEmpty) ...[
                                      const SizedBox(height: 2),
                                      Text(
                                        venue,
                                        style: const TextStyle(
                                          color: FaColors.muted,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                    const SizedBox(height: 4),
                                    Text(
                                      formatDateTime(n.at ?? n.createdAt),
                                      style: const TextStyle(
                                        color: FaColors.muted,
                                        fontSize: 11,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
