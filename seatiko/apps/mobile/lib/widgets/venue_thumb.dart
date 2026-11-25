import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/theme.dart';

/// Restaurant photo thumb with gradient/cutlery fallback and relative URL resolution.
class VenueThumb extends StatelessWidget {
  const VenueThumb({
    super.key,
    required this.imageUrl,
    this.size = 72,
    this.radius = 15,
    this.priceLevel = 2,
  });

  final String imageUrl;
  final double size;
  final double radius;
  final int priceLevel;

  @override
  Widget build(BuildContext context) {
    final fallback = _Fallback(size: size, radius: radius, priceLevel: priceLevel);
    final url = mediaUrl(imageUrl);
    if (url.isEmpty) return fallback;

    final cachePx = (size * 2.5).round();
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Image.network(
        url,
        width: size,
        height: size,
        cacheWidth: cachePx,
        cacheHeight: cachePx,
        fit: BoxFit.cover,
        gaplessPlayback: true,
        errorBuilder: (_, error, stackTrace) => fallback,
        loadingBuilder: (context, child, progress) {
          if (progress == null) return child;
          return SizedBox(
            width: size,
            height: size,
            child: Stack(
              fit: StackFit.expand,
              children: [
                fallback,
                const Center(
                  child: SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white70,
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
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
              : const [Color(0xFFE6B17E), Color(0xFF43735D)],
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
    this.height = 200,
  });

  final String imageUrl;
  final double height;

  @override
  Widget build(BuildContext context) {
    final url = mediaUrl(imageUrl);
    if (url.isEmpty) {
      return Container(
        height: height,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF2D5A3D), Color(0xFF1A2218), Color(0xFF3A3020)],
          ),
        ),
        child: const Center(
          child: Icon(Icons.restaurant, size: 64, color: FaColors.gold),
        ),
      );
    }
    return Image.network(
      url,
      height: height,
      width: double.infinity,
      fit: BoxFit.cover,
      gaplessPlayback: true,
      errorBuilder: (_, error, stackTrace) => Container(
        height: height,
        color: const Color(0xFF1A2218),
        child: const Center(
          child: Icon(Icons.restaurant, size: 64, color: FaColors.gold),
        ),
      ),
    );
  }
}
