import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/auth_sheet.dart';

class ProfileTab extends StatefulWidget {
  const ProfileTab({super.key, this.onOpenOrders});

  final VoidCallback? onOpenOrders;

  @override
  State<ProfileTab> createState() => ProfileTabState();
}

class ProfileTabState extends State<ProfileTab> {
  User? user;
  bool loading = true;
  int spent = 0;
  int bookingCount = 0;
  int orderCount = 0;
  final firstName = TextEditingController();
  final lastName = TextEditingController();
  final displayName = TextEditingController();

  @override
  void initState() {
    super.initState();
    reload();
  }

  @override
  void dispose() {
    firstName.dispose();
    lastName.dispose();
    displayName.dispose();
    super.dispose();
  }

  Future<void> reload() async {
    final token = await ApiClient.instance.getToken();
    if (token == null || token.isEmpty) {
      if (mounted) {
        setState(() {
          user = null;
          loading = false;
          spent = 0;
          bookingCount = 0;
          orderCount = 0;
        });
      }
      return;
    }
    setState(() => loading = true);
    try {
      final u = await ApiClient.instance.fetchMe();
      final orders = await ApiClient.instance.fetchOrders();
      final reservations = await ApiClient.instance.fetchReservations();
      if (mounted) {
        firstName.text = u.firstName;
        lastName.text = u.lastName;
        displayName.text = u.displayName;
        setState(() {
          user = u;
          loading = false;
          spent = orders
              .where((o) => o.status == 'PAID')
              .fold(0, (s, o) => s + o.total);
          orderCount = orders.length;
          bookingCount = reservations.length;
        });
      }
    } catch (_) {
      await ApiClient.instance.logout();
      if (mounted) {
        setState(() {
          user = null;
          loading = false;
        });
      }
    }
  }

  Future<void> _save() async {
    try {
      final u = await ApiClient.instance.updateMe(
        firstName: firstName.text.trim(),
        lastName: lastName.text.trim(),
        displayName: displayName.text.trim(),
        locale: context.locale.languageCode,
      );
      if (mounted) {
        setState(() => user = u);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('profile.saved'.tr())),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('common.error'.tr())),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Center(
        child: CircularProgressIndicator(color: FaColors.gold),
      );
    }

    if (user == null) {
      return SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.person_outline, size: 56, color: FaColors.gold),
                const SizedBox(height: 12),
                Text(
                  'profile.guest'.tr(),
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 10),
                Text(
                  'auth.body'.tr(),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: FaColors.muted, height: 1.4),
                ),
                const SizedBox(height: 8),
                Text(
                  'profile.account_benefits'.tr(),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: FaColors.muted, fontSize: 13),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: () async {
                    await showAuthSheet(context);
                    reload();
                  },
                  child: Text('auth.login'.tr()),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: () async {
                    await showAuthSheet(context, register: true);
                    reload();
                  },
                  child: Text('auth.register'.tr()),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'profile.title'.tr(),
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text(user!.email, style: const TextStyle(color: FaColors.muted)),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  label: 'profile.stat_spent'.tr(),
                  value: '$spent MDL',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _StatCard(
                  label: 'profile.stat_bookings'.tr(),
                  value: '$bookingCount',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _StatCard(
                  label: 'profile.stat_orders'.tr(),
                  value: '$orderCount',
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.receipt_long_outlined),
            title: Text('profile.my_history'.tr()),
            subtitle: Text('profile.my_history_hint'.tr()),
            trailing: const Icon(Icons.chevron_right),
            onTap: widget.onOpenOrders,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: firstName,
            decoration: InputDecoration(labelText: 'profile.first_name'.tr()),
            onEditingComplete: _save,
          ),
          const SizedBox(height: 10),
          TextField(
            controller: lastName,
            decoration: InputDecoration(labelText: 'profile.last_name'.tr()),
            onEditingComplete: _save,
          ),
          const SizedBox(height: 10),
          TextField(
            controller: displayName,
            decoration:
                InputDecoration(labelText: 'profile.display_name'.tr()),
            onEditingComplete: _save,
          ),
          const SizedBox(height: 16),
          Text(
            'profile.language'.tr(),
            style: const TextStyle(color: FaColors.muted),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: ['ru', 'en', 'ro'].map((code) {
              final selected = context.locale.languageCode == code;
              return ChoiceChip(
                label: Text(code.toUpperCase()),
                selected: selected,
                onSelected: (_) async {
                  await context.setLocale(Locale(code));
                  try {
                    await ApiClient.instance.updateMe(locale: code);
                  } catch (_) {}
                },
              );
            }).toList(),
          ),
          const SizedBox(height: 20),
          FilledButton(onPressed: _save, child: Text('common.save'.tr())),
          const SizedBox(height: 10),
          OutlinedButton(
            onPressed: () async {
              await ApiClient.instance.logout();
              reload();
            },
            child: Text('profile.logout'.tr()),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: FaColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: FaColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(color: FaColors.muted, fontSize: 11),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
          ),
        ],
      ),
    );
  }
}
