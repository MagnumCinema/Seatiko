import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/auth_sheet.dart';

class MenuScreen extends StatefulWidget {
  const MenuScreen({
    super.key,
    required this.venueId,
    required this.venueName,
    this.sessionId,
    this.preorderMode = false,
  });

  final String venueId;
  final String venueName;
  final String? sessionId;
  final bool preorderMode;

  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  late Future<List<MenuItem>> _future;
  final cart = <String, ({MenuItem item, int qty})>{};
  bool busy = false;

  @override
  void initState() {
    super.initState();
    _future = ApiClient.instance.fetchMenu(widget.venueId);
  }

  int get total =>
      cart.values.fold(0, (s, e) => s + e.item.price * e.qty);

  int get count => cart.values.fold(0, (s, e) => s + e.qty);

  void _add(MenuItem item) {
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
    if (widget.sessionId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('reservation.success'.tr())),
      );
      Navigator.pop(context);
      return;
    }
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

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    return Scaffold(
      appBar: AppBar(title: Text('${'menu.title'.tr()} · ${widget.venueName}')),
      floatingActionButton: count == 0
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
              for (final entry in categories.entries) ...[
                Text(
                  entry.key,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: FaColors.gold,
                  ),
                ),
                const SizedBox(height: 8),
                ...entry.value.map((item) {
                  final blocked =
                      widget.preorderMode && item.containsAlcohol;
                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      title: Text(item.name.pick(locale)),
                      subtitle: Text(
                        item.description.pick(locale),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: FaColors.muted, fontSize: 12),
                      ),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text('${item.price} MDL'),
                          TextButton(
                            onPressed: blocked ? null : () => _add(item),
                            child: Text('menu.add'.tr()),
                          ),
                        ],
                      ),
                      isThreeLine: true,
                    ),
                  );
                }),
                const SizedBox(height: 12),
              ],
              if (cart.isNotEmpty) ...[
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
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                FilledButton(
                  onPressed: busy ? null : _checkout,
                  child: Text('menu.checkout'.tr()),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
