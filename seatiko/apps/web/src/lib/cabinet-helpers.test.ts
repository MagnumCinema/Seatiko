import { describe, expect, it } from "vitest";
import {
  photoProblem,
  pluralize,
} from "./cabinet-helpers";

const ruRecords = { one: "запись", few: "записи", many: "записей", other: "записи" };
const enRecords = { one: "record", few: "records", many: "records", other: "records" };

describe("pluralize", () => {
  it("uses Russian plural forms", () => {
    expect(pluralize(1, ruRecords, "ru")).toBe("запись");
    expect(pluralize(3, ruRecords, "ru")).toBe("записи");
    expect(pluralize(5, ruRecords, "ru")).toBe("записей");
    expect(pluralize(21, ruRecords, "ru")).toBe("запись");
  });
  it("uses English plural forms", () => {
    expect(pluralize(1, enRecords, "en")).toBe("record");
    expect(pluralize(0, enRecords, "en")).toBe("records");
  });
});

describe("photoProblem", () => {
  it("checks type and size", () => {
    expect(photoProblem({ type: "image/png", size: 1000 })).toBeNull();
    expect(photoProblem({ type: "image/gif", size: 1000 })).toBe("type");
    expect(photoProblem({ type: "image/jpeg", size: 6 * 1024 * 1024 })).toBe("size");
  });
});
