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
    Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => const QrScreen()));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBody: true,
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
          ProfileTab(
            key: profileKey,
            onOpenOrders: () {
              setState(() => tab = 2);
              ordersKey.currentState?.reload();
            },
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(14, 0, 14, 12),
        child: Container(
          height: 72,
          padding: const EdgeInsets.symmetric(horizontal: 8),
          decoration: BoxDecoration(
            color: FaColors.surface.withValues(alpha: .96),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: FaColors.border),
            boxShadow: const [
              BoxShadow(
                color: Color(0x24203E32),
                blurRadius: 30,
                offset: Offset(0, 12),
              ),
            ],
          ),
          child: Row(
            children: [
              _NavItem(
                icon: Icons.map_outlined,
                activeIcon: Icons.map_rounded,
                label: 'nav.map'.tr(),
                active: tab == 0,
                onTap: () => _onTab(0),
              ),
              _NavItem(
                icon: Icons.auto_awesome_outlined,
                activeIcon: Icons.auto_awesome_rounded,
                label: 'nav.discover'.tr(),
                active: tab == 1,
                onTap: () => _onTab(1),
              ),
              Expanded(
                child: Center(
                  child: Semantics(
                    button: true,
                    label: 'nav.scan_qr'.tr(),
                    child: InkWell(
                      onTap: openQr,
                      borderRadius: BorderRadius.circular(18),
                      child: Container(
                        width: 52,
                        height: 52,
                        decoration: BoxDecoration(
                          color: FaColors.clay,
                          borderRadius: const BorderRadius.only(
                            topLeft: Radius.circular(18),
                            topRight: Radius.circular(18),
                            bottomRight: Radius.circular(18),
                            bottomLeft: Radius.circular(6),
                          ),
                          boxShadow: const [
                            BoxShadow(
                              color: Color(0x42D77B48),
                              blurRadius: 18,
                              offset: Offset(0, 7),
                            ),
                          ],
                        ),
                        child: const Icon(
                          Icons.qr_code_scanner_rounded,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              _NavItem(
                icon: Icons.receipt_long_outlined,
                activeIcon: Icons.receipt_long_rounded,
                label: 'nav.orders'.tr(),
                active: tab == 2,
                onTap: () => _onTab(2),
              ),
              _NavItem(
                icon: Icons.person_outline_rounded,
                activeIcon: Icons.person_rounded,
                label: 'nav.profile'.tr(),
                active: tab == 3,
                onTap: () => _onTab(3),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.active,
    required this.onTap,
  });

  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              active ? activeIcon : icon,
              color: active ? FaColors.green : FaColors.muted,
              size: 22,
            ),
            const SizedBox(height: 4),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: active ? FaColors.green : FaColors.muted,
                fontSize: 9,
                fontWeight: active ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
