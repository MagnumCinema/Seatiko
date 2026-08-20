import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/screens/discover_screen.dart';
import 'package:mobile/screens/map_screen.dart';
import 'package:mobile/screens/orders_screen.dart';
import 'package:mobile/screens/profile_screen.dart';
import 'package:mobile/screens/qr_screen.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/auth_sheet.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key, this.initialTab = 0});

  final int initialTab;

  @override
  State<HomeShell> createState() => HomeShellState();
}

class HomeShellState extends State<HomeShell> {
  late int tab;
  String cityId = 'city-balti';
  String cityName = '';
  final mapKey = GlobalKey<MapTabState>();
  final ordersKey = GlobalKey<OrdersTabState>();
  final profileKey = GlobalKey<ProfileTabState>();

  @override
  void initState() {
    super.initState();
    tab = widget.initialTab;
    _loadCity();
  }

  Future<void> _loadCity() async {
    final id = await ApiClient.instance.getCityId();
    String name = 'map.city'.tr();
    try {
      final cities = await ApiClient.instance.fetchCities();
      final c = cities.where((e) => e.id == id).firstOrNull;
      if (c != null && mounted) {
        name = c.name.pick(context.locale.languageCode);
      }
    } catch (_) {}
    if (mounted) {
      setState(() {
        cityId = id;
        cityName = name;
      });
      mapKey.currentState?.reload(cityId);
    }
  }

  void setCity(String id, String name) {
    setState(() {
      cityId = id;
      cityName = name;
    });
    mapKey.currentState?.reload(id);
  }

  Future<void> _onTab(int i) async {
    if (i == 2 || i == 3) {
      final ok = await ensureAuth(context);
      if (!ok) return;
      if (i == 2) ordersKey.currentState?.reload();
      if (i == 3) profileKey.currentState?.reload();
    }
    setState(() => tab = i);
  }

  void openQr() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const QrScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: tab,
        children: [
          MapTab(
            key: mapKey,
            cityId: cityId,
            cityName: cityName.isEmpty ? 'map.city'.tr() : cityName,
            onCityChanged: _loadCity,
          ),
          DiscoverTab(cityId: cityId),
          OrdersTab(key: ordersKey),
          ProfileTab(key: profileKey),
        ],
      ),
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Material(
            color: FaColors.surface2,
            child: InkWell(
              onTap: openQr,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        'nav.scan_qr'.tr(),
                        style: const TextStyle(
                          color: FaColors.text,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: FaColors.gold.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: FaColors.gold),
                      ),
                      child: const Icon(Icons.qr_code_2, color: FaColors.gold),
                    ),
                  ],
                ),
              ),
            ),
          ),
          NavigationBar(
            selectedIndex: tab,
            onDestinationSelected: _onTab,
            destinations: [
              NavigationDestination(
                icon: const Icon(Icons.map_outlined),
                selectedIcon: const Icon(Icons.map),
                label: 'nav.map'.tr(),
              ),
              NavigationDestination(
                icon: const Icon(Icons.auto_awesome_outlined),
                selectedIcon: const Icon(Icons.auto_awesome),
                label: 'nav.discover'.tr(),
              ),
              NavigationDestination(
                icon: const Icon(Icons.receipt_long_outlined),
                selectedIcon: const Icon(Icons.receipt_long),
                label: 'nav.orders'.tr(),
              ),
              NavigationDestination(
                icon: const Icon(Icons.person_outline),
                selectedIcon: const Icon(Icons.person),
                label: 'nav.profile'.tr(),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
