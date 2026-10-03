import { describe, it, expect } from "vitest";
import { parse } from "../parser";
import { emitPython } from "../translate/python";
import { translateBlessedToPython } from "../index";

const py = (src: string) => { const { program, errors } = parse(src); expect(errors).toEqual([]); return emitPython(program); };

const BDIV = 'def _bdiv(a, b):\n    if b == 0:\n        raise ZeroDivisionError("Division by zero. Int is a count and there is no infinite count.")\n    q = abs(a) // abs(b)\n    return q if (a >= 0) == (b >= 0) else -q\n\ndef _bmod(a, b):\n    if b == 0:\n        raise ZeroDivisionError("Division by zero. Int is a count and there is no infinite count.")\n    return a - b * _bdiv(a, b)\n\n';

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
    expect(py("print(7.0 / 2.0)")).toBe("print(7.0 / 2.0)");
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
    expect(py("let a = 7.0\nlet b = 2.0\nprint(a / b)")).toBe("a = 7.0\nb = 2.0\nprint(a / b)");
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
