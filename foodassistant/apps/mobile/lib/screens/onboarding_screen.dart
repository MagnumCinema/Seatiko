import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/screens/city_select_screen.dart';
import 'package:mobile/screens/home_shell.dart';
import 'package:mobile/theme.dart';

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
                            color: FaColors.green.withValues(alpha: 0.2),
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
                  index < 3
                      ? 'onboarding.next'.tr()
                      : 'onboarding.start'.tr(),
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
    await Future<void>.delayed(const Duration(milliseconds: 400));
    if (!mounted) return;
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
            Text(
              'FoodAssistant',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w700,
                color: FaColors.gold,
              ),
            ),
            SizedBox(height: 24),
            CircularProgressIndicator(color: FaColors.gold),
          ],
        ),
      ),
    );
  }
}
