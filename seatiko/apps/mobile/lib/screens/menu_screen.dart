import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/api.dart';
import 'package:mobile/errors.dart';
import 'package:mobile/screens/reservation_screen.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/auth_sheet.dart';
import 'package:mobile/widgets/shimmer.dart';
import 'package:mobile/widgets/venue_thumb.dart';

sealed class _MenuRow {}

class _BrowseHintRow extends _MenuRow {}

class _CategoryHeaderRow extends _MenuRow {
  _CategoryHeaderRow(this.title);
  final String title;
}

class _DishRow extends _MenuRow {
  _DishRow(this.item);
  final MenuItem item;
}

class _CartSummaryRow extends _MenuRow {}

class MenuScreen extends StatefulWidget {
  const MenuScreen({
    super.key,
    required this.venueId,
    required this.venueName,
    this.sessionId,
    this.reservationId,
    this.preorderMode = false,
    this.venue,
  });

  final String venueId;
  final String venueName;
  final String? sessionId;
  final String? reservationId;
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
  bool get canPreorder => widget.preorderMode && widget.reservationId != null;
  bool get browseOnly => !canOrder && !widget.preorderMode;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() {
      _future = _loadMenu();
    });
  }

  Future<List<MenuItem>> _loadMenu() async {
    final token = await ApiClient.instance.getToken();
    final List<MenuItem> items;
    if (widget.preorderMode && token != null && token.isNotEmpty) {
      items = await ApiClient.instance.fetchPreorderMenu(widget.venueId);
    } else {
      items = await ApiClient.instance.fetchMenu(widget.venueId);
    }
    if (canPreorder && cart.isEmpty) {
      try {
        final existing = await ApiClient.instance.fetchPreorder(
          widget.reservationId!,
        );
        final byId = {for (final m in items) m.id: m};
        for (final oi in existing.items) {
          final m = byId[oi.menuItemId];
          if (m != null && m.orderable) {
            cart[m.id] = (item: m, qty: oi.qty);
          }
        }
      } catch (_) {}
    }
    return items;
  }

  int get total => cart.values.fold(0, (s, e) => s + e.item.price * e.qty);
  int get count => cart.values.fold(0, (s, e) => s + e.qty);

  void _add(MenuItem item) {
    if (browseOnly) return;
    if (item.stopped) {
      HapticFeedback.heavyImpact();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('error.item_unavailable'.tr())),
      );
      return;
    }
    if (widget.preorderMode && !item.orderable) {
      HapticFeedback.heavyImpact();
      final msg = item.blockedReason == 'age_verification_required'
          ? 'age18.preorder_blocked'.tr()
          : 'error.item_unavailable'.tr();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      return;
    }
    HapticFeedback.mediumImpact();
    setState(() {
      final cur = cart[item.id];
      cart[item.id] = (item: item, qty: (cur?.qty ?? 0) + 1);
    });
  }

  void _dec(MenuItem item) {
    final cur = cart[item.id];
    if (cur == null) return;
    HapticFeedback.selectionClick();
    setState(() {
      if (cur.qty <= 1) {
        cart.remove(item.id);
      } else {
        cart[item.id] = (item: item, qty: cur.qty - 1);
      }
    });
  }

  Future<void> _checkout() async {
    if (cart.isEmpty) return;
    final ok = await ensureAuth(context);
    if (!ok || !mounted) return;
    HapticFeedback.mediumImpact();
    setState(() => busy = true);
    try {
      final lines = cart.values
          .map((e) => (menuItemId: e.item.id, qty: e.qty))
          .toList();
      if (canPreorder) {
        await ApiClient.instance.savePreorder(widget.reservationId!, lines);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('menu.preorder_saved'.tr())),
        );
        Navigator.pop(context, true);
      } else if (widget.sessionId != null) {
        await ApiClient.instance.createOrder(
          sessionId: widget.sessionId!,
          items: lines,
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('menu.checkout'.tr())),
        );
        Navigator.pop(context, true);
      }
    } catch (e) {
      HapticFeedback.heavyImpact();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(apiErrorText(e))),
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

  List<_MenuRow> _buildRows(List<MenuItem> items, String locale) {
    final categories = <String, List<MenuItem>>{};
    for (final item in items) {
      final cat = item.category.pick(locale);
      categories.putIfAbsent(cat, () => []).add(item);
    }
    final rows = <_MenuRow>[];
    if (browseOnly) rows.add(_BrowseHintRow());
    for (final entry in categories.entries) {
      rows.add(_CategoryHeaderRow(entry.key));
      for (final item in entry.value) {
        rows.add(_DishRow(item));
      }
    }
    if (!browseOnly && cart.isNotEmpty) {
      rows.add(_CartSummaryRow());
    }
    return rows;
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    return Scaffold(
      backgroundColor: FaColors.bg,
      appBar: AppBar(title: Text('${'menu.title'.tr()} · ${widget.venueName}')),
      floatingActionButton: browseOnly || count == 0
          ? null
          : AnimatedScale(
              scale: count > 0 ? 1.0 : 0.0,
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOutBack,
              child: FloatingActionButton.extended(
                backgroundColor: FaColors.green,
                foregroundColor: Colors.white,
                onPressed: busy ? null : _checkout,
                label: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 180),
                  child: Text(
                    '${'menu.cart'.tr()} · $count · $total MDL',
                    key: ValueKey('$count-$total'),
                  ),
                ),
                icon: const Icon(Icons.shopping_bag_outlined),
              ),
            ),
      body: SafeArea(
        top: false,
        child: FutureBuilder<List<MenuItem>>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const CardListShimmer();
            }
            if (snap.hasError) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        apiErrorText(snap.error!),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: _reload,
                        child: Text('common.retry'.tr()),
                      ),
                    ],
                  ),
                ),
              );
            }
            final items = snap.data ?? [];
            if (items.isEmpty) {
              return Center(child: Text('menu.empty'.tr()));
            }
            final rows = _buildRows(items, locale);
            return ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 110),
              itemCount: rows.length,
              itemBuilder: (context, index) {
                final row = rows[index];
                switch (row) {
                  case _BrowseHintRow():
                    return Container(
                      margin: const EdgeInsets.only(bottom: 16),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: FaColors.surface2,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: FaColors.border),
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
                    );
                  case _CategoryHeaderRow(:final title):
                    return Padding(
                      padding: const EdgeInsets.only(top: 10, bottom: 8),
                      child: Text(
                        title.toUpperCase(),
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.1,
                          color: FaColors.ratingFg,
                        ),
                      ),
                    );
                  case _DishRow(:final item):
                    return _DishCard(
                      item: item,
                      locale: locale,
                      browseOnly: browseOnly,
                      preorderMode: widget.preorderMode,
                      qtyInCart: cart[item.id]?.qty ?? 0,
                      onAdd: () => _add(item),
                      onDec: () => _dec(item),
                    );
                  case _CartSummaryRow():
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Divider(color: FaColors.border),
                        Text(
                          'menu.cart'.tr(),
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        ...cart.values.map(
                          (e) => ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(e.item.name.pick(locale)),
                            subtitle: Text('×${e.qty} · ${e.item.price * e.qty} MDL'),
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                IconButton(
                                  onPressed: () => _dec(e.item),
                                  icon: const Icon(Icons.remove_circle_outline),
                                ),
                                IconButton(
                                  onPressed: () => _add(e.item),
                                  icon: const Icon(Icons.add_circle_outline),
                                ),
                              ],
                            ),
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
                                : 'menu.save_preorder'.tr(),
                          ),
                        ),
                      ],
                    );
                }
              },
            );
          },
        ),
      ),
    );
  }
}

class _DishCard extends StatelessWidget {
  const _DishCard({
    required this.item,
    required this.locale,
    required this.browseOnly,
    required this.preorderMode,
    required this.qtyInCart,
    required this.onAdd,
    required this.onDec,
  });

  final MenuItem item;
  final String locale;
  final bool browseOnly;
  final bool preorderMode;
  final int qtyInCart;
  final VoidCallback onAdd;
  final VoidCallback onDec;

  @override
  Widget build(BuildContext context) {
    final blocked = item.stopped || (preorderMode && !item.orderable);
    final portion = item.weightG != null && item.weightG! > 0
        ? '${item.weightG} g'
        : (item.volumeMl != null && item.volumeMl! > 0
              ? '${item.volumeMl} ml'
              : '');
    return Opacity(
      opacity: item.stopped ? 0.55 : 1.0,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.fromLTRB(12, 12, 10, 12),
        decoration: BoxDecoration(
          color: FaColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: FaColors.border),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (item.imageUrl.isNotEmpty) ...[
              VenueThumb(imageUrl: item.imageUrl, size: 60, radius: 10),
              const SizedBox(width: 10),
            ],
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
                  if (portion.isNotEmpty ||
                      item.allergens.isNotEmpty ||
                      item.is18Plus ||
                      item.stopped)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        children: [
                          if (portion.isNotEmpty)
                            Text(
                              portion,
                              style: const TextStyle(
                                color: FaColors.muted,
                                fontSize: 11,
                              ),
                            ),
                          if (item.allergens.isNotEmpty)
                            Text(
                              '${'menu.allergens'.tr()}: ${item.allergens.join(', ')}',
                              style: const TextStyle(
                                color: FaColors.muted,
                                fontSize: 11,
                              ),
                            ),
                          if (item.is18Plus)
                            Text(
                              preorderMode &&
                                      item.blockedReason ==
                                          'age_verification_required'
                                  ? '18+ · ${'age18.preorder_blocked'.tr()}'
                                  : '18+',
                              style: const TextStyle(
                                color: FaColors.ratingFg,
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          if (item.stopped)
                            Text(
                              'menu.stopped'.tr(),
                              style: const TextStyle(
                                color: FaColors.occupied,
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${item.price} MDL',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                if (!browseOnly) ...[
                  const SizedBox(height: 4),
                  if (qtyInCart == 0)
                    TextButton(
                      onPressed: blocked ? null : onAdd,
                      child: Text('menu.add'.tr()),
                    )
                  else
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          visualDensity: VisualDensity.compact,
                          onPressed: onDec,
                          icon: const Icon(
                            Icons.remove_circle_outline,
                            size: 20,
                          ),
                        ),
                        Text(
                          '$qtyInCart',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        IconButton(
                          visualDensity: VisualDensity.compact,
                          onPressed: blocked ? null : onAdd,
                          icon: const Icon(Icons.add_circle_outline, size: 20),
                        ),
                      ],
                    ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}
