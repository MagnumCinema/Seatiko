import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/theme.dart';

Future<User?> showAuthSheet(BuildContext context) async {
  return showModalBottomSheet<User>(
    context: context,
    isScrollControlled: true,
    backgroundColor: FaColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => const _AuthSheet(),
  );
}

class _AuthSheet extends StatefulWidget {
  const _AuthSheet();

  @override
  State<_AuthSheet> createState() => _AuthSheetState();
}

class _AuthSheetState extends State<_AuthSheet> {
  bool register = false;
  bool busy = false;
  String? error;
  final email = TextEditingController();
  final password = TextEditingController();
  final firstName = TextEditingController();
  final lastName = TextEditingController();

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    firstName.dispose();
    lastName.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final api = ApiClient.instance;
      final AuthResponse res;
      if (register) {
        res = await api.register(
          email: email.text.trim(),
          password: password.text,
          firstName: firstName.text.trim(),
          lastName: lastName.text.trim(),
          locale: context.locale.languageCode,
        );
      } else {
        res = await api.login(
          email: email.text.trim(),
          password: password.text,
        );
      }
      if (mounted) Navigator.pop(context, res.user);
    } on ApiException catch (e) {
      setState(() => error = e.code);
    } catch (_) {
      setState(() => error = 'common.error'.tr());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: FaColors.muted,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'auth.title'.tr(),
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: FaColors.gold,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'auth.body'.tr(),
            style: const TextStyle(color: FaColors.muted),
          ),
          const SizedBox(height: 16),
          if (register) ...[
            TextField(
              controller: firstName,
              decoration: InputDecoration(labelText: 'auth.first_name'.tr()),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: lastName,
              decoration: InputDecoration(labelText: 'auth.last_name'.tr()),
            ),
            const SizedBox(height: 10),
          ],
          TextField(
            controller: email,
            keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(labelText: 'auth.email'.tr()),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: password,
            obscureText: true,
            decoration: InputDecoration(labelText: 'auth.password'.tr()),
          ),
          if (error != null) ...[
            const SizedBox(height: 10),
            Text(error!, style: const TextStyle(color: FaColors.occupied)),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: busy ? null : _submit,
            child: Text(
              register ? 'auth.register'.tr() : 'auth.login'.tr(),
            ),
          ),
          TextButton(
            onPressed: busy
                ? null
                : () => setState(() => register = !register),
            child: Text(
              register
                  ? 'auth.switch_login'.tr()
                  : 'auth.switch_register'.tr(),
            ),
          ),
        ],
      ),
    );
  }
}

Future<bool> ensureAuth(BuildContext context) async {
  final token = await ApiClient.instance.getToken();
  if (token != null && token.isNotEmpty) return true;
  if (!context.mounted) return false;
  final user = await showAuthSheet(context);
  return user != null;
}
