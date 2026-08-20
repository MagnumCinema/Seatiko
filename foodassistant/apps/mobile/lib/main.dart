import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await EasyLocalization.ensureInitialized();

  runApp(
    EasyLocalization(
      supportedLocales: const [Locale('ru'), Locale('en'), Locale('ro')],
      path: 'assets/translations',
      fallbackLocale: const Locale('en'),
      startLocale: const Locale('ru'),
      child: const FoodAssistantApp(),
    ),
  );
}

class FoodAssistantApp extends StatelessWidget {
  const FoodAssistantApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FoodAssistant',
      debugShowCheckedModeBanner: false,
      localizationsDelegates: context.localizationDelegates,
      supportedLocales: context.supportedLocales,
      locale: context.locale,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFC4A574),
          brightness: Brightness.dark,
          surface: const Color(0xFF121812),
        ),
        useMaterial3: true,
      ),
      home: const MapScreen(),
    );
  }
}

class MapScreen extends StatefulWidget {
  const MapScreen({super.key});

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  late Future<List<Venue>> _venuesFuture;

  @override
  void initState() {
    super.initState();
    _venuesFuture = fetchVenues();
  }

  void _reload() {
    setState(() {
      _venuesFuture = fetchVenues();
    });
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;

    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'app.title'.tr(),
                          style: Theme.of(context).textTheme.headlineSmall
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'map.city'.tr(),
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(color: Colors.white70),
                        ),
                      ],
                    ),
                  ),
                  for (final code in ['ru', 'en', 'ro'])
                    Padding(
                      padding: const EdgeInsets.only(left: 4),
                      child: ChoiceChip(
                        label: Text(code.toUpperCase()),
                        selected: locale == code,
                        onSelected: (_) =>
                            context.setLocale(Locale(code)),
                      ),
                    ),
                ],
              ),
            ),
            Expanded(
              child: FutureBuilder<List<Venue>>(
                future: _venuesFuture,
                builder: (context, snapshot) {
                  if (snapshot.connectionState != ConnectionState.done) {
                    return Center(child: Text('map.loading'.tr()));
                  }
                  if (snapshot.hasError) {
                    return Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('errors.api'.tr()),
                          const SizedBox(height: 8),
                          Text(
                            '$apiBaseUrl',
                            style: const TextStyle(
                              fontSize: 12,
                              color: Colors.white54,
                            ),
                          ),
                          TextButton(onPressed: _reload, child: const Text('Retry')),
                        ],
                      ),
                    );
                  }
                  final venues = snapshot.data ?? [];
                  return RefreshIndicator(
                    onRefresh: () async => _reload(),
                    child: ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: venues.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final v = venues[index];
                        return Card(
                          child: ListTile(
                            title: Text(v.name.pick(locale)),
                            subtitle: Text(
                              '${v.address.pick(locale)}\n'
                              '${'map.free_tables'.tr(args: ['${v.freeTables}'])}',
                            ),
                            isThreeLine: true,
                            trailing: Text('★ ${v.rating}'),
                          ),
                        );
                      },
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 0,
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.map_outlined),
            label: 'nav.map'.tr(),
          ),
          NavigationDestination(
            icon: const Icon(Icons.auto_awesome_outlined),
            label: 'nav.discover'.tr(),
          ),
          NavigationDestination(
            icon: const Icon(Icons.receipt_long_outlined),
            label: 'nav.orders'.tr(),
          ),
          NavigationDestination(
            icon: const Icon(Icons.person_outline),
            label: 'nav.profile'.tr(),
          ),
        ],
      ),
    );
  }
}
