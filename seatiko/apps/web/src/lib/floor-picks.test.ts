import { describe, expect, it } from "vitest";
import type { Table } from "@/lib/api";
import { defaultTable, firstInZone, similarFreeTables } from "./floor-picks";

const table = (number: number, seats: number, status: Table["status"], zone = "hall"): Table => ({
  id: `t${number}`,
  venue_id: "v",
  number,
  seats,
  status,
  zone,
  x: 0.5,
  y: 0.5,
});

const tables = [
  table(3, 4, "OCCUPIED"),
  table(1, 2, "RESERVED"),
  table(2, 4, "FREE"),
  table(4, 6, "FREE", "terrace"),
  table(5, 4, "FREE", "terrace"),
];

describe("floor picks", () => {
  it("opens on the first free table of the first zone", () => {
    expect(defaultTable(tables, ["hall", "terrace"])?.number).toBe(2);
    expect(defaultTable(tables, ["terrace", "hall"])?.number).toBe(4);
  });

  it("falls back to the first table when nothing is free", () => {
    const busy = tables.map((t) => ({ ...t, status: "OCCUPIED" as const }));
    expect(defaultTable(busy, ["hall", "terrace"])?.number).toBe(1);
    expect(defaultTable([], ["hall"])).toBeNull();
  });

  it("respects the seats filter", () => {
    expect(defaultTable(tables, ["hall", "terrace"], 6)?.number).toBe(4);
    expect(firstInZone(tables, "terrace", 5)?.number).toBe(4);
    expect(firstInZone(tables, "hall", 8)).toBeNull();
  });

  it("offers the closest free table with enough seats, same zone first", () => {
    const busy = tables[0]; // №3, 4 seats, hall
    expect(similarFreeTables(tables, busy).map((t) => t.number)).toEqual([2, 5, 4]);
  });
});
