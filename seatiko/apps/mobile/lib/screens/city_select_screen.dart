import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/screens/home_shell.dart';
import 'package:mobile/theme.dart';

class CitySelectScreen extends StatefulWidget {
  const CitySelectScreen({super.key, this.replaceHome = true});

  final bool replaceHome;

  @override
  State<CitySelectScreen> createState() => _CitySelectScreenState();
}

class _CitySelectScreenState extends State<CitySelectScreen> {
  late Future<List<City>> _future;
  String currentId = 'city-balti';

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<City>> _load() async {
    currentId = await ApiClient.instance.getCityId();
    try {
      return await ApiClient.instance.fetchCities();
    } catch (_) {
      return [
        City(
          id: 'city-balti',
          slug: 'balti',
          name: LocalizedString(ru: 'Бельцы', en: 'Bălți', ro: 'Bălți'),
          available: true,
          country: 'MD',
        ),
        City(
          id: 'city-chisinau',
          slug: 'chisinau',
          name: LocalizedString(ru: 'Кишинёв', en: 'Chișinău', ro: 'Chișinău'),
          available: false,
          country: 'MD',
        ),
        City(
          id: 'city-cahul',
          slug: 'cahul',
          name: LocalizedString(ru: 'Кагул', en: 'Cahul', ro: 'Cahul'),
          available: false,
          country: 'MD',
        ),
        City(
          id: 'city-ungeni',
          slug: 'ungeni',
          name: LocalizedString(ru: 'Унгены', en: 'Ungheni', ro: 'Ungheni'),
          available: false,
          country: 'MD',
        ),
      ];
    }
  }

  Future<void> _select(City city) async {
    if (!city.available) return;
    await ApiClient.instance.setCityId(city.id);
    if (!mounted) return;
    if (widget.replaceHome) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const HomeShell()),
      );
    } else {
      Navigator.of(context).pop(city.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    return Scaffold(
      appBar: AppBar(title: Text('city.title'.tr())),
      body: FutureBuilder<List<City>>(
        future: _future,
        builder: (context, snap) {
          if (!snap.hasData) {
            return const Center(
              child: CircularProgressIndicator(color: FaColors.gold),
            );
          }
          final cities = snap.data!;
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: cities.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, i) {
              final c = cities[i];
              final selected = c.id == currentId;
              return ListTile(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                  side: BorderSide(
                    color: selected ? FaColors.gold : FaColors.border,
                  ),
                ),
                tileColor: FaColors.surface2,
                title: Text(c.name.pick(locale)),
                subtitle: Text(
                  c.available
                      ? (selected
                          ? 'city.current'.tr()
                          : 'city.pilot'.tr())
                      : 'city.soon'.tr(),
                  style: TextStyle(
                    color: c.available ? FaColors.green : FaColors.muted,
                  ),
                ),
                trailing: c.available
                    ? Icon(
                        selected ? Icons.check_circle : Icons.chevron_right,
                        color: FaColors.gold,
                      )
                    : Text(
                        'common.soon'.tr(),
                        style: const TextStyle(color: FaColors.muted),
                      ),
                onTap: c.available ? () => _select(c) : null,
              );
            },
          );
        },
      ),
    );
  }
}
