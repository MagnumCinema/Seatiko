import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/auth_sheet.dart';

class ProfileTab extends StatefulWidget {
  const ProfileTab({super.key});

  @override
  State<ProfileTab> createState() => ProfileTabState();
}

class ProfileTabState extends State<ProfileTab> {
  User? user;
  bool loading = true;
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
        });
      }
      return;
    }
    setState(() => loading = true);
    try {
      final u = await ApiClient.instance.fetchMe();
      if (mounted) {
        firstName.text = u.firstName;
        lastName.text = u.lastName;
        displayName.text = u.displayName;
        setState(() {
          user = u;
          loading = false;
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
                Text(
                  'profile.guest'.tr(),
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                Text(
                  'auth.body'.tr(),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: FaColors.muted),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: () async {
                    await showAuthSheet(context);
                    reload();
                  },
                  child: Text('profile.sign_in'.tr()),
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
          const SizedBox(height: 20),
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
          Text('profile.language'.tr(),
              style: const TextStyle(color: FaColors.muted)),
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
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text('profile.allergies'.tr()),
            trailing: const Text('—', style: TextStyle(color: FaColors.muted)),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text('profile.payment_methods'.tr()),
            trailing: const Icon(Icons.chevron_right, color: FaColors.muted),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text('profile.favorites'.tr()),
            trailing: const Icon(Icons.chevron_right, color: FaColors.muted),
          ),
          const SizedBox(height: 12),
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
