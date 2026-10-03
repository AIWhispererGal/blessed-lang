import { describe, it, expect } from "vitest";
import { D, formatDiagnostic } from "../diagnostics";

describe("diagnostics", () => {
  it("formats an error with line number", () => {
    expect(formatDiagnostic({ line: 3, severity: "error", message: "x" }))
      .toBe("Line 3: CompileError: x");
  });
  it("formats a warning", () => {
    expect(formatDiagnostic({ line: 1, severity: "warning", message: "y" }))
      .toBe("Line 1: Warning: y");
  });
  it("keeps the triple-equals joke verbatim", () => {
    expect(D.tripleEquals()).toBe(
      "What is '==='? We only need '==' because it actually checks equality. There is no other kind of equality. We do not have the JS scar here."
    );
  });
  it("names both types in the mixed-add message", () => {
    expect(D.cannotAdd("Int", "String", "x", "s")).toBe(
      "cannot add Int and String. Did you mean: String(x) + s? BLESSED will wait. Take your time."
    );
  });
});
