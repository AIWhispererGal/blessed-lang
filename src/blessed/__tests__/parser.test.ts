// src/blessed/__tests__/parser.test.ts
import { describe, it, expect } from "vitest";
import { parse } from "../parser";

const ok = (src: string) => { const r = parse(src); expect(r.errors).toEqual([]); return r.program; };
const err = (src: string) => { const r = parse(src); expect(r.errors.length).toBe(1); return r.errors[0]; };
const stmt = (src: string) => ok(src).body[0] as any;
const expr = (src: string) => stmt(src).expr;

describe("parser statements", () => {
  it("let with and without type", () => {
    expect(stmt("let x = 5")).toMatchObject({ kind: "Let", name: "x", init: { kind: "IntLit", value: 5n } });
    expect(stmt("let n: String? = null")).toMatchObject({ kind: "Let", type: { kind: "Nullable", inner: { kind: "Named", name: "String" } } });
    expect(stmt("let m: Map<String, Int> = {}")).toMatchObject({ type: { kind: "Named", name: "Map", args: [{ name: "String" }, { name: "Int" }] } });
  });
  it("let without init is an error", () => {
    expect(err("let x").message).toContain("needs a value");
  });
  it("assignment to ident, index, field", () => {
    expect(stmt("x = 1")).toMatchObject({ kind: "Assign", target: { kind: "Ident" } });
    expect(stmt('m["k"] = 1')).toMatchObject({ kind: "Assign", target: { kind: "Index" } });
    expect(stmt("p.x = 1")).toMatchObject({ kind: "Assign", target: { kind: "Field" } });
  });
  it("if / else if / else", () => {
    const s = stmt("if a {\n} else if b {\n} else {\n}");
    expect(s.kind).toBe("If");
    expect(s.else[0].kind).toBe("If");
    expect(s.else[0].else).toEqual([]);
  });
  it("if let", () => {
    expect(stmt("if let n = nick {\nprint(n)\n}")).toMatchObject({ kind: "IfLet", name: "n", then: [{ kind: "ExprStmt" }] });
  });
  it("four loop shapes plus despite", () => {
    expect(stmt("loop {\n}")).toMatchObject({ kind: "Loop", shape: "forever" });
    expect(stmt("loop x < 3 {\n}")).toMatchObject({ shape: "while", cond: { kind: "Binary", op: "<" } });
    expect(stmt("loop f in fruits {\n}")).toMatchObject({ shape: "in", item: "f", iter: { kind: "Ident", name: "fruits" } });
    expect(stmt("loop f in fruits despite errors {\n}")).toMatchObject({ despite: {} });
    expect(stmt("loop f in fruits despite errors as e {\n}")).toMatchObject({ despite: { errName: "e" } });
    expect(stmt("loop i in 0..10 {\n}")).toMatchObject({ iter: { kind: "Range" } });
  });
  it("fn decl with params and return type", () => {
    expect(stmt("fn add(a: Int, b: Int) -> Int {\nreturn a + b\n}")).toMatchObject({
      kind: "FnDecl", name: "add", params: [{ name: "a" }, { name: "b" }], ret: { name: "Int" }, body: [{ kind: "Return" }],
    });
  });
  it("record decl", () => {
    expect(stmt("record Point { x: Int, y: Int }")).toMatchObject({ kind: "RecordDecl", name: "Point", fields: [{ name: "x" }, { name: "y" }] });
  });
  it("fail", () => {
    expect(stmt('fail "boom"')).toMatchObject({ kind: "Fail", expr: { kind: "StrLit" } });
  });
  it("comments attach to the next statement and blank lines are counted", () => {
    const p = ok("-- one\n-- two\n\n\nlet x = 1 -- tail\n\nlet y = 2\n-- end");
    expect(p.body[0].leading).toEqual(["-- one", "-- two"]);
    expect(p.body[0].trailing).toBe("-- tail");
    expect(p.body[1].blankBefore).toBe(1);
    expect(p.trailingComments).toEqual(["-- end"]);
  });
  it("records semicolons so the checker can warn", () => {
    expect(stmt("let x = 1;").semicolon).toBe(true);
  });
});

describe("parser expressions", () => {
  it("precedence: * over +, comparison over and, ?? lowest", () => {
    expect(expr("1 + 2 * 3")).toMatchObject({ op: "+", right: { op: "*" } });
    expect(expr("a < b and c")).toMatchObject({ op: "and", left: { op: "<" } });
    expect(expr("a ?? b or c")).toMatchObject({ op: "??", right: { op: "or" } });
  });
  it("unary minus and not", () => {
    expect(expr("-x * 2")).toMatchObject({ op: "*", left: { kind: "Unary", op: "-" } });
    expect(expr("not a and b")).toMatchObject({ op: "and", left: { kind: "Unary", op: "not" } });
  });
  it("complex literal folding", () => {
    expect(expr("3 + 4i")).toEqual({ kind: "ComplexLit", re: 3, im: 4, span: { line: 1 } });
    expect(expr("3 - 4i")).toEqual({ kind: "ComplexLit", re: 3, im: -4, span: { line: 1 } });
    expect(expr("4i")).toEqual({ kind: "ComplexLit", re: 0, im: 4, span: { line: 1 } });
    expect(expr("x + 4i")).toMatchObject({ kind: "Binary", op: "+" });
  });
  it("Infinity is a FloatLit", () => {
    expect(expr("Infinity")).toEqual({ kind: "FloatLit", value: Infinity, span: { line: 1 } });
    expect(expr("-Infinity")).toMatchObject({ kind: "Unary", op: "-", expr: { value: Infinity } });
  });
  it("postfix: call, index, slice, field, method", () => {
    expect(expr("f(1, 2)")).toMatchObject({ kind: "Call", args: [{ value: 1n }, { value: 2n }], named: [] });
    expect(expr("xs[0]")).toMatchObject({ kind: "Index", index: { kind: "IntLit" } });
    expect(expr("xs[0..2]")).toMatchObject({ kind: "Index", index: { kind: "Range" } });
    expect(expr("xs[-1]")).toMatchObject({ kind: "Index", index: { kind: "Unary" } });
    expect(expr("p.x")).toMatchObject({ kind: "Field", name: "x" });
    expect(expr("s.upper()")).toMatchObject({ kind: "Call", callee: { kind: "Field", name: "upper" } });
    expect(expr("(0..3).map(fn(n) { n * 2 })")).toMatchObject({ kind: "Call", callee: { kind: "Field", obj: { kind: "Range" } }, args: [{ kind: "Lambda" }] });
  });
  it("named-argument record construction", () => {
    expect(expr("Point(x: 1, y: 2)")).toMatchObject({ kind: "Call", callee: { name: "Point" }, args: [], named: [{ name: "x" }, { name: "y" }] });
    expect(err("let p = Point(1, 2)").message).toContain("named fields");
  });
  it("with", () => {
    expect(expr("p with { x: 3 }")).toMatchObject({ kind: "With", fields: [{ name: "x" }] });
  });
  it("list, map, empty map, string parts", () => {
    expect(expr("[1, 2]")).toMatchObject({ kind: "ListLit", items: [{}, {}] });
    expect(expr('{"a": 1, "b": 2}')).toMatchObject({ kind: "MapLit", entries: [{ key: { kind: "StrLit" } }, {}] });
    expect(expr("{}")).toMatchObject({ kind: "MapLit", entries: [] });
    expect(expr('"a${x}b"')).toMatchObject({ kind: "StrLit", parts: ["a", { kind: "Ident", name: "x" }, "b"] });
  });
  it("lambda with and without types", () => {
    expect(expr("fn(x: Int) -> Int { return x }")).toMatchObject({ kind: "Lambda", params: [{ name: "x", type: { name: "Int" } }], ret: { name: "Int" } });
    expect(expr("fn(x) { x }")).toMatchObject({ kind: "Lambda", params: [{ name: "x" }], body: [{ kind: "ExprStmt" }] });
  });
  it("match with every arm kind", () => {
    const m = expr('match n {\n0 -> "zero"\nx if x > 10 -> "big"\nPoint(x: 0, y: y) -> "axis"\n_ -> { let s = "o"\ns }\n}');
    expect(m.kind).toBe("Match");
    expect(m.arms.map((a: any) => a.pattern.kind)).toEqual(["PLit", "PBind", "PRecord", "PWild"]);
    expect(m.arms[1].guard).toMatchObject({ op: ">" });
    expect(m.arms[2].pattern.fields[1].pattern).toMatchObject({ kind: "PBind", name: "y" });
    expect(m.arms[3].body.length).toBe(2);
  });
  it("negative literal pattern", () => {
    expect(expr("match n {\n-1 -> 0\n_ -> 1\n}").arms[0].pattern).toMatchObject({ kind: "PLit", value: { kind: "Unary" } });
  });
  it("is and ==, and the === scar", () => {
    expect(expr("a is b")).toMatchObject({ op: "is" });
    expect(err("a === b").message).toContain("JS scar");
  });
  it("newlines are allowed inside brackets and after binary operators", () => {
    expect(expr("[\n1,\n2\n]")).toMatchObject({ kind: "ListLit", items: [{}, {}] });
    expect(expr("1 +\n2")).toMatchObject({ op: "+" });
  });
  it("reports the line of an error", () => {
    expect(err("let a = 1\nlet b = (1 + ").line).toBe(2);
  });
  it("range binds looser than +, tighter than comparison, and does not chain", () => {
    expect(expr("k + 1..n + 1")).toMatchObject({ kind: "Range", start: { op: "+" }, end: { op: "+" } });
    expect(expr("-1..3")).toMatchObject({ kind: "Range", start: { kind: "Unary" } });
    expect(expr("a..b < c")).toMatchObject({ op: "<", left: { kind: "Range" } });
    expect(stmt("loop i in 0..n + 1 {\n}")).toMatchObject({ iter: { kind: "Range", end: { op: "+" } } });
    expect(err("a..b..c").message).toContain("end of range");
  });
  it("negative complex fold", () => {
    expect(expr("-3 + 4i")).toEqual({ kind: "ComplexLit", re: -3, im: 4, span: { line: 1 } });
  });
  it("block-end comments are kept", () => {
    expect(stmt("fn f() {\nlet x = 1\n-- end\n}").body[0].after).toEqual(["-- end"]);
    expect(stmt("if a {\n-- only\n}").innerComments).toEqual(["-- only"]);
  });
});
