import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:mobile/api.dart';
import 'package:mobile/screens/city_select_screen.dart';
import 'package:mobile/screens/home_shell.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/seatiko_logo.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final page = PageController();
  int index = 0;

  static const icons = [
    Icons.map_outlined,
    Icons.event_seat_outlined,
    Icons.restaurant_menu_outlined,
    Icons.qr_code_2_outlined,
  ];

  Future<void> _finish() async {
    await ApiClient.instance.setOnboarded(true);
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const CitySelectScreen()),
    );
  }

  @override
  void dispose() {
    page.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: _finish,
                child: Text('onboarding.skip'.tr()),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: page,
                itemCount: 4,
                onPageChanged: (i) => setState(() => index = i),
                itemBuilder: (_, i) {
                  final n = i + 1;
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 28),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 120,
                          height: 120,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: FaColors.green.withValues(alpha: 0.14),
                            border: Border.all(color: FaColors.gold, width: 2),
                          ),
                          child: Icon(icons[i], size: 56, color: FaColors.gold),
                        ),
                        const SizedBox(height: 32),
                        Text(
                          'app.title'.tr(),
                          style: const TextStyle(
                            color: FaColors.gold,
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'onboarding.$n.title'.tr(),
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'onboarding.$n.body'.tr(),
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: FaColors.muted,
                            fontSize: 16,
                            height: 1.4,
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(4, (i) {
                final active = i == index;
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: active ? 18 : 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: active ? FaColors.gold : FaColors.muted,
                    borderRadius: BorderRadius.circular(4),
                  ),
                );
              }),
            ),
            const SizedBox(height: 24),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
              child: FilledButton(
                onPressed: () {
                  if (index < 3) {
                    page.nextPage(
                      duration: const Duration(milliseconds: 280),
                      curve: Curves.easeOut,
                    );
                  } else {
                    _finish();
                  }
                },
                child: Text(
                  index < 3 ? 'onboarding.next'.tr() : 'onboarding.start'.tr(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class SplashGate extends StatefulWidget {
  const SplashGate({super.key});

  @override
  State<SplashGate> createState() => _SplashGateState();
}

class _SplashGateState extends State<SplashGate> {
  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    final api = ApiClient.instance;
    final onboarded = await api.isOnboarded();

    // Validate existing session token quietly on startup (401 clears token).
    final token = await api.getToken();
    if (token != null && token.isNotEmpty) {
      try {
        await api.fetchMe();
      } catch (_) {}
    }

    City? detectedUnsupportedCity;
    bool outsidePilotArea = false;

    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (serviceEnabled) {
        var perm = await Geolocator.checkPermission();
        if (perm == LocationPermission.denied && !onboarded) {
          perm = await Geolocator.requestPermission();
        }
        if (perm == LocationPermission.whileInUse ||
            perm == LocationPermission.always) {
          final pos = await Geolocator.getCurrentPosition(
            locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.low,
              timeLimit: Duration(seconds: 4),
            ),
          );
          final cities = await api.fetchCities();
          final matched = cities.where((c) {
            final b = c.bounds;
            return b != null && b.contains(pos.latitude, pos.longitude);
          }).firstOrNull;
          if (matched != null) {
            if (matched.available) {
              await api.setCityId(matched.id);
            } else {
              detectedUnsupportedCity = matched;
            }
          } else if (cities.any((c) => c.bounds != null)) {
            outsidePilotArea = true;
          }
        }
      }
    } catch (_) {
      // Geolocation failure must never block startup.
    }

    if (!mounted) return;
    if (!onboarded &&
        (detectedUnsupportedCity != null || outsidePilotArea)) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => CitySoonScreen(city: detectedUnsupportedCity),
        ),
      );
      return;
    }

    if (!onboarded) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const OnboardingScreen()),
      );
      return;
    }

    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const HomeShell()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SeatikoLogo(size: 72),
            SizedBox(height: 16),
            Text(
              'Seatiko',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w800,
                color: FaColors.text,
                letterSpacing: -0.5,
              ),
            ),
            SizedBox(height: 24),
            CircularProgressIndicator(color: FaColors.green),
          ],
        ),
      ),
    );
  }
}

class CitySoonScreen extends StatelessWidget {
  const CitySoonScreen({super.key, this.city});

  final City? city;

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    final cityName = city?.name.pick(locale) ?? '';
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Center(child: SeatikoLogo(size: 64)),
              const SizedBox(height: 24),
              Text(
                cityName.isNotEmpty
                    ? 'city.soon_in_named'.tr(args: [cityName])
                    : 'city.soon_in_yours'.tr(),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'city.soon_body'.tr(),
                textAlign: TextAlign.center,
                style: const TextStyle(color: FaColors.muted, height: 1.4),
              ),
              const SizedBox(height: 28),
              FilledButton(
                onPressed: () async {
                  await ApiClient.instance.setOnboarded(true);
                  await ApiClient.instance.setCityId('city-balti');
                  if (!context.mounted) return;
                  Navigator.of(context).pushReplacement(
                    MaterialPageRoute(builder: (_) => const OnboardingScreen()),
                  );
                },
                child: Text('city.try_pilot'.tr()),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: () async {
                  await ApiClient.instance.setOnboarded(true);
                  if (!context.mounted) return;
                  Navigator.of(context).pushReplacement(
                    MaterialPageRoute(builder: (_) => const CitySelectScreen()),
                  );
                },
                child: Text('city.choose_manual'.tr()),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
