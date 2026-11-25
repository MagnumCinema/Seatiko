import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:mobile/api.dart';
import 'package:mobile/theme.dart';

/// Schematic floor plan: cream room, tan tables, olive chairs/benches.
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

  Color _tableFill(VenueTable t) {
    if (widget.yoursTableIds.contains(t.id)) {
      return FaColors.yours;
    }
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
                        onSelected: (_) => setState(() => _zone = zone),
                      ),
                    ),
                ],
              ),
            ),
          ),
        Expanded(
          child: Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: RestaurantFloorPlan.roomBg,
              borderRadius: BorderRadius.circular(widget.compact ? 14 : 18),
              border: Border.all(color: const Color(0xFFE2D6C4)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x14281E10),
                  blurRadius: 24,
                  offset: Offset(0, 12),
                ),
              ],
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
                      Positioned(
                        left: 10,
                        top: roomHeight * .14,
                        bottom: roomHeight * .18,
                        child: const _ZoneBar(),
                      ),
                      Positioned(
                        right: 12,
                        top: 12,
                        child: _ZoneChip(
                          outdoor
                              ? 'floor.zone_outside'.tr()
                              : 'floor.zone_kitchen'.tr(),
                        ),
                      ),
                      Positioned(
                        right: 14,
                        bottom: 12,
                        child: Text(
                          'floor.entrance'.tr(),
                          style: const TextStyle(
                            color: RestaurantFloorPlan.zoneText,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ),
                      for (final table in visible)
                        Positioned(
                          left: table.x.clamp(.12, .88) * roomWidth,
                          top: table.y.clamp(.16, .84) * roomHeight,
                          child: FractionalTranslation(
                            translation: const Offset(-.5, -.5),
                            child: _SchematicTable(
                              table: table,
                              fill: _tableFill(table),
                              selected: widget.selectedTableId == table.id,
                              isYours: widget.yoursTableIds.contains(table.id),
                              compact: widget.compact,
                              onTap: () => widget.onTableTap(table),
                            ),
                          ),
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
      ],
    );
  }
}

class _ZoneBar extends StatelessWidget {
  const _ZoneBar();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 34,
      decoration: BoxDecoration(
        color: const Color(0x1FD2B48C),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: RestaurantFloorPlan.zoneBorder,
          style: BorderStyle.solid,
        ),
      ),
      child: RotatedBox(
        quarterTurns: 3,
        child: Center(
          child: Text(
            'floor.zone_bar'.tr().toUpperCase(),
            style: const TextStyle(
              color: RestaurantFloorPlan.zoneText,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.2,
            ),
          ),
        ),
      ),
    );
  }
}

class _ZoneChip extends StatelessWidget {
  const _ZoneChip(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0x8CFFFFFF),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: RestaurantFloorPlan.zoneBorder),
      ),
      child: Text(
        label.toUpperCase(),
        style: const TextStyle(
          color: RestaurantFloorPlan.zoneText,
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
        ),
      ),
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

class _SchematicTable extends StatelessWidget {
  const _SchematicTable({
    required this.table,
    required this.fill,
    required this.selected,
    required this.isYours,
    required this.compact,
    required this.onTap,
  });

  final VenueTable table;
  final Color fill;
  final bool selected;
  final bool isYours;
  final bool compact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final shape = _shapeFor(table.seats);
    final scale = compact ? 0.88 : 1.0;
    late final double w;
    late final double h;
    late final BorderRadius radius;
    switch (shape) {
      case _TableShape.oval:
        w = 58 * scale;
        h = 40 * scale;
        radius = BorderRadius.circular(99);
      case _TableShape.portrait:
        w = 42 * scale;
        h = 62 * scale;
        radius = BorderRadius.circular(10);
      case _TableShape.portraitLarge:
        w = 46 * scale;
        h = 78 * scale;
        radius = BorderRadius.circular(10);
      case _TableShape.booth:
        w = 44 * scale;
        h = 70 * scale;
        radius = BorderRadius.circular(10);
    }

    final pad = 18.0 * scale;
    final freeRing = table.status == 'FREE' && !selected && !isYours;

    return Semantics(
      button: true,
      label: 'floor.table_semantics'.tr(args: ['${table.number}', '${table.seats}']),
      child: GestureDetector(
        onTap: onTap,
        child: SizedBox(
          width: w + pad * 2,
          height: h + pad * 2,
          child: Stack(
            alignment: Alignment.center,
            clipBehavior: Clip.none,
            children: [
              ..._seatingMarks(shape, w, h, scale),
              AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                width: w,
                height: h,
                decoration: BoxDecoration(
                  color: fill,
                  borderRadius: radius,
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0x245A3C14),
                      blurRadius: selected ? 18 : 12,
                      offset: const Offset(0, 6),
                    ),
                    if (selected)
                      const BoxShadow(
                        color: Color(0xFF6F8F3D),
                        blurRadius: 0,
                        spreadRadius: 3,
                      )
                    else if (isYours)
                      BoxShadow(
                        color: FaColors.yours.withValues(alpha: 0.4),
                        blurRadius: 0,
                        spreadRadius: 3,
                      )
                    else if (freeRing)
                      BoxShadow(
                        color: RestaurantFloorPlan.olive.withValues(alpha: 0.22),
                        blurRadius: 0,
                        spreadRadius: 2,
                      )
                    else if (table.status == 'RESERVED')
                      BoxShadow(
                        color: RestaurantFloorPlan.tableReserved.withValues(
                          alpha: 0.35,
                        ),
                        blurRadius: 0,
                        spreadRadius: 3,
                      )
                    else if (table.status == 'OCCUPIED')
                      BoxShadow(
                        color: FaColors.occupied.withValues(alpha: 0.35),
                        blurRadius: 0,
                        spreadRadius: 3,
                      ),
                  ],
                ),
                child: Center(
                  child: Text(
                    '${table.number}',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: compact ? 13 : 15,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.3,
                      shadows: const [
                        Shadow(
                          color: Color(0x2E5A3C14),
                          offset: Offset(0, 1),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _seatingMarks(
    _TableShape shape,
    double w,
    double h,
    double scale,
  ) {
    const olive = RestaurantFloorPlan.olive;
    if (shape == _TableShape.booth) {
      final benchW = 10 * scale;
      final benchH = h * 0.78;
      return [
        Positioned(
          left: 18 * scale - benchW - 4,
          top: (h + 36 * scale - benchH) / 2,
          child: _Bench(width: benchW, height: benchH, color: olive),
        ),
        Positioned(
          right: 18 * scale - benchW - 4,
          top: (h + 36 * scale - benchH) / 2,
          child: _Bench(width: benchW, height: benchH, color: olive),
        ),
      ];
    }

    final chair = shape == _TableShape.oval ? 11.0 * scale : 12.0 * scale;
    final perSide = shape == _TableShape.portraitLarge ? 3 : 2;
    final marks = <Widget>[];
    for (var i = 0; i < perSide; i++) {
      final t = perSide == 1
          ? 0.5
          : (0.28 + i * (0.44 / (perSide - 1)));
      final top = 18 * scale + h * t - chair / 2;
      marks.add(
        Positioned(
          left: 18 * scale - chair - 3,
          top: top,
          child: _Chair(size: chair, color: olive),
        ),
      );
      marks.add(
        Positioned(
          right: 18 * scale - chair - 3,
          top: top,
          child: _Chair(size: chair, color: olive),
        ),
      );
    }
    return marks;
  }
}

class _Chair extends StatelessWidget {
  const _Chair({required this.size, required this.color});
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(3),
        boxShadow: const [
          BoxShadow(
            color: Color(0x26283214),
            blurRadius: 3,
            offset: Offset(0, 1),
          ),
        ],
      ),
    );
  }
}

class _Bench extends StatelessWidget {
  const _Bench({
    required this.width,
    required this.height,
    required this.color,
  });
  final double width;
  final double height;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(4),
        boxShadow: const [
          BoxShadow(
            color: Color(0x26283214),
            blurRadius: 3,
            offset: Offset(0, 1),
          ),
        ],
      ),
    );
  }
}
