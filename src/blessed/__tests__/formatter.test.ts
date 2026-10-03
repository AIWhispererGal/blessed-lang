// src/blessed/__tests__/formatter.test.ts
import { describe, it, expect } from "vitest";
import { formatSource } from "../formatter";

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
  it("returns input unchanged with a log on parse error", () => {
    const r = formatSource("let = 1");
    expect(r.formatted).toBe("let = 1");
    expect(r.logs[0]).toMatch(/^Line 1: CompileError/);
  });
});
