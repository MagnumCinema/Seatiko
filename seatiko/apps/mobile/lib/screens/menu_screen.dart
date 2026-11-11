import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/screens/reservation_screen.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/auth_sheet.dart';

class MenuScreen extends StatefulWidget {
  const MenuScreen({
    super.key,
    required this.venueId,
    required this.venueName,
    this.sessionId,
    this.preorderMode = false,
    this.venue,
  });

  final String venueId;
  final String venueName;
  final String? sessionId;
  final bool preorderMode;
  final Venue? venue;

  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  late Future<List<MenuItem>> _future;
  final cart = <String, ({MenuItem item, int qty})>{};
  bool busy = false;

  bool get canOrder => widget.sessionId != null;
  bool get browseOnly => widget.sessionId == null && !widget.preorderMode;

  @override
  void initState() {
    super.initState();
    _future = ApiClient.instance.fetchMenu(widget.venueId);
  }

  int get total =>
      cart.values.fold(0, (s, e) => s + e.item.price * e.qty);

  int get count => cart.values.fold(0, (s, e) => s + e.qty);

  void _add(MenuItem item) {
    if (browseOnly) return;
    if (widget.preorderMode && item.containsAlcohol) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('menu.alcohol_hint'.tr())),
      );
      return;
    }
    setState(() {
      final cur = cart[item.id];
      cart[item.id] = (item: item, qty: (cur?.qty ?? 0) + 1);
    });
  }

  Future<void> _checkout() async {
    if (cart.isEmpty) return;
    if (widget.preorderMode && widget.sessionId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('menu.preorder_saved'.tr())),
      );
      Navigator.pop(context);
      return;
    }
    if (widget.sessionId == null) return;
    final ok = await ensureAuth(context);
    if (!ok || !mounted) return;
    setState(() => busy = true);
    try {
      await ApiClient.instance.createOrder(
        sessionId: widget.sessionId!,
        items: cart.values
            .map((e) => (menuItemId: e.item.id, qty: e.qty))
            .toList(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('menu.checkout'.tr())),
      );
      Navigator.pop(context);
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

  Future<void> _goBook() async {
    final ok = await ensureAuth(context);
    if (!ok || !mounted) return;
    Venue? v = widget.venue;
    v ??= await ApiClient.instance.fetchVenue(widget.venueId);
    if (!mounted) return;
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => ReservationScreen(venue: v!)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    return Scaffold(
      backgroundColor: FaColors.bg,
      appBar: AppBar(title: Text('${'menu.title'.tr()} · ${widget.venueName}')),
      floatingActionButton: browseOnly || count == 0
          ? null
          : FloatingActionButton.extended(
              backgroundColor: FaColors.gold,
              foregroundColor: FaColors.bg,
              onPressed: busy ? null : _checkout,
              label: Text('${'menu.cart'.tr()} · $count · $total MDL'),
              icon: const Icon(Icons.shopping_bag_outlined),
            ),
      body: FutureBuilder<List<MenuItem>>(
        future: _future,
        builder: (context, snap) {
          if (!snap.hasData) {
            return const Center(
              child: CircularProgressIndicator(color: FaColors.gold),
            );
          }
          final items = snap.data!;
          if (items.isEmpty) {
            return Center(child: Text('menu.empty'.tr()));
          }
          final categories = <String, List<MenuItem>>{};
          for (final item in items) {
            final cat = item.category.pick(locale);
            categories.putIfAbsent(cat, () => []).add(item);
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
            children: [
              if (browseOnly)
                Container(
                  margin: const EdgeInsets.only(bottom: 16),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF3EEE4),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: const Color(0xFFE2D6C4)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'menu.browse_hint'.tr(),
                        style: const TextStyle(
                          color: FaColors.muted,
                          height: 1.4,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: _goBook,
                        child: Text('menu.book_to_order'.tr()),
                      ),
                    ],
                  ),
                ),
              for (final entry in categories.entries) ...[
                Text(
                  entry.key.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.1,
                    color: Color(0xFFB8924F),
                  ),
                ),
                const SizedBox(height: 8),
                ...entry.value.map((item) {
                  final blocked =
                      widget.preorderMode && item.containsAlcohol;
                  return Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
                    decoration: BoxDecoration(
                      color: FaColors.surface,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: FaColors.border),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item.name.pick(locale),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 15,
                                ),
                              ),
                              if (item.description.pick(locale).isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(
                                  item.description.pick(locale),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: FaColors.muted,
                                    fontSize: 12,
                                    height: 1.35,
                                  ),
                                ),
                              ],
                              if (item.containsAlcohol)
                                const Padding(
                                  padding: EdgeInsets.only(top: 6),
                                  child: Text(
                                    '18+',
                                    style: TextStyle(
                                      color: Color(0xFFB8924F),
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 10),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              '${item.price} MDL',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            if (!browseOnly)
                              TextButton(
                                onPressed: blocked ? null : () => _add(item),
                                child: Text('menu.add'.tr()),
                              ),
                          ],
                        ),
                      ],
                    ),
                  );
                }),
                const SizedBox(height: 12),
              ],
              if (!browseOnly && cart.isNotEmpty) ...[
                const Divider(color: FaColors.border),
                Text(
                  'menu.cart'.tr(),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                ...cart.values.map(
                  (e) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(e.item.name.pick(locale)),
                    subtitle: Text('×${e.qty}'),
                    trailing: Text('${e.item.price * e.qty} MDL'),
                  ),
                ),
                Text(
                  '${'menu.total'.tr()}: $total MDL',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                FilledButton(
                  onPressed: busy ? null : _checkout,
                  child: Text(
                    canOrder
                        ? 'menu.checkout'.tr()
                        : 'menu.preorder_saved'.tr(),
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
