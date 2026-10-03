// src/blessed/__tests__/checker.test.ts
import { describe, it, expect } from "vitest";
import { parse } from "../parser";
import { check } from "../checker";

const diags = (src: string) => { const { program, errors } = parse(src); expect(errors).toEqual([]); return check(program); };
const errors = (src: string) => diags(src).filter(d => d.severity === "error").map(d => `${d.line}: ${d.message}`);
const warnings = (src: string) => diags(src).filter(d => d.severity === "warning").map(d => `${d.line}: ${d.message}`);
const clean = (src: string) => expect(errors(src)).toEqual([]);

describe("checker: names and declarations", () => {
  it("undefined name", () => { expect(errors("print(x)")[0]).toContain("'x' is not defined"); });
  it("redeclaration in same scope, shadowing in inner scope is fine", () => {
    expect(errors("let x = 1\nlet x = 2")[0]).toContain("already declared");
    clean("let x = 1\nif true {\nlet x = 2\n}");
  });
  it("constants cannot be reassigned", () => { expect(errors("let MAX = 1\nMAX = 2")[0]).toContain("SCREAMING_SNAKE"); });
  it("reassignment keeps the declared type", () => { expect(errors('let x = 1\nx = "a"')[0]).toContain("Expected Int but got String"); });
  it("annotation mismatch and null into non-nullable", () => {
    expect(errors('let x: Int = "a"')[0]).toContain("Expected Int but got String");
    expect(errors("let x: String = null")[0]).toContain("cannot be null. Declare it as 'String?'");
  });
  it("snake_case and underscore style", () => {
    expect(warnings("let user_name = 1")[0]).toContain("Renamed variable 'user_name' to 'userName'");
    expect(warnings("let _x = 1")[0]).toContain("Leading underscores");
    expect(errors("let __x__ = 1")[0]).toContain("not Python");
    expect(warnings("let x = 1;")[0]).toContain("remove this semicolon");
    expect(warnings("let MAX_SIZE = 1")).toEqual([]);
  });
});

describe("checker: types and operators", () => {
  it("Int + String literal and variables", () => {
    expect(errors('let t = 5 + "a"')[0]).toContain("cannot add Int and String");
    expect(errors('let x = 5\nlet s = "a"\nlet t = x + s')[0]).toBe("3: cannot add Int and String. Did you mean: String(x) + s? BLESSED will wait. Take your time.");
  });
  it("Int and Float never mix", () => { expect(errors("let x = 1 + 2.0")[0]).toContain("cannot apply '+' to Int and Float"); });
  it("comparison across types", () => {
    expect(errors('let a = 5\nlet b = "5"\nprint(a == b)')[0]).toBe("3: Int ≠ String. We won't guess. Did you mean: a == Int(b)?");
    expect(errors('print(true == 1)')[0]).toContain("Bool ≠ Int");
  });
  it("Complex rules", () => {
    expect(errors("let x = 1.0\nlet z = x + 4i")[0]).toContain("Did you mean: Complex(x)?");
    expect(errors("print((1 + 1i) < (2 + 2i))")[0]).toContain("Complex numbers have no order");
    clean("let z = 3 + 4i\nprint(z * Complex(2))");
  });
  it("is only on List, Map, Record", () => {
    expect(errors("print(1 is 1)")[0]).toContain("Int values are not objects");
    clean("let a = [1]\nprint(a is a)");
  });
  it("conditions must be Bool", () => {
    expect(errors('let s = "x"\nif s {\n}')[0]).toBe('2: String is not Bool. Did you mean: if s != ""?');
    expect(errors("let n = 1\nif n {\n}")[0]).toContain("Did you mean: if n > 0?");
    expect(errors("let n = 1\nloop n {\n}")[0]).toContain("Int is not Bool");
    expect(errors("if not 1 {\n}")[0]).toContain("not Bool");
  });
  it("list element and map key/value homogeneity", () => {
    expect(errors('let xs = [1, "a"]')[0]).toContain("Expected Int but got String");
    expect(errors('let m = {"a": 1, 2: 3}')[0]).toContain("Expected String but got Int");
    expect(errors("let m = {}")[0]).toContain("Annotate it");
    clean("let m: Map<String, Int> = {}\nm[\"a\"] = 1");
  });
  it("map key type mismatch", () => {
    expect(errors('let m = {"a": 1}\nprint(m[1] ?? 0)')[0]).toContain("This map has String keys. Int is not one of them.");
  });
  it("map lookup is nullable", () => {
    expect(errors('let m = {"a": 1}\nprint(m["a"])')[0]).toContain("may be null");
    clean('let m = {"a": 1}\nprint(m["a"] ?? 0)');
  });
  it("indexing", () => {
    expect(errors("print(1[0])")[0]).toContain("Int cannot be indexed");
    expect(errors('let xs = [1]\nprint(xs["a"])')[0]).toContain("Expected Int but got String");
    clean("let xs = [1, 2]\nprint(xs[0..1])\nprint(xs[-1])");
  });
  it("ranges need Int ends", () => { expect(errors("print(0.5..2)")[0]).toContain("Range ends must be Int"); });
});

describe("checker: nullability", () => {
  it("nullable used raw is an error, handled forms are fine", () => {
    expect(errors("let n: String? = null\nprint(n)")[0]).toBe("2: Variable 'n' may be null. Handle it first. Did you mean 'n ?? \"default\"' or using 'if let'?");
    clean('let n: String? = null\nprint(n ?? "d")\nif let v = n {\nprint(v)\n}\nprint(n == null)\nprint(n != null)\nprint(match n {\nnull -> "a"\n_ -> "b"\n})');
  });
  it("nullable passes only into nullable params", () => {
    expect(errors("fn f(s: String) -> Int { 1 }\nlet n: String? = null\nprint(f(n))")[0]).toContain("may be null");
    clean("fn f(s: String?) -> Int { 1 }\nlet n: String? = null\nprint(f(n))");
  });
  it("inferred null type and assignments", () => {
    expect(errors("let n: Int? = null\nlet m: Int = n")[0]).toContain("may be null");
    clean("let n: Int? = null\nn = 5\nlet o: Int? = 3\no = null");
  });
  it("?? result is non-null, and left must be nullable", () => {
    clean("let n: Int? = null\nlet x: Int = n ?? 0");
    expect(errors('let n: Int? = null\nlet s: String = n ?? "a"')[0]).toContain("Expected Int but got String");
  });
  it("if let on a non-nullable is pointless and flagged", () => {
    expect(errors("let n = 1\nif let v = n {\n}")[0]).toContain("Expected a nullable value but got Int");
  });
});

describe("checker: functions, records, match, errors", () => {
  it("arity, return type, return outside fn", () => {
    expect(errors("fn f(a: Int) -> Int { a }\nprint(f(1, 2))")[0]).toContain("takes 1 argument(s), got 2");
    expect(errors('fn f(a: Int) -> Int {\nreturn "x"\n}')[0]).toContain("Expected Int but got String");
    expect(errors("return 1")[0]).toContain("Return to where?");
    expect(errors("let x = 1\nx(2)")[0]).toContain("Int is not callable");
  });
  it("inferred return type and first-class use", () => {
    clean("fn f(a: Int) { a + 1 }\nlet g = f\nlet r: Int = g(1)");
    expect(errors("fn f(a: Int) { a + 1 }\nlet r: String = f(1)")[0]).toContain("Expected String but got Int");
  });
  it("lambda param inference through map/filter/reduce, and failure elsewhere", () => {
    clean("let ys: List<Int> = [1, 2].map(fn(x) { x * 2 })\nlet zs: List<Int> = [1, 2].filter(fn(x) { x > 1 })\nlet s: Int = [1, 2].reduce(fn(a, x) { a + x }, 0)");
    expect(errors("let f = fn(x) { x }")[0]).toContain("Cannot infer the type of parameter 'x'");
    expect(errors('[1, 2].map(fn(x) { x + "a" })')[0]).toContain("cannot add Int and String");
  });
  it("records: fields, construction, immutability, with, undefined record", () => {
    clean("record P { x: Int, y: Int }\nlet p = P(x: 1, y: 2)\nprint(p.x + p.y)\nlet q = p with { x: 3 }\nprint(p == q)");
    expect(errors("record P { x: Int }\nlet p = P(x: 1)\nprint(p.z)")[0]).toContain("P has no field 'z'");
    expect(errors("record P { x: Int, y: Int }\nlet p = P(x: 1)")[0]).toContain("missing 'y'");
    expect(errors("record P { x: Int }\nlet p = P(x: 1, x: 2)")[0]).toContain("given twice");
    expect(errors("record P { x: Int }\nlet p = P(x: 1)\np.x = 2")[0]).toContain("records do not change");
    expect(errors('record P { x: Int }\nlet p = P(x: "a")')[0]).toContain("Expected Int but got String");
    expect(errors("let p = Q(x: 1)")[0]).toContain("'Q' is not defined");
    expect(errors("record P { x: Int }\nlet p = P(x: 1)\nlet q = p with { z: 1 }")[0]).toContain("no field 'z'");
  });
  it("match exhaustiveness and arm types", () => {
    expect(errors('let n = 1\nlet s = match n {\n0 -> "a"\n1 -> "b"\n}')[0]).toContain("does not cover every case");
    clean('let b = true\nlet s = match b {\ntrue -> "a"\nfalse -> "b"\n}');
    clean('let n = 1\nlet s = match n {\n0 -> "a"\nx -> "b"\n}');
    expect(errors('let n = 1\nlet s = match n {\n0 -> "a"\n_ -> 1\n}')[0]).toContain("Match arms disagree: String vs Int");
    expect(errors('let n = 1\nlet s = match n {\n"a" -> 1\n_ -> 2\n}')[0]).toContain("Expected Int but got String");
    expect(errors("record P { x: Int }\nlet p = P(x: 1)\nlet s = match p {\nP(x: 0, y: 1) -> 1\n_ -> 2\n}")[0]).toContain("no field 'y'");
    clean("record P { x: Int }\nlet p = P(x: 1)\nlet s = match p {\nP(x: 0) -> 1\nP(x: v) if v > 3 -> v\n_ -> 2\n}");
  });
  it("guards must be Bool; bindings are typed", () => {
    expect(errors("let n = 1\nlet s = match n {\nx if x -> 1\n_ -> 2\n}")[0]).toContain("Int is not Bool");
  });
  it("fail takes a String; despite as binds a String? visible in the body and after the loop", () => {
    expect(errors("fail 1")[0]).toContain("'fail' takes a String message, not Int");
    clean('loop x in [1] despite errors as e {\nprint((e ?? "none").upper())\n}\nprint(e ?? "clean run")');
    expect(errors("loop x in [1] despite errors as e {\nprint(e)\n}")[0]).toContain("may be null");
    expect(errors('loop x in [1] despite errors as e {\nprint((e ?? "") + 1)\n}')[0]).toContain("cannot add Int and String");
  });
  it("loop item types and iterating a non-list", () => {
    expect(errors("loop x in 5 {\n}")[0]).toContain("Expected List but got Int");
    expect(errors('loop x in [1] {\nprint(x + "a")\n}')[0]).toContain("cannot add Int and String");
  });
  it("methods and properties through the stdlib tables", () => {
    expect(errors('print("a".length())')[0]).toContain("'length' is a property, not a call");
    expect(errors("print(1.nope())")[0]).toContain("Int has no method 'nope'");
    expect(errors('print("a".split())')[0]).toContain("takes 1 argument(s), got 0");
    clean('let n: Int = "a,b".split(",").length\nlet m: Int? = [1].min()\nlet z: Float = (1 + 1i).re');
    expect(errors("let x: Int = [1].min()")[0]).toContain("may be null");
  });
  it("conversions type", () => {
    clean('let a: String = String(1)\nlet b: Int = Int("1") ?? 0\nlet c: Float = Float(1)\nlet d: Complex = Complex(1.0)');
    expect(errors('let b: Int = Int("1")')[0]).toContain("may be null");
  });
});

describe("checker: review fixes", () => {
  it("[] learns its element type from the first assignment", () => {
    expect(errors('let xs = []\nxs = [1]\nxs = ["a"]')).toEqual(["3: Expected Int but got String. Types are not suggestions."]);
  });
  it("[].push(x) learns its element type", () => {
    expect(errors('let xs = []\nlet ys = xs.push(1)\nprint(ys[0] + "a")')[0]).toContain("3: cannot add Int and String");
  });
  it("guarded Bool literal arms do not count toward exhaustiveness", () => {
    expect(errors("let b = true\nlet c = false\nlet s = match b {\ntrue if c -> 1\nfalse -> 2\n}")).toEqual(["3: This match does not cover every case. Add '_ ->' or a binding arm. BLESSED does not do surprise endings."]);
    clean("let b = true\nlet s = match b {\ntrue -> 1\nfalse -> 2\n}");
  });
  it("records can be used before their declaration", () => {
    clean("fn make() -> Int {\nlet p = P(x: 1)\np.x\n}\nrecord P { x: Int }\nprint(make())");
    expect(errors("record P { x: Int, x: Int }")).toEqual(["1: Field 'x' given twice. Once was enough."]);
  });
  it("arms that fail or return contribute no value", () => {
    clean('let n = 1\nlet s: Int = match n {\n0 -> {\nfail "no"\n}\n_ -> 5\n}');
    clean("fn f(n: Int) -> Int {\nreturn match n {\n0 -> {\nreturn 1\n}\n_ -> 5\n}\n}");
  });
  it("named arguments on a function call are an error, and their values are still checked", () => {
    const es = errors("fn f(a: Int, b: Int) -> Int { a }\nprint(f(1, b: undefinedThing))");
    expect(es).toContain("2: f is a function, not a record. Functions take arguments in order. Records take fields by name. Choose one.");
    expect(es.some(m => m.includes("'undefinedThing' is not defined"))).toBe(true);
  });
  it("declared non-nullable returns must return on every path", () => {
    expect(errors("fn f() -> Int {\nif true {\nreturn 1\n}\n}")).toEqual(["1: 'f' promises Int but can finish without returning one. Promises matter."]);
    clean("fn g(n: Int) -> Int {\nif n > 0 {\nreturn 1\n} else {\nreturn 2\n}\n}");
    clean("fn h(n: Int) -> Int {\nlet m = n + 1\nm * 2\n}");
    clean("fn k(n: Int) -> Int? {\nif n > 0 {\nreturn 1\n}\n}");
    expect(errors("let f: Fn(Int) -> Int = fn(n: Int) -> Int {\nif n > 0 {\nreturn 1\n}\n}")[0]).toContain("'fn' promises Int");
  });
});

describe("checker: first-round deviations", () => {
  it("inferred returns and match arms unify Null into T?", () => {
    expect(errors("fn f(a: Int) {\nif a > 0 {\nreturn 1\n}\nreturn null\n}\nlet r: Int = f(1)")).toEqual(["7: Variable 'f(...)' may be null. Handle it first. Did you mean 'f(...) ?? \"default\"' or using 'if let'?"]);
    expect(errors("let n = 1\nlet s = match n {\n0 -> null\n_ -> 1\n}\nlet t: Int = s")[0]).toContain("6: Variable 's' may be null");
    clean("let n = 1\nlet s: Int? = match n {\n0 -> null\n_ -> 1\n}");
  });
  it("a binding arm before any null arm sees the nullable subject", () => {
    expect(errors("let n: Int? = null\nlet s = match n {\nx -> x + 1\n}")[0]).toContain("Variable 'x' may be null");
    clean("let n: Int? = null\nlet s = match n {\nnull -> 0\nx -> x + 1\n}");
  });
  it("lists only add to lists of the same element type", () => {
    expect(errors('print([1] + ["a"])')).toEqual(["1: cannot apply '+' to List<Int> and List<String>. We won't guess."]);
    clean("print([1] + [2])");
  });
  it("String + Int suggests converting the right operand, in order", () => {
    expect(errors('let s = "a"\nprint(s + 1)')).toEqual(["2: cannot add Int and String. Did you mean: s + String(1)? BLESSED will wait. Take your time."]);
  });
  it("fix-its parenthesize nested binary operands", () => {
    expect(errors('let e: String? = null\nprint((e ?? "") + 1)')).toEqual(['2: cannot add Int and String. Did you mean: (e ?? "") + String(1)? BLESSED will wait. Take your time.']);
  });
  it("unary minus only on numbers", () => {
    expect(errors('print(-"a")')).toEqual(["1: cannot negate String. Only numbers have an opposite."]);
  });
  it("Float.round takes 0 or 1 arguments", () => {
    expect(errors("print(1.5.round(1, 2))")).toEqual(["1: round takes 1 argument(s), got 2. Counting is the one thing we agreed on."]);
    clean("print(1.5.round())\nprint(1.5.round(1))");
  });
  it("conversion arguments are checked", () => {
    expect(errors("print(Int(true))")).toEqual(["1: Int() accepts Int, Float, String. Bool is not on the list."]);
    expect(errors('print(Complex("1"))')).toEqual(["1: Complex() accepts Int, Float, Complex. String is not on the list."]);
    expect(errors("print(Float([1]))")).toEqual(["1: Float() accepts Int, Float, String, Complex. List<Int> is not on the list."]);
  });
  it("String(x) accepts a nullable value", () => { clean("let n: Int? = null\nprint(String(n))"); });
  it("duplicate parameter names", () => {
    expect(errors("fn f(a: Int, a: Int) -> Int { a }")).toEqual(["1: 'a' is already declared in this scope. One name, one meaning."]);
  });
  it("map/filter/reduce callbacks are checked against the element type", () => {
    expect(errors('fn d(x: Int) -> Int { x * 2 }\nprint(["a"].map(d))')).toEqual(["2: Expected Fn(String) -> Unknown but got Fn(Int) -> Int. Types are not suggestions."]);
    expect(errors("print([1].filter(fn(x) { x + 1 }))")[0]).toContain("Expected Fn(Int) -> Bool but got Fn(Int) -> Int");
    expect(errors('print([1].reduce(fn(a, x) { "s" }, 0))')[0]).toContain("Expected Fn(Int, Int) -> Int but got Fn(Int, Int) -> String");
  });
  it("nullable values in conditions, indexes, iterables, with, fields", () => {
    expect(errors("let b: Bool? = null\nif b {\n}")[0]).toContain("Variable 'b' may be null");
    expect(errors("let xs: List<Int>? = null\nprint(xs[0])")[0]).toContain("Variable 'xs' may be null");
    expect(errors("let xs: List<Int>? = null\nloop x in xs {\n}")[0]).toContain("Variable 'xs' may be null");
    expect(errors("record P { x: Int }\nlet p: P? = null\nlet q = p with { x: 1 }")[0]).toContain("Variable 'p' may be null");
  });
  it("assigning null to a non-nullable variable", () => {
    expect(errors("let x: Int = 1\nx = null")).toEqual(["2: Variable 'x' of type 'Int' cannot be null. Declare it as 'Int?' to make it nullable."]);
  });
  it("a double-underscore name is still declared, so it does not cascade", () => {
    expect(errors("let __x__ = 1\nprint(__x__)")).toEqual(["1: Double underscores on both sides are not a thing. This is Blessed, not Python."]);
  });
  it("camelCase rename handles digits and other binding forms", () => {
    expect(warnings("let x_1 = 2")).toEqual(["1: Renamed variable 'x_1' to 'x1'. camelCase is the variable convention. You are welcome."]);
    expect(warnings("loop my_item in [1] {\n}")[0]).toContain("Renamed variable 'my_item' to 'myItem'");
    expect(warnings("let n: Int? = 1\nif let my_v = n {\n}")[0]).toContain("Renamed variable 'my_v' to 'myV'");
  });
  it("a semicolon on a tail expression is still flagged", () => {
    expect(warnings("fn f() -> Int {\n1;\n}")).toEqual(["2: Formatter will remove this semicolon. Semicolons are optional. Don't think about it."]);
  });
});
