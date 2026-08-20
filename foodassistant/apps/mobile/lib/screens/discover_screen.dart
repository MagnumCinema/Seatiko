import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/screens/venue_detail_screen.dart';
import 'package:mobile/theme.dart';

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
  bool busy = false;
  final chips = ['near', 'budget', 'romantic', 'fast'];
  final selected = <String>{};

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

  Future<void> _askAi([String? chip]) async {
    final q = chip ?? queryCtrl.text.trim();
    if (q.isEmpty) return;
    setState(() => busy = true);
    try {
      final list = await ApiClient.instance.discoverAi(q);
      if (mounted) setState(() => results = list);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('common.error'.tr())));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'discover.title'.tr(),
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 16),
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
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 88,
            child: collections.isEmpty
                ? Center(
                    child: Text('discover.empty'.tr(),
                        style: const TextStyle(color: FaColors.muted)))
                : ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: collections.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 10),
                    itemBuilder: (_, i) {
                      final col = collections[i];
                      return InkWell(
                        onTap: () => _askAi(col.title.pick(locale)),
                        borderRadius: BorderRadius.circular(14),
                        child: Container(
                          width: 140,
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
                              style:
                                  const TextStyle(fontWeight: FontWeight.w600),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
          ),
          const SizedBox(height: 24),
          if (results.isEmpty && !busy)
            Text('discover.empty'.tr(),
                style: const TextStyle(color: FaColors.muted))
          else
            ...results.map(
              (v) => Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  title: Text(v.name.pick(locale)),
                  subtitle: Text(
                    'map.free_tables'.tr(args: ['${v.freeTables}']),
                  ),
                  trailing: Text('★ ${v.rating}'),
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => VenueDetailScreen(venueId: v.id),
                      ),
                    );
                  },
                ),
              ),
            ),
        ],
      ),
    );
  }
}
