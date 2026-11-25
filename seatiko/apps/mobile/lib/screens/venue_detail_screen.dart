import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/api.dart';
import 'package:mobile/errors.dart';
import 'package:mobile/screens/floor_map_screen.dart';
import 'package:mobile/screens/menu_screen.dart';
import 'package:mobile/screens/reservation_screen.dart';
import 'package:mobile/theme.dart';
import 'package:mobile/widgets/auth_sheet.dart';
import 'package:mobile/widgets/shimmer.dart';
import 'package:mobile/widgets/venue_thumb.dart';
import 'package:mobile/widgets/waitlist_card.dart';
import 'package:url_launcher/url_launcher.dart';

class VenueDetailScreen extends StatefulWidget {
  const VenueDetailScreen({super.key, required this.venueId, this.heroTag});

  final String venueId;
  final String? heroTag;

  @override
  State<VenueDetailScreen> createState() => _VenueDetailScreenState();
}

class _VenueDetailScreenState extends State<VenueDetailScreen> {
  late Future<Venue> _future;
  VenuePlaces? _places;
  List<MenuItem> _menuPreview = [];
  bool _isFavorite = false;
  int _galleryIndex = 0;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() {
      _future = ApiClient.instance.fetchVenue(widget.venueId);
    });
    _loadExtras();
  }

  Future<void> _loadExtras() async {
    ApiClient.instance.fetchVenuePlaces(widget.venueId).then((p) {
      if (mounted) setState(() => _places = p);
    }).catchError((_) {});
    ApiClient.instance.fetchMenu(widget.venueId).then((items) {
      if (mounted) {
        setState(() => _menuPreview = items.where((i) => !i.stopped).take(3).toList());
      }
    }).catchError((_) {});
    final token = await ApiClient.instance.getToken();
    if (token != null && token.isNotEmpty) {
      ApiClient.instance.fetchMe().then((u) {
        if (mounted) {
          setState(() => _isFavorite = u.favoriteVenues.contains(widget.venueId));
        }
      }).catchError((_) {});
    }
  }

  Future<void> _toggleFavorite() async {
    HapticFeedback.selectionClick();
    final ok = await ensureAuth(context);
    if (!ok || !mounted) return;
    try {
      final me = await ApiClient.instance.fetchMe();
      final favs = List<String>.from(me.favoriteVenues);
      final adding = !favs.contains(widget.venueId);
      if (adding) {
        favs.add(widget.venueId);
      } else {
        favs.remove(widget.venueId);
      }
      await ApiClient.instance.updateMe(favoriteVenues: favs);
      if (!mounted) return;
      setState(() => _isFavorite = adding);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            adding
                ? 'profile.favorites_added'.tr()
                : 'profile.favorites_removed'.tr(),
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(apiErrorText(e))),
      );
    }
  }

  void _openMenu(Venue v, String locale) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => MenuScreen(
          venueId: v.id,
          venueName: v.name.pick(locale),
          venue: v,
        ),
      ),
    );
  }

  Future<void> _launchExternal(
    Uri uri, {
    LaunchMode mode = LaunchMode.platformDefault,
  }) async {
    HapticFeedback.selectionClick();
    try {
      final opened = await launchUrl(uri, mode: mode);
      if (!opened && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('common.error'.tr())),
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

  void _openRoute(Venue v) {
    final uri = Uri.parse(
      'https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}',
    );
    _launchExternal(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _openEventInquiry(Venue v, String locale) async {
    final messenger = ScaffoldMessenger.of(context);
    final ok = await ensureAuth(context);
    if (!ok || !mounted) return;

    var initialName = '';
    var initialPhone = '';
    try {
      final me = await ApiClient.instance.fetchMe();
      initialName = me.displayName;
      initialPhone = me.phone ?? '';
    } catch (_) {}

    if (!mounted) return;
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: FaColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => _EventInquirySheet(
        venue: v,
        locale: locale,
        initialName: initialName,
        initialPhone: initialPhone,
      ),
    );
    if (sent == true && mounted) {
      messenger.showSnackBar(
        SnackBar(content: Text('venue.event_sent'.tr())),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.locale.languageCode;
    return Scaffold(
      body: FutureBuilder<Venue>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const SafeArea(child: CardListShimmer());
          }
          if (snap.hasError || !snap.hasData) {
            return Center(
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
                    Text(
                      snap.hasError
                          ? apiErrorText(snap.error!)
                          : 'common.error'.tr(),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _reload,
                      child: Text('common.retry'.tr()),
                    ),
                  ],
                ),
              ),
            );
          }
          final v = snap.data!;
          final photos = v.galleryUrls;
          final reviews = _places?.reviews.isNotEmpty == true
              ? _places!.reviews
              : v.reviews;

          return CustomScrollView(
            slivers: [
              SliverAppBar(
                expandedHeight: 220,
                pinned: true,
                actions: [
                  IconButton(
                    onPressed: _toggleFavorite,
                    icon: Icon(
                      _isFavorite
                          ? Icons.favorite_rounded
                          : Icons.favorite_border_rounded,
                      color: _isFavorite ? FaColors.clay : null,
                    ),
                    tooltip: 'profile.favorites_add'.tr(),
                  ),
                ],
                flexibleSpace: FlexibleSpaceBar(
                  title: Text(
                    v.name.pick(locale),
                    style: const TextStyle(fontSize: 16),
                  ),
                  background: photos.length > 1
                      ? Stack(
                          fit: StackFit.expand,
                          children: [
                            PageView.builder(
                              itemCount: photos.length,
                              onPageChanged: (i) =>
                                  setState(() => _galleryIndex = i),
                              itemBuilder: (_, i) => VenueHeroImage(
                                imageUrl: photos[i],
                                height: 220,
                                heroTag: i == 0
                                    ? (widget.heroTag ?? 'venue-cover-${v.id}')
                                    : null,
                              ),
                            ),
                            Positioned(
                              bottom: 12,
                              right: 16,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: Colors.black54,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  '${_galleryIndex + 1}/${photos.length}',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        )
                      : VenueHeroImage(
                          imageUrl: v.imageUrl,
                          height: 220,
                          heroTag: widget.heroTag ?? 'venue-cover-${v.id}',
                        ),
                ),
              ),
              SliverToBoxAdapter(
                child: SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Text(
                              '★ ${v.rating}',
                              style: const TextStyle(
                                color: FaColors.gold,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            if (v.reviewCount > 0) ...[
                              const SizedBox(width: 4),
                              Text(
                                '(${v.reviewCount})',
                                style: const TextStyle(
                                  color: FaColors.muted,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                            const SizedBox(width: 12),
                            Text(v.priceLabel()),
                            const Spacer(),
                            Text(
                              v.openNow
                                  ? 'venue.open'.tr()
                                  : 'venue.closed'.tr(),
                              style: TextStyle(
                                color:
                                    v.openNow ? FaColors.free : FaColors.occupied,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          v.address.pick(locale),
                          style: const TextStyle(color: FaColors.muted),
                        ),
                        if (v.hoursText.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              const Icon(
                                Icons.schedule,
                                size: 15,
                                color: FaColors.muted,
                              ),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  v.hoursText,
                                  style: const TextStyle(
                                    color: FaColors.muted,
                                    fontSize: 13,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                        const SizedBox(height: 6),
                        Text(
                          'venue.avg_check'.tr(args: ['${v.averageCheck}']),
                          style: const TextStyle(color: FaColors.muted),
                        ),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            ActionChip(
                              avatar: const Icon(Icons.directions_outlined, size: 16),
                              label: Text('venue.route'.tr()),
                              onPressed: () => _openRoute(v),
                            ),
                            if (v.phone.isNotEmpty)
                              ActionChip(
                                avatar: const Icon(Icons.phone_outlined, size: 16),
                                label: Text(v.phone),
                                onPressed: () =>
                                    _launchExternal(Uri.parse('tel:${v.phone}')),
                              ),
                            if (v.website.isNotEmpty)
                              ActionChip(
                                avatar: const Icon(Icons.language, size: 16),
                                label: Text('venue.website'.tr()),
                                onPressed: () {
                                  final raw = v.website.startsWith('http')
                                      ? v.website
                                      : 'https://${v.website}';
                                  _launchExternal(
                                    Uri.parse(raw),
                                    mode: LaunchMode.externalApplication,
                                  );
                                },
                              ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: FaColors.green.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: FaColors.green.withValues(alpha: 0.4),
                            ),
                          ),
                          child: Text(
                            'map.free_tables'.tr(args: ['${v.freeTables}']),
                            style: const TextStyle(
                              color: FaColors.free,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'venue.about'.tr(),
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          v.description.pick(locale),
                          style: const TextStyle(height: 1.4),
                        ),
                        const SizedBox(height: 16),
                        // Booking rules block
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: FaColors.surface,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: FaColors.border),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'venue.booking_rules'.tr(),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'venue.rule_hold'.tr(args: ['${v.holdMinutes}', '${v.maxLateArrivalMin}']),
                                style: const TextStyle(
                                  color: FaColors.muted,
                                  fontSize: 12,
                                  height: 1.4,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'venue.rule_duration'.tr(args: ['${v.visitDurationMin}', '${v.bookingIntervalMin}']),
                                style: const TextStyle(
                                  color: FaColors.muted,
                                  fontSize: 12,
                                  height: 1.4,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 18),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: () {
                                  Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) => FloorMapScreen(
                                        venueId: v.id,
                                        venueName: v.name.pick(locale),
                                      ),
                                    ),
                                  );
                                },
                                child: Text('venue.floor_map'.tr()),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: FilledButton(
                                onPressed: () async {
                                  final ok = await ensureAuth(context);
                                  if (!ok || !context.mounted) return;
                                  Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) => ReservationScreen(venue: v),
                                    ),
                                  );
                                },
                                child: Text('venue.book'.tr()),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: () => _openMenu(v, locale),
                                icon: const Icon(Icons.menu_book_outlined),
                                label: Text('venue.menu'.tr()),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: () => _openEventInquiry(v, locale),
                                icon: const Icon(Icons.celebration_outlined),
                                label: Text('venue.event_btn'.tr()),
                              ),
                            ),
                          ],
                        ),
                        if (_menuPreview.isNotEmpty) ...[
                          const SizedBox(height: 20),
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  'venue.menu_preview'.tr(),
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                              TextButton(
                                onPressed: () => _openMenu(v, locale),
                                child: Text('venue.see_full_menu'.tr()),
                              ),
                            ],
                          ),
                          ..._menuPreview.map(
                            (m) => ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(m.name.pick(locale)),
                              subtitle: m.description.pick(locale).isNotEmpty
                                  ? Text(
                                      m.description.pick(locale),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    )
                                  : null,
                              trailing: Text(
                                '${m.price} MDL',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ),
                        ],
                        WaitlistCard(
                          venueId: v.id,
                          onChanged: _reload,
                        ),
                        if (reviews.isNotEmpty) ...[
                          const SizedBox(height: 20),
                          Text(
                            'venue.reviews'.tr(),
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 8),
                          ...reviews.take(5).map(
                            (r) => Card(
                              margin: const EdgeInsets.only(bottom: 8),
                              child: Padding(
                                padding: const EdgeInsets.all(12),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            r.author,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ),
                                        Text(
                                          '★ ${r.rating}',
                                          style: const TextStyle(
                                            color: FaColors.clay,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                      ],
                                    ),
                                    if (r.text.isNotEmpty) ...[
                                      const SizedBox(height: 6),
                                      Text(
                                        r.text,
                                        style: const TextStyle(
                                          fontSize: 13,
                                          height: 1.35,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _EventInquirySheet extends StatefulWidget {
  const _EventInquirySheet({
    required this.venue,
    required this.locale,
    required this.initialName,
    required this.initialPhone,
  });

  final Venue venue;
  final String locale;
  final String initialName;
  final String initialPhone;

  @override
  State<_EventInquirySheet> createState() => _EventInquirySheetState();
}

class _EventInquirySheetState extends State<_EventInquirySheet> {
  late final TextEditingController _nameCtrl = TextEditingController(
    text: widget.initialName,
  );
  late final TextEditingController _phoneCtrl = TextEditingController(
    text: widget.initialPhone,
  );
  final TextEditingController _notesCtrl = TextEditingController();
  String _eventType = 'birthday';
  int _guestCount = 12;
  String _contactMethod = 'call';
  DateTime _preferredDate = DateTime.now().add(const Duration(days: 7));
  bool _submitting = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_nameCtrl.text.trim().isEmpty || _phoneCtrl.text.trim().isEmpty) {
      HapticFeedback.heavyImpact();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('error.invalid_input'.tr())),
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      await ApiClient.instance.createEventInquiry(
        venueId: widget.venue.id,
        eventType: _eventType,
        guestCount: _guestCount,
        preferredDate: _preferredDate,
        contactMethod: _contactMethod,
        contactPhone: _phoneCtrl.text.trim(),
        contactName: _nameCtrl.text.trim(),
        notes: _notesCtrl.text.trim(),
      );
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        HapticFeedback.heavyImpact();
        setState(() => _submitting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(apiErrorText(e))),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          14,
          20,
          24 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: FaColors.muted.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Text(
              'venue.event_inquiry_title'.tr(),
              style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            Text(
              widget.venue.name.pick(widget.locale),
              style: const TextStyle(color: FaColors.muted),
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              initialValue: _eventType,
              decoration: InputDecoration(labelText: 'venue.event_type'.tr()),
              items: const ['birthday', 'banquet', 'corporate', 'romantic', 'other']
                  .map(
                    (e) => DropdownMenuItem(
                      value: e,
                      child: Text('venue.event_$e'.tr()),
                    ),
                  )
                  .toList(),
              onChanged: (val) =>
                  setState(() => _eventType = val ?? 'birthday'),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: Text('reservation.guests'.tr())),
                IconButton(
                  onPressed: _guestCount > 2
                      ? () => setState(() => _guestCount -= 2)
                      : null,
                  icon: const Icon(Icons.remove_circle_outline),
                ),
                Text(
                  '$_guestCount',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                IconButton(
                  onPressed: _guestCount < 200
                      ? () => setState(() => _guestCount += 2)
                      : null,
                  icon: const Icon(Icons.add_circle_outline),
                ),
              ],
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('venue.event_date'.tr()),
              subtitle: Text(formatDateTime(_preferredDate)),
              trailing: const Icon(Icons.calendar_today_outlined),
              onTap: () async {
                final d = await showDatePicker(
                  context: context,
                  firstDate: DateTime.now(),
                  lastDate: DateTime.now().add(const Duration(days: 365)),
                  initialDate: _preferredDate,
                );
                if (d == null || !mounted) return;
                setState(() {
                  _preferredDate = DateTime(
                    d.year,
                    d.month,
                    d.day,
                    _preferredDate.hour,
                    _preferredDate.minute,
                  );
                });
              },
            ),
            TextField(
              controller: _nameCtrl,
              decoration: InputDecoration(labelText: 'venue.contact_name'.tr()),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _phoneCtrl,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                labelText: 'venue.contact_phone'.tr(),
              ),
            ),
            const SizedBox(height: 10),
            SegmentedButton<String>(
              segments: [
                ButtonSegment(
                  value: 'call',
                  label: Text('venue.contact_call'.tr()),
                ),
                ButtonSegment(
                  value: 'chat',
                  label: Text('venue.contact_chat'.tr()),
                ),
              ],
              selected: {_contactMethod},
              onSelectionChanged: (s) =>
                  setState(() => _contactMethod = s.first),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _notesCtrl,
              maxLines: 2,
              decoration: InputDecoration(labelText: 'reservation.notes'.tr()),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: Text('venue.event_submit'.tr()),
            ),
          ],
        ),
      ),
    );
  }
}
