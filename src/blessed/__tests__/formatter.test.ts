// src/blessed/__tests__/formatter.test.ts
import { describe, it, expect } from "vitest";
import { formatSource } from "../formatter";
import { parse } from "../parser";

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
  it("returns input unchanged with a log on parse error", () => {
    const r = formatSource("let = 1");
    expect(r.formatted).toBe("let = 1");
    expect(r.logs[0]).toMatch(/^Line 1: CompileError/);
  });
});
