import { describe, it, expect } from "vitest";
import { parse } from "../parser";
import { emitPython } from "../translate/python";
import { emitTypeScript } from "../translate/typescript";
import { translateBlessedToPython, translateBlessedToTypeScript } from "../index";

const py = (src: string) => { const { program, errors } = parse(src); expect(errors).toEqual([]); return emitPython(program); };

const BDIV = 'def _bdiv(a, b):\n    if b == 0:\n        raise ZeroDivisionError("Division by zero. Int is a count and there is no infinite count.")\n    q = abs(a) // abs(b)\n    return q if (a >= 0) == (b >= 0) else -q\n\ndef _bmod(a, b):\n    if b == 0:\n        raise ZeroDivisionError("Division by zero. Int is a count and there is no infinite count.")\n    return a - b * _bdiv(a, b)\n\n';

const FDIV = 'import math\n\ndef _fdiv(a, b):\n    if b == 0.0:\n        if a == 0.0:\n            raise ArithmeticError("0.0 / 0.0 is not a number. We will not pretend it is.")\n        return math.inf if (a > 0) == (math.copysign(1.0, b) > 0) else -math.inf\n    return a / b\n\n';

describe("python emitter", () => {
  it("hello world", () => {
    expect(py('-- hello.blessed\nlet recipients = ["World", "Nurse"]\n\nloop r in recipients {\n    print("Hello, ${r}!")\n}')).toBe(
      '# hello.blessed\nrecipients = ["World", "Nurse"]\n\nfor r in recipients:\n    print(f"Hello, {r}!")');
  });
  it("types, null, ??, if let", () => {
    expect(py('let n: String? = null\nprint(n ?? "x")\nif let v = n {\n    print(v)\n} else {\n    print("none")\n}')).toBe(
      'from typing import Optional\n\nn: Optional[str] = None\nprint((n if n is not None else "x"))\nv = n\nif v is not None:\n    print(v)\nelse:\n    print("none")');
  });
  it("if / else if, loops, despite errors, fail", () => {
    expect(py('let i = 0\nloop i < 2 {\n    i = i + 1\n}\nloop {\n    fail "stop"\n}\nloop x in [1, 2] despite errors as e {\n    if x == 2 {\n        fail "two"\n    } else if x == 1 {\n        print(x)\n    } else {\n        print("no")\n    }\n}')).toBe(
      'i = 0\nwhile i < 2:\n    i = i + 1\nwhile True:\n    raise Exception("stop")\ne = None\nfor x in [1, 2]:\n    try:\n        if x == 2:\n            raise Exception("two")\n        elif x == 1:\n            print(x)\n        else:\n            print("no")\n    except Exception as _err:\n        e = str(_err)');
  });
  it("Int division helpers appear only when used", () => {
    expect(py("print(7 / 2)\nprint(-7 % 2)")).toBe(BDIV + 'print(_bdiv(7, 2))\nprint(_bmod(-7, 2))');
    expect(py("print(7.0 / 2.0)")).toBe(FDIV + "print(_fdiv(7.0, 2.0))");
  });
  it("Float division and NaN-capable arithmetic are checked; PI and E map to math", () => {
    const out = py("print(1.0 / 0.0)");
    expect(out).toContain("_fdiv(1.0, 0.0)");
    expect(out).toContain("def _fdiv(a, b):");
    const sub = py("let i = Infinity\nprint(i - i)");
    expect(sub).toContain("def _fcheck(x):");
    expect(sub).toContain("_fcheck(i - i)");
    expect(py("print(PI)")).toBe("import math\n\nprint(math.pi)");
  });
  it("functions, lambdas, records, with, match", () => {
    const src = 'record Point { x: Int, y: Int }\nfn norm(p: Point) -> Int {\n    return p.x * p.x + p.y * p.y\n}\nlet p = Point(x: 3, y: 4)\nlet q = p with { x: 0 }\nlet double = fn(n: Int) { n * 2 }\nlet label = match norm(p) {\n    25 -> "five"\n    n if n > 100 -> "big"\n    _ -> "other"\n}\nprint(match q {\n    Point(x: 0, y: yy) -> "axis ${yy}"\n    _ -> "off"\n})';
    expect(py(src)).toBe(
      'from dataclasses import dataclass, replace\n\n@dataclass(frozen=True)\nclass Point:\n    x: int\n    y: int\n\ndef norm(p: Point) -> int:\n    return p.x * p.x + p.y * p.y\n\np = Point(x=3, y=4)\nq = replace(p, x=0)\ndouble = lambda n: n * 2\nmatch norm(p):\n    case 25:\n        label = "five"\n    case n if n > 100:\n        label = "big"\n    case _:\n        label = "other"\ndef _match_1(_subject):\n    match _subject:\n        case Point(x=0, y=yy):\n            return f"axis {yy}"\n        case _:\n            return "off"\nprint(_match_1(q))');
  });
  it("ranges, slices, negative index, complex, infinity, lists and maps, methods", () => {
    expect(py('let xs = [3, 1, 2]\nprint(xs[-1], xs[0..2], 0..3)\nlet m = {"a": 1}\nprint(m["a"] ?? 0, m.has("a"), xs.length, xs.sort(), xs.map(fn(x) { x * 2 }), "a,b".split(","), 2.pow(10), 3 + 4i, Infinity, (2.0).sqrt())')).toBe(
      'import math\n\nxs = [3, 1, 2]\nprint(xs[-1], xs[0:2], list(range(0, 3)))\nm = {"a": 1}\nprint((m.get("a") if m.get("a") is not None else 0), ("a" in m), len(xs), sorted(xs), list(map(lambda x: x * 2, xs)), "a,b".split(","), 2 ** 10, complex(3, 4), math.inf, math.sqrt(2.0))');
  });

  // ---- checker-typed decisions
  it("Int vs Float division is decided by checker types, not names", () => {
    expect(py("let a = 7\nlet b = 2\nprint(a / b)")).toBe(BDIV + "a = 7\nb = 2\nprint(_bdiv(a, b))");
    expect(py("let a = 7.0\nlet b = 2.0\nprint(a / b)")).toBe(FDIV + "a = 7.0\nb = 2.0\nprint(_fdiv(a, b))");
    expect(py("let a = 7.5\nprint(a % 2.0)")).toBe("import math\n\na = 7.5\nprint(math.fmod(a, 2.0))");
  });
  it("map lookups use .get() by type; list indexing does not", () => {
    expect(py('let scores = {"a": 1}\nlet xs = [1]\nprint(scores["a"] ?? 0, xs[0])')).toBe(
      'scores = {"a": 1}\nxs = [1]\nprint((scores.get("a") if scores.get("a") is not None else 0), xs[0])');
  });
  it("Int(String) and Float(String) return null on bad input; ?? on a call evaluates it once", () => {
    expect(py('let s = "42"\nprint(Int(s) ?? 0)\nprint(Int(4.7))')).toBe(
      'import re\n\ndef _bint(s):\n    s = s.strip()\n    return int(s) if re.fullmatch(r"-?[0-9]+", s) else None\n\ns = "42"\nprint((_n1 if (_n1 := _bint(s)) is not None else 0))\nprint(int(4.7))');
  });
  it("join, map and filter over a ?? with a call stay valid Python (no walrus in a comprehension iterable)", () => {
    expect(py('fn g() -> List<Int>? {\n    return null\n}\nprint((g() ?? [2]).join(","))\nprint((g() ?? [3]).map(fn(x) { x + 1 }).filter(fn(x) { x > 1 }))')).toBe(
      'from typing import Optional\n\ndef g() -> Optional[list[int]]:\n    return None\n\nprint(",".join(map(str, (_n1 if (_n1 := g()) is not None else [2]))))\nprint(list(filter(lambda x: x > 1, list(map(lambda x: x + 1, (_n2 if (_n2 := g()) is not None else [3]))))))');
  });
  it("Complex methods use cmath", () => {
    expect(py("print((3 + 4i).sqrt())")).toBe("import cmath\n\nprint(cmath.sqrt(complex(3, 4)))");
  });

  // ---- statements and scoping
  it("assigning an outer variable inside a function declares it global", () => {
    expect(py("let count = 0\nfn bump() {\n    count = count + 1\n}\nbump()")).toBe(
      "count = 0\n\ndef bump():\n    global count\n    count = count + 1\n\nbump()");
  });
  it("functions called before their declaration are moved above the code that calls them", () => {
    expect(py("print(sq(3))\nfn sq(n: Int) -> Int {\n    return n * n\n}")).toBe(
      "def sq(n: int) -> int:\n    return n * n\n\nprint(sq(3))");
  });
  it("match in return position is an inline match statement", () => {
    expect(py('fn f(n: Int) -> String {\n    return match n {\n        0 -> "zero"\n        _ -> "many"\n    }\n}')).toBe(
      'def f(n: int) -> str:\n    match n:\n        case 0:\n            return "zero"\n        case _:\n            return "many"');
  });
  it("nested empty blocks inside match arms keep their pass", () => {
    expect(py('let x = match 1 {\n    1 -> {\n        if true {\n        }\n        "a"\n    }\n    _ -> "b"\n}')).toBe(
      'match 1:\n    case 1:\n        if True:\n            pass\n        x = "a"\n    case _:\n        x = "b"');
  });
  it("ranges in loops use range() directly", () => {
    expect(py("loop i in 0..3 {\n    print(i)\n}")).toBe("for i in range(0, 3):\n    print(i)");
  });
  it("comparisons never chain the Python way", () => {
    expect(py("let a = 1\nprint(a < 2 == true, not a == 1)")).toBe("a = 1\nprint((a < 2) == True, (not a) == 1)");
  });
  it("interpolations containing quotes fall back to str.format", () => {
    expect(py('let m = {"a": 1}\nprint("v=${m["a"]} {x}")')).toBe('m = {"a": 1}\nprint("v={} {{x}}".format(m.get("a")))');
  });

  // ---- comments
  it("comments after the last statement and inside empty blocks", () => {
    expect(py("fn f() {\n    -- nothing yet\n}\nloop {\n    print(1)\n    -- after\n}\nprint(2) -- trailing")).toBe(
      "def f():\n    # nothing yet\n    pass\n\nwhile True:\n    print(1)\n    # after\nprint(2)  # trailing");
  });
});

describe("translateBlessedToPython", () => {
  it("reports parse errors as Python comments", () => {
    expect(translateBlessedToPython("a === b")).toMatch(/^# Line 1: CompileError:/);
  });
});

const ts = (src: string) => { const { program, errors } = parse(src); expect(errors).toEqual([]); return emitTypeScript(program); };

describe("typescript emitter", () => {
  it("hello world", () => {
    expect(ts('-- hello.blessed\nlet recipients = ["World", "Nurse"]\n\nloop r in recipients {\n    print("Hello, ${r}!")\n}')).toBe(
      'export {};\n// hello.blessed\nlet recipients = ["World", "Nurse"];\n\nfor (const r of recipients) {\n    console.log(`Hello, ${r}!`);\n}');
  });
  it("types, Int as bigint, nullable, ??, if let", () => {
    expect(ts('let n: String? = null\nlet k: Int = 5\nprint(n ?? "x")\nif let v = n {\n    print(v)\n}')).toBe(
      'export {};\nlet n: string | null = null;\nlet k: bigint = 5n;\nconsole.log(n ?? "x");\n{\n    const v = n;\n    if (v !== null) {\n        console.log(v);\n    }\n}');
  });
  it("structural equality uses a helper; is uses ===", () => {
    expect(ts("let a = [1]\nprint(a == [1], a is a)")).toBe(
      'export {};\nfunction blessedEq(a: unknown, b: unknown): boolean {\n    if (a === b) return true;\n    if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;\n    if (Array.isArray(a) !== Array.isArray(b)) return false;\n    if (a instanceof Map && b instanceof Map) return a.size === b.size && [...a].every(([k, v]) => b.has(k) && blessedEq(v, b.get(k)));\n    const ka = Object.keys(a as object), kb = Object.keys(b as object);\n    return ka.length === kb.length && ka.every(k => blessedEq((a as any)[k], (b as any)[k]));\n}\n\nlet a = [1n];\nconsole.log(blessedEq(a, [1n]), a === a);');
  });
  it("loops, despite errors, fail, if chain, Int division", () => {
    expect(ts('let i = 0\nloop i < 2 {\n    i = i + 1\n}\nloop x in [1, 2] despite errors as e {\n    if x == 2 {\n        fail "two"\n    } else if x == 1 {\n        print(7 / x)\n    } else {\n        print("no")\n    }\n}')).toBe(
      'export {};\nfunction blessedDiv(a: bigint, b: bigint): bigint {\n    if (b === 0n) throw new Error("Division by zero. Int is a count and there is no infinite count.");\n    return a / b;\n}\n\nlet i = 0n;\nwhile (i < 2n) {\n    i = i + 1n;\n}\nlet e: string | null = null;\nfor (const x of [1n, 2n]) {\n    try {\n        if (x === 2n) {\n            throw new Error("two");\n        } else if (x === 1n) {\n            console.log(blessedDiv(7n, x));\n        } else {\n            console.log("no");\n        }\n    } catch (_blessedErr) {\n        e = _blessedErr instanceof Error ? _blessedErr.message : String(_blessedErr);\n    }\n}');
  });
  it("functions, records, with, match, ranges, complex", () => {
    const src = 'record Point { x: Int, y: Int }\nfn norm(p: Point) -> Int {\n    return p.x * p.x + p.y * p.y\n}\nlet p = Point(x: 3, y: 4)\nlet q = p with { x: 0 }\nlet label = match norm(p) {\n    25 -> "five"\n    n if n > 100 -> "big"\n    _ -> "other"\n}\nprint(match q {\n    Point(x: 0, y: yy) -> "axis ${yy}"\n    _ -> "off"\n})\nloop i in 0..3 {\n    print(i)\n}\nlet z = 3 + 4i\nprint(z.abs(), Infinity, (2.0).sqrt(), [3, 1].sort(), "a,b".split(",").length)';
    expect(ts(src)).toBe(
      'export {};\nfunction blessedRange(a: bigint, b: bigint): bigint[] {\n    const out: bigint[] = [];\n    for (let i = a; i < b; i++) out.push(i);\n    return out;\n}\n\nclass Complex {\n    constructor(public re: number, public im: number) {}\n    add(o: Complex) { return new Complex(this.re + o.re, this.im + o.im); }\n    sub(o: Complex) { return new Complex(this.re - o.re, this.im - o.im); }\n    mul(o: Complex) { return new Complex(this.re * o.re - this.im * o.im, this.re * o.im + this.im * o.re); }\n    div(o: Complex) { const d = o.re * o.re + o.im * o.im; if (d === 0) throw new Error("Division by zero. Int is a count and there is no infinite count."); return new Complex((this.re * o.re + this.im * o.im) / d, (this.im * o.re - this.re * o.im) / d); }\n    abs() { return Math.hypot(this.re, this.im); }\n    arg() { return Math.atan2(this.im, this.re); }\n    conj() { return new Complex(this.re, -this.im); }\n    sqrt() { const r = Math.sqrt(this.abs()), t = this.arg() / 2; return new Complex(r * Math.cos(t), r * Math.sin(t)); }\n    exp() { const m = Math.exp(this.re); return new Complex(m * Math.cos(this.im), m * Math.sin(this.im)); }\n    log() { return new Complex(Math.log(this.abs()), this.arg()); }\n    pow(n: number | bigint) { const k = Number(n), r = this.abs() ** k, t = this.arg() * k; return new Complex(r * Math.cos(t), r * Math.sin(t)); }\n    toString() { return this.re === 0 ? `${this.im}i` : `${this.re} ${this.im < 0 ? "-" : "+"} ${Math.abs(this.im)}i`; }\n}\n\ninterface Point { x: bigint; y: bigint }\nconst Point = (f: Point): Point => ({ ...f });\n\nfunction norm(p: Point): bigint {\n    return p.x * p.x + p.y * p.y;\n}\n\nlet p = Point({ x: 3n, y: 4n });\nlet q = { ...p, x: 0n };\nlet label = ((_s) => {\n    if (_s === 25n) return "five";\n    { const n = _s; if (n > 100n) return "big"; }\n    return "other";\n})(norm(p));\nconsole.log(((_s) => {\n    if (_s.x === 0n) { const yy = _s.y; return `axis ${yy}`; }\n    return "off";\n})(q));\nfor (const i of blessedRange(0n, 3n)) {\n    console.log(i);\n}\nlet z = new Complex(3, 4);\nconsole.log(z.abs(), Infinity, Math.sqrt(2.0), [...[3n, 1n]].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), BigInt("a,b".split(",").length));');
  });
});

describe("translateBlessedToTypeScript", () => {
  it("reports parse errors as TypeScript comments", () => {
    expect(translateBlessedToTypeScript("a === b")).toMatch(/^\/\/ Line 1: CompileError:/);
  });
});

describe("typescript emitter: indexing, ordering, comments", () => {
  const AT = 'function blessedAt<T>(xs: ArrayLike<T>, i: bigint): T {\n    const n = Number(i), j = n < 0 ? xs.length + n : n;\n    if (j < 0 || j >= xs.length) throw new Error(`Index ${i} is out of range for a list of length ${xs.length}. Offsets have edges.`);\n    return xs[j];\n}\n\n';
  const CHECK = 'function blessedCheck(x: number): number {\n    if (Number.isNaN(x)) throw new Error("Result is not a number. We will not pretend it is.");\n    return x;\n}\n\n';
  it("list reads are checked (lib es2020 has no .at); stores and map lookups are not", () => {
    expect(ts('let xs = [1, 2]\nxs[0] = 5\nlet m = {"a": 1}\nm["b"] = 2\nprint(xs[-1], m["a"] ?? 0)')).toBe(
      'export {};\n' + AT + 'let xs = [1n, 2n];\nxs[Number(0n)] = 5n;\nlet m = new Map([["a", 1n]]);\nm.set("b", 2n);\nconsole.log(blessedAt(xs, -1n), (m.get("a") ?? null) ?? 0n);');
  });
  it("declarations used before they appear move to the top (record factories are consts)", () => {
    expect(ts("print(sq(3))\nfn sq(n: Int) -> Int {\n    n * n\n}")).toBe("export {};\nfunction sq(n: bigint): bigint {\n    return n * n;\n}\n\nconsole.log(sq(3n));");
  });
  it("?? never mixes with || unparenthesized", () => {
    expect(ts("let a: Bool? = null\nlet b = true\nprint(b or a ?? false)")).toBe("export {};\nlet a: boolean | null = null;\nlet b = true;\nconsole.log((b || a) ?? false);");
  });
  it("comments in empty blocks, after the last statement, and trailing", () => {
    expect(ts("fn f() {\n    -- nothing yet\n}\nloop {\n    print(1)\n    -- after\n}\nprint(2) -- trailing")).toBe(
      "export {};\nfunction f() {\n    // nothing yet\n}\n\nwhile (true) {\n    console.log(1n);\n    // after\n}\nconsole.log(2n); // trailing");
  });
  it("untyped lambdas get any unless a typed parameter gives context; NaN-capable math is checked", () => {
    expect(ts("let g = fn(x) { x }\nprint([1].map(fn(x) { x + 1 }), (-4.0).sqrt(), (4.0).sqrt())")).toBe(
      'export {};\n' + CHECK + "let g = (x: any) => x;\nconsole.log([1n].map((x) => x + 1n), blessedCheck(Math.sqrt(-4.0)), Math.sqrt(4.0));");
  });
});

describe("typescript emitter: module scope and despite errors", () => {
  it("emits a module, so names like lib.dom globals do not collide", () => {
    expect(ts('let name = "Ada"\nprint(name)')).toBe('export {};\nlet name = "Ada";\nconsole.log(name);');
  });
  it("the catch parameter cannot shadow an errName called err", () => {
    expect(ts('loop v in [1, 0] despite errors as err {\n    print(10 / v)\n}\nprint(err ?? "none")')).toBe(
      'export {};\nfunction blessedDiv(a: bigint, b: bigint): bigint {\n    if (b === 0n) throw new Error("Division by zero. Int is a count and there is no infinite count.");\n    return a / b;\n}\n\nlet err: string | null = null;\nfor (const v of [1n, 0n]) {\n    try {\n        console.log(blessedDiv(10n, v));\n    } catch (_blessedErr) {\n        err = _blessedErr instanceof Error ? _blessedErr.message : String(_blessedErr);\n    }\n}\nconsole.log(err ?? "none");');
  });
});
