import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/api.dart';
import 'package:mobile/errors.dart';
import 'package:mobile/screens/venue_detail_screen.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/auth_sheet.dart';
import 'package:mobile/widgets/shimmer.dart';
import 'package:mobile/widgets/venue_thumb.dart';

class DiscoverTab extends StatefulWidget {
  const DiscoverTab({super.key, required this.cityId});

  final String cityId;

  @override
  State<DiscoverTab> createState() => _DiscoverTabState();
}

class _DiscoverTabState extends State<DiscoverTab> {
  final queryCtrl = TextEditingController();
  List<HolidayCollection> collections = [];
  List<Venue> results = [];
  String explanation = '';
  bool exactMatch = true;
  String? activeCollectionTitle;
  bool busy = false;
  final chips = ['near', 'budget', 'romantic', 'fast'];
  final selected = <String>{};

  // 5-axis DiscoverPreferences
  final Set<String> _cuisines = {};
  final Set<String> _types = {};
  final Set<String> _occasions = {};
  final Set<String> _practical = {};
  RangeValues _budget = const RangeValues(50, 1000);
  bool _budgetEdited = false;

  @override
  void initState() {
    super.initState();
    _loadCollections();
  }

  @override
  void dispose() {
    queryCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadCollections() async {
    try {
      final list = await ApiClient.instance.fetchCollections();
      if (mounted) setState(() => collections = list);
    } catch (_) {}
  }

  DiscoverAiPrefs _buildPrefs() {
    final occasions = {..._occasions};
    final practical = {..._practical};
    int? bMin = _budgetEdited ? _budget.start.round() : null;
    int? bMax = _budgetEdited ? _budget.end.round() : null;

    if (selected.contains('near')) practical.add('nearby');
    if (selected.contains('budget')) {
      bMin ??= 50;
      bMax = bMax != null ? (bMax < 300 ? bMax : 300) : 300;
    }
    if (selected.contains('romantic')) occasions.add('date_night');
    if (selected.contains('fast')) occasions.add('quick_lunch');

    return DiscoverAiPrefs(
      cuisine: _cuisines.toList(),
      restaurantType: _types.toList(),
      budgetMin: bMin,
      budgetMax: bMax,
      occasion: occasions.toList(),
      practical: practical.toList(),
    );
  }

  bool get _hasWizardPrefs =>
      _cuisines.isNotEmpty ||
      _types.isNotEmpty ||
      _occasions.isNotEmpty ||
      _practical.isNotEmpty ||
      _budgetEdited;

  Future<void> _askAi([String? chipQuery]) async {
    final q = chipQuery ?? queryCtrl.text.trim();
    final prefs = _buildPrefs();
    if (q.isEmpty && prefs.isEmpty) return;

    final token = await ApiClient.instance.getToken();
    if ((token == null || token.isEmpty) && q.isNotEmpty) {
      final used = await ApiClient.instance.getGuestDiscoverAiCountToday();
      if (used >= 3) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('discover.guest_limit_reached'.tr())),
        );
        await showAuthSheet(context);
        return;
      }
      await ApiClient.instance.incrementGuestDiscoverAiCountToday();
    }

    if (!mounted) return;
    setState(() {
      busy = true;
      activeCollectionTitle = null;
    });
    try {
      final res = await ApiClient.instance.discoverAi(
        query: q,
        cityId: widget.cityId,
        locale: context.locale.languageCode,
        prefs: prefs,
      );
      if (mounted) {
        setState(() {
          results = res.venues;
          explanation = res.explanation;
          exactMatch = res.exact;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiErrorText(e))));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _openCollection(HolidayCollection col, String locale) async {
    setState(() {
      busy = true;
      activeCollectionTitle = col.title.pick(locale);
      explanation = '';
      exactMatch = true;
    });
    try {
      final all = await ApiClient.instance.fetchVenues(cityId: widget.cityId);
      final byId = {for (final v in all) v.id: v};
      final picked = <Venue>[];
      for (final id in col.venueIds) {
        final found = byId[id];
        if (found != null) {
          picked.add(found);
        } else {
          try {
            picked.add(await ApiClient.instance.fetchVenue(id));
          } catch (_) {}
        }
      }
      if (mounted) setState(() => results = picked);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiErrorText(e))));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void _openPreferencesWizard() {
    const cuisines = [
      'moldovan',
      'italian',
      'asian',
      'european',
      'japanese',
      'grill',
      'cafe_sweets',
    ];
    const types = [
      'restaurant',
      'cafe',
      'bar',
      'pizzeria',
      'bakery',
      'wine_bar',
    ];
    const occasions = [
      'quick_lunch',
      'date_night',
      'family',
      'business',
      'group',
      'celebration',
    ];
    const practical = [
      'open_now',
      'free_tables',
      'outdoor',
      'parking',
      'wifi',
      'kid_friendly',
    ];

    final nextCuisines = Set<String>.from(_cuisines);
    final nextTypes = Set<String>.from(_types);
    final nextOccasions = Set<String>.from(_occasions);
    final nextPractical = Set<String>.from(_practical);
    var nextBudget = _budget;
    var nextBudgetEdited = _budgetEdited;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: FaColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => SafeArea(
          top: false,
          child: DraggableScrollableSheet(
            expand: false,
            initialChildSize: 0.78,
            maxChildSize: 0.92,
            builder: (ctx, scrollCtrl) => ListView(
              controller: scrollCtrl,
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: FaColors.muted.withValues(alpha: 0.4),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'discover.wizard.title'.tr(),
                        style: const TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () => setModalState(() {
                        nextCuisines.clear();
                        nextTypes.clear();
                        nextOccasions.clear();
                        nextPractical.clear();
                        nextBudget = const RangeValues(50, 1000);
                        nextBudgetEdited = false;
                      }),
                      child: Text('discover.wizard.filters_clear'.tr()),
                    ),
                  ],
                ),
                Text(
                  'discover.wizard.lead'.tr(),
                  style: const TextStyle(color: FaColors.muted, fontSize: 13),
                ),
                const SizedBox(height: 16),
                _wizardGroup(
                  'discover.wizard.step.cuisine'.tr(),
                  cuisines,
                  nextCuisines,
                  (id) => 'discover.cuisine.$id'.tr(),
                  setModalState,
                ),
                _wizardGroup(
                  'discover.wizard.step.restaurant_type'.tr(),
                  types,
                  nextTypes,
                  (id) => 'discover.type.$id'.tr(),
                  setModalState,
                ),
                Text(
                  '${'discover.wizard.step.budget'.tr()}: ${nextBudget.start.round()}–${nextBudget.end.round()} MDL',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                RangeSlider(
                  values: nextBudget,
                  min: 50,
                  max: 1000,
                  divisions: 19,
                  activeColor: FaColors.green,
                  onChanged: (v) => setModalState(() {
                    nextBudget = v;
                    nextBudgetEdited = true;
                  }),
                ),
                const SizedBox(height: 10),
                _wizardGroup(
                  'discover.wizard.step.occasion'.tr(),
                  occasions,
                  nextOccasions,
                  (id) => 'discover.occasion.$id'.tr(),
                  setModalState,
                ),
                _wizardGroup(
                  'discover.wizard.step.practical'.tr(),
                  practical,
                  nextPractical,
                  (id) => 'discover.practical.$id'.tr(),
                  setModalState,
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () {
                    setState(() {
                      _cuisines
                        ..clear()
                        ..addAll(nextCuisines);
                      _types
                        ..clear()
                        ..addAll(nextTypes);
                      _occasions
                        ..clear()
                        ..addAll(nextOccasions);
                      _practical
                        ..clear()
                        ..addAll(nextPractical);
                      _budget = nextBudget;
                      _budgetEdited = nextBudgetEdited;
                    });
                    Navigator.pop(ctx);
                    _askAi();
                  },
                  child: Text('discover.wizard.show_map'.tr()),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _wizardGroup(
    String title,
    List<String> ids,
    Set<String> target,
    String Function(String) labelOf,
    StateSetter setModalState,
  ) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: ids.map((id) {
              final on = target.contains(id);
              return FilterChip(
                label: Text(labelOf(id)),
                selected: on,
                onSelected: (v) => setModalState(() {
                  if (v) {
                    target.add(id);
                  } else {
                    target.remove(id);
                  }
                }),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    final bottomPad = MediaQuery.paddingOf(context).bottom + 96;
    return SafeArea(
      bottom: false,
      child: CustomScrollView(
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            sliver: SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'discover.title'.tr(),
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      OutlinedButton.icon(
                        onPressed: () {
                          HapticFeedback.selectionClick();
                          _openPreferencesWizard();
                        },
                        icon: const Icon(Icons.tune_rounded, size: 18),
                        label: Text(
                          _hasWizardPrefs
                              ? 'discover.wizard.filters_edit'.tr()
                              : 'discover.wizard.preferences_btn'.tr(),
                        ),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: queryCtrl,
                    decoration: InputDecoration(
                      hintText: 'discover.placeholder'.tr(),
                      suffixIcon: IconButton(
                        icon: busy
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.send, color: FaColors.gold),
                        onPressed: busy ? null : () => _askAi(),
                      ),
                    ),
                    onSubmitted: (_) => _askAi(),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: chips.map((c) {
                      final label = 'discover.chip_$c'.tr();
                      final on = selected.contains(c);
                      return FilterChip(
                        label: Text(label),
                        selected: on,
                        onSelected: (v) {
                          HapticFeedback.selectionClick();
                          setState(() {
                            if (v) {
                              selected.add(c);
                            } else {
                              selected.remove(c);
                            }
                          });
                          _askAi(label);
                        },
                        selectedColor: FaColors.gold.withValues(alpha: 0.25),
                        checkmarkColor: FaColors.gold,
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'discover.holiday'.tr(),
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 88,
                    child: collections.isEmpty
                        ? Center(
                            child: Text(
                              'discover.empty'.tr(),
                              style: const TextStyle(color: FaColors.muted),
                            ),
                          )
                        : ListView.separated(
                            scrollDirection: Axis.horizontal,
                            itemCount: collections.length,
                            separatorBuilder: (_, _) =>
                                const SizedBox(width: 10),
                            itemBuilder: (_, i) {
                              final col = collections[i];
                              return InkWell(
                                onTap: () {
                                  HapticFeedback.selectionClick();
                                  _openCollection(col, locale);
                                },
                                borderRadius: BorderRadius.circular(14),
                                child: Container(
                                  width: 150,
                                  padding: const EdgeInsets.all(14),
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(14),
                                    gradient: LinearGradient(
                                      colors: [
                                        FaColors.green.withValues(alpha: 0.35),
                                        FaColors.gold.withValues(alpha: 0.2),
                                      ],
                                    ),
                                    border: Border.all(color: FaColors.border),
                                  ),
                                  child: Align(
                                    alignment: Alignment.bottomLeft,
                                    child: Text(
                                      col.title.pick(locale),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                  ),
                  const SizedBox(height: 20),
                  if (activeCollectionTitle != null) ...[
                    Text(
                      activeCollectionTitle!,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                  if (explanation.isNotEmpty) ...[
                    Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: FaColors.green.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: FaColors.green.withValues(alpha: 0.22),
                        ),
                      ),
                      child: Text(
                        explanation,
                        style: const TextStyle(fontSize: 13, height: 1.35),
                      ),
                    ),
                  ],
                  if (!exactMatch && results.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Text(
                        'discover.wizard.approximate_hint'.tr(),
                        style: const TextStyle(
                          color: FaColors.muted,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  if (busy && results.isEmpty)
                    const CardListShimmer(count: 3)
                  else if (results.isEmpty && !busy)
                    Text(
                      'discover.empty'.tr(),
                      style: const TextStyle(color: FaColors.muted),
                    ),
                ],
              ),
            ),
          ),
          if (results.isNotEmpty)
            SliverPadding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, bottomPad),
              sliver: SliverList.builder(
                itemCount: results.length,
                itemBuilder: (_, i) {
                  final v = results[i];
                  return Card(
                    margin: const EdgeInsets.only(bottom: 10),
                    child: ListTile(
                      leading: VenueThumb(
                        imageUrl: v.imageUrl,
                        size: 48,
                        radius: 12,
                        priceLevel: v.priceLevel,
                        heroTag: 'venue-cover-${v.id}',
                      ),
                      title: Text(v.name.pick(locale)),
                      subtitle: Text(
                        'map.free_tables'.tr(args: ['${v.freeTables}']),
                      ),
                      trailing: Text('★ ${v.rating}'),
                      onTap: () {
                        HapticFeedback.selectionClick();
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => VenueDetailScreen(venueId: v.id),
                          ),
                        );
                      },
                    ),
                  );
                },
              ),
            )
          else
            SliverToBoxAdapter(child: SizedBox(height: bottomPad)),
        ],
      ),
    );
  }
}
