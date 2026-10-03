// src/blessed/__tests__/stdlib.test.ts
import { describe, it, expect } from "vitest";
import { parse } from "../parser";
import { run } from "../interpreter";

const out = (src: string) => { const { program, errors } = parse(src); expect(errors).toEqual([]); const r = run(program); expect(r.error).toBeUndefined(); return r.stdout; };
const fails = (src: string) => { const { program } = parse(src); const r = run(program); expect(r.error).toBeDefined(); return r.error!; };

describe("stdlib", () => {
  it("String methods and length", () => {
    expect(out('let s = " Hello, World "\nprint(s.length)\nprint(s.trim())\nprint(s.upper())\nprint(s.lower())\nprint(s.trim().split(", "))\nprint(s.contains("World"))\nprint(s.trim().startsWith("He"))\nprint(s.trim().endsWith("ld"))\nprint(s.replace("World", "Nurse"))'))
      .toEqual(["14", "Hello, World", " HELLO, WORLD ", " hello, world ", '["Hello", "World"]', "true", "true", "true", " Hello, Nurse "]);
  });
  it("length is a property; calling it fails", () => {
    expect(fails('print("abc".length())')).toContain("'length' is a property, not a call");
  });
  it("List methods", () => {
    expect(out("let xs = [3, 1, 2]\nprint(xs.length)\nprint(xs.push(4))\nprint(xs)\nprint(xs.map(fn(x) { x * 2 }))\nprint(xs.filter(fn(x) { x > 1 }))\nprint(xs.reduce(fn(acc, x) { acc + x }, 0))\nprint(xs.contains(2))\nprint(xs.reverse())\nprint(xs.sort())\nprint([\"b\", \"a\"].sort())\nprint([\"a\", \"b\"].join(\"-\"))"))
      .toEqual(["3", "[3, 1, 2, 4]", "[3, 1, 2]", "[6, 2, 4]", "[3, 2]", "6", "true", "[2, 1, 3]", "[1, 2, 3]", '["a", "b"]', "a-b"]);
  });
  it("numeric aggregates", () => {
    expect(out("print([1, 2, 3].sum())\nprint([1.5, 2.5].sum())\nprint([3, 1].min() ?? -1)\nprint([3, 1].max() ?? -1)\nlet e: List<Int> = []\nprint(e.min() ?? -1)\nprint(e.sum())")).toEqual(["6", "4.0", "1", "3", "-1", "0"]);
  });
  it("Map methods", () => {
    expect(out('let m = {"a": 1, "b": 2}\nprint(m.keys())\nprint(m.values())\nprint(m.has("a"))\nprint(m.has("z"))')).toEqual(['["a", "b"]', "[1, 2]", "true", "false"]);
  });
  it("Int methods", () => {
    expect(out("print((-5).abs())\nprint(2.pow(64))\nprint(12.gcd(18))\nprint(20.factorial())")).toEqual(["5", "18446744073709551616", "6", "2432902008176640000"]);
    expect(fails("print(2.pow(-1))")).toContain("negative exponent");
  });
  it("Float methods", () => {
    expect(out("print((-2.5).abs())\nprint(2.5.floor())\nprint(2.1.ceil())\nprint(2.5.round())\nprint(3.14159.round(2))\nprint(16.0.sqrt())\nprint(2.0.pow(10))\nprint(0.0.sin())\nprint(0.0.cos())\nprint(1.0.exp() == E)\nprint(E.log())\nprint(1.0.atan2(1.0) * 4.0 == PI)"))
      .toEqual(["2.5", "2.0", "3.0", "3.0", "3.14", "4.0", "1024.0", "0.0", "1.0", "true", "1.0", "true"]);
    expect(fails("print((-4.0).sqrt())")).toContain("is not a number");
    expect(fails("print((-1.0).log())")).toContain("is not a number");
    expect(out("print(2.0.pow(0.5) == 2.0.sqrt())\nprint(1.0.asin() * 2.0 == PI)\nprint(1.0.acos())\nprint(0.0.atan())\nprint(0.0.tan())")).toEqual(["true", "true", "0.0", "0.0", "0.0"]);
  });
  it("Complex properties and methods", () => {
    expect(out("let z = 3 + 4i\nprint(z.re)\nprint(z.im)\nprint(z.abs())\nprint(z.conj())\nprint(Complex(-4.0).sqrt())\nprint((0i).exp())\nprint(Complex(1.0).log())\nprint((1i).pow(2))\nprint((1i).arg() * 2.0 == PI)"))
      .toEqual(["3.0", "4.0", "5.0", "3 - 4i", "2i", "1 + 0i", "0i", "-1 + 0i", "true"]);
  });
  it("unknown method and property", () => {
    expect(fails("print(1.nope())")).toContain("Int has no method 'nope'");
    expect(fails("print(1.nope)")).toContain("Int has no property 'nope'");
  });
  it("wrong arity", () => {
    expect(fails('print("a".split())')).toContain("takes 1 argument(s), got 0");
  });
});
