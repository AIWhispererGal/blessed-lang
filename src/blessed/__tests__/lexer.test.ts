// src/blessed/__tests__/lexer.test.ts
import { describe, it, expect } from "vitest";
import { tokenize, LexError } from "../lexer";

const kinds = (src: string) => tokenize(src).map(t => `${t.kind}:${t.text}`);

describe("lexer", () => {
  it("lexes let with Int literal", () => {
    expect(kinds("let x = 5")).toEqual(["Keyword:let", "Ident:x", "Op:=", "Int:5", "EOF:"]);
    expect(tokenize("let x = 5")[3].value).toBe(5n);
  });
  it("distinguishes Int, Float, Imag", () => {
    const t = tokenize("1 2.5 3i 4.5i");
    expect(t.map(x => x.kind)).toEqual(["Int", "Float", "Imag", "Imag", "EOF"]);
    expect(t[1].value).toBe(2.5);
    expect(t[2].value).toBe(3);
  });
  it("does not treat `4 i` as imaginary", () => {
    expect(kinds("4 i")).toEqual(["Int:4", "Ident:i", "EOF:"]);
  });
  it("lexes Infinity as a keyword and i as an identifier", () => {
    expect(kinds("Infinity i")).toEqual(["Keyword:Infinity", "Ident:i", "EOF:"]);
  });
  it("lexes multi-char operators", () => {
    expect(kinds("a == b != c <= d >= e ?? f .. g -> h")).toEqual([
      "Ident:a", "Op:==", "Ident:b", "Op:!=", "Ident:c", "Op:<=", "Ident:d", "Op:>=", "Ident:e",
      "Op:??", "Ident:f", "Op:..", "Ident:g", "Op:->", "Ident:h", "EOF:",
    ]);
  });
  it("lexes === as a single Op so the parser can scold", () => {
    expect(kinds("a === b")).toEqual(["Ident:a", "Op:===", "Ident:b", "EOF:"]);
  });
  it("lexes comments and newlines", () => {
    expect(kinds("-- hi\nlet x = 1\n\n\nlet y = 2")).toEqual([
      "Comment:-- hi", "Newline:\n", "Keyword:let", "Ident:x", "Op:=", "Int:1",
      "Newline:\n\n\n", "Keyword:let", "Ident:y", "Op:=", "Int:2", "EOF:",
    ]);
  });
  it("lexes strings with escapes and interpolation parts", () => {
    const [s] = tokenize('"a\\n${x + 1}b\\$"');
    expect(s.kind).toBe("String");
    expect(s.parts![0]).toEqual({ kind: "text", text: "a\n" });
    expect(s.parts![1].kind).toBe("expr");
    expect((s.parts![1] as any).tokens.map((t: any) => t.text)).toEqual(["x", "+", "1", ""]);
    expect(s.parts![2]).toEqual({ kind: "text", text: "b$" });
  });
  it("interpolation nested braces and strings", () => {
    const [s] = tokenize('"${ {"k": 1}["k"] }"');
    expect(s.parts!.length).toBe(1);
    expect((s.parts![0] as any).tokens.map((t: any) => t.kind).join(" ")).toBe("Op String Op Int Op Op String Op EOF");
    expect(() => tokenize('"${ 1 + "')).toThrow(LexError);
  });
  it("reports line numbers", () => {
    const t = tokenize("let a = 1\nlet b = 2");
    expect(t.find(x => x.text === "b")!.line).toBe(2);
  });
  it("throws on an unknown character with the line", () => {
    try { tokenize("let x = 1\nlet y = @"); throw new Error("no throw"); }
    catch (e: any) { expect(e).toBeInstanceOf(LexError); expect(e.line).toBe(2); }
  });
  it("throws on an unterminated string", () => {
    expect(() => tokenize('"abc')).toThrow(LexError);
  });
});
