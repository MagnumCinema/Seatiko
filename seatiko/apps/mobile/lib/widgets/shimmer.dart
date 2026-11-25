import 'package:flutter/material.dart';
import 'package:mobile/theme.dart';

/// Lightweight shimmer surface using a single AnimatedBuilder.
class FaShimmer extends StatefulWidget {
  const FaShimmer({super.key, required this.child});

  final Widget child;

  @override
  State<FaShimmer> createState() => _FaShimmerState();
}

class _FaShimmerState extends State<FaShimmer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      child: widget.child,
      builder: (context, child) {
        final t = _controller.value;
        return ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (bounds) {
            return LinearGradient(
              begin: Alignment(-1.0 + 2.0 * t - 0.6, -0.2),
              end: Alignment(-1.0 + 2.0 * t + 0.6, 0.2),
              colors: const [
                FaColors.surface2,
                Color(0xFFFFFDF8),
                FaColors.surface2,
              ],
              stops: const [0.1, 0.5, 0.9],
            ).createShader(bounds);
          },
          child: child,
        );
      },
    );
  }
}

class ShimmerBox extends StatelessWidget {
  const ShimmerBox({
    super.key,
    required this.height,
    this.width = double.infinity,
    this.radius = 12,
  });

  final double height;
  final double width;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: FaColors.surface2,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

class VenueListShimmer extends StatelessWidget {
  const VenueListShimmer({super.key, this.count = 4});
  final int count;

  @override
  Widget build(BuildContext context) {
    return FaShimmer(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 96),
        physics: const NeverScrollableScrollPhysics(),
        children: [
          const ShimmerBox(height: 310, radius: 24),
          const SizedBox(height: 18),
          const ShimmerBox(height: 22, width: 140, radius: 8),
          const SizedBox(height: 12),
          for (var i = 0; i < count; i++) ...[
            const ShimmerBox(height: 92, radius: 16),
            const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }
}

class CardListShimmer extends StatelessWidget {
  const CardListShimmer({super.key, this.count = 5});
  final int count;

  @override
  Widget build(BuildContext context) {
    return FaShimmer(
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        physics: const NeverScrollableScrollPhysics(),
        itemCount: count,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (_, _) => const ShimmerBox(height: 82, radius: 16),
      ),
    );
  }
}
