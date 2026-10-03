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

describe("emitted TypeScript type-checks and runs", () => {
  for (const [key, ex] of runnable) {
    it(key, () => {
      const file = join(dir, `${key}.ts`);
      writeFileSync(file, translateBlessedToTypeScript(ex.code));
      const tsc = spawnSync(bin("tsc"), ["--noEmit", "--strict", "--target", "es2020", "--lib", "es2020,dom", file], { encoding: "utf8", cwd: dir });
      expect(tsc.stdout + tsc.stderr).toBe("");
      const node = spawnSync(bin("tsx"), [file], { encoding: "utf8", cwd: dir });
      expect(node.status).toBe(0);
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
    }, TIMEOUT);
  }
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
