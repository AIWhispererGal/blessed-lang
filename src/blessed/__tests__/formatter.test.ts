// src/blessed/__tests__/formatter.test.ts
import { describe, it, expect } from "vitest";
import { formatSource } from "../formatter";
import { parse } from "../parser";
import { executeBlessed } from "../index";
import { EXAMPLES } from "../examples";
import { COMMANDMENTS } from "../commandments";

const fmt = (s: string) => formatSource(s).formatted;

describe("formatter", () => {
  it("normalises indentation to four spaces and strips semicolons", () => {
    expect(formatSource("let x = 1;\nif x == 1 {\n  print(x);\n}").formatted).toBe("let x = 1\nif x == 1 {\n    print(x)\n}");
    expect(formatSource("let x = 1;").logs[0]).toContain("vaporized 1 time(s)");
  });
  it("renames snake_case lets and their uses", () => {
    const r = formatSource("let user_name = \"a\"\nprint(user_name)");
    expect(r.formatted).toBe('let userName = "a"\nprint(userName)');
    expect(r.logs[0]).toContain("Renamed variable 'user_name' to 'userName'");
  });
  it("keeps SCREAMING_SNAKE constants", () => { expect(fmt("let MAX_SIZE = 1")).toBe("let MAX_SIZE = 1"); });
  it("preserves comments and single blank lines", () => {
    expect(fmt("-- a\n\n\n\nlet x = 1 -- t\n\n\nlet y = 2\n-- end")).toBe("-- a\nlet x = 1 -- t\n\nlet y = 2\n-- end");
  });
  it("formats every construct", () => {
    const src = `record Point { x: Int, y: Int }
fn dist(p: Point) -> Float {
return (Float(p.x * p.x + p.y * p.y)).sqrt()
}
let p = Point(x: 3, y: 4)
let q = p with { x: 0 }
let m: Map<String, Int> = {"a": 1}
let n: String? = null
if let v = n {
print(v)
} else if p.x > 1 {
print("big")
} else {
print(n ?? "none")
}
loop i in 0..3 despite errors as e {
print(match i {
0 -> "zero"
k if k > 1 -> "many"
Point(x: 0, y: y) -> "p"
_ -> {
let s = "o"
s
}
})
}
loop {
fail "stop"
}
let z = 3 + 4i
let f = fn(x: Int) { x * -2 }
print([1, 2][0..1], not true, -Infinity, (1 + 2) * 3, "s\${z.re}")`;
    const expected = `record Point { x: Int, y: Int }

fn dist(p: Point) -> Float {
    return Float(p.x * p.x + p.y * p.y).sqrt()
}

let p = Point(x: 3, y: 4)
let q = p with { x: 0 }
let m: Map<String, Int> = {"a": 1}
let n: String? = null
if let v = n {
    print(v)
} else if p.x > 1 {
    print("big")
} else {
    print(n ?? "none")
}
loop i in 0..3 despite errors as e {
    print(match i {
        0 -> "zero"
        k if k > 1 -> "many"
        Point(x: 0, y: y) -> "p"
        _ -> {
            let s = "o"
            s
        }
    })
}
loop {
    fail "stop"
}
let z = 3 + 4i
let f = fn(x: Int) { x * -2 }
print([1, 2][0..1], not true, -Infinity, (1 + 2) * 3, "s\${z.re}")`;
    expect(fmt(src)).toBe(expected);
  });
  it("format is idempotent on every example", async () => {
    const path = "../examples";
    const { EXAMPLES } = (await import(/* @vite-ignore */ path).catch(() => ({ EXAMPLES: {} }))) as { EXAMPLES: Record<string, { code: string }> };
    for (const ex of Object.values(EXAMPLES)) { const once = fmt(ex.code); expect(fmt(once)).toBe(once); }
    const once = fmt("let a = 1\n\n\n-- c\nlet b = [\n1,\n2\n]");
    expect(fmt(once)).toBe(once);
  });
  it("keeps block-end comments inside the block", () => {
    const a = "fn f() {\nlet x = 1\n-- end\n}";
    expect(fmt(a)).toBe("fn f() {\n    let x = 1\n    -- end\n}");
    expect(fmt(fmt(a))).toBe(fmt(a));
    const b = "if a {\n-- only\n}";
    expect(fmt(b)).toBe("if a {\n    -- only\n}");
    expect(fmt(fmt(b))).toBe(fmt(b));
  });
  it("parenthesises ranges by precedence", () => {
    expect(fmt("let a = (0..3).map(f)")).toBe("let a = (0..3).map(f)");
    expect(fmt("loop i in 0..3 {\nprint(i)\n}")).toBe("loop i in 0..3 {\n    print(i)\n}");
    expect(fmt("let a = xs[0..1]")).toBe("let a = xs[0..1]");
  });
  it("keeps innerComments in else-if and else blocks", () => {
    const a = "if a {\n-- only\n} else if b {\n-- two\n} else {\n-- three\n}";
    const once = fmt(a);
    expect(once).toBe("if a {\n    -- only\n} else if b {\n    -- two\n} else {\n    -- three\n}");
    expect(fmt(once)).toBe(once);
  });
  it("parenthesises unary operands in postfix contexts", () => {
    for (const s of ["let a = (-1).abs()", "let a = (not b).c", "let a = (-x)[0]", "let a = -x * 2", "let a = x * -2"]) expect(fmt(s)).toBe(s);
  });
  it("threads indentation into nested lambdas", () => {
    const s = "if true {\n    let y = xs.map(fn(z) {\n        let w = z\n        w\n    })\n}";
    expect(fmt(s)).toBe(s);
  });
  it("parenthesises a range on the left of a range", () => {
    expect(fmt("let r = (a..b)..c")).toBe("let r = (a..b)..c");
  });
  it("renames every declaration site and use consistently", () => {
    const src = "let n = null\nif let user_name = n {\nprint(user_name)\n}\nloop my_item in xs {\nprint(my_item)\n}\nlet f = fn(a_b) {\nlet inner_var = a_b\ninner_var\n}\nlet g = match n {\nsome_x -> some_x\n}";
    const r = formatSource(src);
    expect(r.formatted).toBe("let n = null\nif let userName = n {\n    print(userName)\n}\nloop myItem in xs {\n    print(myItem)\n}\nlet f = fn(aB) {\n    let innerVar = aB\n    innerVar\n}\nlet g = match n {\n    someX -> someX\n}");
    expect(r.logs.filter(l => l.startsWith("Formatter Warning")).length).toBe(5);
    expect(parse(r.formatted).errors).toEqual([]);
    expect(fmt(r.formatted)).toBe(r.formatted);
  });
  it("renames only declared variables, not functions or undeclared calls", () => {
    const r = formatSource("fn my_fn(a_b: Int) -> Int {\n    return a_b\n}\nprint(my_fn(1))");
    expect(r.formatted).toBe("fn my_fn(aB: Int) -> Int {\n    return aB\n}\n\nprint(my_fn(1))");
    expect(parse(r.formatted).errors).toEqual([]);
    const u = formatSource("print(some_fn(2))");
    expect(u.formatted).toBe("print(some_fn(2))");
    expect(u.logs).toEqual([]);
    const f = formatSource("let my_field = 1\nprint(p.my_field, my_field)");
    expect(f.formatted).toBe("let myField = 1\nprint(p.my_field, myField)");
  });
  it("returns input unchanged with a log on parse error", () => {
    const r = formatSource("let = 1");
    expect(r.formatted).toBe("let = 1");
    expect(r.logs[0]).toMatch(/^Line 1: CompileError/);
  });
});

describe("format then re-run", () => {
  const TRICKY: [string, string][] = [
    ["complex in operator position", "let z = Complex(2) * (3 + 4i)\nprint(z, (3 + 4i).abs(), (1 + 2i) - (3 + 4i))"],
    ["negated complex", "print(-(3 + 4i), -(4i))"],
    ["long float", "print(3.141592653589793, 0.1 + 0.2 == 0.30000000000000004)"],
    ["huge and tiny floats", "print(0.0000001 * 10000000.0, 123456789012345678901234567890.0 / 1000000000000000000000000000.0)"],
    ["tiny complex", "print(0.0000001i * 10000000.0i)"],
    ["parenthesised with", "record P { x: Int }\nlet p = P(x: 1)\nlet q = P(x: 3)\nprint((p with { x: 3 }) == q, (p with { x: 9 }).x)"],
    ["range of a range start", "let a = 1\nlet b = 3\nprint((0..2).length, (a..b).map(fn(i: Int) { i * 2 }))"],
    ["negative receiver", "print((-1).abs(), (-2.5).abs())"],
  ];
  const cases: [string, string][] = [
    ...Object.entries(EXAMPLES).filter(([k]) => k !== "budget").map(([k, ex]) => [`example ${k}`, ex.code] as [string, string]),
    ...COMMANDMENTS.map(c => [`commandment ${c.n}`, c.snippet] as [string, string]),
    ...TRICKY,
  ];
  for (const [name, src] of cases) {
    it(name, () => {
      const before = executeBlessed(src); const formatted = fmt(src); const after = executeBlessed(formatted);
      expect(before.errors).toEqual([]);
      expect(after.errors).toEqual([]);
      expect(after.stdout).toEqual(before.stdout);
    });
  }
  it("float literals print exactly, without exponent form", () => {
    expect(fmt("let a = 3.141592653589793\nlet b = 0.0000001\nlet c = 100000000000000000000000.0")).toBe("let a = 3.141592653589793\nlet b = 0.0000001\nlet c = 100000000000000000000000.0");
    expect(fmt("let z = (3 + 4i).abs()\nlet w = -(3 + 4i)\nlet v = 2 * (1 - 2i)")).toBe("let z = (3 + 4i).abs()\nlet w = -(3 + 4i)\nlet v = 2 * (1 - 2i)");
    expect(fmt("let t = (p with { x: 3 }) == q\nlet u = (p with { x: 9 }).x")).toBe("let t = (p with { x: 3 }) == q\nlet u = (p with { x: 9 }).x");
  });
});

describe("formatter and checker agree on renames", () => {
  it("uses the same camelCase rule as the checker", async () => {
    const { analyzeBlessed } = await import("../index");
    for (const [from, to] of [["a_1", "a1"], ["my__var", "myVar"], ["user_Name", "userName"]] as const) {
      const r = formatSource(`let ${from} = 1\nprint(${from})`);
      expect(r.formatted).toBe(`let ${to} = 1\nprint(${to})`);
      expect(r.logs[0]).toContain(`Renamed variable '${from}' to '${to}'`);
      expect(analyzeBlessed(`let ${from} = 1`).warnings[0]).toContain(`Renamed variable '${from}' to '${to}'`);
    }
  });
  it("skips a rename onto a name that already exists, with a note", () => {
    const src = "let my_x = 1\nlet myX = 2\nprint(my_x + myX)";
    const r = formatSource(src);
    expect(r.formatted).toBe(src);
    expect(r.logs).toEqual(["Formatter Notice: Would have renamed 'my_x' to 'myX', but 'myX' already exists. BLESSED does not do collisions."]);
    const f = formatSource("fn myX() -> Int {\n    return 1\n}\nlet my_x = 2\nprint(my_x)");
    expect(f.formatted).toContain("let my_x = 2");
  });
});

describe("formatter never drops comments", () => {
  it("leaves the source unchanged when a comment lives inside an expression", () => {
    const src = "let xs = [\n    1, -- the first\n    2\n]\nprint(xs);";
    const r = formatSource(src);
    expect(r.formatted).toBe(src);
    expect(r.logs).toEqual(["Formatter Notice: Some comments live inside expressions, where the formatter cannot yet follow them. Nothing was changed. Your comments are safe."]);
  });
  it("still formats when every comment has a place", () => {
    expect(formatSource("let x = 1; -- keep\n-- also\nprint(x)").formatted).toBe("let x = 1 -- keep\n-- also\nprint(x)");
  });
});
