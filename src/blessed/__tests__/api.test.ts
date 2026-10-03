import { describe, it, expect } from "vitest";
import { formatBlessed, analyzeBlessed, executeBlessed, translatePythonToBlessed, translateTypeScriptToBlessed } from "../index";

describe("public api", () => {
  it("executeBlessed runs a program", () => {
    const r = executeBlessed('let xs = ["a", "b"]\nloop x in xs {\nprint("Hi, ${x}")\n}');
    expect(r.stdout).toEqual(["Hi, a", "Hi, b"]);
    expect(r.errors).toEqual([]);
    expect(typeof r.executionTime).toBe("number");
  });
  it("executeBlessed reports compile errors with header and footer", () => {
    const r = executeBlessed('let x = 5 + "a"');
    expect(r.errors[0]).toBe("--- BLESSED COMPILE ERRORS ---");
    expect(r.errors[1]).toMatch(/^Line 1: CompileError: cannot add Int and String/);
    expect(r.errors.at(-1)).toBe("Execution halted because you did not make the obvious correct choices.");
    expect(r.stdout).toEqual([]);
  });
  it("executeBlessed reports runtime errors and keeps partial stdout", () => {
    const r = executeBlessed('print("a")\nfail "boom"');
    expect(r.stdout).toEqual(["a"]);
    expect(r.errors).toEqual(["RuntimeError: boom"]);
  });
  it("analyzeBlessed splits errors and warnings", () => {
    const r = analyzeBlessed("let user_name = 1;\nprint(user_name + \"a\")");
    expect(r.errors[0]).toMatch(/^Line 2: CompileError: cannot add Int and String/);
    expect(r.warnings.some(w => w.includes("Renamed"))).toBe(true);
    expect(r.warnings.some(w => w.includes("semicolon"))).toBe(true);
  });
  it("analyzeBlessed reports parse errors", () => {
    expect(analyzeBlessed("a === b").errors[0]).toContain("JS scar");
  });
  it("formatBlessed", () => {
    expect(formatBlessed("let x = 1;").formatted).toBe("let x = 1");
    expect(formatBlessed("let x = 1").logs).toEqual(["Formatter finished: Code was already perfectly aligned with the spec."]);
  });
  it("reverse translators still exist", () => {
    expect(translatePythonToBlessed("x = 1")).toBe("let x = 1");
    expect(translateTypeScriptToBlessed("const x: number = 1;")).toContain("let x");
  });
});
