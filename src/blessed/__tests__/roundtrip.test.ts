import { describe, it, expect, afterAll } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EXAMPLES } from "../examples";
import { executeBlessed, translateBlessedToPython, translateBlessedToTypeScript } from "../index";

const has = (cmd: string) => { try { execSync(`${cmd} --version`, { stdio: "ignore" }); return true; } catch { return false; } };
const hasPython = has("python3");
// Temp dir lives outside the repo; tools run with cwd there so repo @types are not loaded.
const dir = mkdtempSync(join(tmpdir(), "blessed-rt-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const bin = (name: string) => resolve(process.cwd(), "node_modules/.bin", name);
const runnable = Object.entries(EXAMPLES).filter(([k]) => k !== "budget");
const TIMEOUT = 120_000;
/** Examples whose emitted program is known to print differently from the interpreter, with the reason. Keep it empty. */
const KNOWN_PRINT_DIFFERENCES: Record<string, string> = {};
const lines = (stdout: string) => stdout === "" ? [] : stdout.replace(/\n$/, "").split("\n");
/** Exercises every printed shape: records (nested, fields given out of order), floats, complex, lists, maps, null, Float(Complex). */
const PRINT_FIDELITY = `record Point { x: Int, y: Float }
record Line { a: Point, b: Point, name: String }
let p = Point(y: 2.0, x: 1)
let l = Line(a: p, b: p with { x: 5 }, name: "diag")
print(p, l)
print(true, false, 0.1 + 0.2, 1.0 / 3.0, 100.0, 1000000000000000000000.0)
let tiny = 0.0000001
print(tiny, tiny * 10.0, 123456789012345678901234.0, 0.000001, -0.5, 2.0.pow(70.0))
let m = {"a": [1, 2], "b": []}
print(m, ["x", "y\\"z"], [1.5, 2.0], [[true]])
let z = 3 + 4i
print(z, -z, 4i, z * z, z.conj(), Complex(2), (1.5 - 2.25i))
let n: Int? = null
print(n ?? 7, String(1.0), String(true), "f=\${1.0} b=\${false} l=\${[1.0]} z=\${z}")
print([1.0, 2.5].join(", "), [true].join("-"), Float(Complex(3)))
print(Infinity, -Infinity, 0.0000001)
loop w in [3 + 4i] despite errors as e {
    print(Float(w))
}
print(e ?? "none")`;

describe("emitted TypeScript type-checks and runs", () => {
  for (const [key, ex] of runnable) {
    it(key, () => {
      const file = join(dir, `${key}.ts`);
      writeFileSync(file, translateBlessedToTypeScript(ex.code));
      const tsc = spawnSync(bin("tsc"), ["--noEmit", "--strict", "--target", "es2020", "--lib", "es2020,dom", file], { encoding: "utf8", cwd: dir });
      expect(tsc.stdout + tsc.stderr).toBe("");
      const node = spawnSync(bin("tsx"), [file], { encoding: "utf8", cwd: dir });
      expect(node.status).toBe(0);
      if (!(key in KNOWN_PRINT_DIFFERENCES)) expect(lines(node.stdout)).toEqual(executeBlessed(ex.code).stdout);
    }, TIMEOUT);
  }
});

describe.skipIf(!hasPython)("emitted Python runs", () => {
  for (const [key, ex] of runnable) {
    it(key, () => {
      const file = join(dir, `${key}.py`);
      writeFileSync(file, translateBlessedToPython(ex.code));
      const py = spawnSync("python3", [file], { encoding: "utf8", cwd: dir });
      expect(py.stderr).toBe("");
      expect(py.status).toBe(0);
      if (!(key in KNOWN_PRINT_DIFFERENCES)) expect(lines(py.stdout)).toEqual(executeBlessed(ex.code).stdout);
    }, TIMEOUT);
  }
});

describe("emitted programs print exactly what the interpreter prints", () => {
  const want = executeBlessed(PRINT_FIDELITY);
  it("the interpreter runs the fidelity program", () => {
    expect(want.errors).toEqual([]);
    expect(want.stdout[want.stdout.length - 1]).toBe("Float(z) only works when z.im == 0.0. Did you mean z.re?");
  });
  it("TypeScript", () => {
    const file = join(dir, "printFidelity.ts");
    writeFileSync(file, translateBlessedToTypeScript(PRINT_FIDELITY));
    const tsc = spawnSync(bin("tsc"), ["--noEmit", "--strict", "--target", "es2020", "--lib", "es2020,dom", file], { encoding: "utf8", cwd: dir });
    expect(tsc.stdout + tsc.stderr).toBe("");
    const node = spawnSync(bin("tsx"), [file], { encoding: "utf8", cwd: dir });
    expect(node.stderr).toBe("");
    expect(lines(node.stdout)).toEqual(want.stdout);
  }, TIMEOUT);
  it.skipIf(!hasPython)("Python", () => {
    const file = join(dir, "printFidelity.py");
    writeFileSync(file, translateBlessedToPython(PRINT_FIDELITY));
    const py = spawnSync("python3", [file], { encoding: "utf8", cwd: dir });
    expect(py.stderr).toBe("");
    expect(lines(py.stdout)).toEqual(want.stdout);
  }, TIMEOUT);
});

describe("emitted TypeScript: record pattern on a nullable subject", () => {
  const src = `record Point { x: Int, y: Int }
fn find(n: Int) -> Point? {
    if n > 0 {
        return Point(x: n, y: 2)
    }
    return null
}
loop n in [1, 0] {
    print(match find(n) {
        Point(x: x, y: y) -> "point \${x} \${y}"
        null -> "nothing"
        _ -> "other"
    })
}`;
  it("type-checks under --strict and prints what the interpreter prints", () => {
    const file = join(dir, "nullableRecordMatch.ts");
    writeFileSync(file, translateBlessedToTypeScript(src));
    const tsc = spawnSync(bin("tsc"), ["--noEmit", "--strict", "--target", "es2020", "--lib", "es2020,dom", file], { encoding: "utf8", cwd: dir });
    expect(tsc.stdout + tsc.stderr).toBe("");
    const node = spawnSync(bin("tsx"), [file], { encoding: "utf8", cwd: dir });
    expect(node.stderr).toBe("");
    expect(node.stdout.trimEnd().split("\n")).toEqual(executeBlessed(src).stdout);
    expect(executeBlessed(src).stdout).toEqual(["point 1 2", "nothing"]);
  }, TIMEOUT);
});

describe.skipIf(!hasPython)("emitted Python: closures made in a loop keep that iteration's values", () => {
  const src = `let fs: List<Fn() -> Int> = []
loop i in 0..3 {
    let twice = i * 2
    fs = fs.push(fn() { i })
    fs = fs.push(fn() { twice })
    fn get() -> Int {
        return i + 100
    }
    fs = fs.push(get)
}
loop f in fs {
    print(f())
}`;
  it("runs under python3 and prints what the interpreter prints", () => {
    const want = executeBlessed(src);
    expect(want.errors).toEqual([]);
    expect(want.stdout).toEqual(["0", "0", "100", "1", "2", "101", "2", "4", "102"]);
    const out = translateBlessedToPython(src);
    expect(out).toContain("lambda i=i: i");
    expect(out).toContain("def get(i=i) -> int:");
    const file = join(dir, "loopClosures.py");
    writeFileSync(file, out);
    const py = spawnSync("python3", [file], { encoding: "utf8", cwd: dir });
    expect(py.stderr).toBe("");
    expect(lines(py.stdout)).toEqual(want.stdout);
  }, TIMEOUT);
});
