import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/errors.dart';
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
    return ApiClient.instance.fetchCities();
  }

  void _retry() {
    setState(() {
      _future = _load();
    });
  }

  Future<void> _select(City city) async {
    if (!city.available) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('city.soon_toast'.tr(args: [city.name.pick(context.locale.languageCode)]))),
      );
      return;
    }
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
      body: SafeArea(
        child: FutureBuilder<List<City>>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Center(
                child: CircularProgressIndicator(color: FaColors.gold),
              );
            }
            if (snap.hasError) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.cloud_off_rounded,
                        size: 48,
                        color: FaColors.muted,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        apiErrorText(snap.error!),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: _retry,
                        child: Text('common.retry'.tr()),
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: () {
                          _select(
                            City(
                              id: 'city-balti',
                              slug: 'balti',
                              name: LocalizedString(
                                ru: 'Бельцы',
                                en: 'Bălți',
                                ro: 'Bălți',
                              ),
                              available: true,
                              country: 'MD',
                            ),
                          );
                        },
                        child: Text('city.try_pilot'.tr()),
                      ),
                    ],
                  ),
                ),
              );
            }
            final cities = snap.data ?? [];
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
                        ? (selected ? 'city.current'.tr() : 'city.pilot'.tr())
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
                  onTap: () => _select(c),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
