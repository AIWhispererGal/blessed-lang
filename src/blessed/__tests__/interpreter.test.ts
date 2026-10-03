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
});
