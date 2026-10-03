import { describe, it, expect } from "vitest";
import { parse } from "../parser";
import { run } from "../interpreter";

const exec = (src: string, opts?: any) => { const { program, errors } = parse(src); expect(errors).toEqual([]); return run(program, opts); };
const out = (src: string) => { const r = exec(src); expect(r.error).toBeUndefined(); return r.stdout; };
const fails = (src: string) => { const r = exec(src); expect(r.error).toBeDefined(); return r.error!; };

describe("interpreter core", () => {
  it("prints literals and interpolation", () => {
    expect(out('print("hi")\nprint(1)\nprint(2.0)\nprint("a${1 + 1}b")')).toEqual(["hi", "1", "2.0", "a2b"]);
  });
  it("let, assign, arithmetic, Int division truncates", () => {
    expect(out("let x = 7\nx = x + 1\nprint(x / 3)\nprint(x % 3)\nprint(-7 / 2)")).toEqual(["2", "2", "-3"]);
  });
  it("Int is arbitrary precision", () => {
    expect(out("let big = 9007199254740993\nprint(big + 1)")).toEqual(["9007199254740994"]);
  });
  it("Int division by zero fails, Float gives Infinity, NaN refused", () => {
    expect(fails("print(1 / 0)")).toContain("Division by zero");
    expect(out("print(1.0 / 0.0)\nprint(-1.0 / 0.0)")).toEqual(["Infinity", "-Infinity"]);
    expect(fails("print(0.0 / 0.0)")).toContain("is not a number");
    expect(fails("print(Infinity - Infinity)")).toContain("is not a number");
  });
  it("mixed Int and String at runtime is an error", () => {
    expect(fails('let xs = [1, "a"]\nloop x in xs {\nprint(x + 1)\n}')).toContain("cannot apply '+' to String and Int");
  });
  it("comparison, and/or short circuit, not", () => {
    expect(out("print(1 < 2 and 2 < 3)\nprint(false and (1 / 0 == 0))\nprint(true or (1 / 0 == 0))\nprint(not true)")).toEqual(["true", "false", "true", "false"]);
  });
  it("== is structural and is is identity", () => {
    expect(out("let a = [1, 2]\nlet b = [1, 2]\nlet c = a\nprint(a == b)\nprint(a is b)\nprint(a is c)")).toEqual(["true", "false", "true"]);
  });
  it("if / else if / else", () => {
    expect(out('let n = 5\nif n < 3 {\nprint("s")\n} else if n < 10 {\nprint("m")\n} else {\nprint("l")\n}')).toEqual(["m"]);
  });
  it("null, ??, if let", () => {
    expect(out('let n: String? = null\nprint(n ?? "none")\nif let v = n {\nprint(v)\n} else {\nprint("was null")\n}\nlet m: String? = "x"\nif let v = m {\nprint(v)\n}')).toEqual(["none", "was null", "x"]);
  });
  it("if let bindings are scoped so names can be reused", () => {
    expect(out('let a: Int? = 1\nlet b: Int? = 2\nif let v = a {\nprint(v)\n}\nif let v = b {\nprint(v)\n}')).toEqual(["1", "2"]);
  });
  it("loop shapes", () => {
    expect(out('loop x in [1, 2] {\nprint(x)\n}\nlet i = 0\nloop i < 2 {\nprint("w${i}")\ni = i + 1\n}')).toEqual(["1", "2", "w0", "w1"]);
    expect(out('loop i in 0..3 {\nprint(i)\n}')).toEqual(["0", "1", "2"]);
  });
  it("step budget stops a forever loop", () => {
    expect(fails("loop {\n}")).toContain("1,000,000 steps");
    expect(exec("loop {\n}", { stepBudget: 10 }).steps).toBeLessThanOrEqual(11);
  });
  it("functions, recursion, closures, first-class", () => {
    expect(out("fn fact(n: Int) -> Int {\nif n <= 1 {\nreturn 1\n}\nreturn n * fact(n - 1)\n}\nprint(fact(25))")).toEqual(["15511210043330985984000000"]);
    expect(out("fn adder(n: Int) -> Fn(Int) -> Int {\nreturn fn(x: Int) { x + n }\n}\nlet add2 = adder(2)\nprint(add2(3))")).toEqual(["5"]);
    expect(out("fn id(x: Int) -> Int { x }\nprint(id(4))")).toEqual(["4"]);
  });
  it("recursion limit is a catchable error", () => {
    expect(fails("fn f(n: Int) -> Int {\nreturn f(n + 1)\n}\nf(0)")).toContain("Call depth exceeded 500");
  });
  it("fail and despite errors with as", () => {
    expect(out('loop x in [1, 2, 3] despite errors as e {\nif x == 2 {\nfail "two is bad"\n}\nprint(x)\n}\nprint("done")')).toEqual(["1", "3", "done"]);
    expect(out('loop x in [1, 2] despite errors as e {\nif x == 2 {\nfail "two is bad"\n}\nprint(x)\n}')).toEqual(["1"]);
    expect(out('loop x in [2] despite errors as e {\nfail "bad ${x}"\nprint("not reached")\n}\nprint("ok")')).toEqual(["ok"]);
  });
  it("despite errors as e holds the most recent message, null before any failure, and survives the loop", () => {
    expect(out('loop x in [1, 0, 2] despite errors as e {\nprint("item ${x}, last error: ${e ?? "none"}")\nprint(10 / x)\n}\nprint(e ?? "no errors")')).toEqual([
      "item 1, last error: none", "10", "item 0, last error: none", "item 2, last error: Division by zero. Int is a count and there is no infinite count.", "5", "Division by zero. Int is a count and there is no infinite count.",
    ]);
    expect(out('loop x in [1] despite errors as e {\nprint(x)\n}\nprint(e ?? "clean")')).toEqual(["1", "clean"]);
    expect(out('fn risky(x: Int) -> Int {\nif x == 0 {\nfail "zero"\n}\nreturn 10 / x\n}\nloop x in [0, 5] despite errors as e {\nprint(risky(x))\n}\nprint(e ?? "")')).toEqual(["2", "zero"]);
  });
  it("despite errors also catches runtime errors from called functions", () => {
    expect(out('loop d in [0, 2] despite errors {\nprint(10 / d)\n}')).toEqual(["5"]);
  });
  it("recursion caught by despite", () => {
    expect(out("fn f(n: Int) -> Int {\nreturn f(n + 1)\n}\nloop x in [1] despite errors {\nf(0)\n}\nprint(\"survived\")")).toEqual(["survived"]);
  });
  it("budget not caught by despite", () => {
    expect(fails("loop x in [1] despite errors {\nloop {\n}\n}")).toContain("1,000,000 steps");
  });
  it("uncaught fail becomes RuntimeError", () => {
    expect(fails('fail "nope"')).toBe("RuntimeError: nope");
  });
  it("conversions", () => {
    expect(out('print(String(5))\nprint(Int("42") ?? 0)\nprint(Int("x") ?? -1)\nprint(Float(3))\nprint(Int(3.9))\nprint(Float("2.5") ?? 0.0)')).toEqual(["5", "42", "-1", "3.0", "3", "2.5"]);
    expect(fails("print(Int(Infinity))")).toContain("no infinite count");
    expect(out('print(Float("inf") ?? -1.0)\nprint(Float("nan") ?? -1.0)')).toEqual(["-1.0", "-1.0"]);
  });
  it("complex arithmetic and conversions", () => {
    expect(out("let z = 3 + 4i\nlet w = Complex(2.0)\nprint(z * w)\nprint(z + w)\nprint(z - w)\nprint((3 + 4i) / (1 + 2i))\nprint(-z)")).toEqual(["6 + 8i", "5 + 4i", "1 + 4i", "2.2 - 0.4i", "-3 - 4i"]);
    expect(fails("print((1 + 1i) / 0i)")).toContain("Division by zero");
    expect(out("print(Complex(1) == Complex(1.0))\nprint(Complex(2) == 2 + 0i)")).toEqual(["true", "true"]);
  });
  it("PI and E exist", () => {
    expect(out("print(PI > 3.14 and PI < 3.15)\nprint(E > 2.71 and E < 2.72)")).toEqual(["true", "true"]);
  });
  it("slice bounds are evaluated once for String and List", () => {
    expect(out('fn nx() -> Int {\nprint("called")\nreturn 2\n}\nprint("abcd"[0..nx()])')).toEqual(["called", "ab"]);
    expect(out('fn nx() -> Int {\nprint("called")\nreturn 2\n}\nprint([1, 2, 3][0..nx()])')).toEqual(["called", "[1, 2]"]);
    expect(out('print("abc"[0..20000000])')).toEqual(["abc"]);
  });
  it("runtime unary and conversion errors read cleanly", () => {
    expect(fails('let s = "a"\nprint(-s)')).toBe("RuntimeError: cannot apply '-' to String at runtime. The type was only knowable now, and now we know.");
    expect(fails("print(Int(true))")).toBe("RuntimeError: cannot apply 'Int()' to Bool at runtime. The type was only knowable now, and now we know.");
  });
  it("runtime non-Bool condition does not echo a value", () => {
    expect(fails('let xs = ["Bob"]\nloop x in xs {\nif x {\nprint(1)\n}\n}')).toBe("RuntimeError: Condition is String, not Bool. BLESSED is not interested in truthy/falsy load-bearing conventions that were always wrong. Please make it explicit.");
  });
  it("depth stays balanced after a caught recursion failure", () => {
    expect(out('fn f(n: Int) -> Int {\nreturn f(n + 1)\n}\nfn g(n: Int) -> Int {\nif n == 0 {\nreturn 0\n}\nreturn 1 + g(n - 1)\n}\nloop x in [1] despite errors {\nf(0)\n}\nprint(g(400))')).toEqual(["400"]);
  });
});

describe("interpreter data types", () => {
  it("list index, negative index, slices clamp, out of range fails", () => {
    expect(out('let xs = ["a", "b", "c"]\nprint(xs[0])\nprint(xs[-1])\nprint(xs[0..2])\nprint(xs[1..99])\nprint(xs[2..1])')).toEqual(["a", "c", '["a", "b"]', '["b", "c"]', "[]"]);
    expect(fails("let xs = [1, 2, 3]\nprint(xs[3])")).toContain("Index 3 is out of range for a list of length 3");
  });
  it("negative index out of range", () => {
    expect(fails("let xs = [1, 2, 3]\nprint(xs[-4])")).toContain("Index -4 is out of range");
  });
  it("slice clamps", () => {
    expect(out("let xs = [1, 2, 3]\nprint(xs[-99..2])")).toEqual(["[1, 2]"]);
  });
  it("list element assignment and concatenation", () => {
    expect(out("let xs = [1, 2]\nxs[0] = 9\nprint(xs)\nprint(xs + [3])")).toEqual(["[9, 2]", "[9, 2, 3]"]);
  });
  it("string indexing and slicing", () => {
    expect(out('let s = "hello"\nprint(s[0])\nprint(s[-1])\nprint(s[1..3])')).toEqual(["h", "o", "el"]);
  });
  it("maps: literal, lookup, missing is null, set, Int vs String keys", () => {
    expect(out('let m = {"al": 30, "bo": 25}\nprint(m["al"])\nprint(m["cy"] ?? -1)\nm["cy"] = 40\nprint(m)')).toEqual(["30", "-1", '{"al": 30, "bo": 25, "cy": 40}']);
    expect(out('let m = {1: "one"}\nprint(m[1])\nprint(m)')).toEqual(["one", '{1: "one"}']);
  });
  it("records: construct, field, structural equality, immutability, with", () => {
    const src = "record Point { x: Int, y: Int }\nlet p = Point(y: 2, x: 1)\nprint(p)\nprint(p.x)\nprint(p == Point(x: 1, y: 2))\nprint(p is Point(x: 1, y: 2))\nlet q = p with { x: 3 }\nprint(q)\nprint(p)";
    expect(out(src)).toEqual(["Point(x: 1, y: 2)", "1", "true", "false", "Point(x: 3, y: 2)", "Point(x: 1, y: 2)"]);
    expect(fails("record P { x: Int }\nlet p = P(x: 1)\np.x = 2")).toContain("records do not change");
    expect(fails("record P { x: Int, y: Int }\nlet p = P(x: 1)")).toContain("missing 'y'");
    expect(fails("record P { x: Int }\nlet p = P(x: 1, z: 2)")).toContain("no field 'z'");
    expect(fails("record P { x: Int }\nlet p = P(x: 1)\nprint(p.z)")).toContain("no field 'z'");
  });
  it("records hold functions and nested records", () => {
    expect(out("record Dog { name: String, speak: Fn(String) -> String }\nlet d = Dog(name: \"Rex\", speak: fn(n: String) { \"${n} says woof\" })\nprint(d.speak(d.name))")).toEqual(["Rex says woof"]);
  });
  it("match: literal, binding, guard, record destructuring, wildcard, block body, as expression", () => {
    const src = 'record Point { x: Int, y: Int }\nfn label(v: Int) -> String {\nreturn match v {\n0 -> "zero"\nn if n > 10 -> "big ${n}"\n_ -> "other"\n}\n}\nprint(label(0))\nprint(label(11))\nprint(label(5))\nlet p = Point(x: 0, y: 7)\nprint(match p {\nPoint(x: 0, y: y) -> "axis ${y}"\n_ -> "off"\n})\nlet r = match true {\ntrue -> {\nlet t = "yes"\nt + "!"\n}\nfalse -> "no"\n}\nprint(r)';
    expect(out(src)).toEqual(["zero", "big 11", "other", "axis 7", "yes!"]);
  });
  it("match on String, negative Int literal, and null", () => {
    expect(out('print(match "b" {\n"a" -> 1\n"b" -> 2\n_ -> 0\n})\nprint(match -1 {\n-1 -> "neg"\n_ -> "pos"\n})\nlet n: Int? = null\nprint(match n {\nnull -> "nothing"\nv -> "got ${v}"\n})')).toEqual(["2", "neg", "nothing"]);
  });
  it("ranges as values and in loops", () => {
    expect(out("print(0..3)\nprint(3..3)\nprint(5..2)\nlet n = 2\nprint(0..n + 1)")).toEqual(["[0, 1, 2]", "[]", "[]", "[0, 1, 2]"]);
    expect(fails("print(0..20000000)")).toContain("would not fit");
  });
  it("list of lists is structural", () => {
    expect(out("print([[1], [2]] == [[1], [2]])")).toEqual(["true"]);
  });
  it("mutation inside loop over the list body does not change iteration", () => {
    expect(out("let xs = [1, 2]\nloop x in xs {\nxs[0] = 99\nprint(x)\n}")).toEqual(["1", "2"]);
  });
});
