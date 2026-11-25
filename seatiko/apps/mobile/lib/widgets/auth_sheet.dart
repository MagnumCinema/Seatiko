import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/errors.dart';
import 'package:mobile/theme.dart';

Future<User?> showAuthSheet(
  BuildContext context, {
  bool register = false,
}) async {
  return showModalBottomSheet<User>(
    context: context,
    isScrollControlled: true,
    backgroundColor: FaColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _AuthSheet(initialRegister: register),
  );
}

class _AuthSheet extends StatefulWidget {
  const _AuthSheet({this.initialRegister = false});
  final bool initialRegister;

  @override
  State<_AuthSheet> createState() => _AuthSheetState();
}

class _AuthSheetState extends State<_AuthSheet> {
  late bool register;
  bool busy = false;
  bool obscure = true;
  String? error;
  AuthProviders? providers;
  final email = TextEditingController();
  final password = TextEditingController();
  final firstName = TextEditingController();
  final lastName = TextEditingController();

  @override
  void initState() {
    super.initState();
    register = widget.initialRegister;
    ApiClient.instance.fetchAuthProviders().then((p) {
      if (mounted) setState(() => providers = p);
    }).catchError((_) {});
  }

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    firstName.dispose();
    lastName.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final mail = email.text.trim();
    final pwd = password.text;
    if (mail.isEmpty || !mail.contains('@')) {
      setState(() => error = 'error.invalid_email'.tr());
      return;
    }
    if (pwd.length < (register ? 6 : 1)) {
      setState(() => error = 'error.password_too_short'.tr());
      return;
    }

    setState(() {
      busy = true;
      error = null;
    });
    try {
      final api = ApiClient.instance;
      final AuthResponse res;
      if (register) {
        res = await api.register(
          email: mail,
          password: pwd,
          firstName: firstName.text.trim(),
          lastName: lastName.text.trim(),
          locale: context.locale.languageCode,
        );
      } else {
        res = await api.login(email: mail, password: pwd);
      }
      if (mounted) Navigator.pop(context, res.user);
    } catch (e) {
      if (mounted) setState(() => error = apiErrorText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return SafeArea(
      top: false,
      child: SingleChildScrollView(
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
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(labelText: 'auth.first_name'.tr()),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: lastName,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(labelText: 'auth.last_name'.tr()),
              ),
              const SizedBox(height: 10),
            ],
            TextField(
              controller: email,
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              autocorrect: false,
              decoration: InputDecoration(labelText: 'auth.email'.tr()),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: password,
              obscureText: obscure,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => busy ? null : _submit(),
              decoration: InputDecoration(
                labelText: 'auth.password'.tr(),
                suffixIcon: IconButton(
                  onPressed: () => setState(() => obscure = !obscure),
                  icon: Icon(
                    obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                  ),
                ),
              ),
            ),
            if (error != null) ...[
              const SizedBox(height: 10),
              Text(error!, style: const TextStyle(color: FaColors.occupied)),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: busy ? null : _submit,
              child: busy
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: FaColors.cream,
                      ),
                    )
                  : Text(register ? 'auth.register'.tr() : 'auth.login'.tr()),
            ),
            TextButton(
              onPressed: busy
                  ? null
                  : () => setState(() {
                        register = !register;
                        error = null;
                      }),
              child: Text(
                register
                    ? 'auth.switch_login'.tr()
                    : 'auth.switch_register'.tr(),
              ),
            ),
            if (providers?.googleEnabled == true)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  'auth.google_web_hint'.tr(),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: FaColors.muted, fontSize: 11),
                ),
              ),
          ],
        ),
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
