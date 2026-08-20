import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/theme.dart';

class RestaurantFloorPlan extends StatelessWidget {
  const RestaurantFloorPlan({
    super.key,
    required this.tables,
    required this.onTableTap,
    this.selectedTableId,
    this.compact = false,
  });

  final List<VenueTable> tables;
  final ValueChanged<VenueTable> onTableTap;
  final String? selectedTableId;
  final bool compact;

  Color _statusColor(String status) {
    switch (status) {
      case 'FREE':
        return FaColors.free;
      case 'OCCUPIED':
        return FaColors.occupied;
      case 'RESERVED':
        return FaColors.reserved;
      default:
        return FaColors.muted;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: const Color(0xFFF2EFE5),
        borderRadius: BorderRadius.circular(compact ? 20 : 24),
        border: Border.all(color: FaColors.border),
        boxShadow: const [
          BoxShadow(
            color: Color(0x10244135),
            blurRadius: 24,
            offset: Offset(0, 12),
          ),
        ],
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final roomWidth = constraints.maxWidth;
          final roomHeight = constraints.maxHeight;
          return Stack(
            children: [
              const Positioned.fill(child: _FloorGrid()),
              Positioned(
                left: roomWidth * .26,
                right: roomWidth * .18,
                top: 9,
                child: const _Windows(),
              ),
              Positioned(
                left: 11,
                top: roomHeight * .2,
                bottom: roomHeight * .22,
                child: const _Bar(),
              ),
              const Positioned(right: 13, top: 13, child: _RoomLabel('Кухня')),
              const Positioned(
                right: 16,
                bottom: 12,
                child: Text(
                  'Вход ↑',
                  style: TextStyle(
                    color: FaColors.muted,
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              for (final table in tables)
                Positioned(
                  left:
                      56 +
                      table.x.clamp(.08, .92) *
                          (roomWidth - (compact ? 115 : 128)),
                  top:
                      32 +
                      table.y.clamp(.08, .9) *
                          (roomHeight - (compact ? 92 : 108)),
                  child: FractionalTranslation(
                    translation: const Offset(-.5, -.5),
                    child: _FloorTable(
                      table: table,
                      color: _statusColor(table.status),
                      selected: selectedTableId == table.id,
                      compact: compact,
                      onTap: () => onTableTap(table),
                    ),
                  ),
                ),
              if (tables.isEmpty)
                const Positioned.fill(
                  child: Center(
                    child: Text(
                      'План зала пока не настроен',
                      style: TextStyle(color: FaColors.muted, fontSize: 12),
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

class _FloorGrid extends StatelessWidget {
  const _FloorGrid();

  @override
  Widget build(BuildContext context) {
    return CustomPaint(painter: _GridPainter());
  }
}

class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0x10244135)
      ..strokeWidth = 1;
    const step = 28.0;
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _Windows extends StatelessWidget {
  const _Windows();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: List.generate(
        3,
        (_) => Expanded(
          child: Container(
            height: 5,
            margin: const EdgeInsets.symmetric(horizontal: 3),
            decoration: BoxDecoration(
              color: const Color(0xFFBFD6D5),
              borderRadius: BorderRadius.circular(99),
            ),
          ),
        ),
      ),
    );
  }
}

class _Bar extends StatelessWidget {
  const _Bar();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 39,
      padding: const EdgeInsets.symmetric(vertical: 11),
      decoration: BoxDecoration(
        color: const Color(0xFFE9DFC9),
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: const Color(0x1FD77B48)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          const Text(
            'BAR',
            style: TextStyle(
              color: FaColors.clay,
              fontSize: 7,
              letterSpacing: 1,
              fontWeight: FontWeight.w800,
            ),
          ),
          for (var i = 0; i < 3; i++)
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0x66A47554)),
              ),
            ),
        ],
      ),
    );
  }
}

class _RoomLabel extends StatelessWidget {
  const _RoomLabel(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        color: FaColors.surface.withValues(alpha: .72),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: FaColors.border),
      ),
      child: Text(
        label,
        style: const TextStyle(color: FaColors.muted, fontSize: 9),
      ),
    );
  }
}

class _FloorTable extends StatelessWidget {
  const _FloorTable({
    required this.table,
    required this.color,
    required this.selected,
    required this.compact,
    required this.onTap,
  });

  final VenueTable table;
  final Color color;
  final bool selected;
  final bool compact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final round = table.seats <= 2;
    final width = round
        ? (compact ? 46.0 : 52.0)
        : table.seats >= 6
        ? (compact ? 66.0 : 76.0)
        : (compact ? 58.0 : 65.0);
    final height = round ? width : (compact ? 43.0 : 48.0);

    return Semantics(
      button: true,
      label: 'Стол ${table.number}, ${table.seats} мест',
      child: GestureDetector(
        onTap: onTap,
        child: SizedBox(
          width: width + 16,
          height: height + 16,
          child: Stack(
            alignment: Alignment.center,
            children: [
              _Seat(
                color: color,
                alignment: Alignment.topCenter,
                horizontal: true,
              ),
              _Seat(
                color: color,
                alignment: Alignment.bottomCenter,
                horizontal: true,
              ),
              _Seat(
                color: color,
                alignment: Alignment.centerLeft,
                horizontal: false,
              ),
              _Seat(
                color: color,
                alignment: Alignment.centerRight,
                horizontal: false,
              ),
              AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                width: width,
                height: height,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: .14),
                  borderRadius: BorderRadius.circular(round ? 99 : 13),
                  border: Border.all(
                    color: selected ? FaColors.clay : color,
                    width: selected ? 3 : 2,
                  ),
                  boxShadow: selected
                      ? const [
                          BoxShadow(
                            color: Color(0x33D77B48),
                            blurRadius: 14,
                            spreadRadius: 3,
                          ),
                        ]
                      : const [],
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      '${table.number}',
                      style: TextStyle(
                        color: color,
                        fontSize: compact ? 12 : 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (!compact)
                      Text(
                        '${table.seats} мест',
                        style: TextStyle(
                          color: color.withValues(alpha: .75),
                          fontSize: 7,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Seat extends StatelessWidget {
  const _Seat({
    required this.color,
    required this.alignment,
    required this.horizontal,
  });
  final Color color;
  final Alignment alignment;
  final bool horizontal;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: alignment,
      child: Container(
        width: horizontal ? 15 : 5,
        height: horizontal ? 5 : 15,
        decoration: BoxDecoration(
          color: color.withValues(alpha: .35),
          borderRadius: BorderRadius.circular(3),
        ),
      ),
    );
  }
}
