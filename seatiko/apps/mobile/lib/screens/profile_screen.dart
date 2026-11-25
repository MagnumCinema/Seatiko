import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/api.dart';
import 'package:mobile/errors.dart';
import 'package:mobile/screens/venue_detail_screen.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/auth_sheet.dart';
import 'package:mobile/widgets/shimmer.dart';

class ProfileTab extends StatefulWidget {
  const ProfileTab({super.key, this.onOpenOrders});

  final VoidCallback? onOpenOrders;

  @override
  State<ProfileTab> createState() => ProfileTabState();
}

class ProfileTabState extends State<ProfileTab> {
  User? user;
  bool loading = true;
  Object? error;
  int spent = 0;
  int bookingCount = 0;
  int orderCount = 0;
  List<Venue> favoriteVenues = [];
  List<String> localPayments = [];
  final firstName = TextEditingController();
  final lastName = TextEditingController();
  final displayName = TextEditingController();
  final phone = TextEditingController();
  final Set<String> selectedDiets = {};

  static const _dietOptions = [
    'vegetarian',
    'vegan',
    'gluten_free',
    'lactose_free',
    'halal',
    'nut_free',
  ];

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
    phone.dispose();
    super.dispose();
  }

  Future<void> reload() async {
    final token = await ApiClient.instance.getToken();
    if (token == null || token.isEmpty) {
      if (mounted) {
        setState(() {
          user = null;
          loading = false;
          error = null;
          spent = 0;
          bookingCount = 0;
          orderCount = 0;
          favoriteVenues = [];
        });
      }
      return;
    }
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final results = await Future.wait([
        ApiClient.instance.fetchMe(),
        ApiClient.instance.fetchOrders(),
        ApiClient.instance.fetchReservations(),
        ApiClient.instance.getLocalPaymentPreviews(),
      ]);
      final u = results[0] as User;
      final orders = results[1] as List<Order>;
      final reservations = results[2] as List<Reservation>;
      final payments = results[3] as List<String>;

      final favs = <Venue>[];
      for (final vid in u.favoriteVenues) {
        try {
          favs.add(await ApiClient.instance.fetchVenue(vid));
        } catch (_) {}
      }

      if (mounted) {
        firstName.text = u.firstName;
        lastName.text = u.lastName;
        displayName.text = u.displayName;
        phone.text = u.phone ?? '';
        selectedDiets
          ..clear()
          ..addAll(u.dietPreferences);
        setState(() {
          user = u;
          loading = false;
          error = null;
          spent = orders
              .where((o) => o.status == 'PAID')
              .fold(0, (s, o) => s + o.total);
          orderCount = orders.length;
          bookingCount = reservations.length;
          favoriteVenues = favs;
          localPayments = payments;
        });
      }
    } on ApiException catch (e) {
      if (e.status == 401) {
        await ApiClient.instance.logout();
        if (mounted) {
          setState(() {
            user = null;
            loading = false;
            error = null;
          });
        }
        return;
      }
      if (mounted) {
        setState(() {
          error = e;
          loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e;
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
        phone: phone.text.trim(),
        locale: context.locale.languageCode,
        dietPreferences: selectedDiets.toList(),
      );
      if (mounted) {
        HapticFeedback.mediumImpact();
        setState(() => user = u);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('profile.saved'.tr())),
        );
      }
    } catch (e) {
      if (mounted) {
        HapticFeedback.heavyImpact();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(apiErrorText(e))),
        );
      }
    }
  }

  Future<void> _pickAvatar() async {
    try {
      final picker = ImagePicker();
      final picked = await picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );
      if (picked == null) return;
      final updated = await ApiClient.instance.uploadAvatar(picked.path);
      if (!mounted) return;
      setState(() => user = updated);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('profile.saved'.tr())),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(apiErrorText(e))),
        );
      }
    }
  }

  Future<void> _removeAvatar() async {
    try {
      final updated = await ApiClient.instance.deleteAvatar();
      if (mounted) setState(() => user = updated);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(apiErrorText(e))),
        );
      }
    }
  }

  Future<void> _changeEmailDialog() async {
    final ctrl = TextEditingController(text: user?.email ?? '');
    final updatedEmail = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('profile.change_email'.tr()),
        content: SingleChildScrollView(
          child: TextField(
            controller: ctrl,
            keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(labelText: 'auth.email'.tr()),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('common.cancel'.tr()),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            child: Text('common.save'.tr()),
          ),
        ],
      ),
    );
    ctrl.dispose();
    if (updatedEmail == null || updatedEmail.isEmpty || !mounted) return;
    try {
      final u = await ApiClient.instance.updateEmail(updatedEmail);
      if (mounted) {
        setState(() => user = u);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('profile.saved'.tr())),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(apiErrorText(e))),
        );
      }
    }
  }

  Future<void> _changePasswordDialog() async {
    final oldCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    final needsOld = user?.hasPassword ?? true;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('profile.change_password'.tr()),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (needsOld) ...[
                TextField(
                  controller: oldCtrl,
                  obscureText: true,
                  decoration: InputDecoration(
                    labelText: 'profile.old_password'.tr(),
                  ),
                ),
                const SizedBox(height: 10),
              ],
              TextField(
                controller: newCtrl,
                obscureText: true,
                decoration: InputDecoration(
                  labelText: 'profile.new_password'.tr(),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('common.cancel'.tr()),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('common.save'.tr()),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      try {
        await ApiClient.instance.updatePassword(
          oldPassword: needsOld ? oldCtrl.text : null,
          newPassword: newCtrl.text,
        );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('profile.password_updated'.tr())),
          );
          reload();
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(apiErrorText(e))),
          );
        }
      }
    }
    oldCtrl.dispose();
    newCtrl.dispose();
  }

  Future<void> _deleteAccountFlow() async {
    final pwdCtrl = TextEditingController();
    final needsPassword = user?.hasPassword ?? true;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('profile.delete_account'.tr()),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('profile.delete_account_warn'.tr()),
              if (needsPassword) ...[
                const SizedBox(height: 12),
                TextField(
                  controller: pwdCtrl,
                  obscureText: true,
                  decoration: InputDecoration(labelText: 'auth.password'.tr()),
                ),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('common.cancel'.tr()),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: FaColors.occupied),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('profile.delete_confirm_btn'.tr()),
          ),
        ],
      ),
    );
    final pwd = pwdCtrl.text;
    pwdCtrl.dispose();
    if (confirmed != true || !mounted) return;
    try {
      await ApiClient.instance.deleteAccount(needsPassword ? pwd : null);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('profile.account_deleted'.tr())),
      );
      reload();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(apiErrorText(e))),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    final bottomPad = MediaQuery.paddingOf(context).bottom + 96;

    if (loading) {
      return const SafeArea(child: CardListShimmer());
    }

    if (error != null) {
      return SafeArea(
        child: Center(
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
                Text(apiErrorText(error!), textAlign: TextAlign.center),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: reload,
                  child: Text('common.retry'.tr()),
                ),
              ],
            ),
          ),
        ),
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
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                  ),
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

    final avatarUrl = mediaUrl(user!.avatarUrl);
    final av = user!.adultVerification;

    return SafeArea(
      bottom: false,
      child: ListView(
        padding: EdgeInsets.fromLTRB(16, 16, 16, bottomPad),
        children: [
          Row(
            children: [
              GestureDetector(
                onTap: _pickAvatar,
                child: CircleAvatar(
                  radius: 30,
                  backgroundColor: FaColors.green.withValues(alpha: 0.16),
                  backgroundImage:
                      avatarUrl.isNotEmpty ? NetworkImage(avatarUrl) : null,
                  child: avatarUrl.isEmpty
                      ? const Icon(
                          Icons.person_rounded,
                          size: 32,
                          color: FaColors.green,
                        )
                      : null,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'profile.title'.tr(),
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      user!.email,
                      style: const TextStyle(color: FaColors.muted),
                    ),
                  ],
                ),
              ),
              if (avatarUrl.isNotEmpty)
                IconButton(
                  onPressed: _removeAvatar,
                  icon: const Icon(Icons.delete_outline),
                  tooltip: 'profile.remove_photo'.tr(),
                ),
            ],
          ),
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
          // 18+ read-only status
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: user!.adultPreorderAllowed
                  ? FaColors.free.withValues(alpha: 0.1)
                  : FaColors.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: user!.adultPreorderAllowed
                    ? FaColors.free.withValues(alpha: 0.4)
                    : FaColors.border,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  user!.adultPreorderAllowed
                      ? Icons.verified_user_outlined
                      : Icons.badge_outlined,
                  color: user!.adultPreorderAllowed
                      ? FaColors.free
                      : FaColors.muted,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'profile.age18'.tr(),
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        user!.adultPreorderAllowed && av != null
                            ? 'age18.profile_status_verified'.tr(
                                args: [
                                  av.verifiedByStaffDisplayName,
                                  av.verifiedAtVenueId,
                                  formatDateTime(av.verifiedAt),
                                ],
                              )
                            : 'age18.profile_status_unverified'.tr(),
                        style: const TextStyle(
                          color: FaColors.muted,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
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
            decoration: InputDecoration(labelText: 'profile.display_name'.tr()),
            onEditingComplete: _save,
          ),
          const SizedBox(height: 10),
          TextField(
            controller: phone,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(labelText: 'profile.phone'.tr()),
            onEditingComplete: _save,
          ),
          const SizedBox(height: 16),
          Text(
            'profile.allergies'.tr(),
            style: const TextStyle(color: FaColors.muted),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: _dietOptions.map((d) {
              final on = selectedDiets.contains(d);
              return FilterChip(
                label: Text('profile.diet_$d'.tr()),
                selected: on,
                onSelected: (v) {
                  HapticFeedback.selectionClick();
                  setState(() {
                    if (v) {
                      selectedDiets.add(d);
                    } else {
                      selectedDiets.remove(d);
                    }
                  });
                },
              );
            }).toList(),
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
                  HapticFeedback.selectionClick();
                  await context.setLocale(Locale(code));
                  try {
                    await ApiClient.instance.updateMe(locale: code);
                  } catch (_) {}
                },
              );
            }).toList(),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _save, child: Text('common.save'.tr())),
          const SizedBox(height: 16),
          // Favorites
          Text(
            'profile.favorites'.tr(),
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          if (favoriteVenues.isEmpty)
            Text(
              'profile.favorites_empty'.tr(),
              style: const TextStyle(color: FaColors.muted, fontSize: 13),
            )
          else
            ...favoriteVenues.map(
              (v) => Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  title: Text(v.name.pick(locale)),
                  subtitle: Text(v.address.pick(locale)),
                  trailing: IconButton(
                    icon: const Icon(Icons.favorite_rounded, color: FaColors.clay),
                    onPressed: () async {
                      final next = user!.favoriteVenues
                          .where((id) => id != v.id)
                          .toList();
                      try {
                        await ApiClient.instance.updateMe(favoriteVenues: next);
                        reload();
                      } catch (_) {}
                    },
                  ),
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => VenueDetailScreen(venueId: v.id),
                      ),
                    );
                  },
                ),
              ),
            ),
          const SizedBox(height: 16),
          // Payment methods preview
          Text(
            'profile.payment_methods'.tr(),
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(
            'profile.payments_placeholder'.tr(),
            style: const TextStyle(color: FaColors.muted, fontSize: 12),
          ),
          const SizedBox(height: 8),
          ...localPayments.map(
            (card) => ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.credit_card_outlined),
              title: Text(card),
            ),
          ),
          OutlinedButton.icon(
            onPressed: localPayments.isNotEmpty
                ? null
                : () async {
                    final demo = ['profile.payments_demo'.tr()];
                    await ApiClient.instance.setLocalPaymentPreviews(demo);
                    if (mounted) setState(() => localPayments = demo);
                  },
            icon: const Icon(Icons.add_card_outlined),
            label: Text('profile.payments_add'.tr()),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _changeEmailDialog,
                  child: Text('profile.change_email'.tr()),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton(
                  onPressed: _changePasswordDialog,
                  child: Text('profile.change_password'.tr()),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          OutlinedButton(
            onPressed: () async {
              await ApiClient.instance.logout();
              reload();
            },
            child: Text('profile.logout'.tr()),
          ),
          const SizedBox(height: 10),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: FaColors.occupied),
            onPressed: user!.role == 'guest' ? _deleteAccountFlow : null,
            child: Text('profile.delete_account'.tr()),
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
