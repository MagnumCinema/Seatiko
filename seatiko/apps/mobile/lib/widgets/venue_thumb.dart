import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/theme.dart';

/// Restaurant photo thumb with disk caching, memory cap and optional Hero transition.
class VenueThumb extends StatelessWidget {
  const VenueThumb({
    super.key,
    required this.imageUrl,
    this.size = 72,
    this.radius = 15,
    this.priceLevel = 2,
    this.heroTag,
  });

  final String imageUrl;
  final double size;
  final double radius;
  final int priceLevel;
  final String? heroTag;

  @override
  Widget build(BuildContext context) {
    final fallback = _Fallback(size: size, radius: radius, priceLevel: priceLevel);
    final url = mediaUrl(imageUrl);
    final cachePx = (size * 2.5).round();

    Widget child;
    if (url.isEmpty) {
      child = fallback;
    } else {
      child = ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: CachedNetworkImage(
          imageUrl: url,
          width: size,
          height: size,
          memCacheWidth: cachePx,
          memCacheHeight: cachePx,
          fit: BoxFit.cover,
          fadeInDuration: const Duration(milliseconds: 160),
          placeholder: (_, _) => fallback,
          errorWidget: (_, _, _) => fallback,
        ),
      );
    }

    if (heroTag != null && heroTag!.isNotEmpty) {
      return Hero(tag: heroTag!, child: child);
    }
    return child;
  }
}

class _Fallback extends StatelessWidget {
  const _Fallback({
    required this.size,
    required this.radius,
    required this.priceLevel,
  });

  final double size;
  final double radius;
  final int priceLevel;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: priceLevel >= 3
              ? const [Color(0xFF7D4C37), Color(0xFF2E493C)]
              : const [Color(0xFFE9B96E), Color(0xFF246046)],
        ),
      ),
      child: Icon(
        Icons.restaurant_menu_rounded,
        color: Colors.white.withValues(alpha: 0.92),
        size: size * 0.38,
      ),
    );
  }
}

class VenueHeroImage extends StatelessWidget {
  const VenueHeroImage({
    super.key,
    required this.imageUrl,
    this.height = 220,
    this.heroTag,
  });

  final String imageUrl;
  final double height;
  final String? heroTag;

  @override
  Widget build(BuildContext context) {
    final url = mediaUrl(imageUrl);
    final placeholder = Container(
      height: height,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF246046), Color(0xFF153E2E), Color(0xFF1A2420)],
        ),
      ),
      child: const Center(
        child: Icon(Icons.restaurant, size: 64, color: FaColors.gold),
      ),
    );

    final Widget content = url.isEmpty
        ? placeholder
        : CachedNetworkImage(
            imageUrl: url,
            height: height,
            width: double.infinity,
            memCacheWidth: 1080,
            fit: BoxFit.cover,
            fadeInDuration: const Duration(milliseconds: 180),
            placeholder: (_, _) => placeholder,
            errorWidget: (_, _, _) => placeholder,
          );

    if (heroTag != null && heroTag!.isNotEmpty) {
      return Hero(tag: heroTag!, child: content);
    }
    return content;
  }
}
