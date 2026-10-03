import { describe, it, expect } from "vitest";
import { int, float, str, bool, complex, list, NULL, equals, identical, show, mapKey, checkFloat, makeComplex, BlessedError, typeName, Value } from "../values";

const rec = (name: string, f: Record<string, Value>): Value => ({ t: "Record", name, fields: new Map(Object.entries(f)) });
const map = (pairs: [Value, Value][]): Value => ({ t: "Map", entries: new Map(pairs.map(([k, v]) => [mapKey(k), { key: k, value: v }])) });

describe("values", () => {
  it("structural equality on lists, maps, records", () => {
    expect(equals(list([int(1), int(2)]), list([int(1), int(2)]))).toBe(true);
    expect(equals(list([int(1)]), list([int(1), int(2)]))).toBe(false);
    expect(equals(map([[str("a"), int(1)], [str("b"), int(2)]]), map([[str("b"), int(2)], [str("a"), int(1)]]))).toBe(true);
    expect(equals(rec("P", { x: int(1) }), rec("P", { x: int(1) }))).toBe(true);
    expect(equals(rec("P", { x: int(1) }), rec("Q", { x: int(1) }))).toBe(false);
  });
  it("never equates across tags", () => {
    expect(equals(int(1), float(1))).toBe(false);
    expect(equals(str("1"), int(1))).toBe(false);
    expect(equals(NULL, NULL)).toBe(true);
    expect(equals(NULL, int(0))).toBe(false);
  });
  it("Infinity equals Infinity", () => {
    expect(equals(float(Infinity), float(Infinity))).toBe(true);
  });
  it("identity is reference", () => {
    const a = list([int(1)]); const b = list([int(1)]);
    expect(identical(a, a)).toBe(true);
    expect(identical(a, b)).toBe(false);
  });
  it("shows values in BLESSED literal syntax", () => {
    expect(show(int(5n))).toBe("5");
    expect(show(float(2.5))).toBe("2.5");
    expect(show(float(2))).toBe("2.0");
    expect(show(float(Infinity))).toBe("Infinity");
    expect(show(str("hi"))).toBe("hi");
    expect(show(list([str("a"), int(1), NULL]))).toBe('["a", 1, null]');
    expect(show(map([[str("a"), int(1)]]))).toBe('{"a": 1}');
    expect(show(rec("Point", { x: int(1), y: int(2) }))).toBe("Point(x: 1, y: 2)");
    expect(show(bool(true))).toBe("true");
  });
  it("shows complex numbers", () => {
    expect(show(complex(3, 4))).toBe("3 + 4i");
    expect(show(complex(3, -4))).toBe("3 - 4i");
    expect(show(complex(0, 4))).toBe("4i");
    expect(show(complex(3, 0))).toBe("3 + 0i");
    expect(show(complex(0, 0))).toBe("0i");
    expect(show(complex(1.5, 2.5))).toBe("1.5 + 2.5i");
  });
  it("map keys distinguish Int 1 and String 1", () => {
    expect(mapKey(int(1))).not.toBe(mapKey(str("1")));
  });
  it("refuses NaN", () => {
    expect(() => checkFloat(0 / 0, "0.0 / 0.0")).toThrow(BlessedError);
    expect(() => checkFloat(0 / 0, "0.0 / 0.0")).toThrow("0.0 / 0.0 is not a number. We will not pretend it is.");
    expect(checkFloat(1 / 0, "x")).toBe(Infinity);
    expect(() => makeComplex(Infinity - Infinity, 0, "z")).toThrow(BlessedError);
  });
  it("typeName", () => {
    expect(typeName(rec("Point", {}))).toBe("Point");
    expect(typeName(list([]))).toBe("List");
    expect(typeName(int(1))).toBe("Int");
  });
});
