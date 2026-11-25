import 'dart:ui' as ui;

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/api.dart';
import 'package:mobile/theme.dart';

/// Schematic floor plan: CustomPainter room/tables/chairs with RepaintBoundary + AnimatedSwitcher.
class RestaurantFloorPlan extends StatefulWidget {
  const RestaurantFloorPlan({
    super.key,
    required this.tables,
    required this.onTableTap,
    this.selectedTableId,
    this.yoursTableIds = const {},
    this.compact = false,
    this.locale = 'ru',
  });

  final List<VenueTable> tables;
  final ValueChanged<VenueTable> onTableTap;
  final String? selectedTableId;
  final Set<String> yoursTableIds;
  final bool compact;
  final String locale;

  static const roomBg = Color(0xFFF3EEE4);
  static const tableTan = Color(0xFFC9A66B);
  static const tableReserved = Color(0xFFB8924F);
  static const tableOccupied = Color(0xFFA07850);
  static const tableCleaning = Color(0xFFB5AA98);
  static const olive = Color(0xFF6F8F3D);
  static const zoneBorder = Color(0xFFD2C4AE);
  static const zoneText = Color(0xFF8A8070);

  @override
  State<RestaurantFloorPlan> createState() => _RestaurantFloorPlanState();
}

class _RestaurantFloorPlanState extends State<RestaurantFloorPlan> {
  late String _zone;

  @override
  void initState() {
    super.initState();
    final zones = zonesFromTables(widget.tables);
    _zone = zones.isEmpty ? 'hall' : zones.first;
  }

  @override
  void didUpdateWidget(covariant RestaurantFloorPlan oldWidget) {
    super.didUpdateWidget(oldWidget);
    final zones = zonesFromTables(widget.tables);
    if (!zones.contains(_zone)) {
      _zone = zones.isEmpty ? 'hall' : zones.first;
    }
  }

  @override
  Widget build(BuildContext context) {
    final zones = zonesFromTables(widget.tables);
    final visible = widget.tables.where((t) => t.zone == _zone).toList();
    final outdoor = _zone == 'street' || _zone == 'terrace';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (zones.length > 1)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final zone in zones)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(
                          '${zoneLabel(zone, widget.locale)} · ${widget.tables.where((t) => t.zone == zone && t.status == 'FREE').length}',
                        ),
                        selected: _zone == zone,
                        selectedColor: RestaurantFloorPlan.olive,
                        labelStyle: TextStyle(
                          color: _zone == zone ? Colors.white : FaColors.text,
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                        onSelected: (_) {
                          HapticFeedback.selectionClick();
                          setState(() => _zone = zone);
                        },
                      ),
                    ),
                ],
              ),
            ),
          ),
        Expanded(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 220),
            switchInCurve: Curves.easeOut,
            switchOutCurve: Curves.easeIn,
            child: Container(
              key: ValueKey(_zone),
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: RestaurantFloorPlan.roomBg,
                borderRadius: BorderRadius.circular(widget.compact ? 14 : 18),
                border: Border.all(color: const Color(0xFFE2D6C4)),
              ),
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final roomWidth = constraints.maxWidth;
                  final roomHeight = constraints.maxHeight;
                  final room = SizedBox(
                    width: roomWidth,
                    height: roomHeight,
                    child: Stack(
                      children: [
                        Positioned.fill(
                          child: RepaintBoundary(
                            child: CustomPaint(
                              painter: _FloorPlanPainter(
                                tables: visible,
                                selectedTableId: widget.selectedTableId,
                                yoursTableIds: widget.yoursTableIds,
                                compact: widget.compact,
                                barLabel: 'floor.zone_bar'.tr().toUpperCase(),
                                cornerLabel: (outdoor
                                        ? 'floor.zone_outside'.tr()
                                        : 'floor.zone_kitchen'.tr())
                                    .toUpperCase(),
                                entranceLabel: 'floor.entrance'.tr(),
                              ),
                            ),
                          ),
                        ),
                        for (final table in visible)
                          _TableHitTarget(
                            table: table,
                            roomWidth: roomWidth,
                            roomHeight: roomHeight,
                            compact: widget.compact,
                            onTap: () {
                              HapticFeedback.selectionClick();
                              widget.onTableTap(table);
                            },
                          ),
                        if (visible.isEmpty)
                          Positioned.fill(
                            child: Center(
                              child: Text(
                                'floor.zone_empty'.tr(
                                  args: [zoneLabel(_zone, widget.locale)],
                                ),
                                style: const TextStyle(
                                  color: RestaurantFloorPlan.zoneText,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  );
                  if (widget.compact) return room;
                  return InteractiveViewer(
                    minScale: 1.0,
                    maxScale: 2.5,
                    boundaryMargin: const EdgeInsets.all(24),
                    child: room,
                  );
                },
              ),
            ),
          ),
        ),
      ],
    );
  }
}

enum _TableShape { oval, portrait, portraitLarge, booth }

_TableShape _shapeFor(int seats) {
  if (seats <= 2) return _TableShape.oval;
  if (seats >= 7) return _TableShape.booth;
  if (seats >= 5) return _TableShape.portraitLarge;
  return _TableShape.portrait;
}

({double w, double h, double radius}) _tableMetrics(
  _TableShape shape,
  bool compact,
) {
  final scale = compact ? 0.88 : 1.0;
  switch (shape) {
    case _TableShape.oval:
      return (w: 58 * scale, h: 40 * scale, radius: 99);
    case _TableShape.portrait:
      return (w: 42 * scale, h: 62 * scale, radius: 10);
    case _TableShape.portraitLarge:
      return (w: 46 * scale, h: 78 * scale, radius: 10);
    case _TableShape.booth:
      return (w: 44 * scale, h: 70 * scale, radius: 10);
  }
}

class _TableHitTarget extends StatelessWidget {
  const _TableHitTarget({
    required this.table,
    required this.roomWidth,
    required this.roomHeight,
    required this.compact,
    required this.onTap,
  });

  final VenueTable table;
  final double roomWidth;
  final double roomHeight;
  final bool compact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scale = compact ? 0.88 : 1.0;
    final m = _tableMetrics(_shapeFor(table.seats), compact);
    final pad = 18.0 * scale;
    return Positioned(
      left: table.x.clamp(.12, .88) * roomWidth,
      top: table.y.clamp(.16, .84) * roomHeight,
      child: FractionalTranslation(
        translation: const Offset(-.5, -.5),
        child: Semantics(
          button: true,
          label: 'floor.table_semantics'.tr(
            args: ['${table.number}', '${table.seats}'],
          ),
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onTap,
            child: SizedBox(width: m.w + pad * 2, height: m.h + pad * 2),
          ),
        ),
      ),
    );
  }
}

class _FloorPlanPainter extends CustomPainter {
  _FloorPlanPainter({
    required this.tables,
    required this.selectedTableId,
    required this.yoursTableIds,
    required this.compact,
    required this.barLabel,
    required this.cornerLabel,
    required this.entranceLabel,
  });

  final List<VenueTable> tables;
  final String? selectedTableId;
  final Set<String> yoursTableIds;
  final bool compact;
  final String barLabel;
  final String cornerLabel;
  final String entranceLabel;

  Color _fillFor(VenueTable t) {
    if (yoursTableIds.contains(t.id)) return FaColors.yours;
    switch (t.status) {
      case 'RESERVED':
        return RestaurantFloorPlan.tableReserved;
      case 'OCCUPIED':
        return RestaurantFloorPlan.tableOccupied;
      case 'CLEANING':
        return RestaurantFloorPlan.tableCleaning;
      default:
        return RestaurantFloorPlan.tableTan;
    }
  }

  @override
  void paint(Canvas canvas, Size size) {
    // 1. Subtle architectural floor grid
    final gridPaint = Paint()
      ..color = const Color(0x0D1A2420)
      ..strokeWidth = 1;
    const step = 36.0;
    for (var x = step; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), gridPaint);
    }
    for (var y = step; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    // 2. Left Bar strip
    final barRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(10, size.height * 0.14, 34, size.height * 0.68),
      const Radius.circular(10),
    );
    canvas.drawRRect(
      barRect,
      Paint()..color = const Color(0x1FD2B48C),
    );
    canvas.drawRRect(
      barRect,
      Paint()
        ..color = RestaurantFloorPlan.zoneBorder
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
    canvas.save();
    canvas.translate(27, size.height * 0.48);
    canvas.rotate(-1.5707963);
    final barTp = TextPainter(
      text: TextSpan(
        text: barLabel,
        style: const TextStyle(
          color: RestaurantFloorPlan.zoneText,
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.2,
        ),
      ),
      textDirection: ui.TextDirection.ltr,
    )..layout();
    barTp.paint(canvas, Offset(-barTp.width / 2, -barTp.height / 2));
    canvas.restore();

    // 3. Corner zone chip (Kitchen / Outside)
    final cornerTp = TextPainter(
      text: TextSpan(
        text: cornerLabel,
        style: const TextStyle(
          color: RestaurantFloorPlan.zoneText,
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
        ),
      ),
      textDirection: ui.TextDirection.ltr,
    )..layout();
    final chipW = cornerTp.width + 20;
    final chipH = cornerTp.height + 12;
    final chipRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(size.width - chipW - 12, 12, chipW, chipH),
      const Radius.circular(8),
    );
    canvas.drawRRect(chipRect, Paint()..color = const Color(0x8CFFFFFF));
    canvas.drawRRect(
      chipRect,
      Paint()
        ..color = RestaurantFloorPlan.zoneBorder
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
    cornerTp.paint(canvas, Offset(size.width - chipW - 2, 18));

    // 4. Entrance label
    final entTp = TextPainter(
      text: TextSpan(
        text: entranceLabel,
        style: const TextStyle(
          color: RestaurantFloorPlan.zoneText,
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.4,
        ),
      ),
      textDirection: ui.TextDirection.ltr,
    )..layout();
    entTp.paint(
      canvas,
      Offset(size.width - entTp.width - 14, size.height - entTp.height - 12),
    );

    // 5. Tables, chairs/benches, rings and numbers
    final scale = compact ? 0.88 : 1.0;
    final chairPaint = Paint()..color = RestaurantFloorPlan.olive;
    final shadowPaint = Paint()
      ..color = const Color(0x1E5A3C14)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);

    for (final t in tables) {
      final cx = t.x.clamp(.12, .88) * size.width;
      final cy = t.y.clamp(.16, .84) * size.height;
      final shape = _shapeFor(t.seats);
      final m = _tableMetrics(shape, compact);
      final rect = Rect.fromCenter(center: Offset(cx, cy), width: m.w, height: m.h);
      final rad = Radius.circular(m.radius);
      final rrect = RRect.fromRectAndRadius(rect, rad);
      final selected = selectedTableId == t.id;
      final isYours = yoursTableIds.contains(t.id);

      // Chairs / benches
      if (shape == _TableShape.booth) {
        final bw = 10 * scale;
        final bh = m.h * 0.78;
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromCenter(
              center: Offset(rect.left - bw / 2 - 4, cy),
              width: bw,
              height: bh,
            ),
            const Radius.circular(4),
          ),
          chairPaint,
        );
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromCenter(
              center: Offset(rect.right + bw / 2 + 4, cy),
              width: bw,
              height: bh,
            ),
            const Radius.circular(4),
          ),
          chairPaint,
        );
      } else {
        final chair = shape == _TableShape.oval ? 11.0 * scale : 12.0 * scale;
        final perSide = shape == _TableShape.portraitLarge ? 3 : 2;
        for (var i = 0; i < perSide; i++) {
          final frac = perSide == 1 ? 0.5 : (0.28 + i * (0.44 / (perSide - 1)));
          final y = rect.top + m.h * frac;
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromCenter(
                center: Offset(rect.left - chair / 2 - 3, y),
                width: chair,
                height: chair,
              ),
              const Radius.circular(3),
            ),
            chairPaint,
          );
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromCenter(
                center: Offset(rect.right + chair / 2 + 3, y),
                width: chair,
                height: chair,
              ),
              const Radius.circular(3),
            ),
            chairPaint,
          );
        }
      }

      // Status/selection outer ring
      Color? ringColor;
      if (selected) {
        ringColor = RestaurantFloorPlan.olive;
      } else if (isYours) {
        ringColor = FaColors.yours.withValues(alpha: 0.42);
      } else if (t.status == 'FREE') {
        ringColor = RestaurantFloorPlan.olive.withValues(alpha: 0.22);
      } else if (t.status == 'RESERVED') {
        ringColor = RestaurantFloorPlan.tableReserved.withValues(alpha: 0.35);
      } else if (t.status == 'OCCUPIED') {
        ringColor = FaColors.occupied.withValues(alpha: 0.35);
      }
      if (ringColor != null) {
        canvas.drawRRect(
          rrect.inflate(selected ? 3.5 : 2.5),
          Paint()..color = ringColor,
        );
      }

      // Drop shadow + table surface
      canvas.drawRRect(rrect.shift(const Offset(0, 3)), shadowPaint);
      canvas.drawRRect(rrect, Paint()..color = _fillFor(t));

      // Table number
      final numTp = TextPainter(
        text: TextSpan(
          text: '${t.number}',
          style: TextStyle(
            color: Colors.white,
            fontSize: compact ? 13 : 15,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.3,
          ),
        ),
        textDirection: ui.TextDirection.ltr,
      )..layout();
      numTp.paint(canvas, Offset(cx - numTp.width / 2, cy - numTp.height / 2));
    }
  }

  @override
  bool shouldRepaint(covariant _FloorPlanPainter oldDelegate) {
    return oldDelegate.tables != tables ||
        oldDelegate.selectedTableId != selectedTableId ||
        oldDelegate.compact != compact ||
        oldDelegate.barLabel != barLabel ||
        oldDelegate.cornerLabel != cornerLabel ||
        oldDelegate.entranceLabel != entranceLabel ||
        !_setEquals(oldDelegate.yoursTableIds, yoursTableIds);
  }

  bool _setEquals(Set<String> a, Set<String> b) {
    if (identical(a, b)) return true;
    if (a.length != b.length) return false;
    for (final v in a) {
      if (!b.contains(v)) return false;
    }
    return true;
  }
}
