// src/blessed/__tests__/examples.test.ts
import { describe, it, expect } from "vitest";
import { EXAMPLES } from "../examples";
import { COMMANDMENTS } from "../commandments";
import { executeBlessed, analyzeBlessed, formatBlessed } from "../index";

describe("examples", () => {
  for (const [key, ex] of Object.entries(EXAMPLES)) {
    it(`${key} runs as documented`, () => {
      const r = executeBlessed(ex.code);
      if (ex.expectError) { expect(r.errors.join("\n")).toContain(ex.expectError); }
      else expect(r.errors).toEqual([]);
      expect(r.stdout).toEqual(ex.expectStdout);
    });
    it(`${key} formats idempotently`, () => {
      const once = formatBlessed(ex.code).formatted;
      expect(formatBlessed(once).formatted).toBe(once);
    });
  }
});

describe("commandments", () => {
  it("there are exactly twenty, numbered in order", () => {
    expect(COMMANDMENTS.map(c => c.n)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
  for (const c of COMMANDMENTS) {
    it(`§${c.n} snippet checks and runs`, () => {
      expect(analyzeBlessed(c.snippet).errors).toEqual([]);
      const r = executeBlessed(c.snippet);
      expect(r.errors).toEqual([]);
    });
    it(`§${c.n} example key exists`, () => { if (c.example) expect(EXAMPLES[c.example]).toBeDefined(); });
  }
});
