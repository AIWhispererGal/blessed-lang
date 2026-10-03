# BLESSED Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the regex-based BLESSED compiler with a lexer, parser, checker, tree-walking interpreter, formatter, and two AST-based emitters, implementing all twenty commandments with a tested, in-character diagnostic voice.

**Architecture:** `src/blessed/lexer.ts` turns source into tokens; `parser.ts` builds the AST in `ast.ts`; `checker.ts` types and validates it; `interpreter.ts` executes it over the value model in `values.ts` with methods from `stdlib.ts`; `formatter.ts` and `translate/*.ts` pretty-print the same AST. `index.ts` keeps the seven function signatures `App.tsx` already imports. Every user-facing message string lives in `diagnostics.ts`.

**Tech Stack:** TypeScript 5.9, Vite 7, React 19, Vitest (to add), BigInt for Int.

**Spec:** `docs/superpowers/specs/2026-10-03-blessed-engine-design.md`

## Global Constraints

- Public API in `src/blessed/index.ts` keeps these exact signatures: `formatBlessed(code): {formatted, logs}`, `analyzeBlessed(code): {errors, warnings}`, `executeBlessed(code): {stdout, errors, executionTime}`, `translateBlessedToPython(code): string`, `translateBlessedToTypeScript(code): string`, `translatePythonToBlessed(code): string`, `translateTypeScriptToBlessed(code): string`.
- Errors are reported as `Line N: CompileError: <message>` for parse and checker errors, `RuntimeError: <message>` for interpreter errors.
- Every message string is defined in `src/blessed/diagnostics.ts`; no module builds a user-facing message inline.
- Int is BigInt. Int and Float never mix. Float may be Infinity; no operation may yield NaN.
- Step budget 1,000,000; call depth 500; range size limit 10,000,000.
- Four-space indentation in the formatter; no semicolons emitted.
- `npm test` runs vitest once; `npx tsc --noEmit` and `npx vite build` must pass at the end of every task.
- Commit after every task with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` as the last line.

## Review Focus

1. A string literal containing `${` with an unbalanced brace, or a `}` inside a nested string inside interpolation, must produce a parse error at the right line, not hang or mis-split (Task 2 lexer test `interpolation nested braces`).
2. `despite errors` around a body that calls a function that recurses past 500 frames must catch the recursion error and continue, while the step budget must still terminate an infinite loop inside a despite-errors body (Task 5 tests `recursion caught by despite`, `budget not caught by despite`).
3. Negative index out of range `xs[-4]` on a 3-element list, and slice bounds beyond length, must fail or clamp exactly as specified: index fails, slice clamps like Python (Task 6 tests `negative index out of range`, `slice clamps`).
4. Map keys: `{1: "a"}` and `{"1": "a"}` must be distinct and `m[1]` on a String-keyed map must be a checker error, not a silent null (Task 8 test `map key type mismatch`).
5. Formatter idempotence: formatting already-formatted output must produce byte-identical text, including comments and blank lines (Task 9 test `format is idempotent on every example`).

---

## File Structure

```
src/blessed/
  diagnostics.ts        all message strings, keyed functions         (Task 1, grown by later tasks)
  lexer.ts              tokenize(source): Token[]                     (Task 2)
  ast.ts                node types                                    (Task 3)
  parser.ts             parse(source): {program, errors}              (Task 3)
  values.ts             Value union, equals, show, numeric helpers    (Task 4)
  interpreter.ts        run(program, opts): RunResult                 (Tasks 5, 6)
  stdlib.ts             callMethod(value, name, args), getProperty    (Task 7)
  checker.ts            check(program): Diagnostic[]                  (Task 8)
  formatter.ts          format(program): string                       (Task 9)
  index.ts              public API                                    (Task 10)
  translate/
    fromPython.ts       moved from compiler.ts unchanged              (Task 10)
    fromTypescript.ts   moved from compiler.ts unchanged              (Task 10)
    python.ts           emitPython(program): string                   (Task 11)
    typescript.ts       emitTypeScript(program): string               (Task 12)
  examples.ts           shared examples with expected stdout          (Task 13)
  __tests__/
    lexer.test.ts, parser.test.ts, values.test.ts, interpreter.test.ts,
    stdlib.test.ts, checker.test.ts, formatter.test.ts, examples.test.ts,
    translate.test.ts, roundtrip.test.ts
    golden/*.py, golden/*.ts
src/App.tsx             imports examples, new spec cards              (Task 13)
```

---

### Task 1: Test infrastructure and diagnostics module

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/blessed/diagnostics.ts`
- Test: `src/blessed/__tests__/diagnostics.test.ts`

**Interfaces:**
- Produces: `D` object in `diagnostics.ts`, every member a function returning `string`; `Diagnostic` type `{ line: number; severity: 'error' | 'warning'; message: string }`; `formatDiagnostic(d): string` producing `Line N: CompileError: msg` or `Line N: Warning: msg`.

- [ ] **Step 1: Install vitest and rename the package**

```bash
npm install --save-dev vitest@3
node -e '
const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));
p.name="blessed-lang"; p.scripts.test="vitest run"; p.scripts["test:watch"]="vitest";
fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n");'
```

- [ ] **Step 2: Create vitest config**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
```

- [ ] **Step 3: Write the failing test**

```ts
// src/blessed/__tests__/diagnostics.test.ts
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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/blessed/__tests__/diagnostics.test.ts`
Expected: FAIL, cannot resolve `../diagnostics`.

- [ ] **Step 5: Write the diagnostics module**

```ts
// src/blessed/diagnostics.ts
export type Severity = "error" | "warning";
export interface Diagnostic { line: number; severity: Severity; message: string }

export function formatDiagnostic(d: Diagnostic): string {
  return d.severity === "error"
    ? `Line ${d.line}: CompileError: ${d.message}`
    : `Line ${d.line}: Warning: ${d.message}`;
}

export const D = {
  // lexer / parser
  unexpectedChar: (c: string) => `Unexpected character '${c}'. BLESSED read the whole alphabet and this was not in it.`,
  unterminatedString: () => `Unterminated string. The quote opened and nothing closed it. Closure matters.`,
  unterminatedInterpolation: () => `Unterminated '\${' in string. Every opening deserves a closing brace.`,
  expected: (what: string, got: string) => `Expected ${what} but found ${got}.`,
  tripleEquals: () => `What is '==='? We only need '==' because it actually checks equality. There is no other kind of equality. We do not have the JS scar here.`,
  positionalRecordArgs: (name: string) => `${name}(...) needs named fields. Positional arguments were always a guessing game. Did you mean: ${name}(field: value)?`,
  letNeedsInit: (name: string) => `'let ${name}' needs a value. A variable with no value is a promise with no plan.`,
  // checker
  undefinedName: (n: string) => `'${n}' is not defined. BLESSED checked everywhere. Twice.`,
  redeclared: (n: string) => `'${n}' is already declared in this scope. One name, one meaning.`,
  constReassign: (n: string) => `'${n}' is SCREAMING_SNAKE, which means constant. It does not change. That is the whole point of screaming.`,
  notBool: (t: string, cond: string) =>
    t === "String" ? `String is not Bool. Did you mean: if ${cond} != ""?`
    : t === "Int" || t === "Float" ? `${t} is not Bool. Did you mean: if ${cond} > 0?`
    : `Condition is ${t}, not Bool. BLESSED is not interested in truthy/falsy load-bearing conventions that were always wrong. Please make it explicit.`,
  cannotAdd: (a: string, b: string, x: string, y: string) => `cannot add ${a} and ${b}. Did you mean: String(${x}) + ${y}? BLESSED will wait. Take your time.`,
  cannotOperate: (op: string, a: string, b: string) => `cannot apply '${op}' to ${a} and ${b}. We won't guess.`,
  cannotCompare: (a: string, b: string, x: string, y: string) => `${a} ≠ ${b}. We won't guess. Did you mean: ${x} == ${a}(${y})?`,
  complexOrder: () => `Complex numbers have no order. Neither does your argument.`,
  complexMix: (x: string) => `Complex only mixes with Complex. Did you mean: Complex(${x})?`,
  isOnValue: (t: string) => `'is' asks whether two things are the same object. ${t} values are not objects. Did you mean '=='?`,
  mayBeNull: (n: string) => `Variable '${n}' may be null. Handle it first. Did you mean '${n} ?? "default"' or using 'if let'?`,
  nullToNonNullable: (n: string, t: string) => `Variable '${n}' of type '${t}' cannot be null. Declare it as '${t}?' to make it nullable.`,
  typeMismatch: (expected: string, got: string) => `Expected ${expected} but got ${got}. Types are not suggestions.`,
  noField: (rec: string, f: string) => `${rec} has no field '${f}'. Records do not improvise.`,
  missingFields: (rec: string, fs: string[]) => `${rec}(...) is missing ${fs.map(f => `'${f}'`).join(", ")}. Every field, every time.`,
  duplicateField: (f: string) => `Field '${f}' given twice. Once was enough.`,
  immutableRecord: (rec: string) => `${rec} is a record and records do not change. Did you mean: let next = value with { field: newValue }?`,
  notExhaustive: () => `This match does not cover every case. Add '_ ->' or a binding arm. BLESSED does not do surprise endings.`,
  armTypeMismatch: (a: string, b: string) => `Match arms disagree: ${a} vs ${b}. One match, one type.`,
  returnOutsideFn: () => `'return' outside a function. Return to where?`,
  failNotString: (t: string) => `'fail' takes a String message, not ${t}. Say what went wrong in words.`,
  lengthIsProperty: () => `'length' is a property, not a call. It is not doing anything. Just write .length.`,
  noMethod: (t: string, m: string) => `${t} has no method '${m}'. BLESSED looked.`,
  noProperty: (t: string, p: string) => `${t} has no property '${p}'.`,
  wrongArgCount: (name: string, want: number, got: number) => `${name} takes ${want} argument(s), got ${got}. Counting is the one thing we agreed on.`,
  notCallable: (t: string) => `${t} is not callable. You cannot ring a number.`,
  notIndexable: (t: string) => `${t} cannot be indexed.`,
  mapKeyType: (want: string, got: string) => `This map has ${want} keys. ${got} is not one of them.`,
  emptyMapNeedsType: () => `'{}' has no way of knowing what it holds. Annotate it: let m: Map<String, Int> = {}`,
  rangeEndsInt: () => `Range ends must be Int. 0.5..1.5 is not a sequence of anything.`,
  negativeIntPow: () => `Int.pow() with a negative exponent is a fraction. Use Float.`,
  cannotInfer: (n: string) => `Cannot infer the type of parameter '${n}'. Annotate it.`,
  doubleUnderscore: () => `Double underscores on both sides are not a thing. This is Blessed, not Python.`,
  leadingUnderscore: () => `Leading underscores are reserved for the compiler's internal use. Please stick to camelCase.`,
  snakeCase: (from: string, to: string) => `Renamed variable '${from}' to '${to}'. camelCase is the variable convention. You are welcome.`,
  semicolon: () => `Formatter will remove this semicolon. Semicolons are optional. Don't think about it.`,
  // runtime
  divByZero: () => `Division by zero. Int is a count and there is no infinite count.`,
  notANumber: (expr: string) => `${expr} is not a number. We will not pretend it is.`,
  indexOutOfRange: (i: string, len: number) => `Index ${i} is out of range for a list of length ${len}. Offsets have edges.`,
  rangeTooBig: () => `That range would not fit in anyone's memory. BLESSED will not pretend otherwise.`,
  stepBudget: () => `Execution exceeded 1,000,000 steps. Either the loop is infinite or the universe is. Check the loop first.`,
  recursionLimit: () => `Call depth exceeded 500. The function called itself more times than anyone has called you.`,
  runtimeType: (op: string, a: string, b: string) => `cannot apply '${op}' to ${a} and ${b} at runtime. The types were only knowable now, and now we know.`,
  intFromInfinity: () => `Int(Infinity) is not a count. There is no infinite count.`,
  floatFromComplex: () => `Float(z) only works when z.im == 0.0. Did you mean z.re?`,
  // formatter
  semicolonsVaporized: (n: number) => `Semicolon detected and vaporized ${n} time(s). Semicolons are optional and the formatter removes them. Suffer no more.`,
  formatterClean: () => `Formatter finished: Code was already perfectly aligned with the spec.`,
  // execution wrapper
  compileHeader: () => `--- BLESSED COMPILE ERRORS ---`,
  compileFooter: () => `Execution halted because you did not make the obvious correct choices.`,
};
```

- [ ] **Step 6: Run tests, tsc**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 4 tests pass, tsc exit 0.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/blessed/diagnostics.ts src/blessed/__tests__/diagnostics.test.ts
git commit -m "test: add vitest and the diagnostics module

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Lexer

**Files:**
- Create: `src/blessed/lexer.ts`
- Test: `src/blessed/__tests__/lexer.test.ts`

**Interfaces:**
- Produces:
```ts
export type TokenKind = "Int" | "Float" | "Imag" | "String" | "Ident" | "Keyword" | "Op" | "Newline" | "Comment" | "EOF";
export interface Token { kind: TokenKind; text: string; line: number; col: number; parts?: StringPart[]; value?: bigint | number }
export type StringPart = { kind: "text"; text: string } | { kind: "expr"; tokens: Token[]; line: number };
export class LexError extends Error { line: number }
export function tokenize(source: string): Token[]   // throws LexError
export const KEYWORDS: ReadonlySet<string>
```
- Comments become `Comment` tokens so the formatter can keep them. `Newline` tokens are emitted once per physical line break (collapsed runs keep a count in `text` as "\n" repeated).

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/blessed/__tests__/lexer.test.ts`
Expected: FAIL, cannot resolve `../lexer`.

- [ ] **Step 3: Write the lexer**

```ts
// src/blessed/lexer.ts
import { D } from "./diagnostics";

export type TokenKind = "Int" | "Float" | "Imag" | "String" | "Ident" | "Keyword" | "Op" | "Newline" | "Comment" | "EOF";
export type StringPart = { kind: "text"; text: string } | { kind: "expr"; tokens: Token[]; line: number };
export interface Token { kind: TokenKind; text: string; line: number; col: number; parts?: StringPart[]; value?: bigint | number }

export class LexError extends Error {
  constructor(public line: number, message: string) { super(message); }
}

export const KEYWORDS: ReadonlySet<string> = new Set([
  "let", "fn", "record", "match", "if", "else", "loop", "in", "despite", "errors", "as",
  "return", "fail", "with", "true", "false", "null", "is", "and", "or", "not", "Infinity",
]);

const OPS3 = ["==="];
const OPS2 = ["==", "!=", "<=", ">=", "??", "..", "->"];
const OPS1 = "+-*/%<>=!(){}[],:.|_";

const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdentChar = (c: string) => /[A-Za-z0-9_]/.test(c);
const isDigit = (c: string) => c >= "0" && c <= "9";

export function tokenize(source: string): Token[] {
  const out: Token[] = [];
  let i = 0, line = 1, col = 1;
  const peek = (o = 0) => source[i + o] ?? "";
  const adv = () => { const c = source[i++]; if (c === "\n") { line++; col = 1; } else col++; return c; };
  const push = (kind: TokenKind, text: string, l: number, c: number, extra?: Partial<Token>) =>
    out.push({ kind, text, line: l, col: c, ...extra });

  while (i < source.length) {
    const c = peek(); const l = line, cl = col;
    if (c === " " || c === "\t" || c === "\r") { adv(); continue; }
    if (c === "\n") {
      let text = "";
      while (peek() === "\n" || peek() === "\r" || peek() === " " || peek() === "\t") {
        const ch = adv(); if (ch === "\n") text += "\n";
      }
      // only emit if the run contained a newline (it did) and is not immediately followed by another newline run
      push("Newline", text, l, cl); continue;
    }
    if (c === "-" && peek(1) === "-") {
      let text = ""; while (i < source.length && peek() !== "\n") text += adv();
      push("Comment", text, l, cl); continue;
    }
    if (isDigit(c)) {
      let text = ""; let isFloat = false;
      while (isDigit(peek())) text += adv();
      if (peek() === "." && isDigit(peek(1))) { isFloat = true; text += adv(); while (isDigit(peek())) text += adv(); }
      if (peek() === "i" && !isIdentChar(peek(1))) { adv(); push("Imag", text + "i", l, cl, { value: Number(text) }); continue; }
      if (isFloat) push("Float", text, l, cl, { value: Number(text) });
      else push("Int", text, l, cl, { value: BigInt(text) });
      continue;
    }
    if (isIdentStart(c)) {
      let text = ""; while (isIdentChar(peek())) text += adv();
      if (text === "_") { push("Op", "_", l, cl); continue; }
      push(KEYWORDS.has(text) ? "Keyword" : "Ident", text, l, cl); continue;
    }
    if (c === '"') { adv(); out.push(lexString(l, cl)); continue; }
    const three = source.slice(i, i + 3), two = source.slice(i, i + 2);
    if (OPS3.includes(three)) { adv(); adv(); adv(); push("Op", three, l, cl); continue; }
    if (OPS2.includes(two)) { adv(); adv(); push("Op", two, l, cl); continue; }
    if (OPS1.includes(c)) { adv(); push("Op", c, l, cl); continue; }
    throw new LexError(l, D.unexpectedChar(c));
  }
  push("EOF", "", line, col);
  return out;

  function lexString(l: number, cl: number): Token {
    const parts: StringPart[] = []; let text = "";
    const flush = () => { if (text) { parts.push({ kind: "text", text }); text = ""; } };
    while (true) {
      if (i >= source.length) throw new LexError(l, D.unterminatedString());
      const ch = adv();
      if (ch === '"') break;
      if (ch === "\\") {
        const e = adv();
        text += e === "n" ? "\n" : e === "t" ? "\t" : e === '"' ? '"' : e === "\\" ? "\\" : e === "$" ? "$" : "\\" + e;
        continue;
      }
      if (ch === "$" && peek() === "{") {
        adv(); flush();
        const startLine = line; let depth = 1; let inner = "";
        while (true) {
          if (i >= source.length) throw new LexError(l, D.unterminatedInterpolation());
          const d = peek();
          if (d === '"') { inner += adv(); while (i < source.length && peek() !== '"') { if (peek() === "\\") inner += adv(); inner += adv(); } if (i >= source.length) throw new LexError(l, D.unterminatedInterpolation()); inner += adv(); continue; }
          if (d === "{") depth++;
          if (d === "}") { depth--; if (depth === 0) { adv(); break; } }
          inner += adv();
        }
        const toks = tokenize(inner).map(t => ({ ...t, line: startLine + t.line - 1 }));
        parts.push({ kind: "expr", tokens: toks, line: startLine });
        continue;
      }
      text += ch;
    }
    flush();
    return { kind: "String", text: "", line: l, col: cl, parts };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/blessed/__tests__/lexer.test.ts && npx tsc --noEmit`
Expected: all pass. String tokens carry their content in `parts`, so their `text` is empty; the nested-braces test therefore compares token kinds.

- [ ] **Step 5: Commit**

```bash
git add src/blessed/lexer.ts src/blessed/__tests__/lexer.test.ts
git commit -m "feat(lexer): tokenize BLESSED including imaginary literals and interpolation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: AST and parser

**Files:**
- Create: `src/blessed/ast.ts`
- Create: `src/blessed/parser.ts`
- Test: `src/blessed/__tests__/parser.test.ts`

**Interfaces:**
- Consumes: `tokenize`, `Token`, `StringPart`, `LexError` from Task 2; `D`, `Diagnostic` from Task 1.
- Produces: everything in `ast.ts` below, and `parse(source: string): { program: Program; errors: Diagnostic[] }`. On the first error the parser stops and returns an empty program with that one error (no recovery; the playground shows one error at a time).

- [ ] **Step 1: Write the AST module**

```ts
// src/blessed/ast.ts
export interface Span { line: number }

export type TypeExpr =
  | { kind: "Named"; name: string; args: TypeExpr[]; span: Span }      // Int, String, List<Int>, Map<String, Int>, Point
  | { kind: "Fn"; params: TypeExpr[]; ret: TypeExpr; span: Span }
  | { kind: "Nullable"; inner: TypeExpr; span: Span };

export type Expr =
  | { kind: "IntLit"; value: bigint; span: Span }
  | { kind: "FloatLit"; value: number; span: Span }                     // Infinity keyword becomes FloatLit(Infinity)
  | { kind: "ComplexLit"; re: number; im: number; span: Span }
  | { kind: "StrLit"; parts: (string | Expr)[]; span: Span }
  | { kind: "BoolLit"; value: boolean; span: Span }
  | { kind: "NullLit"; span: Span }
  | { kind: "Ident"; name: string; span: Span }
  | { kind: "ListLit"; items: Expr[]; span: Span }
  | { kind: "MapLit"; entries: { key: Expr; value: Expr }[]; span: Span }
  | { kind: "Range"; start: Expr; end: Expr; span: Span }
  | { kind: "Unary"; op: "-" | "not"; expr: Expr; span: Span }
  | { kind: "Binary"; op: BinOp; left: Expr; right: Expr; span: Span }
  | { kind: "Call"; callee: Expr; args: Expr[]; named: { name: string; value: Expr }[]; span: Span }
  | { kind: "Index"; obj: Expr; index: Expr; span: Span }
  | { kind: "Field"; obj: Expr; name: string; span: Span }
  | { kind: "Lambda"; params: Param[]; ret?: TypeExpr; body: Stmt[]; span: Span }
  | { kind: "Match"; subject: Expr; arms: MatchArm[]; span: Span }
  | { kind: "With"; target: Expr; fields: { name: string; value: Expr }[]; span: Span };

export type BinOp = "+" | "-" | "*" | "/" | "%" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "and" | "or" | "??" | "is";

export interface Param { name: string; type?: TypeExpr; span: Span }
export interface MatchArm { pattern: Pattern; guard?: Expr; body: Stmt[]; span: Span }   // body: single ExprStmt or block

export type Pattern =
  | { kind: "PLit"; value: Expr; span: Span }                            // IntLit, FloatLit, StrLit (no interpolation), BoolLit, NullLit, ComplexLit, negative numbers
  | { kind: "PBind"; name: string; span: Span }
  | { kind: "PWild"; span: Span }
  | { kind: "PRecord"; name: string; fields: { name: string; pattern: Pattern }[]; span: Span };

export type Stmt = (
  | { kind: "Let"; name: string; type?: TypeExpr; init: Expr }
  | { kind: "Assign"; target: Expr; value: Expr }                          // target: Ident | Index | Field
  | { kind: "ExprStmt"; expr: Expr }
  | { kind: "If"; cond: Expr; then: Stmt[]; else?: Stmt[] }               // else-if is nested If in else
  | { kind: "IfLet"; name: string; expr: Expr; then: Stmt[]; else?: Stmt[] }
  | { kind: "Loop"; shape: "forever" | "while" | "in"; cond?: Expr; item?: string; iter?: Expr; despite?: { errName?: string }; body: Stmt[] }
  | { kind: "FnDecl"; name: string; params: Param[]; ret?: TypeExpr; body: Stmt[] }
  | { kind: "RecordDecl"; name: string; fields: { name: string; type: TypeExpr }[] }
  | { kind: "Return"; expr?: Expr }
  | { kind: "Fail"; expr: Expr }
) & { span: Span; leading: string[]; blankBefore: number; trailing?: string; semicolon?: boolean };

export interface Program { body: Stmt[]; trailingComments: string[] }
```

- [ ] **Step 2: Write the failing parser tests**

```ts
// src/blessed/__tests__/parser.test.ts
import { describe, it, expect } from "vitest";
import { parse } from "../parser";

const ok = (src: string) => { const r = parse(src); expect(r.errors).toEqual([]); return r.program; };
const err = (src: string) => { const r = parse(src); expect(r.errors.length).toBe(1); return r.errors[0]; };
const stmt = (src: string) => ok(src).body[0] as any;
const expr = (src: string) => stmt(src).expr;

describe("parser statements", () => {
  it("let with and without type", () => {
    expect(stmt("let x = 5")).toMatchObject({ kind: "Let", name: "x", init: { kind: "IntLit", value: 5n } });
    expect(stmt("let n: String? = null")).toMatchObject({ kind: "Let", type: { kind: "Nullable", inner: { kind: "Named", name: "String" } } });
    expect(stmt("let m: Map<String, Int> = {}")).toMatchObject({ type: { kind: "Named", name: "Map", args: [{ name: "String" }, { name: "Int" }] } });
  });
  it("let without init is an error", () => {
    expect(err("let x").message).toContain("needs a value");
  });
  it("assignment to ident, index, field", () => {
    expect(stmt("x = 1")).toMatchObject({ kind: "Assign", target: { kind: "Ident" } });
    expect(stmt('m["k"] = 1')).toMatchObject({ kind: "Assign", target: { kind: "Index" } });
    expect(stmt("p.x = 1")).toMatchObject({ kind: "Assign", target: { kind: "Field" } });
  });
  it("if / else if / else", () => {
    const s = stmt("if a {\n} else if b {\n} else {\n}");
    expect(s.kind).toBe("If");
    expect(s.else[0].kind).toBe("If");
    expect(s.else[0].else).toEqual([]);
  });
  it("if let", () => {
    expect(stmt("if let n = nick {\nprint(n)\n}")).toMatchObject({ kind: "IfLet", name: "n", then: [{ kind: "ExprStmt" }] });
  });
  it("four loop shapes plus despite", () => {
    expect(stmt("loop {\n}")).toMatchObject({ kind: "Loop", shape: "forever" });
    expect(stmt("loop x < 3 {\n}")).toMatchObject({ shape: "while", cond: { kind: "Binary", op: "<" } });
    expect(stmt("loop f in fruits {\n}")).toMatchObject({ shape: "in", item: "f", iter: { kind: "Ident", name: "fruits" } });
    expect(stmt("loop f in fruits despite errors {\n}")).toMatchObject({ despite: {} });
    expect(stmt("loop f in fruits despite errors as e {\n}")).toMatchObject({ despite: { errName: "e" } });
    expect(stmt("loop i in 0..10 {\n}")).toMatchObject({ iter: { kind: "Range" } });
  });
  it("fn decl with params and return type", () => {
    expect(stmt("fn add(a: Int, b: Int) -> Int {\nreturn a + b\n}")).toMatchObject({
      kind: "FnDecl", name: "add", params: [{ name: "a" }, { name: "b" }], ret: { name: "Int" }, body: [{ kind: "Return" }],
    });
  });
  it("record decl", () => {
    expect(stmt("record Point { x: Int, y: Int }")).toMatchObject({ kind: "RecordDecl", name: "Point", fields: [{ name: "x" }, { name: "y" }] });
  });
  it("fail", () => {
    expect(stmt('fail "boom"')).toMatchObject({ kind: "Fail", expr: { kind: "StrLit" } });
  });
  it("comments attach to the next statement and blank lines are counted", () => {
    const p = ok("-- one\n-- two\n\n\nlet x = 1 -- tail\n\nlet y = 2\n-- end");
    expect(p.body[0].leading).toEqual(["-- one", "-- two"]);
    expect(p.body[0].trailing).toBe("-- tail");
    expect(p.body[1].blankBefore).toBe(1);
    expect(p.trailingComments).toEqual(["-- end"]);
  });
  it("records semicolons so the checker can warn", () => {
    expect(stmt("let x = 1;").semicolon).toBe(true);
  });
});

describe("parser expressions", () => {
  it("precedence: * over +, comparison over and, ?? lowest", () => {
    expect(expr("1 + 2 * 3")).toMatchObject({ op: "+", right: { op: "*" } });
    expect(expr("a < b and c")).toMatchObject({ op: "and", left: { op: "<" } });
    expect(expr("a ?? b or c")).toMatchObject({ op: "??", right: { op: "or" } });
  });
  it("unary minus and not", () => {
    expect(expr("-x * 2")).toMatchObject({ op: "*", left: { kind: "Unary", op: "-" } });
    expect(expr("not a and b")).toMatchObject({ op: "and", left: { kind: "Unary", op: "not" } });
  });
  it("complex literal folding", () => {
    expect(expr("3 + 4i")).toEqual({ kind: "ComplexLit", re: 3, im: 4, span: { line: 1 } });
    expect(expr("3 - 4i")).toEqual({ kind: "ComplexLit", re: 3, im: -4, span: { line: 1 } });
    expect(expr("4i")).toEqual({ kind: "ComplexLit", re: 0, im: 4, span: { line: 1 } });
    expect(expr("x + 4i")).toMatchObject({ kind: "Binary", op: "+" });
  });
  it("Infinity is a FloatLit", () => {
    expect(expr("Infinity")).toEqual({ kind: "FloatLit", value: Infinity, span: { line: 1 } });
    expect(expr("-Infinity")).toMatchObject({ kind: "Unary", op: "-", expr: { value: Infinity } });
  });
  it("postfix: call, index, slice, field, method", () => {
    expect(expr("f(1, 2)")).toMatchObject({ kind: "Call", args: [{ value: 1n }, { value: 2n }], named: [] });
    expect(expr("xs[0]")).toMatchObject({ kind: "Index", index: { kind: "IntLit" } });
    expect(expr("xs[0..2]")).toMatchObject({ kind: "Index", index: { kind: "Range" } });
    expect(expr("xs[-1]")).toMatchObject({ kind: "Index", index: { kind: "Unary" } });
    expect(expr("p.x")).toMatchObject({ kind: "Field", name: "x" });
    expect(expr("s.upper()")).toMatchObject({ kind: "Call", callee: { kind: "Field", name: "upper" } });
    expect(expr("(0..3).map(fn(n) { n * 2 })")).toMatchObject({ kind: "Call", callee: { kind: "Field", obj: { kind: "Range" } }, args: [{ kind: "Lambda" }] });
  });
  it("named-argument record construction", () => {
    expect(expr("Point(x: 1, y: 2)")).toMatchObject({ kind: "Call", callee: { name: "Point" }, args: [], named: [{ name: "x" }, { name: "y" }] });
    expect(err("let p = Point(1, 2)").message).toContain("named fields");
  });
  it("with", () => {
    expect(expr("p with { x: 3 }")).toMatchObject({ kind: "With", fields: [{ name: "x" }] });
  });
  it("list, map, empty map, string parts", () => {
    expect(expr("[1, 2]")).toMatchObject({ kind: "ListLit", items: [{}, {}] });
    expect(expr('{"a": 1, "b": 2}')).toMatchObject({ kind: "MapLit", entries: [{ key: { kind: "StrLit" } }, {}] });
    expect(expr("{}")).toMatchObject({ kind: "MapLit", entries: [] });
    expect(expr('"a${x}b"')).toMatchObject({ kind: "StrLit", parts: ["a", { kind: "Ident", name: "x" }, "b"] });
  });
  it("lambda with and without types", () => {
    expect(expr("fn(x: Int) -> Int { return x }")).toMatchObject({ kind: "Lambda", params: [{ name: "x", type: { name: "Int" } }], ret: { name: "Int" } });
    expect(expr("fn(x) { x }")).toMatchObject({ kind: "Lambda", params: [{ name: "x" }], body: [{ kind: "ExprStmt" }] });
  });
  it("match with every arm kind", () => {
    const m = expr('match n {\n0 -> "zero"\nx if x > 10 -> "big"\nPoint(x: 0, y: y) -> "axis"\n_ -> { let s = "o"\ns }\n}');
    expect(m.kind).toBe("Match");
    expect(m.arms.map((a: any) => a.pattern.kind)).toEqual(["PLit", "PBind", "PRecord", "PWild"]);
    expect(m.arms[1].guard).toMatchObject({ op: ">" });
    expect(m.arms[2].pattern.fields[1].pattern).toMatchObject({ kind: "PBind", name: "y" });
    expect(m.arms[3].body.length).toBe(2);
  });
  it("negative literal pattern", () => {
    expect(expr("match n {\n-1 -> 0\n_ -> 1\n}").arms[0].pattern).toMatchObject({ kind: "PLit", value: { kind: "Unary" } });
  });
  it("is and ==, and the === scar", () => {
    expect(expr("a is b")).toMatchObject({ op: "is" });
    expect(err("a === b").message).toContain("JS scar");
  });
  it("newlines are allowed inside brackets and after binary operators", () => {
    expect(expr("[\n1,\n2\n]")).toMatchObject({ kind: "ListLit", items: [{}, {}] });
    expect(expr("1 +\n2")).toMatchObject({ op: "+" });
  });
  it("reports the line of an error", () => {
    expect(err("let a = 1\nlet b = (1 + ").line).toBe(2);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/blessed/__tests__/parser.test.ts`
Expected: FAIL, cannot resolve `../parser`.

- [ ] **Step 4: Write the parser**

```ts
// src/blessed/parser.ts
import { tokenize, Token, LexError, StringPart } from "./lexer";
import { D, Diagnostic } from "./diagnostics";
import type { Expr, Stmt, Program, TypeExpr, Param, MatchArm, Pattern, BinOp, Span } from "./ast";

export class ParseError extends Error { constructor(public line: number, message: string) { super(message); } }

export function parse(source: string): { program: Program; errors: Diagnostic[] } {
  try {
    const tokens = tokenize(source);
    const p = new Parser(tokens);
    return { program: p.parseProgram(), errors: [] };
  } catch (e) {
    if (e instanceof LexError || e instanceof ParseError)
      return { program: { body: [], trailingComments: [] }, errors: [{ line: e.line, severity: "error", message: e.message }] };
    throw e;
  }
}

/** Parse a standalone expression from tokens (used for string interpolation). */
export function parseExprTokens(tokens: Token[]): Expr {
  const p = new Parser(tokens);
  p.skipNewlines();
  const e = p.parseExpr();
  p.skipNewlines();
  p.expectKind("EOF");
  return e;
}

const BIN_PREC: Record<string, number> = {
  "??": 1, "or": 2, "and": 3, "==": 4, "!=": 4, "is": 4, "<": 5, "<=": 5, ">": 5, ">=": 5,
  "+": 6, "-": 6, "*": 7, "/": 7, "%": 7,
};

class Parser {
  private i = 0;
  private pendingComments: string[] = [];
  private pendingBlank = 0;
  constructor(private toks: Token[]) {}

  // ---- token helpers
  peek(o = 0): Token { return this.toks[Math.min(this.i + o, this.toks.length - 1)]; }
  next(): Token { return this.toks[this.i++]; }
  at(kind: string, text?: string): boolean { const t = this.peek(); return t.kind === kind && (text === undefined || t.text === text); }
  atOp(text: string) { return this.at("Op", text); }
  atKw(text: string) { return this.at("Keyword", text); }
  fail(msg: string, t: Token = this.peek()): never { throw new ParseError(t.line, msg); }
  describe(t: Token) { return t.kind === "EOF" ? "end of input" : t.kind === "Newline" ? "end of line" : `'${t.text}'`; }
  expectOp(text: string): Token { if (!this.atOp(text)) this.fail(D.expected(`'${text}'`, this.describe(this.peek()))); return this.next(); }
  expectKw(text: string): Token { if (!this.atKw(text)) this.fail(D.expected(`'${text}'`, this.describe(this.peek()))); return this.next(); }
  expectKind(kind: string): Token { if (!this.at(kind)) this.fail(D.expected(kind === "Ident" ? "a name" : kind, this.describe(this.peek()))); return this.next(); }
  span(t: Token = this.peek()): Span { return { line: t.line }; }
  skipNewlines() { while (this.at("Newline") || this.at("Comment")) this.next(); }

  /** Consume newlines and comments between statements; remember comments for the next statement. */
  skipTrivia() {
    while (this.at("Newline") || this.at("Comment")) {
      const t = this.next();
      if (t.kind === "Comment") this.pendingComments.push(t.text);
      else if (this.pendingComments.length === 0) this.pendingBlank = Math.max(this.pendingBlank, t.text.length - 1);
    }
  }

  // ---- program / blocks
  parseProgram(): Program {
    const body: Stmt[] = [];
    this.skipTrivia();
    while (!this.at("EOF")) {
      body.push(this.parseStmt());
      this.skipTrivia();
    }
    const trailingComments = this.pendingComments; this.pendingComments = [];
    return { body, trailingComments };
  }

  parseBlock(): Stmt[] {
    this.expectOp("{");
    const savedC = this.pendingComments, savedB = this.pendingBlank;
    this.pendingComments = []; this.pendingBlank = 0;
    const body: Stmt[] = [];
    this.skipTrivia();
    while (!this.atOp("}")) {
      if (this.at("EOF")) this.fail(D.expected("'}'", "end of input"));
      body.push(this.parseStmt());
      this.skipTrivia();
    }
    this.pendingComments = savedC; this.pendingBlank = savedB;
    this.expectOp("}");
    return body;
  }

  endStmt(s: Stmt) {
    if (this.atOp(";")) { this.next(); s.semicolon = true; }
    if (this.at("Comment")) { s.trailing = this.next().text; }
    if (!(this.at("Newline") || this.at("EOF") || this.atOp("}"))) this.fail(D.expected("end of line", this.describe(this.peek())));
  }

  parseStmt(): Stmt {
    const leading = this.pendingComments, blankBefore = this.pendingBlank;
    this.pendingComments = []; this.pendingBlank = 0;
    const s = this.parseStmtInner();
    s.leading = leading; s.blankBefore = blankBefore;
    this.endStmt(s);
    return s;
  }

  private parseStmtInner(): Stmt {
    const t = this.peek(); const span = this.span(t);
    const base = { span, leading: [], blankBefore: 0 };
    if (this.atKw("let")) {
      this.next();
      const name = this.expectKind("Ident").text;
      let type: TypeExpr | undefined;
      if (this.atOp(":")) { this.next(); type = this.parseType(); }
      if (!this.atOp("=")) this.fail(D.letNeedsInit(name));
      this.next();
      return { ...base, kind: "Let", name, type, init: this.parseExpr() };
    }
    if (this.atKw("if")) {
      this.next();
      if (this.atKw("let")) {
        this.next();
        const name = this.expectKind("Ident").text;
        this.expectOp("=");
        const expr = this.parseExpr();
        const then = this.parseBlock();
        const els = this.parseElse();
        return { ...base, kind: "IfLet", name, expr, then, else: els };
      }
      const cond = this.parseExpr();
      const then = this.parseBlock();
      const els = this.parseElse();
      return { ...base, kind: "If", cond, then, else: els };
    }
    if (this.atKw("loop")) {
      this.next();
      if (this.atOp("{")) return { ...base, kind: "Loop", shape: "forever", body: this.parseBlock() };
      // `loop x in ...` vs `loop cond`
      if (this.at("Ident") && this.peek(1).kind === "Keyword" && this.peek(1).text === "in") {
        const item = this.next().text; this.next();
        const iter = this.parseExpr();
        let despite: { errName?: string } | undefined;
        if (this.atKw("despite")) {
          this.next(); this.expectKw("errors"); despite = {};
          if (this.atKw("as")) { this.next(); despite.errName = this.expectKind("Ident").text; }
        }
        return { ...base, kind: "Loop", shape: "in", item, iter, despite, body: this.parseBlock() };
      }
      const cond = this.parseExpr();
      return { ...base, kind: "Loop", shape: "while", cond, body: this.parseBlock() };
    }
    if (this.atKw("fn") && this.peek(1).kind === "Ident") {
      this.next();
      const name = this.next().text;
      const { params, ret } = this.parseParamsAndRet(true);
      return { ...base, kind: "FnDecl", name, params, ret, body: this.parseBlock() };
    }
    if (this.atKw("record")) {
      this.next();
      const name = this.expectKind("Ident").text;
      this.expectOp("{"); this.skipNewlines();
      const fields: { name: string; type: TypeExpr }[] = [];
      while (!this.atOp("}")) {
        const fname = this.expectKind("Ident").text; this.expectOp(":");
        fields.push({ name: fname, type: this.parseType() });
        this.skipNewlines();
        if (this.atOp(",")) { this.next(); this.skipNewlines(); } else break;
      }
      this.skipNewlines(); this.expectOp("}");
      return { ...base, kind: "RecordDecl", name, fields };
    }
    if (this.atKw("return")) {
      this.next();
      if (this.at("Newline") || this.at("EOF") || this.atOp("}") || this.at("Comment")) return { ...base, kind: "Return" };
      return { ...base, kind: "Return", expr: this.parseExpr() };
    }
    if (this.atKw("fail")) { this.next(); return { ...base, kind: "Fail", expr: this.parseExpr() }; }

    const expr = this.parseExpr();
    if (this.atOp("=")) {
      if (expr.kind !== "Ident" && expr.kind !== "Index" && expr.kind !== "Field") this.fail(D.expected("a variable, index, or field before '='", this.describe(t)), t);
      this.next();
      return { ...base, kind: "Assign", target: expr, value: this.parseExpr() };
    }
    return { ...base, kind: "ExprStmt", expr };
  }

  private parseElse(): Stmt[] | undefined {
    if (!this.atKw("else")) return undefined;
    const t = this.next();
    if (this.atKw("if")) {
      const s = this.parseStmtInner();          // nested If, no trivia handling needed
      return [s];
    }
    void t;
    return this.parseBlock();
  }

  private parseParamsAndRet(typesRequired: boolean): { params: Param[]; ret?: TypeExpr } {
    this.expectOp("("); this.skipNewlines();
    const params: Param[] = [];
    while (!this.atOp(")")) {
      const t = this.expectKind("Ident");
      let type: TypeExpr | undefined;
      if (this.atOp(":")) { this.next(); type = this.parseType(); }
      else if (typesRequired) this.fail(D.expected(`a type for parameter '${t.text}'`, this.describe(this.peek())));
      params.push({ name: t.text, type, span: this.span(t) });
      this.skipNewlines();
      if (this.atOp(",")) { this.next(); this.skipNewlines(); } else break;
    }
    this.skipNewlines(); this.expectOp(")");
    let ret: TypeExpr | undefined;
    if (this.atOp("->")) { this.next(); ret = this.parseType(); }
    return { params, ret };
  }

  // ---- types
  parseType(): TypeExpr {
    const t = this.peek(); const span = this.span(t);
    let ty: TypeExpr;
    if (this.at("Ident", "Fn")) {
      this.next(); this.expectOp("(");
      const params: TypeExpr[] = [];
      while (!this.atOp(")")) { params.push(this.parseType()); if (this.atOp(",")) this.next(); else break; }
      this.expectOp(")"); this.expectOp("->");
      ty = { kind: "Fn", params, ret: this.parseType(), span };
    } else {
      const name = this.expectKind("Ident").text;
      const args: TypeExpr[] = [];
      if (this.atOp("<")) {
        this.next();
        while (!this.atOp(">")) { args.push(this.parseType()); if (this.atOp(",")) this.next(); else break; }
        this.expectOp(">");
      }
      ty = { kind: "Named", name, args, span };
    }
    while (this.atOp("?")) { this.next(); ty = { kind: "Nullable", inner: ty, span }; }
    return ty;
  }

  // ---- expressions (Pratt)
  parseExpr(minPrec = 1): Expr {
    let left = this.parseUnary();
    while (true) {
      const t = this.peek();
      if (t.kind === "Op" && t.text === "===") this.fail(D.tripleEquals(), t);
      const op = (t.kind === "Op" || t.kind === "Keyword") ? t.text : "";
      const prec = BIN_PREC[op];
      if (prec === undefined || prec < minPrec) break;
      this.next(); this.skipNewlines();
      const right = this.parseExpr(prec + 1);
      // fold `<number> + <imag>` into a ComplexLit
      if ((op === "+" || op === "-") && (left.kind === "IntLit" || left.kind === "FloatLit") && right.kind === "ComplexLit" && right.re === 0 && isFinite(Number(left.value))) {
        left = { kind: "ComplexLit", re: Number(left.value), im: op === "+" ? right.im : -right.im, span: left.span };
        continue;
      }
      left = { kind: "Binary", op: op as BinOp, left, right, span: left.span };
    }
    if (this.atKw("with")) {
      this.next(); this.expectOp("{"); this.skipNewlines();
      const fields = this.parseNamedFields();
      this.skipNewlines(); this.expectOp("}");
      left = { kind: "With", target: left, fields, span: left.span };
    }
    return left;
  }

  private parseUnary(): Expr {
    const t = this.peek();
    if (this.atOp("-")) { this.next(); const e = this.parseUnary(); return { kind: "Unary", op: "-", expr: e, span: this.span(t) }; }
    if (this.atKw("not")) { this.next(); const e = this.parseUnary(); return { kind: "Unary", op: "not", expr: e, span: this.span(t) }; }
    return this.parsePostfix(this.parsePrimary());
  }

  private parsePostfix(e: Expr): Expr {
    while (true) {
      const t = this.peek();
      if (this.atOp("(")) {
        this.next(); this.skipNewlines();
        const args: Expr[] = []; const named: { name: string; value: Expr }[] = [];
        while (!this.atOp(")")) {
          if (this.at("Ident") && this.peek(1).kind === "Op" && this.peek(1).text === ":") {
            const name = this.next().text; this.next(); this.skipNewlines();
            named.push({ name, value: this.parseExpr() });
          } else {
            if (named.length) this.fail(D.expected("a named argument", this.describe(this.peek())));
            args.push(this.parseExpr());
          }
          this.skipNewlines();
          if (this.atOp(",")) { this.next(); this.skipNewlines(); } else break;
        }
        this.skipNewlines(); this.expectOp(")");
        if (e.kind === "Ident" && /^[A-Z]/.test(e.name) && args.length > 0 && named.length === 0 && !["String", "Int", "Float", "Complex", "Bool"].includes(e.name))
          this.fail(D.positionalRecordArgs(e.name), t);
        e = { kind: "Call", callee: e, args, named, span: e.span };
      } else if (this.atOp("[")) {
        this.next(); this.skipNewlines();
        const index = this.parseExpr();
        this.skipNewlines(); this.expectOp("]");
        e = { kind: "Index", obj: e, index, span: e.span };
      } else if (this.atOp(".") ) {
        this.next();
        const name = this.expectKind("Ident").text;
        e = { kind: "Field", obj: e, name, span: e.span };
      } else if (this.atOp("..")) {
        this.next(); this.skipNewlines();
        const end = this.parseExpr(BIN_PREC["+"]);     // range binds looser than arithmetic, tighter than comparison
        e = { kind: "Range", start: e, end, span: e.span };
      } else break;
    }
    return e;
  }

  private parsePrimary(): Expr {
    const t = this.next(); const span = this.span(t);
    switch (t.kind) {
      case "Int": return { kind: "IntLit", value: t.value as bigint, span };
      case "Float": return { kind: "FloatLit", value: t.value as number, span };
      case "Imag": return { kind: "ComplexLit", re: 0, im: t.value as number, span };
      case "String": return { kind: "StrLit", parts: (t.parts ?? []).map(p => this.stringPart(p)), span };
      case "Ident": return { kind: "Ident", name: t.text, span };
      case "Keyword":
        switch (t.text) {
          case "true": return { kind: "BoolLit", value: true, span };
          case "false": return { kind: "BoolLit", value: false, span };
          case "null": return { kind: "NullLit", span };
          case "Infinity": return { kind: "FloatLit", value: Infinity, span };
          case "fn": {
            const { params, ret } = this.parseParamsAndRet(false);
            return { kind: "Lambda", params, ret, body: this.parseBlock(), span };
          }
          case "match": return this.parseMatch(span);
        }
        break;
      case "Op":
        if (t.text === "(") { this.skipNewlines(); const e = this.parseExpr(); this.skipNewlines(); this.expectOp(")"); return e; }
        if (t.text === "[") {
          this.skipNewlines(); const items: Expr[] = [];
          while (!this.atOp("]")) { items.push(this.parseExpr()); this.skipNewlines(); if (this.atOp(",")) { this.next(); this.skipNewlines(); } else break; }
          this.skipNewlines(); this.expectOp("]");
          return { kind: "ListLit", items, span };
        }
        if (t.text === "{") {
          this.skipNewlines(); const entries: { key: Expr; value: Expr }[] = [];
          while (!this.atOp("}")) {
            const key = this.parseExpr(); this.expectOp(":"); this.skipNewlines();
            entries.push({ key, value: this.parseExpr() });
            this.skipNewlines();
            if (this.atOp(",")) { this.next(); this.skipNewlines(); } else break;
          }
          this.skipNewlines(); this.expectOp("}");
          return { kind: "MapLit", entries, span };
        }
        break;
    }
    return this.fail(D.expected("an expression", this.describe(t)), t);
  }

  private stringPart(p: StringPart): string | Expr {
    if (p.kind === "text") return p.text;
    return parseExprTokens(p.tokens);
  }

  private parseNamedFields(): { name: string; value: Expr }[] {
    const fields: { name: string; value: Expr }[] = [];
    while (!this.atOp("}")) {
      const name = this.expectKind("Ident").text; this.expectOp(":"); this.skipNewlines();
      fields.push({ name, value: this.parseExpr() });
      this.skipNewlines();
      if (this.atOp(",")) { this.next(); this.skipNewlines(); } else break;
    }
    return fields;
  }

  private parseMatch(span: Span): Expr {
    const subject = this.parseExpr();
    this.expectOp("{"); this.skipNewlines();
    const arms: MatchArm[] = [];
    while (!this.atOp("}")) {
      const armSpan = this.span();
      const pattern = this.parsePattern();
      let guard: Expr | undefined;
      if (this.atKw("if")) { this.next(); guard = this.parseExpr(); }
      this.expectOp("->"); this.skipNewlines();
      let body: Stmt[];
      if (this.atOp("{")) body = this.parseBlock();
      else { const e = this.parseExpr(); body = [{ kind: "ExprStmt", expr: e, span: e.span, leading: [], blankBefore: 0 }]; }
      arms.push({ pattern, guard, body, span: armSpan });
      this.skipNewlines();
    }
    this.expectOp("}");
    return { kind: "Match", subject, arms, span };
  }

  private parsePattern(): Pattern {
    const t = this.peek(); const span = this.span(t);
    if (this.atOp("_")) { this.next(); return { kind: "PWild", span }; }
    if (t.kind === "Ident" && /^[A-Z]/.test(t.text) && this.peek(1).kind === "Op" && this.peek(1).text === "(") {
      this.next(); this.next(); this.skipNewlines();
      const fields: { name: string; pattern: Pattern }[] = [];
      while (!this.atOp(")")) {
        const name = this.expectKind("Ident").text; this.expectOp(":"); this.skipNewlines();
        fields.push({ name, pattern: this.parsePattern() });
        this.skipNewlines();
        if (this.atOp(",")) { this.next(); this.skipNewlines(); } else break;
      }
      this.expectOp(")");
      return { kind: "PRecord", name: t.text, fields, span };
    }
    if (t.kind === "Ident") { this.next(); return { kind: "PBind", name: t.text, span }; }
    if (t.kind === "Int" || t.kind === "Float" || t.kind === "Imag" || t.kind === "String" ||
        (t.kind === "Keyword" && ["true", "false", "null", "Infinity"].includes(t.text)) || (t.kind === "Op" && t.text === "-")) {
      const value = this.parseUnary();
      return { kind: "PLit", value, span };
    }
    return this.fail(D.expected("a pattern", this.describe(t)), t);
  }
}
```

- [ ] **Step 5: Run tests and tsc**

Run: `npx vitest run src/blessed/__tests__/parser.test.ts && npx tsc --noEmit`
Expected: all pass. Known subtlety: in `parsePostfix` the `..` range binds inside postfix so `0..10` and `(0..3).map` work and `xs[0..2]` parses the bracket interior as a Range. `a..b + 1` parses as `a..(b + 1)` because the end is parsed at `+` precedence; that is intended.

- [ ] **Step 6: Commit**

```bash
git add src/blessed/ast.ts src/blessed/parser.ts src/blessed/__tests__/parser.test.ts
git commit -m "feat(parser): recursive-descent parser and AST for all twenty commandments

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Value model

**Files:**
- Create: `src/blessed/values.ts`
- Test: `src/blessed/__tests__/values.test.ts`

**Interfaces:**
- Consumes: `D` from Task 1; `Stmt`, `Param` from Task 3.
- Produces:
```ts
export type Value =
  | { t: "Int"; v: bigint } | { t: "Float"; v: number } | { t: "Complex"; re: number; im: number }
  | { t: "String"; v: string } | { t: "Bool"; v: boolean } | { t: "Null" }
  | { t: "List"; items: Value[] }
  | { t: "Map"; entries: Map<string, { key: Value; value: Value }> }      // keyed by mapKey(key)
  | { t: "Record"; name: string; fields: Map<string, Value> }
  | { t: "Function"; name: string; params: Param[]; body: Stmt[]; env: Env }
  | { t: "Builtin"; name: string; arity: number; fn: (args: Value[]) => Value };
export class Env { constructor(parent?: Env); define(name, v): void; lookup(name): Value | undefined; assign(name, v): boolean; has(name): boolean }
export class BlessedError extends Error { catchable = true }      // fail, runtime type errors, div by zero, index, recursion
export class BudgetError extends Error { catchable = false }      // step budget
export const NULL: Value, TRUE: Value, FALSE: Value;
export const int(v: bigint | number): Value; float(v): Value; str(v): Value; bool(v): Value; complex(re, im): Value; list(items): Value;
export function typeName(v: Value): string                      // "Int", "List", "Point" for records, "Fn" for functions
export function equals(a: Value, b: Value): boolean             // structural
export function identical(a: Value, b: Value): boolean          // reference, only meaningful for List/Map/Record
export function show(v: Value): string                           // print format
export function mapKey(k: Value): string                         // "Int:5" | "String:al"
export function checkFloat(v: number, exprText: string): number  // throws BlessedError on NaN
export function makeComplex(re, im, exprText): Value             // checks both components
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/blessed/__tests__/values.test.ts
import { describe, it, expect } from "vitest";
import { int, float, str, bool, complex, list, NULL, equals, identical, show, mapKey, checkFloat, makeComplex, BlessedError, typeName, Value } from "../values";

const rec = (name: string, f: Record<string, Value>): Value => ({ t: "Record", name, fields: new Map(Object.entries(f)) });
const map = (pairs: [Value, Value][]): Value => ({ t: "Map", entries: new Map(pairs.map(([k, v]) => [mapKey(k), { key: k, value: v }])) });

describe("values", () => {
  it("structural equality on lists, maps, records", () => {
    expect(equals(list([int(1), int(2)]), list([int(1), int(2)]))).toBe(true);
    expect(equals(list([int(1)]), list([int(1), int(2)]))).toBe(false);
    expect(equals(map([[str("a"), int(1)], [str("b"), int(2)]]), map([[str("b"), int(2)], [str("a"), int(1)]]))).toBe(true);
    expect(equals(rec("P", { x: int(1) }), rec("P", { x: int(1) }))).toBe(true);
    expect(equals(rec("P", { x: int(1) }), rec("Q", { x: int(1) }))).toBe(false);
  });
  it("never equates across tags", () => {
    expect(equals(int(1), float(1))).toBe(false);
    expect(equals(str("1"), int(1))).toBe(false);
    expect(equals(NULL, NULL)).toBe(true);
    expect(equals(NULL, int(0))).toBe(false);
  });
  it("Infinity equals Infinity", () => {
    expect(equals(float(Infinity), float(Infinity))).toBe(true);
  });
  it("identity is reference", () => {
    const a = list([int(1)]); const b = list([int(1)]);
    expect(identical(a, a)).toBe(true);
    expect(identical(a, b)).toBe(false);
  });
  it("shows values in BLESSED literal syntax", () => {
    expect(show(int(5n))).toBe("5");
    expect(show(float(2.5))).toBe("2.5");
    expect(show(float(2))).toBe("2.0");
    expect(show(float(Infinity))).toBe("Infinity");
    expect(show(str("hi"))).toBe("hi");
    expect(show(list([str("a"), int(1), NULL]))).toBe('["a", 1, null]');
    expect(show(map([[str("a"), int(1)]]))).toBe('{"a": 1}');
    expect(show(rec("Point", { x: int(1), y: int(2) }))).toBe("Point(x: 1, y: 2)");
    expect(show(bool(true))).toBe("true");
  });
  it("shows complex numbers", () => {
    expect(show(complex(3, 4))).toBe("3 + 4i");
    expect(show(complex(3, -4))).toBe("3 - 4i");
    expect(show(complex(0, 4))).toBe("4i");
    expect(show(complex(3, 0))).toBe("3 + 0i");
    expect(show(complex(0, 0))).toBe("0i");
    expect(show(complex(1.5, 2.5))).toBe("1.5 + 2.5i");
  });
  it("map keys distinguish Int 1 and String 1", () => {
    expect(mapKey(int(1))).not.toBe(mapKey(str("1")));
  });
  it("refuses NaN", () => {
    expect(() => checkFloat(0 / 0, "0.0 / 0.0")).toThrow(BlessedError);
    expect(() => checkFloat(0 / 0, "0.0 / 0.0")).toThrow("0.0 / 0.0 is not a number. We will not pretend it is.");
    expect(checkFloat(1 / 0, "x")).toBe(Infinity);
    expect(() => makeComplex(Infinity - Infinity, 0, "z")).toThrow(BlessedError);
  });
  it("typeName", () => {
    expect(typeName(rec("Point", {}))).toBe("Point");
    expect(typeName(list([]))).toBe("List");
    expect(typeName(int(1))).toBe("Int");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/blessed/__tests__/values.test.ts`
Expected: FAIL, cannot resolve `../values`.

- [ ] **Step 3: Write the values module**

```ts
// src/blessed/values.ts
import { D } from "./diagnostics";
import type { Stmt, Param } from "./ast";

export type Value =
  | { t: "Int"; v: bigint } | { t: "Float"; v: number } | { t: "Complex"; re: number; im: number }
  | { t: "String"; v: string } | { t: "Bool"; v: boolean } | { t: "Null" }
  | { t: "List"; items: Value[] }
  | { t: "Map"; entries: Map<string, { key: Value; value: Value }> }
  | { t: "Record"; name: string; fields: Map<string, Value> }
  | { t: "Function"; name: string; params: Param[]; body: Stmt[]; env: Env }
  | { t: "Builtin"; name: string; arity: number; fn: (args: Value[]) => Value };

export class BlessedError extends Error { catchable = true; }
export class BudgetError extends Error { catchable = false; }

export class Env {
  private vars = new Map<string, Value>();
  constructor(public parent?: Env) {}
  define(name: string, v: Value) { this.vars.set(name, v); }
  has(name: string) { return this.vars.has(name); }
  lookup(name: string): Value | undefined { return this.vars.has(name) ? this.vars.get(name) : this.parent?.lookup(name); }
  assign(name: string, v: Value): boolean {
    if (this.vars.has(name)) { this.vars.set(name, v); return true; }
    return this.parent ? this.parent.assign(name, v) : false;
  }
}

export const NULL: Value = { t: "Null" };
export const TRUE: Value = { t: "Bool", v: true };
export const FALSE: Value = { t: "Bool", v: false };
export const int = (v: bigint | number): Value => ({ t: "Int", v: typeof v === "bigint" ? v : BigInt(Math.trunc(v)) });
export const float = (v: number): Value => ({ t: "Float", v });
export const str = (v: string): Value => ({ t: "String", v });
export const bool = (v: boolean): Value => (v ? TRUE : FALSE);
export const complex = (re: number, im: number): Value => ({ t: "Complex", re, im });
export const list = (items: Value[]): Value => ({ t: "List", items });

export function checkFloat(v: number, exprText: string): number {
  if (Number.isNaN(v)) throw new BlessedError(D.notANumber(exprText));
  return v;
}
export function makeComplex(re: number, im: number, exprText: string): Value {
  return complex(checkFloat(re, exprText), checkFloat(im, exprText));
}

export function typeName(v: Value): string {
  switch (v.t) {
    case "Record": return v.name;
    case "Function": case "Builtin": return "Fn";
    default: return v.t;
  }
}

export function mapKey(k: Value): string {
  if (k.t === "Int") return `Int:${k.v}`;
  if (k.t === "String") return `String:${k.v}`;
  return `${k.t}:${show(k)}`;
}

export function equals(a: Value, b: Value): boolean {
  if (a.t !== b.t) return false;
  switch (a.t) {
    case "Int": return a.v === (b as any).v;
    case "Float": return a.v === (b as any).v;
    case "Complex": return a.re === (b as any).re && a.im === (b as any).im;
    case "String": return a.v === (b as any).v;
    case "Bool": return a.v === (b as any).v;
    case "Null": return true;
    case "List": { const bb = b as any; return a.items.length === bb.items.length && a.items.every((x, i) => equals(x, bb.items[i])); }
    case "Map": {
      const bb = b as any; if (a.entries.size !== bb.entries.size) return false;
      for (const [k, e] of a.entries) { const o = bb.entries.get(k); if (!o || !equals(e.value, o.value)) return false; }
      return true;
    }
    case "Record": {
      const bb = b as any; if (a.name !== bb.name || a.fields.size !== bb.fields.size) return false;
      for (const [k, v] of a.fields) { const o = bb.fields.get(k); if (!o || !equals(v, o)) return false; }
      return true;
    }
    case "Function": case "Builtin": return a === b;
  }
}

export function identical(a: Value, b: Value): boolean { return a === b; }

export function showFloat(n: number): string {
  if (n === Infinity) return "Infinity";
  if (n === -Infinity) return "-Infinity";
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

export function show(v: Value): string {
  switch (v.t) {
    case "Int": return v.v.toString();
    case "Float": return showFloat(v.v);
    case "Complex": {
      const plain = (n: number) => Number.isInteger(n) ? String(Math.abs(n)) : String(Math.abs(n));
      if (v.re === 0) return `${v.im < 0 ? "-" : ""}${plain(v.im)}i`;
      return `${Number.isInteger(v.re) ? v.re : v.re} ${v.im < 0 ? "-" : "+"} ${plain(v.im)}i`;
    }
    case "String": return v.v;
    case "Bool": return v.v ? "true" : "false";
    case "Null": return "null";
    case "List": return `[${v.items.map(showLiteral).join(", ")}]`;
    case "Map": return `{${[...v.entries.values()].map(e => `${showLiteral(e.key)}: ${showLiteral(e.value)}`).join(", ")}}`;
    case "Record": return `${v.name}(${[...v.fields].map(([k, x]) => `${k}: ${showLiteral(x)}`).join(", ")})`;
    case "Function": return `fn ${v.name}`;
    case "Builtin": return `fn ${v.name}`;
  }
}

/** Like show, but strings are quoted (used inside lists, maps, records). */
export function showLiteral(v: Value): string {
  return v.t === "String" ? JSON.stringify(v.v) : show(v);
}
```

- [ ] **Step 4: Run tests and tsc**

Run: `npx vitest run src/blessed/__tests__/values.test.ts && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/blessed/values.ts src/blessed/__tests__/values.test.ts
git commit -m "feat(values): tagged value model, structural equality, NaN refusal, printing

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Interpreter core (statements, functions, errors, budget)

**Files:**
- Create: `src/blessed/interpreter.ts`
- Create: `src/blessed/stdlib.ts` (stub with only `print`, conversions, PI, E; Task 7 fills methods)
- Test: `src/blessed/__tests__/interpreter.test.ts`

**Interfaces:**
- Consumes: `parse` (Task 3), everything in `values.ts` (Task 4), `D` (Task 1).
- Produces:
```ts
// interpreter.ts
export interface RunResult { stdout: string[]; error?: string; steps: number }
export function run(program: Program, opts?: { stepBudget?: number; depthLimit?: number }): RunResult
export class Interpreter { constructor(opts); evalExpr(e: Expr, env: Env): Value; execBlock(stmts: Stmt[], env: Env): void; callFunction(f: Value, args: Value[], named: {name, value}[] , line: number): Value; stdout: string[] }
// stdlib.ts
export function globals(interp: Interpreter): Env                 // print, String, Int, Float, Complex, PI, E
export function getProperty(v: Value, name: string, line: number): Value          // Task 7 fills; Task 5 version throws noProperty
export function callMethod(interp: Interpreter, v: Value, name: string, args: Value[], line: number): Value   // Task 7 fills
```
- Control flow uses two internal exception classes: `ReturnSignal { value }` and the `BlessedError` / `BudgetError` from values.
- Runtime errors thrown as `BlessedError` get the message only; `run` wraps it as `RuntimeError: <message>` in `error`. Line numbers for runtime errors are not reported (the spec reports lines only for compile errors).

- [ ] **Step 1: Write the failing tests**

```ts
// src/blessed/__tests__/interpreter.test.ts
import { describe, it, expect } from "vitest";
import { parse } from "../parser";
import { run } from "../interpreter";

const exec = (src: string, opts?: any) => { const { program, errors } = parse(src); expect(errors).toEqual([]); return run(program, opts); };
const out = (src: string) => { const r = exec(src); expect(r.error).toBeUndefined(); return r.stdout; };
const fails = (src: string) => { const r = exec(src); expect(r.error).toBeDefined(); return r.error!; };

describe("interpreter core", () => {
  it("prints literals and interpolation", () => {
    expect(out('print("hi")\nprint(1)\nprint(2.0)\nprint("a${1 + 1}b")')).toEqual(["hi", "1", "2.0", "a2b"]);
  });
  it("let, assign, arithmetic, Int division truncates", () => {
    expect(out("let x = 7\nx = x + 1\nprint(x / 3)\nprint(x % 3)\nprint(-7 / 2)")).toEqual(["2", "2", "-3"]);
  });
  it("Int is arbitrary precision", () => {
    expect(out("let big = 9007199254740993\nprint(big + 1)")).toEqual(["9007199254740994"]);
  });
  it("Int division by zero fails, Float gives Infinity, NaN refused", () => {
    expect(fails("print(1 / 0)")).toContain("Division by zero");
    expect(out("print(1.0 / 0.0)\nprint(-1.0 / 0.0)")).toEqual(["Infinity", "-Infinity"]);
    expect(fails("print(0.0 / 0.0)")).toContain("is not a number");
    expect(fails("print(Infinity - Infinity)")).toContain("is not a number");
  });
  it("mixed Int and String at runtime is an error", () => {
    expect(fails('let xs = [1, "a"]\nloop x in xs {\nprint(x + 1)\n}')).toContain("cannot apply '+' to String and Int");
  });
  it("comparison, and/or short circuit, not", () => {
    expect(out("print(1 < 2 and 2 < 3)\nprint(false and (1 / 0 == 0))\nprint(true or (1 / 0 == 0))\nprint(not true)")).toEqual(["true", "false", "true", "false"]);
  });
  it("== is structural and is is identity", () => {
    expect(out("let a = [1, 2]\nlet b = [1, 2]\nlet c = a\nprint(a == b)\nprint(a is b)\nprint(a is c)")).toEqual(["true", "false", "true"]);
  });
  it("if / else if / else", () => {
    expect(out('let n = 5\nif n < 3 {\nprint("s")\n} else if n < 10 {\nprint("m")\n} else {\nprint("l")\n}')).toEqual(["m"]);
  });
  it("null, ??, if let", () => {
    expect(out('let n: String? = null\nprint(n ?? "none")\nif let v = n {\nprint(v)\n} else {\nprint("was null")\n}\nlet m: String? = "x"\nif let v = m {\nprint(v)\n}')).toEqual(["none", "was null", "x"]);
  });
  it("if let bindings are scoped so names can be reused", () => {
    expect(out('let a: Int? = 1\nlet b: Int? = 2\nif let v = a {\nprint(v)\n}\nif let v = b {\nprint(v)\n}')).toEqual(["1", "2"]);
  });
  it("loop shapes", () => {
    expect(out('loop x in [1, 2] {\nprint(x)\n}\nlet i = 0\nloop i < 2 {\nprint("w${i}")\ni = i + 1\n}')).toEqual(["1", "2", "w0", "w1"]);
    expect(out('loop i in 0..3 {\nprint(i)\n}')).toEqual(["0", "1", "2"]);
  });
  it("step budget stops a forever loop", () => {
    expect(fails("loop {\n}")).toContain("1,000,000 steps");
    expect(exec("loop {\n}", { stepBudget: 10 }).steps).toBeLessThanOrEqual(11);
  });
  it("functions, recursion, closures, first-class", () => {
    expect(out("fn fact(n: Int) -> Int {\nif n <= 1 {\nreturn 1\n}\nreturn n * fact(n - 1)\n}\nprint(fact(25))")).toEqual(["15511210043330985984000000"]);
    expect(out("fn adder(n: Int) -> Fn(Int) -> Int {\nreturn fn(x: Int) { x + n }\n}\nlet add2 = adder(2)\nprint(add2(3))")).toEqual(["5"]);
    expect(out("fn id(x: Int) -> Int { x }\nprint(id(4))")).toEqual(["4"]);
  });
  it("recursion limit is a catchable error", () => {
    expect(fails("fn f(n: Int) -> Int {\nreturn f(n + 1)\n}\nf(0)")).toContain("Call depth exceeded 500");
  });
  it("fail and despite errors with as", () => {
    expect(out('loop x in [1, 2, 3] despite errors as e {\nif x == 2 {\nfail "two is bad"\n}\nprint(x)\n}\nprint("done")')).toEqual(["1", "3", "done"]);
    expect(out('loop x in [1, 2] despite errors as e {\nif x == 2 {\nfail "two is bad"\n}\nprint(x)\n}')).toEqual(["1"]);
    expect(out('loop x in [2] despite errors as e {\nfail "bad ${x}"\nprint("not reached")\n}\nprint("ok")')).toEqual(["ok"]);
  });
  it("despite errors as e holds the most recent message, null before any failure, and survives the loop", () => {
    expect(out('loop x in [1, 0, 2] despite errors as e {\nprint("item ${x}, last error: ${e ?? "none"}")\nprint(10 / x)\n}\nprint(e ?? "no errors")')).toEqual([
      "item 1, last error: none", "10", "item 0, last error: none", "item 2, last error: Division by zero. Int is a count and there is no infinite count.", "5", "Division by zero. Int is a count and there is no infinite count.",
    ]);
    expect(out('loop x in [1] despite errors as e {\nprint(x)\n}\nprint(e ?? "clean")')).toEqual(["1", "clean"]);
    expect(out('fn risky(x: Int) -> Int {\nif x == 0 {\nfail "zero"\n}\nreturn 10 / x\n}\nloop x in [0, 5] despite errors as e {\nprint(risky(x))\n}\nprint(e ?? "")')).toEqual(["2", "zero"]);
  });
  it("despite errors also catches runtime errors from called functions", () => {
    expect(out('loop d in [0, 2] despite errors {\nprint(10 / d)\n}')).toEqual(["5"]);
  });
  it("recursion caught by despite", () => {
    expect(out("fn f(n: Int) -> Int {\nreturn f(n + 1)\n}\nloop x in [1] despite errors {\nf(0)\n}\nprint(\"survived\")")).toEqual(["survived"]);
  });
  it("budget not caught by despite", () => {
    expect(fails("loop x in [1] despite errors {\nloop {\n}\n}")).toContain("1,000,000 steps");
  });
  it("uncaught fail becomes RuntimeError", () => {
    expect(fails('fail "nope"')).toBe("RuntimeError: nope");
  });
  it("conversions", () => {
    expect(out('print(String(5))\nprint(Int("42") ?? 0)\nprint(Int("x") ?? -1)\nprint(Float(3))\nprint(Int(3.9))\nprint(Float("2.5") ?? 0.0)')).toEqual(["5", "42", "-1", "3.0", "3", "2.5"]);
    expect(fails("print(Int(Infinity))")).toContain("no infinite count");
    expect(out('print(Float("inf") ?? -1.0)\nprint(Float("nan") ?? -1.0)')).toEqual(["-1.0", "-1.0"]);
  });
  it("complex arithmetic and conversions", () => {
    expect(out("let z = 3 + 4i\nlet w = Complex(2.0)\nprint(z * w)\nprint(z + w)\nprint(z - w)\nprint((3 + 4i) / (1 + 2i))\nprint(-z)")).toEqual(["6 + 8i", "5 + 4i", "1 + 4i", "2.2 - 0.4i", "-3 - 4i"]);
    expect(fails("print((1 + 1i) / 0i)")).toContain("Division by zero");
    expect(out("print(Complex(1) == Complex(1.0))\nprint(Complex(2) == 2 + 0i)")).toEqual(["true", "true"]);
  });
  it("PI and E exist", () => {
    expect(out("print(PI > 3.14 and PI < 3.15)\nprint(E > 2.71 and E < 2.72)")).toEqual(["true", "true"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/blessed/__tests__/interpreter.test.ts`
Expected: FAIL, cannot resolve `../interpreter`.

- [ ] **Step 3: Write the stdlib stub**

```ts
// src/blessed/stdlib.ts   (Task 5 version; Task 7 replaces getProperty/callMethod bodies)
import { Value, Env, NULL, int, float, str, complex, BlessedError, show, typeName, checkFloat } from "./values";
import { D } from "./diagnostics";
import type { Interpreter } from "./interpreter";

const builtin = (name: string, arity: number, fn: (args: Value[]) => Value): Value => ({ t: "Builtin", name, arity, fn });

export function globals(interp: Interpreter): Env {
  const g = new Env();
  g.define("print", builtin("print", 1, ([v]) => { interp.stdout.push(show(v)); return NULL; }));
  g.define("String", builtin("String", 1, ([v]) => str(show(v))));
  g.define("Int", builtin("Int", 1, ([v]) => {
    if (v.t === "Int") return v;
    if (v.t === "Float") { if (!Number.isFinite(v.v)) throw new BlessedError(D.intFromInfinity()); return int(Math.trunc(v.v)); }
    if (v.t === "String") return /^\s*-?\d+\s*$/.test(v.v) ? int(BigInt(v.v.trim())) : NULL;
    throw new BlessedError(D.runtimeType("Int()", typeName(v), ""));
  }));
  g.define("Float", builtin("Float", 1, ([v]) => {
    if (v.t === "Float") return v;
    if (v.t === "Int") return float(Number(v.v));
    if (v.t === "String") { const s = v.v.trim(); if (!/^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return NULL; const n = Number(s); return Number.isFinite(n) ? float(n) : NULL; }
    if (v.t === "Complex") { if (v.im !== 0) throw new BlessedError(D.floatFromComplex()); return float(v.re); }
    throw new BlessedError(D.runtimeType("Float()", typeName(v), ""));
  }));
  g.define("Complex", builtin("Complex", 1, ([v]) => {
    if (v.t === "Complex") return v;
    if (v.t === "Int") return complex(Number(v.v), 0);
    if (v.t === "Float") return complex(checkFloat(v.v, "Complex()"), 0);
    throw new BlessedError(D.runtimeType("Complex()", typeName(v), ""));
  }));
  g.define("PI", float(Math.PI));
  g.define("E", float(Math.E));
  return g;
}

export function getProperty(v: Value, name: string, _line: number): Value {
  throw new BlessedError(D.noProperty(typeName(v), name));
}

export function callMethod(_interp: Interpreter, v: Value, name: string, _args: Value[], _line: number): Value {
  throw new BlessedError(D.noMethod(typeName(v), name));
}
```

- [ ] **Step 4: Write the interpreter**

```ts
// src/blessed/interpreter.ts
import type { Program, Stmt, Expr, Pattern } from "./ast";
import { Value, Env, NULL, TRUE, FALSE, int, float, str, bool, list, complex, makeComplex, checkFloat, equals, identical, show, typeName, mapKey, BlessedError, BudgetError } from "./values";
import { D } from "./diagnostics";
import { globals, getProperty, callMethod } from "./stdlib";

export interface RunResult { stdout: string[]; error?: string; steps: number }
class ReturnSignal { constructor(public value: Value) {} }

export function run(program: Program, opts: { stepBudget?: number; depthLimit?: number } = {}): RunResult {
  const interp = new Interpreter(opts);
  try {
    interp.execBlock(program.body, interp.global);
    return { stdout: interp.stdout, steps: interp.steps };
  } catch (e) {
    if (e instanceof BlessedError || e instanceof BudgetError) return { stdout: interp.stdout, error: `RuntimeError: ${e.message}`, steps: interp.steps };
    if (e instanceof ReturnSignal) return { stdout: interp.stdout, error: `RuntimeError: ${D.returnOutsideFn()}`, steps: interp.steps };
    throw e;
  }
}

export class Interpreter {
  stdout: string[] = [];
  steps = 0;
  depth = 0;
  global: Env;
  records = new Map<string, string[]>();          // record name -> field order
  private stepBudget: number; private depthLimit: number;

  constructor(opts: { stepBudget?: number; depthLimit?: number } = {}) {
    this.stepBudget = opts.stepBudget ?? 1_000_000;
    this.depthLimit = opts.depthLimit ?? 500;
    this.global = globals(this);
  }

  tick() { if (++this.steps > this.stepBudget) throw new BudgetError(D.stepBudget()); }

  // ---------- statements
  execBlock(stmts: Stmt[], env: Env) { for (const s of stmts) this.exec(s, env); }

  exec(s: Stmt, env: Env): void {
    this.tick();
    switch (s.kind) {
      case "Let": env.define(s.name, this.evalExpr(s.init, env)); return;
      case "Assign": {
        const v = this.evalExpr(s.value, env);
        if (s.target.kind === "Ident") { if (!env.assign(s.target.name, v)) throw new BlessedError(D.undefinedName(s.target.name)); return; }
        if (s.target.kind === "Index") {
          const obj = this.evalExpr(s.target.obj, env); const idx = this.evalExpr(s.target.index, env);
          if (obj.t === "Map") { obj.entries.set(mapKey(idx), { key: idx, value: v }); return; }
          if (obj.t === "List") { obj.items[this.listIndex(obj.items, idx)] = v; return; }
          throw new BlessedError(D.notIndexable(typeName(obj)));
        }
        const obj = this.evalExpr(s.target.obj, env);
        throw new BlessedError(obj.t === "Record" ? D.immutableRecord(obj.name) : D.noProperty(typeName(obj), s.target.name));
      }
      case "ExprStmt": this.evalExpr(s.expr, env); return;
      case "If": {
        if (this.truth(this.evalExpr(s.cond, env))) this.execBlock(s.then, new Env(env));
        else if (s.else) this.execBlock(s.else, new Env(env));
        return;
      }
      case "IfLet": {
        const v = this.evalExpr(s.expr, env);
        if (v.t !== "Null") { const inner = new Env(env); inner.define(s.name, v); this.execBlock(s.then, inner); }
        else if (s.else) this.execBlock(s.else, new Env(env));
        return;
      }
      case "Loop": {
        if (s.shape === "forever") { while (true) { this.tick(); this.execBlock(s.body, new Env(env)); } }
        if (s.shape === "while") { while (this.truth(this.evalExpr(s.cond!, env))) { this.tick(); this.execBlock(s.body, new Env(env)); } return; }
        const coll = this.evalExpr(s.iter!, env);
        if (coll.t !== "List") throw new BlessedError(D.typeMismatch("List", typeName(coll)));
        if (s.despite?.errName) env.define(s.despite.errName, NULL);        // String?, null until something fails
        for (const item of [...coll.items]) {
          this.tick();
          const inner = new Env(env); inner.define(s.item!, item);
          if (!s.despite) { this.execBlock(s.body, inner); continue; }
          const depthBefore = this.depth;
          try { this.execBlock(s.body, inner); }
          catch (e) {
            if (!(e instanceof BlessedError)) throw e;
            this.depth = depthBefore;
            if (s.despite.errName) env.assign(s.despite.errName, str(e.message));
          }
        }
        return;
      }
      case "FnDecl": env.define(s.name, { t: "Function", name: s.name, params: s.params, body: s.body, env }); return;
      case "RecordDecl": this.records.set(s.name, s.fields.map(f => f.name)); return;
      case "Return": throw new ReturnSignal(s.expr ? this.evalExpr(s.expr, env) : NULL);
      case "Fail": {
        const v = this.evalExpr(s.expr, env);
        if (v.t !== "String") throw new BlessedError(D.failNotString(typeName(v)));
        throw new BlessedError(v.v);
      }
    }
  }

  truth(v: Value): boolean {
    if (v.t !== "Bool") throw new BlessedError(D.notBool(typeName(v), show(v)));
    return v.v;
  }

  listIndex(items: Value[], idx: Value): number {
    if (idx.t !== "Int") throw new BlessedError(D.typeMismatch("Int", typeName(idx)));
    const n = Number(idx.v); const i = n < 0 ? items.length + n : n;
    if (i < 0 || i >= items.length) throw new BlessedError(D.indexOutOfRange(String(n), items.length));
    return i;
  }

  // ---------- expressions
  evalExpr(e: Expr, env: Env): Value {
    switch (e.kind) {
      case "IntLit": return int(e.value);
      case "FloatLit": return float(e.value);
      case "ComplexLit": return complex(e.re, e.im);
      case "BoolLit": return bool(e.value);
      case "NullLit": return NULL;
      case "StrLit": return str(e.parts.map(p => typeof p === "string" ? p : show(this.evalExpr(p, env))).join(""));
      case "Ident": {
        const v = env.lookup(e.name);
        if (v === undefined) throw new BlessedError(D.undefinedName(e.name));
        return v;
      }
      case "ListLit": return list(e.items.map(x => this.evalExpr(x, env)));
      case "MapLit": {
        const m: Value = { t: "Map", entries: new Map() };
        for (const en of e.entries) { const k = this.evalExpr(en.key, env); m.entries.set(mapKey(k), { key: k, value: this.evalExpr(en.value, env) }); }
        return m;
      }
      case "Range": {
        const a = this.evalExpr(e.start, env), b = this.evalExpr(e.end, env);
        if (a.t !== "Int" || b.t !== "Int") throw new BlessedError(D.rangeEndsInt());
        const n = b.v - a.v;
        if (n > 10_000_000n) throw new BlessedError(D.rangeTooBig());
        const items: Value[] = [];
        for (let i = a.v; i < b.v; i++) items.push(int(i));
        return list(items);
      }
      case "Unary": {
        const v = this.evalExpr(e.expr, env);
        if (e.op === "not") return bool(!this.truth(v));
        if (v.t === "Int") return int(-v.v);
        if (v.t === "Float") return float(-v.v);
        if (v.t === "Complex") return complex(-v.re, -v.im);
        throw new BlessedError(D.runtimeType("-", typeName(v), ""));
      }
      case "Binary": return this.evalBinary(e.op, e.left, e.right, env);
      case "Call": {
        if (e.callee.kind === "Field") {
          const obj = this.evalExpr(e.callee.obj, env);
          const args = e.args.map(a => this.evalExpr(a, env));
          if (obj.t === "Record" && obj.fields.has(e.callee.name)) return this.callFunction(obj.fields.get(e.callee.name)!, args, [], e.span.line);
          return callMethod(this, obj, e.callee.name, args, e.span.line);
        }
        if (e.callee.kind === "Ident" && this.records.has(e.callee.name)) return this.construct(e.callee.name, e.named.map(n => ({ name: n.name, value: this.evalExpr(n.value, env) })));
        const f = this.evalExpr(e.callee, env);
        return this.callFunction(f, e.args.map(a => this.evalExpr(a, env)), [], e.span.line);
      }
      case "Index": {
        const obj = this.evalExpr(e.obj, env);
        if (e.index.kind === "Range" && obj.t === "List") {
          const a = this.evalExpr(e.index.start, env), b = this.evalExpr(e.index.end, env);
          if (a.t !== "Int" || b.t !== "Int") throw new BlessedError(D.rangeEndsInt());
          return list(obj.items.slice(Number(a.v), Number(b.v)));
        }
        const idx = this.evalExpr(e.index, env);
        if (obj.t === "List") return obj.items[this.listIndex(obj.items, idx)];
        if (obj.t === "Map") return obj.entries.get(mapKey(idx))?.value ?? NULL;
        if (obj.t === "String") {
          if (e.index.kind === "Range") { const a = this.evalExpr(e.index.start, env) as any, b = this.evalExpr(e.index.end, env) as any; return str([...obj.v].slice(Number(a.v), Number(b.v)).join("")); }
          const chars = [...obj.v]; return str(chars[this.listIndex(chars.map(str), idx)]);
        }
        throw new BlessedError(D.notIndexable(typeName(obj)));
      }
      case "Field": {
        const obj = this.evalExpr(e.obj, env);
        if (obj.t === "Record") { const f = obj.fields.get(e.name); if (f === undefined) throw new BlessedError(D.noField(obj.name, e.name)); return f; }
        return getProperty(obj, e.name, e.span.line);
      }
      case "Lambda": return { t: "Function", name: "fn", params: e.params, body: e.body, env };
      case "With": {
        const base = this.evalExpr(e.target, env);
        if (base.t !== "Record") throw new BlessedError(D.typeMismatch("a record", typeName(base)));
        const fields = new Map(base.fields);
        for (const f of e.fields) { if (!fields.has(f.name)) throw new BlessedError(D.noField(base.name, f.name)); fields.set(f.name, this.evalExpr(f.value, env)); }
        return { t: "Record", name: base.name, fields };
      }
      case "Match": {
        const subject = this.evalExpr(e.subject, env);
        for (const arm of e.arms) {
          const inner = new Env(env);
          if (!this.matchPattern(arm.pattern, subject, inner, env)) continue;
          if (arm.guard && !this.truth(this.evalExpr(arm.guard, inner))) continue;
          return this.evalBlockValue(arm.body, inner);
        }
        throw new BlessedError(D.notExhaustive());
      }
    }
  }

  /** Executes a block; the value of a trailing ExprStmt is the block's value, else null. */
  evalBlockValue(body: Stmt[], env: Env): Value {
    for (let i = 0; i < body.length; i++) {
      const s = body[i];
      if (i === body.length - 1 && s.kind === "ExprStmt") { this.tick(); return this.evalExpr(s.expr, env); }
      this.exec(s, env);
    }
    return NULL;
  }

  matchPattern(p: Pattern, v: Value, bind: Env, env: Env): boolean {
    switch (p.kind) {
      case "PWild": return true;
      case "PBind": bind.define(p.name, v); return true;
      case "PLit": return equals(this.evalExpr(p.value, env), v);
      case "PRecord":
        if (v.t !== "Record" || v.name !== p.name) return false;
        return p.fields.every(f => v.fields.has(f.name) && this.matchPattern(f.pattern, v.fields.get(f.name)!, bind, env));
    }
  }

  construct(name: string, named: { name: string; value: Value }[]): Value {
    const order = this.records.get(name)!;
    const fields = new Map<string, Value>();
    for (const f of order) {
      const given = named.filter(n => n.name === f);
      if (given.length === 0) throw new BlessedError(D.missingFields(name, [f]));
      if (given.length > 1) throw new BlessedError(D.duplicateField(f));
      fields.set(f, given[0].value);
    }
    for (const n of named) if (!order.includes(n.name)) throw new BlessedError(D.noField(name, n.name));
    return { t: "Record", name, fields };
  }

  callFunction(f: Value, args: Value[], _named: { name: string; value: Value }[], _line: number): Value {
    if (f.t === "Builtin") {
      if (args.length !== f.arity) throw new BlessedError(D.wrongArgCount(f.name, f.arity, args.length));
      return f.fn(args);
    }
    if (f.t !== "Function") throw new BlessedError(D.notCallable(typeName(f)));
    if (args.length !== f.params.length) throw new BlessedError(D.wrongArgCount(f.name, f.params.length, args.length));
    if (++this.depth > this.depthLimit) { this.depth = 0; throw new BlessedError(D.recursionLimit()); }
    const env = new Env(f.env);
    f.params.forEach((p, i) => env.define(p.name, args[i]));
    try { return this.evalBlockValue(f.body, env); }
    catch (e) { if (e instanceof ReturnSignal) return e.value; throw e; }
    finally { this.depth--; }
  }

  // ---------- operators
  evalBinary(op: string, le: Expr, re: Expr, env: Env): Value {
    if (op === "and") { const l = this.evalExpr(le, env); return this.truth(l) ? bool(this.truth(this.evalExpr(re, env))) : FALSE; }
    if (op === "or") { const l = this.evalExpr(le, env); return this.truth(l) ? TRUE : bool(this.truth(this.evalExpr(re, env))); }
    if (op === "??") { const l = this.evalExpr(le, env); return l.t === "Null" ? this.evalExpr(re, env) : l; }
    const a = this.evalExpr(le, env), b = this.evalExpr(re, env);
    if (op === "==") return bool(equals(a, b));
    if (op === "!=") return bool(!equals(a, b));
    if (op === "is") return bool(identical(a, b));
    const bad = () => new BlessedError(D.runtimeType(op, typeName(a), typeName(b)));
    if (a.t !== b.t) throw bad();
    const text = `${show(a)} ${op} ${show(b)}`;
    switch (a.t) {
      case "Int": {
        const x = a.v, y = (b as any).v as bigint;
        switch (op) {
          case "+": return int(x + y); case "-": return int(x - y); case "*": return int(x * y);
          case "/": if (y === 0n) throw new BlessedError(D.divByZero()); return int(x / y);
          case "%": if (y === 0n) throw new BlessedError(D.divByZero()); return int(x % y);
          case "<": return bool(x < y); case "<=": return bool(x <= y); case ">": return bool(x > y); case ">=": return bool(x >= y);
        }
        throw bad();
      }
      case "Float": {
        const x = a.v, y = (b as any).v as number;
        switch (op) {
          case "+": return float(checkFloat(x + y, text)); case "-": return float(checkFloat(x - y, text));
          case "*": return float(checkFloat(x * y, text)); case "/": return float(checkFloat(x / y, text));
          case "%": return float(checkFloat(x % y, text));
          case "<": return bool(x < y); case "<=": return bool(x <= y); case ">": return bool(x > y); case ">=": return bool(x >= y);
        }
        throw bad();
      }
      case "Complex": {
        const c = b as any;
        switch (op) {
          case "+": return makeComplex(a.re + c.re, a.im + c.im, text);
          case "-": return makeComplex(a.re - c.re, a.im - c.im, text);
          case "*": return makeComplex(a.re * c.re - a.im * c.im, a.re * c.im + a.im * c.re, text);
          case "/": {
            const d = c.re * c.re + c.im * c.im;
            if (d === 0) throw new BlessedError(D.divByZero());
            return makeComplex((a.re * c.re + a.im * c.im) / d, (a.im * c.re - a.re * c.im) / d, text);
          }
        }
        if (["<", "<=", ">", ">="].includes(op)) throw new BlessedError(D.complexOrder());
        throw bad();
      }
      case "String": {
        const y = (b as any).v as string;
        switch (op) {
          case "+": return str(a.v + y);
          case "<": return bool(a.v < y); case "<=": return bool(a.v <= y); case ">": return bool(a.v > y); case ">=": return bool(a.v >= y);
        }
        throw bad();
      }
      case "List": if (op === "+") return list([...a.items, ...(b as any).items]); throw bad();
    }
    throw bad();
  }
}
```

- [ ] **Step 5: Run tests and tsc**

Run: `npx vitest run src/blessed/__tests__/interpreter.test.ts && npx tsc --noEmit`
Expected: all pass. The complex division test expects `2.2 - 0.4i`: (3+4i)/(1+2i) = (3+8 + (4-6)i)/5 = 2.2 - 0.4i; floating point gives exactly 2.2 and -0.4 here. If `show` prints `2.2 - 0.4i` with a stray `0.4000000000000001`, round components in `show` to 12 significant digits with `Number(n.toPrecision(12))` before printing.

- [ ] **Step 6: Commit**

```bash
git add src/blessed/interpreter.ts src/blessed/stdlib.ts src/blessed/__tests__/interpreter.test.ts
git commit -m "feat(interpreter): tree-walking interpreter with step budget, despite errors, functions, complex math

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Interpreter data types (lists, maps, records, match, with, slices)

The Task 5 interpreter already contains the code paths for these. This task pins their behaviour with tests and fixes whatever the tests reveal.

**Files:**
- Modify: `src/blessed/interpreter.ts` (only if a test fails)
- Test: `src/blessed/__tests__/interpreter.test.ts` (append a second `describe`)

**Interfaces:**
- Consumes: `run`, `parse` as in Task 5.
- Produces: no new interfaces.

- [ ] **Step 1: Append the failing tests**

```ts
// append to src/blessed/__tests__/interpreter.test.ts
describe("interpreter data types", () => {
  it("list index, negative index, slices clamp, out of range fails", () => {
    expect(out('let xs = ["a", "b", "c"]\nprint(xs[0])\nprint(xs[-1])\nprint(xs[0..2])\nprint(xs[1..99])\nprint(xs[2..1])')).toEqual(["a", "c", '["a", "b"]', '["b", "c"]', "[]"]);
    expect(fails("let xs = [1, 2, 3]\nprint(xs[3])")).toContain("Index 3 is out of range for a list of length 3");
  });
  it("negative index out of range", () => {
    expect(fails("let xs = [1, 2, 3]\nprint(xs[-4])")).toContain("Index -4 is out of range");
  });
  it("slice clamps", () => {
    expect(out("let xs = [1, 2, 3]\nprint(xs[-99..2])")).toEqual(["[1, 2]"]);
  });
  it("list element assignment and concatenation", () => {
    expect(out("let xs = [1, 2]\nxs[0] = 9\nprint(xs)\nprint(xs + [3])")).toEqual(["[9, 2]", "[9, 2, 3]"]);
  });
  it("string indexing and slicing", () => {
    expect(out('let s = "hello"\nprint(s[0])\nprint(s[-1])\nprint(s[1..3])')).toEqual(["h", "o", "el"]);
  });
  it("maps: literal, lookup, missing is null, set, Int vs String keys", () => {
    expect(out('let m = {"al": 30, "bo": 25}\nprint(m["al"])\nprint(m["cy"] ?? -1)\nm["cy"] = 40\nprint(m)')).toEqual(["30", "-1", '{"al": 30, "bo": 25, "cy": 40}']);
    expect(out('let m = {1: "one"}\nprint(m[1])\nprint(m)')).toEqual(["one", '{1: "one"}']);
  });
  it("records: construct, field, structural equality, immutability, with", () => {
    const src = "record Point { x: Int, y: Int }\nlet p = Point(y: 2, x: 1)\nprint(p)\nprint(p.x)\nprint(p == Point(x: 1, y: 2))\nprint(p is Point(x: 1, y: 2))\nlet q = p with { x: 3 }\nprint(q)\nprint(p)";
    expect(out(src)).toEqual(["Point(x: 1, y: 2)", "1", "true", "false", "Point(x: 3, y: 2)", "Point(x: 1, y: 2)"]);
    expect(fails("record P { x: Int }\nlet p = P(x: 1)\np.x = 2")).toContain("records do not change");
    expect(fails("record P { x: Int, y: Int }\nlet p = P(x: 1)")).toContain("missing 'y'");
    expect(fails("record P { x: Int }\nlet p = P(x: 1, z: 2)")).toContain("no field 'z'");
    expect(fails("record P { x: Int }\nlet p = P(x: 1)\nprint(p.z)")).toContain("no field 'z'");
  });
  it("records hold functions and nested records", () => {
    expect(out("record Dog { name: String, speak: Fn(String) -> String }\nlet d = Dog(name: \"Rex\", speak: fn(n: String) { \"${n} says woof\" })\nprint(d.speak(d.name))")).toEqual(["Rex says woof"]);
  });
  it("match: literal, binding, guard, record destructuring, wildcard, block body, as expression", () => {
    const src = 'record Point { x: Int, y: Int }\nfn label(v: Int) -> String {\nreturn match v {\n0 -> "zero"\nn if n > 10 -> "big ${n}"\n_ -> "other"\n}\n}\nprint(label(0))\nprint(label(11))\nprint(label(5))\nlet p = Point(x: 0, y: 7)\nprint(match p {\nPoint(x: 0, y: y) -> "axis ${y}"\n_ -> "off"\n})\nlet r = match true {\ntrue -> {\nlet t = "yes"\nt + "!"\n}\nfalse -> "no"\n}\nprint(r)';
    expect(out(src)).toEqual(["zero", "big 11", "other", "axis 7", "yes!"]);
  });
  it("match on String, negative Int literal, and null", () => {
    expect(out('print(match "b" {\n"a" -> 1\n"b" -> 2\n_ -> 0\n})\nprint(match -1 {\n-1 -> "neg"\n_ -> "pos"\n})\nlet n: Int? = null\nprint(match n {\nnull -> "nothing"\nv -> "got ${v}"\n})')).toEqual(["2", "neg", "nothing"]);
  });
  it("ranges as values and in loops", () => {
    expect(out("print(0..3)\nprint(3..3)\nprint(5..2)\nlet n = 2\nprint(0..n + 1)")).toEqual(["[0, 1, 2]", "[]", "[]", "[0, 1, 2]"]);
    expect(fails("print(0..20000000)")).toContain("would not fit");
  });
  it("list of lists is structural", () => {
    expect(out("print([[1], [2]] == [[1], [2]])")).toEqual(["true"]);
  });
  it("mutation inside loop over the list body does not change iteration", () => {
    expect(out("let xs = [1, 2]\nloop x in xs {\nxs[0] = 99\nprint(x)\n}")).toEqual(["1", "2"]);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/blessed/__tests__/interpreter.test.ts`
Expected: most pass immediately. Likely failures and their fixes:
- `0..n + 1` printing `[0, 1, 2]` requires the parser's range end to bind at `+` precedence (Task 3 `parsePostfix`). If it prints `[0, 1]`, the end was parsed as `n` only; change `this.parseExpr(BIN_PREC["+"])` to `this.parseExpr(BIN_PREC["<"] + 1)` is wrong direction. Keep `BIN_PREC["+"]` (6) which lets `+` bind into the end.
- `s[-1]` on strings must map negative indices through `listIndex`; the Task 5 code does.
- `match` with `null -> ...` arm requires `PLit` for `null`; the parser accepts it.

- [ ] **Step 3: Run the whole suite and tsc**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/blessed/interpreter.ts src/blessed/__tests__/interpreter.test.ts
git commit -m "test(interpreter): pin list, map, record, match, range semantics

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Standard library methods

**Files:**
- Modify: `src/blessed/stdlib.ts` (replace `getProperty` and `callMethod`)
- Test: `src/blessed/__tests__/stdlib.test.ts`

**Interfaces:**
- Consumes: `Interpreter.callFunction(f, args, [], line)` for `map`/`filter`/`reduce`/`sort` callbacks; `BlessedError`, value constructors.
- Produces: the method and property tables used by the checker in Task 8. Export them as data so the checker can share names:
```ts
export const PROPERTIES: Record<string, string[]>        // { String: ["length"], List: ["length"], Complex: ["re", "im"] }
export const METHODS: Record<string, Record<string, number>>   // type -> method -> arity, e.g. METHODS.String.split === 1; "round" arity -1 means 0 or 1
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/blessed/__tests__/stdlib.test.ts
import { describe, it, expect } from "vitest";
import { parse } from "../parser";
import { run } from "../interpreter";

const out = (src: string) => { const { program, errors } = parse(src); expect(errors).toEqual([]); const r = run(program); expect(r.error).toBeUndefined(); return r.stdout; };
const fails = (src: string) => { const { program } = parse(src); const r = run(program); expect(r.error).toBeDefined(); return r.error!; };

describe("stdlib", () => {
  it("String methods and length", () => {
    expect(out('let s = " Hello, World "\nprint(s.length)\nprint(s.trim())\nprint(s.upper())\nprint(s.lower())\nprint(s.trim().split(", "))\nprint(s.contains("World"))\nprint(s.trim().startsWith("He"))\nprint(s.trim().endsWith("ld"))\nprint(s.replace("World", "Nurse"))'))
      .toEqual(["14", "Hello, World", " HELLO, WORLD ", " hello, world ", '["Hello", "World"]', "true", "true", "true", " Hello, Nurse "]);
  });
  it("length is a property; calling it fails", () => {
    expect(fails('print("abc".length())')).toContain("'length' is a property, not a call");
  });
  it("List methods", () => {
    expect(out("let xs = [3, 1, 2]\nprint(xs.length)\nprint(xs.push(4))\nprint(xs)\nprint(xs.map(fn(x) { x * 2 }))\nprint(xs.filter(fn(x) { x > 1 }))\nprint(xs.reduce(fn(acc, x) { acc + x }, 0))\nprint(xs.contains(2))\nprint(xs.reverse())\nprint(xs.sort())\nprint([\"b\", \"a\"].sort())\nprint([\"a\", \"b\"].join(\"-\"))"))
      .toEqual(["3", "[3, 1, 2, 4]", "[3, 1, 2]", "[6, 2, 4]", "[3, 2]", "6", "true", "[2, 1, 3]", "[1, 2, 3]", '["a", "b"]', "a-b"]);
  });
  it("numeric aggregates", () => {
    expect(out("print([1, 2, 3].sum())\nprint([1.5, 2.5].sum())\nprint([3, 1].min() ?? -1)\nprint([3, 1].max() ?? -1)\nlet e: List<Int> = []\nprint(e.min() ?? -1)\nprint(e.sum())")).toEqual(["6", "4.0", "1", "3", "-1", "0"]);
  });
  it("Map methods", () => {
    expect(out('let m = {"a": 1, "b": 2}\nprint(m.keys())\nprint(m.values())\nprint(m.has("a"))\nprint(m.has("z"))')).toEqual(['["a", "b"]', "[1, 2]", "true", "false"]);
  });
  it("Int methods", () => {
    expect(out("print((-5).abs())\nprint(2.pow(64))\nprint(12.gcd(18))\nprint(20.factorial())")).toEqual(["5", "18446744073709551616", "6", "2432902008176640000"]);
    expect(fails("print(2.pow(-1))")).toContain("negative exponent");
  });
  it("Float methods", () => {
    expect(out("print((-2.5).abs())\nprint(2.5.floor())\nprint(2.1.ceil())\nprint(2.5.round())\nprint(3.14159.round(2))\nprint(16.0.sqrt())\nprint(2.0.pow(10))\nprint(0.0.sin())\nprint(0.0.cos())\nprint(1.0.exp() == E)\nprint(E.log())\nprint(1.0.atan2(1.0) * 4 == PI)"))
      .toEqual(["2.5", "2.0", "3.0", "3.0", "3.14", "4.0", "1024.0", "0.0", "1.0", "true", "1.0", "true"]);
    expect(fails("print((-4.0).sqrt())")).toContain("is not a number");
    expect(fails("print((-1.0).log())")).toContain("is not a number");
    expect(out("print(2.0.pow(0.5) == 2.0.sqrt())\nprint(1.0.asin() * 2 == PI)\nprint(1.0.acos())\nprint(0.0.atan())\nprint(0.0.tan())")).toEqual(["true", "true", "0.0", "0.0", "0.0"]);
  });
  it("Complex properties and methods", () => {
    expect(out("let z = 3 + 4i\nprint(z.re)\nprint(z.im)\nprint(z.abs())\nprint(z.conj())\nprint(Complex(-4.0).sqrt())\nprint((0i).exp())\nprint(Complex(1.0).log())\nprint((1i).pow(2))\nprint((1i).arg() * 2 == PI)"))
      .toEqual(["3.0", "4.0", "5.0", "3 - 4i", "2i", "1 + 0i", "0i", "-1 + 0i", "true"]);
  });
  it("unknown method and property", () => {
    expect(fails("print(1.nope())")).toContain("Int has no method 'nope'");
    expect(fails("print(1.nope)")).toContain("Int has no property 'nope'");
  });
  it("wrong arity", () => {
    expect(fails('print("a".split())')).toContain("takes 1 argument(s), got 0");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/blessed/__tests__/stdlib.test.ts`
Expected: FAIL on "has no method".

- [ ] **Step 3: Replace getProperty and callMethod in stdlib.ts**

Replace the two stub functions at the bottom of `src/blessed/stdlib.ts` with:

```ts
export const PROPERTIES: Record<string, string[]> = {
  String: ["length"], List: ["length"], Complex: ["re", "im"],
};

export const METHODS: Record<string, Record<string, number>> = {
  String: { upper: 0, lower: 0, trim: 0, split: 1, contains: 1, startsWith: 1, endsWith: 1, replace: 2 },
  List: { push: 1, map: 1, filter: 1, reduce: 2, join: 1, contains: 1, reverse: 0, sort: 0, sum: 0, min: 0, max: 0 },
  Map: { keys: 0, values: 0, has: 1 },
  Int: { abs: 0, pow: 1, gcd: 1, factorial: 0 },
  Float: { abs: 0, floor: 0, ceil: 0, round: -1, sqrt: 0, pow: 1, sin: 0, cos: 0, tan: 0, asin: 0, acos: 0, atan: 0, atan2: 1, exp: 0, log: 0 },
  Complex: { abs: 0, arg: 0, conj: 0, sqrt: 0, exp: 0, log: 0, pow: 1 },
};

export function getProperty(v: Value, name: string, _line: number): Value {
  if (v.t === "String" && name === "length") return int([...v.v].length);
  if (v.t === "List" && name === "length") return int(v.items.length);
  if (v.t === "Complex" && name === "re") return float(v.re);
  if (v.t === "Complex" && name === "im") return float(v.im);
  throw new BlessedError(D.noProperty(typeName(v), name));
}

function expectArgs(name: string, args: Value[], arity: number) {
  if (arity >= 0 && args.length !== arity) throw new BlessedError(D.wrongArgCount(name, arity, args.length));
}
function argOf(args: Value[], i: number, t: Value["t"], name: string): any {
  const a = args[i];
  if (!a || a.t !== t) throw new BlessedError(D.typeMismatch(t, a ? typeName(a) : "nothing"));
  return a;
}
function compare(a: Value, b: Value): number {
  if (a.t === "Int" && b.t === "Int") return a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
  if (a.t === "Float" && b.t === "Float") return a.v - b.v;
  if (a.t === "String" && b.t === "String") return a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
  throw new BlessedError(D.cannotOperate("sort", typeName(a), typeName(b)));
}

export function callMethod(interp: Interpreter, v: Value, name: string, args: Value[], line: number): Value {
  if (name === "length" && (v.t === "String" || v.t === "List")) throw new BlessedError(D.lengthIsProperty());
  const table = METHODS[v.t === "Record" ? "" : v.t];
  if (!table || !(name in table)) throw new BlessedError(D.noMethod(typeName(v), name));
  expectArgs(name, args, table[name]);
  const call = (f: Value, xs: Value[]) => interp.callFunction(f, xs, [], line);
  const f1 = (fn: (x: number) => number, x: number, text: string) => float(checkFloat(fn(x), text));

  switch (v.t) {
    case "String": {
      const s = v.v;
      switch (name) {
        case "upper": return str(s.toUpperCase());
        case "lower": return str(s.toLowerCase());
        case "trim": return str(s.trim());
        case "split": return list(s.split(argOf(args, 0, "String", name).v).map(str));
        case "contains": return bool(s.includes(argOf(args, 0, "String", name).v));
        case "startsWith": return bool(s.startsWith(argOf(args, 0, "String", name).v));
        case "endsWith": return bool(s.endsWith(argOf(args, 0, "String", name).v));
        case "replace": return str(s.split(argOf(args, 0, "String", name).v).join(argOf(args, 1, "String", name).v));
      }
      break;
    }
    case "List": {
      const xs = v.items;
      switch (name) {
        case "push": return list([...xs, args[0]]);
        case "map": return list(xs.map(x => call(args[0], [x])));
        case "filter": return list(xs.filter(x => interp.truth(call(args[0], [x]))));
        case "reduce": return xs.reduce((acc, x) => call(args[0], [acc, x]), args[1]);
        case "join": return str(xs.map(x => show(x)).join(argOf(args, 0, "String", name).v));
        case "contains": return bool(xs.some(x => equals(x, args[0])));
        case "reverse": return list([...xs].reverse());
        case "sort": return list([...xs].sort(compare));
        case "sum": {
          if (xs.length === 0) return int(0);
          if (xs[0].t === "Float") return float(checkFloat(xs.reduce((a, x) => a + argOf([x], 0, "Float", name).v, 0), "sum()"));
          return int(xs.reduce((a, x) => a + argOf([x], 0, "Int", name).v, 0n));
        }
        case "min": case "max": {
          if (xs.length === 0) return NULL;
          return xs.reduce((best, x) => (name === "min" ? compare(x, best) < 0 : compare(x, best) > 0) ? x : best);
        }
      }
      break;
    }
    case "Map": {
      switch (name) {
        case "keys": return list([...v.entries.values()].map(e => e.key));
        case "values": return list([...v.entries.values()].map(e => e.value));
        case "has": return bool(v.entries.has(mapKey(args[0])));
      }
      break;
    }
    case "Int": {
      const n = v.v;
      switch (name) {
        case "abs": return int(n < 0n ? -n : n);
        case "pow": { const e = argOf(args, 0, "Int", name).v as bigint; if (e < 0n) throw new BlessedError(D.negativeIntPow()); return int(n ** e); }
        case "gcd": { let a = n < 0n ? -n : n, b = argOf(args, 0, "Int", name).v as bigint; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return int(a); }
        case "factorial": { if (n < 0n) throw new BlessedError(D.notANumber(`${n}.factorial()`)); let r = 1n; for (let i = 2n; i <= n; i++) r *= i; return int(r); }
      }
      break;
    }
    case "Float": {
      const x = v.v; const t = `${show(v)}.${name}()`;
      switch (name) {
        case "abs": return float(Math.abs(x));
        case "floor": return float(Math.floor(x));
        case "ceil": return float(Math.ceil(x));
        case "round": { if (args.length === 0) return float(Math.round(x)); const d = Number(argOf(args, 0, "Int", name).v); const m = 10 ** d; return float(Math.round(x * m) / m); }
        case "sqrt": return f1(Math.sqrt, x, t);
        case "pow": { const e = args[0]; const ev = e.t === "Int" ? Number(e.v) : e.t === "Float" ? e.v : (() => { throw new BlessedError(D.typeMismatch("Float", typeName(e))); })(); return float(checkFloat(x ** ev, t)); }
        case "sin": return f1(Math.sin, x, t); case "cos": return f1(Math.cos, x, t); case "tan": return f1(Math.tan, x, t);
        case "asin": return f1(Math.asin, x, t); case "acos": return f1(Math.acos, x, t); case "atan": return f1(Math.atan, x, t);
        case "atan2": return float(checkFloat(Math.atan2(x, argOf(args, 0, "Float", name).v), t));
        case "exp": return f1(Math.exp, x, t); case "log": return f1(Math.log, x, t);
      }
      break;
    }
    case "Complex": {
      const { re, im } = v; const t = `${show(v)}.${name}()`;
      const r = Math.hypot(re, im), th = Math.atan2(im, re);
      switch (name) {
        case "abs": return float(r);
        case "arg": return float(th);
        case "conj": return complex(re, -im);
        case "sqrt": { const sr = Math.sqrt(r); return makeComplex(sr * Math.cos(th / 2), sr * Math.sin(th / 2), t); }
        case "exp": { const m = Math.exp(re); return makeComplex(m * Math.cos(im), m * Math.sin(im), t); }
        case "log": if (r === 0) throw new BlessedError(D.notANumber(t)); return makeComplex(Math.log(r), th, t);
        case "pow": {
          const e = args[0]; const n = e.t === "Int" ? Number(e.v) : e.t === "Float" ? e.v : (() => { throw new BlessedError(D.typeMismatch("Int", typeName(e))); })();
          if (r === 0) return n === 0 ? complex(1, 0) : complex(0, 0);
          const m = r ** n; return makeComplex(m * Math.cos(th * n), m * Math.sin(th * n), t);
        }
      }
      break;
    }
  }
  throw new BlessedError(D.noMethod(typeName(v), name));
}
```

Add the missing imports at the top of `stdlib.ts`: `list, bool, equals, mapKey, makeComplex` from `./values`.

Also fix `show` for Complex and Float results of trig so `1 + 0i`, `-1 + 0i`, and `0i` print cleanly: in `values.ts` `show`, round Complex components with `const r = (n: number) => Math.abs(n) < 1e-12 ? 0 : Number(n.toPrecision(12));` before formatting, and in `showFloat` apply the same `toPrecision(12)` rounding when the value is finite.

- [ ] **Step 4: Run tests and tsc**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass. `(1i).pow(2)` relies on the rounding above to print `-1 + 0i` rather than `-1 + 1.2246467991473532e-16i`.

- [ ] **Step 5: Commit**

```bash
git add src/blessed/stdlib.ts src/blessed/values.ts src/blessed/__tests__/stdlib.test.ts
git commit -m "feat(stdlib): String, List, Map, Int, Float, Complex methods

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Checker

**Files:**
- Create: `src/blessed/checker.ts`
- Test: `src/blessed/__tests__/checker.test.ts`

**Interfaces:**
- Consumes: AST (Task 3), `Diagnostic`, `D` (Task 1), `PROPERTIES`, `METHODS` (Task 7).
- Produces:
```ts
export function check(program: Program): Diagnostic[]       // errors and warnings, sorted by line
export type Type = { k: "Int" } | { k: "Float" } | { k: "Complex" } | { k: "String" } | { k: "Bool" } | { k: "Null" }
  | { k: "List"; el: Type } | { k: "Map"; key: Type; val: Type } | { k: "Record"; name: string }
  | { k: "Fn"; params: Type[]; ret: Type } | { k: "Nullable"; inner: Type } | { k: "Unknown" };
export function showType(t: Type): string                   // "Int", "List<Int>", "String?", "Fn(Int) -> Int", "Point"
```
- Rule: `Unknown` is compatible with everything and suppresses cascaded errors.

- [ ] **Step 1: Write the failing tests**

```ts
// src/blessed/__tests__/checker.test.ts
import { describe, it, expect } from "vitest";
import { parse } from "../parser";
import { check } from "../checker";

const diags = (src: string) => { const { program, errors } = parse(src); expect(errors).toEqual([]); return check(program); };
const errors = (src: string) => diags(src).filter(d => d.severity === "error").map(d => `${d.line}: ${d.message}`);
const warnings = (src: string) => diags(src).filter(d => d.severity === "warning").map(d => `${d.line}: ${d.message}`);
const clean = (src: string) => expect(errors(src)).toEqual([]);

describe("checker: names and declarations", () => {
  it("undefined name", () => { expect(errors("print(x)")[0]).toContain("'x' is not defined"); });
  it("redeclaration in same scope, shadowing in inner scope is fine", () => {
    expect(errors("let x = 1\nlet x = 2")[0]).toContain("already declared");
    clean("let x = 1\nif true {\nlet x = 2\n}");
  });
  it("constants cannot be reassigned", () => { expect(errors("let MAX = 1\nMAX = 2")[0]).toContain("SCREAMING_SNAKE"); });
  it("reassignment keeps the declared type", () => { expect(errors('let x = 1\nx = "a"')[0]).toContain("Expected Int but got String"); });
  it("annotation mismatch and null into non-nullable", () => {
    expect(errors('let x: Int = "a"')[0]).toContain("Expected Int but got String");
    expect(errors("let x: String = null")[0]).toContain("cannot be null. Declare it as 'String?'");
  });
  it("snake_case and underscore style", () => {
    expect(warnings("let user_name = 1")[0]).toContain("Renamed variable 'user_name' to 'userName'");
    expect(warnings("let _x = 1")[0]).toContain("Leading underscores");
    expect(errors("let __x__ = 1")[0]).toContain("not Python");
    expect(warnings("let x = 1;")[0]).toContain("remove this semicolon");
    expect(warnings("let MAX_SIZE = 1")).toEqual([]);
  });
});

describe("checker: types and operators", () => {
  it("Int + String literal and variables", () => {
    expect(errors('let t = 5 + "a"')[0]).toContain("cannot add Int and String");
    expect(errors('let x = 5\nlet s = "a"\nlet t = x + s')[0]).toBe("3: cannot add Int and String. Did you mean: String(x) + s? BLESSED will wait. Take your time.");
  });
  it("Int and Float never mix", () => { expect(errors("let x = 1 + 2.0")[0]).toContain("cannot apply '+' to Int and Float"); });
  it("comparison across types", () => {
    expect(errors('let a = 5\nlet b = "5"\nprint(a == b)')[0]).toBe("3: Int ≠ String. We won't guess. Did you mean: a == Int(b)?");
    expect(errors('print(true == 1)')[0]).toContain("Bool ≠ Int");
  });
  it("Complex rules", () => {
    expect(errors("let x = 1.0\nlet z = x + 4i")[0]).toContain("Did you mean: Complex(x)?");
    expect(errors("print((1 + 1i) < (2 + 2i))")[0]).toContain("Complex numbers have no order");
    clean("let z = 3 + 4i\nprint(z * Complex(2))");
  });
  it("is only on List, Map, Record", () => {
    expect(errors("print(1 is 1)")[0]).toContain("Int values are not objects");
    clean("let a = [1]\nprint(a is a)");
  });
  it("conditions must be Bool", () => {
    expect(errors('let s = "x"\nif s {\n}')[0]).toBe('2: String is not Bool. Did you mean: if s != ""?');
    expect(errors("let n = 1\nif n {\n}")[0]).toContain("Did you mean: if n > 0?");
    expect(errors("let n = 1\nloop n {\n}")[0]).toContain("Int is not Bool");
    expect(errors("if not 1 {\n}")[0]).toContain("not Bool");
  });
  it("list element and map key/value homogeneity", () => {
    expect(errors('let xs = [1, "a"]')[0]).toContain("Expected Int but got String");
    expect(errors('let m = {"a": 1, 2: 3}')[0]).toContain("Expected String but got Int");
    expect(errors("let m = {}")[0]).toContain("Annotate it");
    clean("let m: Map<String, Int> = {}\nm[\"a\"] = 1");
  });
  it("map key type mismatch", () => {
    expect(errors('let m = {"a": 1}\nprint(m[1] ?? 0)')[0]).toContain("This map has String keys. Int is not one of them.");
  });
  it("map lookup is nullable", () => {
    expect(errors('let m = {"a": 1}\nprint(m["a"])')[0]).toContain("may be null");
    clean('let m = {"a": 1}\nprint(m["a"] ?? 0)');
  });
  it("indexing", () => {
    expect(errors("print(1[0])")[0]).toContain("Int cannot be indexed");
    expect(errors('let xs = [1]\nprint(xs["a"])')[0]).toContain("Expected Int but got String");
    clean("let xs = [1, 2]\nprint(xs[0..1])\nprint(xs[-1])");
  });
  it("ranges need Int ends", () => { expect(errors("print(0.5..2)")[0]).toContain("Range ends must be Int"); });
});

describe("checker: nullability", () => {
  it("nullable used raw is an error, handled forms are fine", () => {
    expect(errors("let n: String? = null\nprint(n)")[0]).toBe("2: Variable 'n' may be null. Handle it first. Did you mean 'n ?? \"default\"' or using 'if let'?");
    clean('let n: String? = null\nprint(n ?? "d")\nif let v = n {\nprint(v)\n}\nprint(n == null)\nprint(n != null)\nprint(match n {\nnull -> "a"\n_ -> "b"\n})');
  });
  it("nullable passes only into nullable params", () => {
    expect(errors("fn f(s: String) -> Int { 1 }\nlet n: String? = null\nprint(f(n))")[0]).toContain("may be null");
    clean("fn f(s: String?) -> Int { 1 }\nlet n: String? = null\nprint(f(n))");
  });
  it("inferred null type and assignments", () => {
    expect(errors("let n: Int? = null\nlet m: Int = n")[0]).toContain("may be null");
    clean("let n: Int? = null\nn = 5\nlet o: Int? = 3\no = null");
  });
  it("?? result is non-null, and left must be nullable", () => {
    clean("let n: Int? = null\nlet x: Int = n ?? 0");
    expect(errors('let n: Int? = null\nlet s: String = n ?? "a"')[0]).toContain("Expected Int but got String");
  });
  it("if let on a non-nullable is pointless and flagged", () => {
    expect(errors("let n = 1\nif let v = n {\n}")[0]).toContain("Expected a nullable value but got Int");
  });
});

describe("checker: functions, records, match, errors", () => {
  it("arity, return type, return outside fn", () => {
    expect(errors("fn f(a: Int) -> Int { a }\nprint(f(1, 2))")[0]).toContain("takes 1 argument(s), got 2");
    expect(errors('fn f(a: Int) -> Int {\nreturn "x"\n}')[0]).toContain("Expected Int but got String");
    expect(errors("return 1")[0]).toContain("Return to where?");
    expect(errors("let x = 1\nx(2)")[0]).toContain("Int is not callable");
  });
  it("inferred return type and first-class use", () => {
    clean("fn f(a: Int) { a + 1 }\nlet g = f\nlet r: Int = g(1)");
    expect(errors("fn f(a: Int) { a + 1 }\nlet r: String = f(1)")[0]).toContain("Expected String but got Int");
  });
  it("lambda param inference through map/filter/reduce, and failure elsewhere", () => {
    clean("let ys: List<Int> = [1, 2].map(fn(x) { x * 2 })\nlet zs: List<Int> = [1, 2].filter(fn(x) { x > 1 })\nlet s: Int = [1, 2].reduce(fn(a, x) { a + x }, 0)");
    expect(errors("let f = fn(x) { x }")[0]).toContain("Cannot infer the type of parameter 'x'");
    expect(errors('[1, 2].map(fn(x) { x + "a" })')[0]).toContain("cannot add Int and String");
  });
  it("records: fields, construction, immutability, with, undefined record", () => {
    clean("record P { x: Int, y: Int }\nlet p = P(x: 1, y: 2)\nprint(p.x + p.y)\nlet q = p with { x: 3 }\nprint(p == q)");
    expect(errors("record P { x: Int }\nlet p = P(x: 1)\nprint(p.z)")[0]).toContain("P has no field 'z'");
    expect(errors("record P { x: Int, y: Int }\nlet p = P(x: 1)")[0]).toContain("missing 'y'");
    expect(errors("record P { x: Int }\nlet p = P(x: 1, x: 2)")[0]).toContain("given twice");
    expect(errors("record P { x: Int }\nlet p = P(x: 1)\np.x = 2")[0]).toContain("records do not change");
    expect(errors('record P { x: Int }\nlet p = P(x: "a")')[0]).toContain("Expected Int but got String");
    expect(errors("let p = Q(x: 1)")[0]).toContain("'Q' is not defined");
    expect(errors("record P { x: Int }\nlet p = P(x: 1)\nlet q = p with { z: 1 }")[0]).toContain("no field 'z'");
  });
  it("match exhaustiveness and arm types", () => {
    expect(errors('let n = 1\nlet s = match n {\n0 -> "a"\n1 -> "b"\n}')[0]).toContain("does not cover every case");
    clean('let b = true\nlet s = match b {\ntrue -> "a"\nfalse -> "b"\n}');
    clean('let n = 1\nlet s = match n {\n0 -> "a"\nx -> "b"\n}');
    expect(errors('let n = 1\nlet s = match n {\n0 -> "a"\n_ -> 1\n}')[0]).toContain("Match arms disagree: String vs Int");
    expect(errors('let n = 1\nlet s = match n {\n"a" -> 1\n_ -> 2\n}')[0]).toContain("Expected Int but got String");
    expect(errors("record P { x: Int }\nlet p = P(x: 1)\nlet s = match p {\nP(x: 0, y: 1) -> 1\n_ -> 2\n}")[0]).toContain("no field 'y'");
    clean("record P { x: Int }\nlet p = P(x: 1)\nlet s = match p {\nP(x: 0) -> 1\nP(x: v) if v > 3 -> v\n_ -> 2\n}");
  });
  it("guards must be Bool; bindings are typed", () => {
    expect(errors("let n = 1\nlet s = match n {\nx if x -> 1\n_ -> 2\n}")[0]).toContain("Int is not Bool");
  });
  it("fail takes a String; despite as binds a String? visible in the body and after the loop", () => {
    expect(errors("fail 1")[0]).toContain("'fail' takes a String message, not Int");
    clean('loop x in [1] despite errors as e {\nprint((e ?? "none").upper())\n}\nprint(e ?? "clean run")');
    expect(errors("loop x in [1] despite errors as e {\nprint(e)\n}")[0]).toContain("may be null");
    expect(errors('loop x in [1] despite errors as e {\nprint((e ?? "") + 1)\n}')[0]).toContain("cannot add Int and String");
  });
  it("loop item types and iterating a non-list", () => {
    expect(errors("loop x in 5 {\n}")[0]).toContain("Expected List but got Int");
    expect(errors('loop x in [1] {\nprint(x + "a")\n}')[0]).toContain("cannot add Int and String");
  });
  it("methods and properties through the stdlib tables", () => {
    expect(errors('print("a".length())')[0]).toContain("'length' is a property, not a call");
    expect(errors("print(1.nope())")[0]).toContain("Int has no method 'nope'");
    expect(errors('print("a".split())')[0]).toContain("takes 1 argument(s), got 0");
    clean('let n: Int = "a,b".split(",").length\nlet m: Int? = [1].min()\nlet z: Float = (1 + 1i).re');
    expect(errors("let x: Int = [1].min()")[0]).toContain("may be null");
  });
  it("conversions type", () => {
    clean('let a: String = String(1)\nlet b: Int = Int("1") ?? 0\nlet c: Float = Float(1)\nlet d: Complex = Complex(1.0)');
    expect(errors('let b: Int = Int("1")')[0]).toContain("may be null");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/blessed/__tests__/checker.test.ts`
Expected: FAIL, cannot resolve `../checker`.

- [ ] **Step 3: Write the checker**

```ts
// src/blessed/checker.ts
import type { Program, Stmt, Expr, TypeExpr, Pattern, Param } from "./ast";
import { D, Diagnostic } from "./diagnostics";
import { PROPERTIES, METHODS } from "./stdlib";

export type Type =
  | { k: "Int" } | { k: "Float" } | { k: "Complex" } | { k: "String" } | { k: "Bool" } | { k: "Null" }
  | { k: "List"; el: Type } | { k: "Map"; key: Type; val: Type } | { k: "Record"; name: string }
  | { k: "Fn"; params: Type[]; ret: Type } | { k: "Nullable"; inner: Type } | { k: "Unknown" };

const T = {
  Int: { k: "Int" } as Type, Float: { k: "Float" } as Type, Complex: { k: "Complex" } as Type, String: { k: "String" } as Type,
  Bool: { k: "Bool" } as Type, Null: { k: "Null" } as Type, Unknown: { k: "Unknown" } as Type,
  list: (el: Type): Type => ({ k: "List", el }), map: (key: Type, val: Type): Type => ({ k: "Map", key, val }),
  rec: (name: string): Type => ({ k: "Record", name }), fn: (params: Type[], ret: Type): Type => ({ k: "Fn", params, ret }),
  nullable: (inner: Type): Type => inner.k === "Nullable" || inner.k === "Unknown" || inner.k === "Null" ? inner : { k: "Nullable", inner },
};

export function showType(t: Type): string {
  switch (t.k) {
    case "List": return `List<${showType(t.el)}>`;
    case "Map": return `Map<${showType(t.key)}, ${showType(t.val)}>`;
    case "Record": return t.name;
    case "Fn": return `Fn(${t.params.map(showType).join(", ")}) -> ${showType(t.ret)}`;
    case "Nullable": return `${showType(t.inner)}?`;
    default: return t.k;
  }
}

function same(a: Type, b: Type): boolean {
  if (a.k === "Unknown" || b.k === "Unknown") return true;
  if (a.k !== b.k) return false;
  switch (a.k) {
    case "List": return same(a.el, (b as any).el);
    case "Map": return same(a.key, (b as any).key) && same(a.val, (b as any).val);
    case "Record": return a.name === (b as any).name;
    case "Fn": { const bb = b as any; return a.params.length === bb.params.length && a.params.every((p, i) => same(p, bb.params[i])) && same(a.ret, bb.ret); }
    case "Nullable": return same(a.inner, (b as any).inner);
    default: return true;
  }
}

/** Can a value of type `actual` be stored where `expected` is required? */
function assignable(expected: Type, actual: Type): boolean {
  if (expected.k === "Unknown" || actual.k === "Unknown") return true;
  if (expected.k === "Nullable") return actual.k === "Null" || assignable(expected.inner, actual.k === "Nullable" ? actual.inner : actual);
  if (actual.k === "Nullable" || actual.k === "Null") return false;
  if (expected.k === "List" && actual.k === "List" && actual.el.k === "Unknown") return true;   // [] literal
  return same(expected, actual);
}

interface Binding { type: Type; isConst: boolean }
class Scope {
  vars = new Map<string, Binding>();
  constructor(public parent?: Scope, public fnRet?: { declared?: Type; inferred: Type[] }) {}
  lookup(n: string): Binding | undefined { return this.vars.get(n) ?? this.parent?.lookup(n); }
  fn(): Scope | undefined { return this.fnRet ? this : this.parent?.fn(); }
}

const isConstName = (n: string) => /^[A-Z][A-Z0-9_]*$/.test(n) && n.length > 1;

export function check(program: Program): Diagnostic[] {
  const c = new Checker();
  c.block(program.body, c.global);
  return c.diags.sort((a, b) => a.line - b.line);
}

class Checker {
  diags: Diagnostic[] = [];
  records = new Map<string, Map<string, Type>>();
  global = new Scope();

  constructor() {
    const g = this.global;
    g.vars.set("print", { type: T.fn([T.Unknown], T.Null), isConst: true });
    g.vars.set("PI", { type: T.Float, isConst: true });
    g.vars.set("E", { type: T.Float, isConst: true });
  }
  err(line: number, message: string) { this.diags.push({ line, severity: "error", message }); return T.Unknown; }
  warn(line: number, message: string) { this.diags.push({ line, severity: "warning", message }); }

  // ---------- types from syntax
  resolveType(t: TypeExpr): Type {
    switch (t.kind) {
      case "Nullable": return T.nullable(this.resolveType(t.inner));
      case "Fn": return T.fn(t.params.map(p => this.resolveType(p)), this.resolveType(t.ret));
      case "Named":
        switch (t.name) {
          case "Int": case "Float": case "Complex": case "String": case "Bool": return { k: t.name } as Type;
          case "List": return T.list(t.args[0] ? this.resolveType(t.args[0]) : T.Unknown);
          case "Map": return T.map(t.args[0] ? this.resolveType(t.args[0]) : T.Unknown, t.args[1] ? this.resolveType(t.args[1]) : T.Unknown);
          default:
            if (this.records.has(t.name)) return T.rec(t.name);
            return this.err(t.span.line, D.undefinedName(t.name));
        }
    }
  }

  // ---------- statements
  block(stmts: Stmt[], scope: Scope) {
    for (const s of stmts) if (s.kind === "RecordDecl") this.declareRecord(s);        // records are visible before use
    for (const s of stmts) if (s.kind === "FnDecl") this.declareFn(s, scope);          // functions can be mutually recursive
    for (const s of stmts) this.stmt(s, scope);
  }

  declareRecord(s: Extract<Stmt, { kind: "RecordDecl" }>) {
    if (this.records.has(s.name)) { this.err(s.span.line, D.redeclared(s.name)); return; }
    this.records.set(s.name, new Map());
  }
  declareFn(s: Extract<Stmt, { kind: "FnDecl" }>, scope: Scope) {
    if (scope.vars.has(s.name)) { this.err(s.span.line, D.redeclared(s.name)); return; }
    const params = s.params.map(p => p.type ? this.resolveType(p.type) : this.err(p.span.line, D.cannotInfer(p.name)));
    scope.vars.set(s.name, { type: T.fn(params, s.ret ? this.resolveType(s.ret) : T.Unknown), isConst: false });
  }

  checkName(line: number, name: string) {
    if (name.startsWith("__") && name.endsWith("__") && name.length > 4) return this.err(line, D.doubleUnderscore());
    if (name.startsWith("_") && name !== "_") this.warn(line, D.leadingUnderscore());
    else if (name.includes("_") && !isConstName(name)) this.warn(line, D.snakeCase(name, name.replace(/_([a-z])/g, (_, l) => l.toUpperCase())));
    return undefined;
  }

  stmt(s: Stmt, scope: Scope) {
    if (s.semicolon) this.warn(s.span.line, D.semicolon());
    switch (s.kind) {
      case "Let": {
        if (this.checkName(s.span.line, s.name) === T.Unknown) return;
        if (scope.vars.has(s.name)) { this.err(s.span.line, D.redeclared(s.name)); return; }
        const declared = s.type ? this.resolveType(s.type) : undefined;
        const actual = this.expr(s.init, scope, declared);
        let type = declared ?? actual;
        if (declared) {
          if (actual.k === "Null" && declared.k !== "Nullable" && declared.k !== "Unknown") this.err(s.span.line, D.nullToNonNullable(s.name, showType(declared)));
          else this.expect(s.span.line, declared, actual, s.init);
        } else if (actual.k === "List" && actual.el.k === "Unknown") type = actual;
        if (!declared && s.init.kind === "MapLit" && s.init.entries.length === 0) this.err(s.span.line, D.emptyMapNeedsType());
        scope.vars.set(s.name, { type, isConst: isConstName(s.name) });
        return;
      }
      case "Assign": {
        if (s.target.kind === "Ident") {
          const b = scope.lookup(s.target.name);
          if (!b) { this.err(s.span.line, D.undefinedName(s.target.name)); return; }
          if (b.isConst) { this.err(s.span.line, D.constReassign(s.target.name)); return; }
          const v = this.expr(s.value, scope, b.type);
          if (b.type.k === "List" && b.type.el.k === "Unknown") b.type = v;        // `let xs = []` then `xs = [1]`
          else this.expect(s.span.line, b.type, v, s.value);
          return;
        }
        if (s.target.kind === "Field") {
          const t = this.expr(s.target.obj, scope);
          if (t.k === "Record") this.err(s.span.line, D.immutableRecord(t.name));
          else if (t.k !== "Unknown") this.err(s.span.line, D.noProperty(showType(t), s.target.name));
          this.expr(s.value, scope);
          return;
        }
        const obj = this.expr(s.target.obj, scope);
        if (obj.k === "Map") { this.expect(s.span.line, obj.key, this.expr(s.target.index, scope, obj.key), s.target.index, true); this.expect(s.span.line, obj.val, this.expr(s.value, scope, obj.val), s.value); return; }
        if (obj.k === "List") { this.expect(s.span.line, T.Int, this.expr(s.target.index, scope), s.target.index); this.expect(s.span.line, obj.el, this.expr(s.value, scope, obj.el), s.value); return; }
        if (obj.k !== "Unknown") this.err(s.span.line, D.notIndexable(showType(obj)));
        return;
      }
      case "ExprStmt": this.expr(s.expr, scope); return;
      case "If": {
        this.condition(s.cond, scope);
        this.block(s.then, new Scope(scope));
        if (s.else) this.block(s.else, new Scope(scope));
        return;
      }
      case "IfLet": {
        const t = this.expr(s.expr, scope);
        const inner = new Scope(scope);
        if (t.k === "Nullable") inner.vars.set(s.name, { type: t.inner, isConst: false });
        else { if (t.k !== "Unknown") this.err(s.span.line, D.typeMismatch("a nullable value", showType(t))); inner.vars.set(s.name, { type: T.Unknown, isConst: false }); }
        this.block(s.then, inner);
        if (s.else) this.block(s.else, new Scope(scope));
        return;
      }
      case "Loop": {
        const inner = new Scope(scope);
        if (s.shape === "while") this.condition(s.cond!, scope);
        if (s.shape === "in") {
          const t = this.expr(s.iter!, scope);
          const el = t.k === "List" ? t.el : (t.k === "Unknown" ? T.Unknown : this.err(s.span.line, D.typeMismatch("List", showType(t))));
          inner.vars.set(s.item!, { type: el, isConst: false });
          if (s.despite?.errName) {
            if (scope.vars.has(s.despite.errName)) this.err(s.span.line, D.redeclared(s.despite.errName));
            scope.vars.set(s.despite.errName, { type: T.nullable(T.String), isConst: false });   // String?, visible in the body and after the loop
          }
        }
        this.block(s.body, inner);
        return;
      }
      case "FnDecl": {
        const b = scope.vars.get(s.name); if (!b || b.type.k !== "Fn") return;
        const ret = this.fnBody(s.params, b.type.params, s.ret ? b.type.ret : undefined, s.body, scope, s.span.line);
        if (!s.ret) b.type = T.fn(b.type.params, ret);
        return;
      }
      case "RecordDecl": {
        const fields = this.records.get(s.name)!;
        for (const f of s.fields) { if (fields.has(f.name)) this.err(s.span.line, D.duplicateField(f.name)); fields.set(f.name, this.resolveType(f.type)); }
        return;
      }
      case "Return": {
        const fs = scope.fn();
        if (!fs) { this.err(s.span.line, D.returnOutsideFn()); if (s.expr) this.expr(s.expr, scope); return; }
        const t = s.expr ? this.expr(s.expr, scope, fs.fnRet!.declared) : T.Null;
        if (fs.fnRet!.declared) this.expect(s.span.line, fs.fnRet!.declared, t, s.expr);
        else fs.fnRet!.inferred.push(t);
        return;
      }
      case "Fail": {
        const t = this.expr(s.expr, scope);
        if (t.k !== "String" && t.k !== "Unknown") this.err(s.span.line, D.failNotString(showType(t)));
        return;
      }
    }
  }

  /** Checks a function body; returns the function's return type. */
  fnBody(params: Param[], paramTypes: Type[], declaredRet: Type | undefined, body: Stmt[], outer: Scope, line: number): Type {
    const scope = new Scope(outer, { declared: declaredRet, inferred: [] });
    params.forEach((p, i) => { this.checkName(p.span.line, p.name); scope.vars.set(p.name, { type: paramTypes[i], isConst: false }); });
    const last = body[body.length - 1];
    const init = last && last.kind === "ExprStmt" ? body.slice(0, -1) : body;
    this.block(init, scope);
    let tail: Type = T.Null;
    if (last && last.kind === "ExprStmt") {
      tail = this.expr(last.expr, scope, declaredRet);
      if (declaredRet) this.expect(last.span.line, declaredRet, tail, last.expr); else scope.fnRet!.inferred.push(tail);
    }
    if (declaredRet) return declaredRet;
    const inferred = scope.fnRet!.inferred.filter(t => t.k !== "Null");
    if (inferred.length === 0) return T.Null;
    for (const t of inferred.slice(1)) if (!same(inferred[0], t)) this.err(line, D.typeMismatch(showType(inferred[0]), showType(t)));
    return inferred[0];
  }

  condition(e: Expr, scope: Scope) {
    const t = this.expr(e, scope, T.Bool);
    if (t.k !== "Bool" && t.k !== "Unknown") this.err(e.span.line, D.notBool(showType(t), this.src(e)));
  }

  /** Reports a mismatch between `expected` and `actual`; nullable actual gets the may-be-null message when it is a plain variable. */
  expect(line: number, expected: Type, actual: Type, e?: Expr, keyContext = false) {
    if (assignable(expected, actual)) return;
    if ((actual.k === "Nullable" || actual.k === "Null") && expected.k !== "Nullable" && actual.k !== "Null") {
      if (e && e.kind === "Ident") { this.err(line, D.mayBeNull(e.name)); return; }
      if (e && e.kind !== "NullLit") { this.err(line, D.mayBeNull(this.src(e))); return; }
    }
    if (keyContext) { this.err(line, D.mapKeyType(showType(expected), showType(actual))); return; }
    this.err(line, D.typeMismatch(showType(expected), showType(actual)));
  }

  /** Short source-ish rendering of an expression for messages. */
  src(e: Expr): string {
    switch (e.kind) {
      case "Ident": return e.name;
      case "IntLit": return e.value.toString();
      case "FloatLit": return String(e.value);
      case "StrLit": return `"${e.parts.map(p => typeof p === "string" ? p : "${" + this.src(p) + "}").join("")}"`;
      case "BoolLit": return String(e.value);
      case "Field": return `${this.src(e.obj)}.${e.name}`;
      case "Index": return `${this.src(e.obj)}[${this.src(e.index)}]`;
      case "Call": return `${this.src(e.callee)}(...)`;
      case "Unary": return `${e.op === "not" ? "not " : "-"}${this.src(e.expr)}`;
      case "Binary": return `${this.src(e.left)} ${e.op} ${this.src(e.right)}`;
      default: return "expression";
    }
  }

  // ---------- expressions
  expr(e: Expr, scope: Scope, expected?: Type): Type {
    switch (e.kind) {
      case "IntLit": return T.Int;
      case "FloatLit": return T.Float;
      case "ComplexLit": return T.Complex;
      case "BoolLit": return T.Bool;
      case "NullLit": return T.Null;
      case "StrLit": for (const p of e.parts) if (typeof p !== "string") this.exprNonNull(p, scope); return T.String;
      case "Ident": {
        const b = scope.lookup(e.name);
        if (!b) { if (this.records.has(e.name)) return T.Unknown; return this.err(e.span.line, D.undefinedName(e.name)); }
        return b.type;
      }
      case "ListLit": {
        const want = expected?.k === "List" ? expected.el : undefined;
        if (e.items.length === 0) return T.list(want ?? T.Unknown);
        const first = this.expr(e.items[0], scope, want);
        if (want) this.expect(e.span.line, want, first, e.items[0]);
        for (const it of e.items.slice(1)) this.expect(it.span.line, want ?? first, this.expr(it, scope, want ?? first), it);
        return T.list(want ?? first);
      }
      case "MapLit": {
        const wk = expected?.k === "Map" ? expected.key : undefined, wv = expected?.k === "Map" ? expected.val : undefined;
        if (e.entries.length === 0) return T.map(wk ?? T.Unknown, wv ?? T.Unknown);
        const k0 = this.expr(e.entries[0].key, scope, wk), v0 = this.expr(e.entries[0].value, scope, wv);
        if (k0.k !== "Int" && k0.k !== "String" && k0.k !== "Unknown") this.err(e.span.line, D.typeMismatch("String or Int key", showType(k0)));
        for (const en of e.entries.slice(1)) {
          this.expect(en.key.span.line, wk ?? k0, this.expr(en.key, scope, wk ?? k0), en.key);
          this.expect(en.value.span.line, wv ?? v0, this.expr(en.value, scope, wv ?? v0), en.value);
        }
        return T.map(wk ?? k0, wv ?? v0);
      }
      case "Range": {
        const a = this.expr(e.start, scope), b = this.expr(e.end, scope);
        if ((a.k !== "Int" && a.k !== "Unknown") || (b.k !== "Int" && b.k !== "Unknown")) return this.err(e.span.line, D.rangeEndsInt()) && T.list(T.Int);
        return T.list(T.Int);
      }
      case "Unary": {
        const t = this.exprNonNull(e.expr, scope);
        if (e.op === "not") { if (t.k !== "Bool" && t.k !== "Unknown") return this.err(e.span.line, D.notBool(showType(t), this.src(e.expr))); return T.Bool; }
        if (t.k === "Int" || t.k === "Float" || t.k === "Complex" || t.k === "Unknown") return t;
        return this.err(e.span.line, D.cannotOperate("-", showType(t), ""));
      }
      case "Binary": return this.binary(e, scope);
      case "Lambda": {
        const want = expected?.k === "Fn" ? expected : undefined;
        const params = e.params.map((p, i) => p.type ? this.resolveType(p.type) : want?.params[i] ?? this.err(p.span.line, D.cannotInfer(p.name)));
        const ret = this.fnBody(e.params, params, e.ret ? this.resolveType(e.ret) : undefined, e.body, scope, e.span.line);
        return T.fn(params, ret);
      }
      case "Call": return this.call(e, scope);
      case "Index": {
        const obj = this.expr(e.obj, scope);
        if (e.index.kind === "Range") {
          this.expr(e.index, scope);
          if (obj.k === "List" || obj.k === "String" || obj.k === "Unknown") return obj;
          return this.err(e.span.line, D.notIndexable(showType(obj)));
        }
        const idx = this.expr(e.index, scope, obj.k === "Map" ? obj.key : T.Int);
        if (obj.k === "List") { this.expect(e.span.line, T.Int, idx, e.index); return obj.el; }
        if (obj.k === "String") { this.expect(e.span.line, T.Int, idx, e.index); return T.String; }
        if (obj.k === "Map") { this.expect(e.span.line, obj.key, idx, e.index, true); return T.nullable(obj.val); }
        if (obj.k === "Unknown") return T.Unknown;
        return this.err(e.span.line, D.notIndexable(showType(obj)));
      }
      case "Field": {
        const obj = this.exprNonNull(e.obj, scope);
        if (obj.k === "Record") { const f = this.records.get(obj.name)?.get(e.name); return f ?? this.err(e.span.line, D.noField(obj.name, e.name)); }
        if (obj.k === "Unknown") return T.Unknown;
        if ((PROPERTIES[obj.k] ?? []).includes(e.name)) return e.name === "length" ? T.Int : T.Float;
        if (METHODS[obj.k]?.[e.name] !== undefined) return T.Unknown;    // bare method reference; the Call case handles real uses
        return this.err(e.span.line, D.noProperty(showType(obj), e.name));
      }
      case "With": {
        const t = this.exprNonNull(e.target, scope);
        if (t.k !== "Record") { if (t.k !== "Unknown") this.err(e.span.line, D.typeMismatch("a record", showType(t))); e.fields.forEach(f => this.expr(f.value, scope)); return t; }
        const fields = this.records.get(t.name)!;
        for (const f of e.fields) {
          const ft = fields.get(f.name);
          if (!ft) { this.err(e.span.line, D.noField(t.name, f.name)); this.expr(f.value, scope); continue; }
          this.expect(f.value.span.line, ft, this.expr(f.value, scope, ft), f.value);
        }
        return t;
      }
      case "Match": return this.match(e, scope, expected);
    }
  }

  /** Evaluates an expression that must not be nullable in this position. */
  exprNonNull(e: Expr, scope: Scope, expected?: Type): Type {
    const t = this.expr(e, scope, expected);
    if (t.k === "Nullable") { this.err(e.span.line, D.mayBeNull(e.kind === "Ident" ? e.name : this.src(e))); return t.inner; }
    return t;
  }

  binary(e: Extract<Expr, { kind: "Binary" }>, scope: Scope): Type {
    const line = e.span.line;
    if (e.op === "??") {
      const l = this.expr(e.left, scope);
      const inner = l.k === "Nullable" ? l.inner : l;
      const r = this.expr(e.right, scope, inner);
      if (l.k !== "Nullable" && l.k !== "Unknown" && l.k !== "Null") this.err(line, D.typeMismatch("a nullable value", showType(l)));
      if (l.k === "Null") return r.k === "Nullable" ? r.inner : r;
      this.expect(line, inner, r.k === "Nullable" ? r.inner : r, e.right);
      return inner;
    }
    if (e.op === "and" || e.op === "or") { this.condition(e.left, scope); this.condition(e.right, scope); return T.Bool; }
    if (e.op === "==" || e.op === "!=") {
      const l = this.expr(e.left, scope), r = this.expr(e.right, scope);
      if (l.k === "Null" || r.k === "Null" || l.k === "Unknown" || r.k === "Unknown") return T.Bool;
      const li = l.k === "Nullable" ? l.inner : l, ri = r.k === "Nullable" ? r.inner : r;
      if (!same(li, ri)) this.err(line, D.cannotCompare(showType(li), showType(ri), this.src(e.left), this.src(e.right)));
      return T.Bool;
    }
    if (e.op === "is") {
      const l = this.exprNonNull(e.left, scope), r = this.exprNonNull(e.right, scope);
      for (const t of [l, r]) if (!["List", "Map", "Record", "Unknown"].includes(t.k)) return this.err(line, D.isOnValue(showType(t))) && T.Bool;
      return T.Bool;
    }
    const l = this.exprNonNull(e.left, scope), r = this.exprNonNull(e.right, scope);
    if (l.k === "Unknown" || r.k === "Unknown") return ["<", "<=", ">", ">="].includes(e.op) ? T.Bool : (l.k === "Unknown" ? r : l);
    const cmp = ["<", "<=", ">", ">="].includes(e.op);
    if (l.k === "Complex" || r.k === "Complex") {
      if (cmp) return this.err(line, D.complexOrder()) && T.Bool;
      if (l.k !== r.k) return this.err(line, D.complexMix(this.src(l.k === "Complex" ? e.right : e.left)));
      if (e.op === "%") return this.err(line, D.cannotOperate("%", "Complex", "Complex"));
      return T.Complex;
    }
    if (l.k !== r.k) {
      if (e.op === "+" && ((l.k === "Int" || l.k === "Float") && r.k === "String")) return this.err(line, D.cannotAdd(l.k, r.k, this.src(e.left), this.src(e.right)));
      if (e.op === "+" && (l.k === "String" && (r.k === "Int" || r.k === "Float"))) return this.err(line, D.cannotAdd(r.k, l.k, this.src(e.right), this.src(e.left)));
      return this.err(line, D.cannotOperate(e.op, showType(l), showType(r))) && (cmp ? T.Bool : T.Unknown);
    }
    if (cmp) { if (["Int", "Float", "String"].includes(l.k)) return T.Bool; return this.err(line, D.cannotOperate(e.op, showType(l), showType(r))) && T.Bool; }
    if (l.k === "Int" || l.k === "Float") return l;
    if (l.k === "String" && e.op === "+") return T.String;
    if (l.k === "List" && e.op === "+") return l;
    return this.err(line, D.cannotOperate(e.op, showType(l), showType(r)));
  }

  call(e: Extract<Expr, { kind: "Call" }>, scope: Scope): Type {
    const line = e.span.line;
    // record construction
    if (e.callee.kind === "Ident" && this.records.has(e.callee.name) && !scope.lookup(e.callee.name)) {
      const fields = this.records.get(e.callee.name)!; const name = e.callee.name;
      const seen = new Set<string>();
      for (const n of e.named) {
        if (seen.has(n.name)) { this.err(line, D.duplicateField(n.name)); continue; } seen.add(n.name);
        const ft = fields.get(n.name);
        if (!ft) { this.err(line, D.noField(name, n.name)); this.expr(n.value, scope); continue; }
        this.expect(n.value.span.line, ft, this.expr(n.value, scope, ft), n.value);
      }
      const missing = [...fields.keys()].filter(f => !seen.has(f));
      if (missing.length) this.err(line, D.missingFields(name, missing));
      return T.rec(name);
    }
    // conversions
    if (e.callee.kind === "Ident" && ["String", "Int", "Float", "Complex"].includes(e.callee.name) && !scope.lookup(e.callee.name)) {
      if (e.args.length !== 1) return this.err(line, D.wrongArgCount(e.callee.name, 1, e.args.length));
      const a = this.exprNonNull(e.args[0], scope);
      switch (e.callee.name) {
        case "String": return T.String;
        case "Int": return a.k === "String" ? T.nullable(T.Int) : T.Int;
        case "Float": return a.k === "String" ? T.nullable(T.Float) : T.Float;
        default: return T.Complex;
      }
    }
    // method call
    if (e.callee.kind === "Field") {
      const obj = this.exprNonNull(e.callee.obj, scope); const m = e.callee.name;
      if (obj.k === "Record") {
        const ft = this.records.get(obj.name)?.get(m);
        if (!ft) return this.err(line, D.noField(obj.name, m));
        return this.applyFn(ft, e.args, scope, line, m);
      }
      if (obj.k === "Unknown") { e.args.forEach(a => this.expr(a, scope)); return T.Unknown; }
      if (m === "length" && (obj.k === "String" || obj.k === "List")) return this.err(line, D.lengthIsProperty());
      const arity = METHODS[obj.k]?.[m];
      if (arity === undefined) { e.args.forEach(a => this.expr(a, scope)); return this.err(line, D.noMethod(showType(obj), m)); }
      if (arity >= 0 && e.args.length !== arity) { e.args.forEach(a => this.expr(a, scope)); return this.err(line, D.wrongArgCount(m, arity, e.args.length)); }
      return this.method(obj, m, e.args, scope, line);
    }
    const f = this.exprNonNull(e.callee, scope);
    if (f.k === "Unknown") { e.args.forEach(a => this.expr(a, scope)); return T.Unknown; }
    if (f.k !== "Fn") { e.args.forEach(a => this.expr(a, scope)); return this.err(line, D.notCallable(showType(f))); }
    return this.applyFn(f, e.args, scope, line, this.src(e.callee));
  }

  applyFn(f: Type, args: Expr[], scope: Scope, line: number, name: string): Type {
    if (f.k !== "Fn") return T.Unknown;
    if (args.length !== f.params.length) { args.forEach(a => this.expr(a, scope)); return this.err(line, D.wrongArgCount(name, f.params.length, args.length)); }
    args.forEach((a, i) => {
      const want = f.params[i];
      const t = want.k === "Nullable" ? this.expr(a, scope, want) : this.exprNonNull(a, scope, want);
      this.expect(a.span.line, want, t, a);
    });
    return f.ret;
  }

  /** Return types of stdlib methods, with lambda inference for List callbacks. */
  method(obj: Type, m: string, args: Expr[], scope: Scope, line: number): Type {
    const argT = (i: number, want?: Type) => this.expr(args[i], scope, want);
    const need = (i: number, want: Type) => this.expect(args[i].span.line, want, argT(i, want), args[i]);
    switch (obj.k) {
      case "String":
        switch (m) {
          case "upper": case "lower": case "trim": return T.String;
          case "split": need(0, T.String); return T.list(T.String);
          case "contains": case "startsWith": case "endsWith": need(0, T.String); return T.Bool;
          case "replace": need(0, T.String); need(1, T.String); return T.String;
        }
        break;
      case "List": {
        const el = obj.el;
        switch (m) {
          case "push": need(0, el); return obj;
          case "map": { const ft = argT(0, T.fn([el], T.Unknown)); return T.list(ft.k === "Fn" ? ft.ret : T.Unknown); }
          case "filter": { const ft = argT(0, T.fn([el], T.Bool)); if (ft.k === "Fn") this.expect(line, T.Bool, ft.ret, args[0]); return obj; }
          case "reduce": { const init = argT(1); const ft = argT(0, T.fn([init, el], init)); if (ft.k === "Fn") this.expect(line, init, ft.ret, args[0]); return init; }
          case "join": need(0, T.String); return T.String;
          case "contains": need(0, el); return T.Bool;
          case "reverse": case "sort": return obj;
          case "sum": if (el.k !== "Int" && el.k !== "Float" && el.k !== "Unknown") return this.err(line, D.noMethod(showType(obj), m)); return el;
          case "min": case "max": if (el.k !== "Int" && el.k !== "Float" && el.k !== "Unknown") return this.err(line, D.noMethod(showType(obj), m)); return T.nullable(el);
        }
        break;
      }
      case "Map":
        switch (m) { case "keys": return T.list(obj.key); case "values": return T.list(obj.val); case "has": need(0, obj.key); return T.Bool; }
        break;
      case "Int":
        switch (m) {
          case "abs": case "factorial": return T.Int;
          case "pow": { if (args[0].kind === "Unary" && args[0].op === "-") return this.err(line, D.negativeIntPow()); need(0, T.Int); return T.Int; }
          case "gcd": need(0, T.Int); return T.Int;
        }
        break;
      case "Float":
        switch (m) {
          case "round": if (args.length === 1) need(0, T.Int); return T.Float;
          case "pow": { const t = argT(0); if (t.k !== "Int" && t.k !== "Float" && t.k !== "Unknown") this.err(line, D.typeMismatch("Int or Float", showType(t))); return T.Float; }
          case "atan2": need(0, T.Float); return T.Float;
          default: return T.Float;
        }
      case "Complex":
        switch (m) {
          case "abs": case "arg": return T.Float;
          case "pow": { const t = argT(0); if (t.k !== "Int" && t.k !== "Float" && t.k !== "Unknown") this.err(line, D.typeMismatch("Int or Float", showType(t))); return T.Complex; }
          default: return T.Complex;
        }
    }
    args.forEach((a) => this.expr(a, scope));
    return this.err(line, D.noMethod(showType(obj), m));
  }

  match(e: Extract<Expr, { kind: "Match" }>, scope: Scope, expected?: Type): Type {
    const subj = this.expr(e.subject, scope);
    const inner = subj.k === "Nullable" ? subj.inner : subj;
    let exhaustive = false; let sawTrue = false, sawFalse = false, sawNull = false;
    let result: Type | undefined;
    for (const arm of e.arms) {
      const armScope = new Scope(scope);
      const p = arm.pattern;
      if (p.kind === "PWild" || (p.kind === "PBind" && !arm.guard)) exhaustive = true;
      if (p.kind === "PLit" && p.value.kind === "BoolLit") { if (p.value.value) sawTrue = true; else sawFalse = true; }
      if (p.kind === "PLit" && p.value.kind === "NullLit") sawNull = true;
      this.pattern(p, p.kind === "PLit" && p.value.kind === "NullLit" ? subj : inner, armScope, arm.span.line);
      if (arm.guard) this.condition(arm.guard, armScope);
      const last = arm.body[arm.body.length - 1];
      const init = last && last.kind === "ExprStmt" ? arm.body.slice(0, -1) : arm.body;
      this.block(init, armScope);
      const t = last && last.kind === "ExprStmt" ? this.expr(last.expr, armScope, result ?? expected) : T.Null;
      if (!result) result = t;
      else if (!same(result, t) && !(result.k === "Nullable" && same(result.inner, t)) && t.k !== "Null") this.err(arm.span.line, D.armTypeMismatch(showType(result), showType(t)));
      else if (t.k === "Null" && result.k !== "Null") result = T.nullable(result);
    }
    if (inner.k === "Bool" && sawTrue && sawFalse && (subj.k !== "Nullable" || sawNull)) exhaustive = true;
    if (!exhaustive) this.err(e.span.line, D.notExhaustive());
    return result ?? T.Unknown;
  }

  pattern(p: Pattern, subject: Type, scope: Scope, line: number) {
    switch (p.kind) {
      case "PWild": return;
      case "PBind": scope.vars.set(p.name, { type: subject, isConst: false }); return;
      case "PLit": {
        const t = this.expr(p.value, scope);
        if (t.k === "Null") { if (subject.k !== "Nullable" && subject.k !== "Unknown" && subject.k !== "Null") this.err(line, D.typeMismatch(showType(subject), "Null")); return; }
        const s = subject.k === "Nullable" ? subject.inner : subject;
        if (!same(s, t)) this.err(line, D.typeMismatch(showType(s), showType(t)));
        return;
      }
      case "PRecord": {
        const fields = this.records.get(p.name);
        if (!fields) { this.err(line, D.undefinedName(p.name)); return; }
        if (subject.k !== "Unknown" && !(subject.k === "Record" && subject.name === p.name)) this.err(line, D.typeMismatch(showType(subject), p.name));
        for (const f of p.fields) {
          const ft = fields.get(f.name);
          if (!ft) { this.err(line, D.noField(p.name, f.name)); continue; }
          this.pattern(f.pattern, ft, scope, line);
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run tests and tsc; iterate on failures**

Run: `npx vitest run src/blessed/__tests__/checker.test.ts && npx tsc --noEmit`
Expected: all pass. Notes for likely failures:
- `expect` on `let x: String = null` must produce the `nullToNonNullable` message, which is why `Let` checks `actual.k === "Null"` before calling `expect`.
- `print(n)` where `n: String?` is caught in `applyFn`, which uses `exprNonNull` for every non-nullable parameter including `print`'s `Unknown`.
- The test `let m: Int = n` expects "may be null": `expect` receives `Nullable` actual with an `Ident`, which produces `mayBeNull`.

- [ ] **Step 5: Commit**

```bash
git add src/blessed/checker.ts src/blessed/__tests__/checker.test.ts
git commit -m "feat(checker): static types, nullability, Bool conditions, match exhaustiveness, style rules

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Formatter

**Files:**
- Create: `src/blessed/formatter.ts`
- Test: `src/blessed/__tests__/formatter.test.ts`

**Interfaces:**
- Consumes: AST (Task 3), `parse`.
- Produces: `format(program: Program): string` and `formatSource(code: string): { formatted: string; logs: string[] }`. The second parses, counts semicolons, renames snake_case `let` names (and their uses) to camelCase, and returns the input unchanged with the parse error as the only log when parsing fails. Also exports `exprToSource(e: Expr): string` for use by the emitters' messages.

- [ ] **Step 1: Write the failing tests**

```ts
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
print([1, 2][0..1], not true, -Infinity, (1 + 2) * 3, "s${z.re}")`;
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
    const { EXAMPLES } = await import("../examples").catch(() => ({ EXAMPLES: {} as Record<string, { code: string }> }));
    for (const ex of Object.values(EXAMPLES)) { const once = fmt(ex.code); expect(fmt(once)).toBe(once); }
    const once = fmt("let a = 1\n\n\n-- c\nlet b = [\n1,\n2\n]");
    expect(fmt(once)).toBe(once);
  });
  it("returns input unchanged with a log on parse error", () => {
    const r = formatSource("let = 1");
    expect(r.formatted).toBe("let = 1");
    expect(r.logs[0]).toMatch(/^Line 1: CompileError/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/blessed/__tests__/formatter.test.ts`
Expected: FAIL, cannot resolve `../formatter`.

- [ ] **Step 3: Write the formatter**

```ts
// src/blessed/formatter.ts
import type { Program, Stmt, Expr, TypeExpr, Pattern, Param, BinOp } from "./ast";
import { parse } from "./parser";
import { D, formatDiagnostic } from "./diagnostics";
import { showFloat } from "./values";

const IND = "    ";
const PREC: Record<string, number> = { "??": 1, "or": 2, "and": 3, "==": 4, "!=": 4, "is": 4, "<": 5, "<=": 5, ">": 5, ">=": 5, "+": 6, "-": 6, "*": 7, "/": 7, "%": 7 };

export function formatSource(code: string): { formatted: string; logs: string[] } {
  const { program, errors } = parse(code);
  if (errors.length) return { formatted: code, logs: errors.map(formatDiagnostic) };
  const logs: string[] = [];
  const renames = new Map<string, string>();
  let semis = 0;
  walkStmts(program.body, s => {
    if (s.semicolon) semis++;
    if (s.kind === "Let" && s.name.includes("_") && !/^[A-Z][A-Z0-9_]*$/.test(s.name) && !s.name.startsWith("_")) {
      const to = s.name.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
      renames.set(s.name, to); logs.push(`Formatter Warning: ${D.snakeCase(s.name, to)}`);
    }
  });
  if (renames.size) renameIdents(program, renames);
  if (semis) logs.push(`Formatter Notice: ${D.semicolonsVaporized(semis)}`);
  return { formatted: format(program), logs };
}

export function format(p: Program): string {
  const lines = stmts(p.body, 0);
  for (const c of p.trailingComments) lines.push(c);
  return lines.join("\n");
}

function stmts(body: Stmt[], depth: number): string[] {
  const out: string[] = [];
  body.forEach((s, i) => {
    const prevDecl = i > 0 && (body[i - 1].kind === "FnDecl" || body[i - 1].kind === "RecordDecl");
    const isDecl = s.kind === "FnDecl" || s.kind === "RecordDecl";
    if (i > 0 && (s.blankBefore > 0 || prevDecl || (isDecl && s.kind === "FnDecl"))) out.push("");
    for (const c of s.leading) out.push(IND.repeat(depth) + c);
    const ls = stmt(s, depth);
    if (s.trailing) ls[ls.length - 1] += " " + s.trailing;
    out.push(...ls);
  });
  return out;
}

function block(body: Stmt[], depth: number, open: string, close = "}"): string[] {
  return [open, ...stmts(body, depth + 1), IND.repeat(depth) + close];
}

function stmt(s: Stmt, depth: number): string[] {
  const p = IND.repeat(depth);
  switch (s.kind) {
    case "Let": return [`${p}let ${s.name}${s.type ? ": " + type(s.type) : ""} = ${expr(s.init)}`];
    case "Assign": return [`${p}${expr(s.target)} = ${expr(s.value)}`];
    case "ExprStmt": return [p + expr(s.expr, depth)];
    case "If": return ifChain(s, depth, `${p}if ${expr(s.cond)} {`);
    case "IfLet": return ifChain(s, depth, `${p}if let ${s.name} = ${expr(s.expr)} {`);
    case "Loop": {
      const head = s.shape === "forever" ? "loop {" : s.shape === "while" ? `loop ${expr(s.cond!)} {`
        : `loop ${s.item} in ${expr(s.iter!)}${s.despite ? " despite errors" + (s.despite.errName ? " as " + s.despite.errName : "") : ""} {`;
      return block(s.body, depth, p + head);
    }
    case "FnDecl": return block(s.body, depth, `${p}fn ${s.name}(${params(s.params)})${s.ret ? " -> " + type(s.ret) : ""} {`);
    case "RecordDecl": return [`${p}record ${s.name} { ${s.fields.map(f => `${f.name}: ${type(f.type)}`).join(", ")} }`];
    case "Return": return [`${p}return${s.expr ? " " + expr(s.expr, depth) : ""}`];
    case "Fail": return [`${p}fail ${expr(s.expr)}`];
  }
}

function ifChain(s: Extract<Stmt, { kind: "If" | "IfLet" }>, depth: number, head: string): string[] {
  const p = IND.repeat(depth);
  const out = [head, ...stmts(s.then, depth + 1)];
  let els = s.else;
  while (els) {
    if (els.length === 1 && (els[0].kind === "If" || els[0].kind === "IfLet") && els[0].leading.length === 0) {
      const n = els[0];
      out.push(`${p}} else ${n.kind === "If" ? `if ${expr(n.cond)}` : `if let ${n.name} = ${expr(n.expr)}`} {`);
      out.push(...stmts(n.then, depth + 1));
      els = n.else; continue;
    }
    out.push(`${p}} else {`, ...stmts(els, depth + 1)); break;
  }
  out.push(`${p}}`);
  return out;
}

const params = (ps: Param[]) => ps.map(x => x.name + (x.type ? ": " + type(x.type) : "")).join(", ");

export function type(t: TypeExpr): string {
  switch (t.kind) {
    case "Named": return t.name + (t.args.length ? `<${t.args.map(type).join(", ")}>` : "");
    case "Fn": return `Fn(${t.params.map(type).join(", ")}) -> ${type(t.ret)}`;
    case "Nullable": return type(t.inner) + "?";
  }
}

export function exprToSource(e: Expr): string { return expr(e, 0); }

function expr(e: Expr, depth = 0, parentPrec = 0): string {
  const p = IND.repeat(depth);
  switch (e.kind) {
    case "IntLit": return e.value.toString();
    case "FloatLit": return e.value === Infinity ? "Infinity" : showFloat(e.value);
    case "ComplexLit": return e.re === 0 ? `${num(e.im)}i` : `${num(e.re)} ${e.im < 0 ? "-" : "+"} ${num(Math.abs(e.im))}i`;
    case "StrLit": return '"' + e.parts.map(x => typeof x === "string" ? escape(x) : "${" + expr(x) + "}").join("") + '"';
    case "BoolLit": return String(e.value);
    case "NullLit": return "null";
    case "Ident": return e.name;
    case "ListLit": return `[${e.items.map(x => expr(x, depth)).join(", ")}]`;
    case "MapLit": return `{${e.entries.map(en => `${expr(en.key)}: ${expr(en.value, depth)}`).join(", ")}}`;
    case "Range": return paren(`${expr(e.start, depth, 7)}..${expr(e.end, depth, 6)}`, parentPrec > 0);
    case "Unary": return `${e.op === "not" ? "not " : "-"}${expr(e.expr, depth, 8)}`;
    case "Binary": {
      const prec = PREC[e.op];
      const s = `${expr(e.left, depth, prec)} ${e.op} ${expr(e.right, depth, prec + 1)}`;
      return paren(s, prec < parentPrec);
    }
    case "Call": {
      const args = [...e.args.map(a => expr(a, depth)), ...e.named.map(n => `${n.name}: ${expr(n.value, depth)}`)];
      return `${expr(e.callee, depth, 9)}(${args.join(", ")})`;
    }
    case "Index": return `${expr(e.obj, depth, 9)}[${e.index.kind === "Range" ? `${expr(e.index.start)}..${expr(e.index.end)}` : expr(e.index, depth)}]`;
    case "Field": return `${expr(e.obj, depth, 9)}.${e.name}`;
    case "Lambda": {
      const head = `fn(${params(e.params)})${e.ret ? " -> " + type(e.ret) : ""}`;
      if (e.body.length === 1 && e.body[0].kind === "ExprStmt" && e.body[0].leading.length === 0) return `${head} { ${expr(e.body[0].expr, depth)} }`;
      return [`${head} {`, ...stmts(e.body, depth + 1), `${p}}`].join("\n");
    }
    case "Match": {
      const arms = e.arms.map(a => {
        const head = `${IND.repeat(depth + 1)}${pattern(a.pattern)}${a.guard ? " if " + expr(a.guard) : ""} -> `;
        if (a.body.length === 1 && a.body[0].kind === "ExprStmt" && a.body[0].leading.length === 0) return head + expr(a.body[0].expr, depth + 1);
        return [head + "{", ...stmts(a.body, depth + 2), `${IND.repeat(depth + 1)}}`].join("\n");
      });
      return [`match ${expr(e.subject)} {`, ...arms, `${p}}`].join("\n");
    }
    case "With": return `${expr(e.target, depth, 9)} with { ${e.fields.map(f => `${f.name}: ${expr(f.value, depth)}`).join(", ")} }`;
  }
}

function pattern(pt: Pattern): string {
  switch (pt.kind) {
    case "PWild": return "_";
    case "PBind": return pt.name;
    case "PLit": return expr(pt.value);
    case "PRecord": return `${pt.name}(${pt.fields.map(f => `${f.name}: ${pattern(f.pattern)}`).join(", ")})`;
  }
}

const num = (n: number) => Number.isInteger(n) ? String(n) : String(n);
const paren = (s: string, yes: boolean) => yes ? `(${s})` : s;
const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t").replace(/\$\{/g, "\\${");

// ---- helpers used by formatSource
function walkStmts(body: Stmt[], f: (s: Stmt) => void) {
  for (const s of body) {
    f(s);
    const sub: Stmt[][] = [];
    if (s.kind === "If" || s.kind === "IfLet") { sub.push(s.then); if (s.else) sub.push(s.else); }
    if (s.kind === "Loop" || s.kind === "FnDecl") sub.push(s.body);
    sub.forEach(b => walkStmts(b, f));
  }
}

function renameIdents(p: Program, map: Map<string, string>) {
  const rn = (n: string) => map.get(n) ?? n;
  const ex = (e: Expr): void => {
    switch (e.kind) {
      case "Ident": e.name = rn(e.name); return;
      case "StrLit": e.parts.forEach(x => typeof x !== "string" && ex(x)); return;
      case "ListLit": e.items.forEach(ex); return;
      case "MapLit": e.entries.forEach(en => { ex(en.key); ex(en.value); }); return;
      case "Range": ex(e.start); ex(e.end); return;
      case "Unary": ex(e.expr); return;
      case "Binary": ex(e.left); ex(e.right); return;
      case "Call": ex(e.callee); e.args.forEach(ex); e.named.forEach(n => ex(n.value)); return;
      case "Index": ex(e.obj); ex(e.index); return;
      case "Field": ex(e.obj); return;
      case "Lambda": st(e.body); return;
      case "Match": ex(e.subject); e.arms.forEach(a => { if (a.guard) ex(a.guard); st(a.body); }); return;
      case "With": ex(e.target); e.fields.forEach(f => ex(f.value)); return;
      default: return;
    }
  };
  const st = (body: Stmt[]) => body.forEach(s => {
    switch (s.kind) {
      case "Let": s.name = rn(s.name); ex(s.init); return;
      case "Assign": ex(s.target); ex(s.value); return;
      case "ExprStmt": ex(s.expr); return;
      case "If": ex(s.cond); st(s.then); if (s.else) st(s.else); return;
      case "IfLet": ex(s.expr); st(s.then); if (s.else) st(s.else); return;
      case "Loop": if (s.cond) ex(s.cond); if (s.iter) ex(s.iter); st(s.body); return;
      case "FnDecl": st(s.body); return;
      case "Return": if (s.expr) ex(s.expr); return;
      case "Fail": ex(s.expr); return;
      default: return;
    }
  });
  st(p.body);
}
```

Also export `showFloat` from `values.ts` if Task 4 did not (it did, as `export function showFloat`).

- [ ] **Step 4: Run tests and tsc**

Run: `npx vitest run src/blessed/__tests__/formatter.test.ts && npx tsc --noEmit`
Expected: all pass. The big construct test pins exact spacing; if a line differs, fix the formatter to match the expected text, not the other way round. Specifically `(Float(...)).sqrt()` drops the redundant parens because Call binds tighter than Field access, and `-2` inside `x * -2` stays as a Unary on an IntLit.

- [ ] **Step 5: Commit**

```bash
git add src/blessed/formatter.ts src/blessed/__tests__/formatter.test.ts
git commit -m "feat(formatter): AST pretty-printer with comment preservation and snake_case renames

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Public API, delete the old compiler, move the reverse translators

**Files:**
- Create: `src/blessed/index.ts`
- Create: `src/blessed/translate/fromPython.ts`, `src/blessed/translate/fromTypescript.ts` (moved code)
- Create: `src/blessed/translate/python.ts`, `src/blessed/translate/typescript.ts` as stubs that throw (Tasks 11 and 12 fill them)
- Delete: `src/blessed/compiler.ts`
- Modify: `src/App.tsx:14-22` (import path)
- Test: `src/blessed/__tests__/api.test.ts`

**Interfaces:**
- Produces the seven public functions listed in Global Constraints. `executeBlessed` returns compile errors in `errors` with the header and footer lines exactly as the old compiler did, so `App.tsx` needs no logic change.

- [ ] **Step 1: Move the reverse translators**

```bash
mkdir -p src/blessed/translate
node -e '
const fs=require("fs");const src=fs.readFileSync("src/blessed/compiler.ts","utf8");
const grab=(start,end)=>{const a=src.indexOf(start);const b=end?src.indexOf(end,a):src.length;return src.slice(a,b);};
fs.writeFileSync("src/blessed/translate/fromPython.ts","// Best-effort line-based heuristics. Not a real Python parser.\n"+grab("// --- Python -> Blessed ---","// --- Blessed -> TypeScript ---"));
fs.writeFileSync("src/blessed/translate/fromTypescript.ts","// Best-effort line-based heuristics. Not a real TypeScript parser.\n"+grab("// --- TypeScript -> Blessed ---"));
'
git rm -q src/blessed/compiler.ts
```

- [ ] **Step 2: Write the failing API test**

```ts
// src/blessed/__tests__/api.test.ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/blessed/__tests__/api.test.ts`
Expected: FAIL, cannot resolve `../index`.

- [ ] **Step 4: Write index.ts and the emitter stubs**

```ts
// src/blessed/translate/python.ts   (stub, replaced in Task 11)
import type { Program } from "../ast";
export function emitPython(_p: Program): string { throw new Error("not implemented"); }
```
```ts
// src/blessed/translate/typescript.ts   (stub, replaced in Task 12)
import type { Program } from "../ast";
export function emitTypeScript(_p: Program): string { throw new Error("not implemented"); }
```
```ts
// src/blessed/index.ts
import { parse } from "./parser";
import { check } from "./checker";
import { run } from "./interpreter";
import { formatSource } from "./formatter";
import { D, formatDiagnostic } from "./diagnostics";
import { emitPython } from "./translate/python";
import { emitTypeScript } from "./translate/typescript";
export { translatePythonToBlessed } from "./translate/fromPython";
export { translateTypeScriptToBlessed } from "./translate/fromTypescript";

export interface FormatterResult { formatted: string; logs: string[] }
export interface AnalysisResult { errors: string[]; warnings: string[] }
export interface ExecutionResult { stdout: string[]; errors: string[]; executionTime: number }

export function formatBlessed(code: string): FormatterResult {
  const r = formatSource(code);
  return { formatted: r.formatted, logs: r.logs.length ? r.logs : [D.formatterClean()] };
}

export function analyzeBlessed(code: string): AnalysisResult {
  const { program, errors } = parse(code);
  if (errors.length) return { errors: errors.map(formatDiagnostic), warnings: [] };
  const diags = check(program);
  return {
    errors: diags.filter(d => d.severity === "error").map(formatDiagnostic),
    warnings: diags.filter(d => d.severity === "warning").map(formatDiagnostic),
  };
}

export function executeBlessed(code: string): ExecutionResult {
  const start = performance.now();
  const { program, errors } = parse(code);
  const compileErrors = errors.length ? errors.map(formatDiagnostic) : check(program).filter(d => d.severity === "error").map(formatDiagnostic);
  if (compileErrors.length) {
    return { stdout: [], errors: [D.compileHeader(), ...compileErrors, "", D.compileFooter()], executionTime: performance.now() - start };
  }
  const r = run(program);
  return { stdout: r.stdout, errors: r.error ? [r.error] : [], executionTime: performance.now() - start };
}

export function translateBlessedToPython(code: string): string {
  const { program, errors } = parse(code);
  if (errors.length) return errors.map(d => `# ${formatDiagnostic(d)}`).join("\n");
  return emitPython(program);
}

export function translateBlessedToTypeScript(code: string): string {
  const { program, errors } = parse(code);
  if (errors.length) return errors.map(d => `// ${formatDiagnostic(d)}`).join("\n");
  return emitTypeScript(program);
}
```

Update `src/App.tsx` line 22: change `from './blessed/compiler'` to `from './blessed'`.

- [ ] **Step 5: Run tests, tsc, and build**

Run: `npx vitest run && npx tsc --noEmit && npx vite build 2>&1 | tail -3`
Expected: all pass, build succeeds. The reverse-translator files must compile standalone: if `fromPython.ts` or `fromTypescript.ts` lack the `export` keyword on their function, add it.

- [ ] **Step 6: Commit**

```bash
git add -A src/blessed src/App.tsx
git commit -m "feat(api): wire the new engine behind the existing public API; remove regex compiler

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Python emitter

**Files:**
- Replace: `src/blessed/translate/python.ts`
- Test: `src/blessed/__tests__/translate.test.ts` (Python half)
- Create: `src/blessed/__tests__/golden/` (golden files are written by the test on first run, see Step 3)

**Interfaces:**
- Consumes: AST, `showFloat` from values, `exprToSource` from formatter for comments.
- Produces: `emitPython(program: Program): string`. Output targets Python 3.10+. A prelude with helpers is emitted only when the program uses the corresponding feature:
  - `_bdiv(a, b)` and `_bmod(a, b)` for Int `/` and `%` (truncate toward zero, fail on zero).
  - `_fcheck(x)` raises on NaN.
  - `from dataclasses import dataclass, replace` when records are used.
  - `from typing import Optional, Callable` when nullable or function types are used.

- [ ] **Step 1: Write the failing tests**

```ts
// src/blessed/__tests__/translate.test.ts
import { describe, it, expect } from "vitest";
import { parse } from "../parser";
import { emitPython } from "../translate/python";

const py = (src: string) => { const { program, errors } = parse(src); expect(errors).toEqual([]); return emitPython(program); };

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
    expect(py("print(7 / 2)\nprint(-7 % 2)")).toBe(
      'def _bdiv(a, b):\n    if b == 0:\n        raise ZeroDivisionError("Division by zero. Int is a count and there is no infinite count.")\n    q = abs(a) // abs(b)\n    return q if (a >= 0) == (b >= 0) else -q\n\ndef _bmod(a, b):\n    if b == 0:\n        raise ZeroDivisionError("Division by zero. Int is a count and there is no infinite count.")\n    return a - b * _bdiv(a, b)\n\nprint(_bdiv(7, 2))\nprint(_bmod(-7, 2))');
    expect(py("print(7.0 / 2.0)")).toBe("print(7.0 / 2.0)");
  });
  it("functions, lambdas, records, with, match", () => {
    const src = 'record Point { x: Int, y: Int }\nfn norm(p: Point) -> Int {\n    return p.x * p.x + p.y * p.y\n}\nlet p = Point(x: 3, y: 4)\nlet q = p with { x: 0 }\nlet double = fn(n: Int) { n * 2 }\nlet label = match norm(p) {\n    25 -> "five"\n    n if n > 100 -> "big"\n    _ -> "other"\n}\nprint(match q {\n    Point(x: 0, y: yy) -> "axis ${yy}"\n    _ -> "off"\n})';
    expect(py(src)).toBe(
      'from dataclasses import dataclass, replace\n\n@dataclass(frozen=True)\nclass Point:\n    x: int\n    y: int\n\ndef norm(p: Point) -> int:\n    return p.x * p.x + p.y * p.y\n\np = Point(x=3, y=4)\nq = replace(p, x=0)\ndouble = lambda n: n * 2\nmatch norm(p):\n    case 25:\n        label = "five"\n    case n if n > 100:\n        label = "big"\n    case _:\n        label = "other"\ndef _match_1(_subject):\n    match _subject:\n        case Point(x=0, y=yy):\n            return f"axis {yy}"\n        case _:\n            return "off"\nprint(_match_1(q))');
  });
  it("ranges, slices, negative index, complex, infinity, lists and maps, methods", () => {
    expect(py('let xs = [3, 1, 2]\nprint(xs[-1], xs[0..2], 0..3)\nlet m = {"a": 1}\nprint(m["a"] ?? 0, m.has("a"), xs.length, xs.sort(), xs.map(fn(x) { x * 2 }), "a,b".split(","), 2.pow(10), 3 + 4i, Infinity, (2.0).sqrt())')).toBe(
      'import math\n\nxs = [3, 1, 2]\nprint(xs[-1], xs[0:2], list(range(0, 3)))\nm = {"a": 1}\nprint((m.get("a") if m.get("a") is not None else 0), ("a" in m), len(xs), sorted(xs), [(lambda x: x * 2)(_x) for _x in xs], "a,b".split(","), 2 ** 10, complex(3, 4), math.inf, math.sqrt(2.0))');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/blessed/__tests__/translate.test.ts`
Expected: FAIL with "not implemented".

- [ ] **Step 3: Write the Python emitter**

```ts
// src/blessed/translate/python.ts
import type { Program, Stmt, Expr, TypeExpr, Pattern, Param } from "../ast";
import { showFloat } from "../values";
import { D } from "../diagnostics";

const IND = "    ";
const PREC: Record<string, number> = { "??": 1, "or": 2, "and": 3, "==": 4, "!=": 4, "is": 4, "<": 5, "<=": 5, ">": 5, ">=": 5, "+": 6, "-": 6, "*": 7, "/": 7, "%": 7 };

export function emitPython(p: Program): string {
  const em = new Py();
  const body = em.stmts(p.body, 0);
  const lines: string[] = [];
  const imports: string[] = [];
  if (em.uses.has("dataclass")) imports.push("from dataclasses import dataclass, replace");
  if (em.uses.has("typing")) imports.push(`from typing import ${[...em.typing].sort().join(", ")}`);
  if (em.uses.has("math")) imports.push("import math");
  if (imports.length) lines.push(...imports, "");
  if (em.uses.has("bdiv")) lines.push(
    "def _bdiv(a, b):", `${IND}if b == 0:`, `${IND}${IND}raise ZeroDivisionError(${JSON.stringify(D.divByZero())})`,
    `${IND}q = abs(a) // abs(b)`, `${IND}return q if (a >= 0) == (b >= 0) else -q`, "",
    "def _bmod(a, b):", `${IND}if b == 0:`, `${IND}${IND}raise ZeroDivisionError(${JSON.stringify(D.divByZero())})`,
    `${IND}return a - b * _bdiv(a, b)`, "");
  lines.push(...em.hoisted, ...body);
  for (const c of p.trailingComments) lines.push(em.comment(c));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

class Py {
  uses = new Set<string>();
  typing = new Set<string>();
  hoisted: string[] = [];     // match-expression helper functions, emitted before the statement that uses them
  matchCounter = 0;
  comment(c: string) { return "#" + c.slice(2); }

  stmts(body: Stmt[], depth: number): string[] {
    const out: string[] = [];
    body.forEach((s, i) => {
      if (i > 0 && (s.blankBefore > 0 || body[i - 1].kind === "FnDecl" || body[i - 1].kind === "RecordDecl")) out.push("");
      for (const c of s.leading) out.push(IND.repeat(depth) + this.comment(c));
      const before = this.hoisted.length;
      const ls = this.stmt(s, depth);
      const hoisted = this.hoisted.splice(before);
      out.push(...hoisted.map(l => IND.repeat(depth) + l), ...ls);
      if (s.trailing) out[out.length - 1] += "  " + this.comment(s.trailing);
    });
    if (out.length === 0) out.push(IND.repeat(depth) + "pass");
    return out;
  }

  stmt(s: Stmt, depth: number): string[] {
    const p = IND.repeat(depth);
    switch (s.kind) {
      case "Let": {
        // `let x = match ... { }` becomes a statement-level match assigning x in every arm
        if (s.init.kind === "Match") return this.matchStmt(s.init, depth, s.name);
        return [`${p}${s.name}${s.type ? ": " + this.type(s.type) : ""} = ${this.expr(s.init)}`];
      }
      case "Assign": return [`${p}${this.expr(s.target)} = ${this.expr(s.value)}`];
      case "ExprStmt": return [`${p}${this.expr(s.expr)}`];
      case "If": return this.ifChain(s, depth, `${p}if ${this.expr(s.cond)}:`);
      case "IfLet": return [`${p}${s.name} = ${this.expr(s.expr)}`, ...this.ifChain(s, depth, `${p}if ${s.name} is not None:`)];
      case "Loop": {
        if (s.shape === "forever") return [`${p}while True:`, ...this.stmts(s.body, depth + 1)];
        if (s.shape === "while") return [`${p}while ${this.expr(s.cond!)}:`, ...this.stmts(s.body, depth + 1)];
        const head = `${p}for ${s.item} in ${this.expr(s.iter!)}:`;
        if (!s.despite) return [head, ...this.stmts(s.body, depth + 1)];
        const name = s.despite.errName;
        const pre = name ? [`${p}${name} = None`] : [];
        const handler = name ? [`${p}${IND}except Exception as _err:`, `${p}${IND}${IND}${name} = str(_err)`] : [`${p}${IND}except Exception:`, `${p}${IND}${IND}pass`];
        return [...pre, head, `${p}${IND}try:`, ...this.stmts(s.body, depth + 2), ...handler];
      }
      case "FnDecl": {
        const ps = s.params.map(x => `${x.name}${x.type ? ": " + this.type(x.type) : ""}`).join(", ");
        return [`${p}def ${s.name}(${ps})${s.ret ? " -> " + this.type(s.ret) : ""}:`, ...this.fnBody(s.body, depth + 1)];
      }
      case "RecordDecl": {
        this.uses.add("dataclass");
        return [`${p}@dataclass(frozen=True)`, `${p}class ${s.name}:`, ...(s.fields.length ? s.fields.map(f => `${p}${IND}${f.name}: ${this.type(f.type)}`) : [`${p}${IND}pass`])];
      }
      case "Return": return [`${p}return${s.expr ? " " + this.expr(s.expr) : ""}`];
      case "Fail": return [`${p}raise Exception(${this.expr(s.expr)})`];
    }
  }

  /** A function body whose trailing expression statement is an implicit return. */
  fnBody(body: Stmt[], depth: number): string[] {
    const last = body[body.length - 1];
    if (last && last.kind === "ExprStmt") {
      const init = this.stmts(body.slice(0, -1), depth).filter(l => l.trim() !== "pass");
      return [...init, `${IND.repeat(depth)}return ${this.expr(last.expr)}`];
    }
    return this.stmts(body, depth);
  }

  ifChain(s: Extract<Stmt, { kind: "If" | "IfLet" }>, depth: number, head: string): string[] {
    const p = IND.repeat(depth);
    const out = [head, ...this.stmts(s.then, depth + 1)];
    let els = s.else;
    while (els) {
      if (els.length === 1 && els[0].kind === "If" && els[0].leading.length === 0) {
        out.push(`${p}elif ${this.expr(els[0].cond)}:`, ...this.stmts(els[0].then, depth + 1)); els = els[0].else; continue;
      }
      out.push(`${p}else:`, ...this.stmts(els, depth + 1)); break;
    }
    return out;
  }

  matchStmt(m: Extract<Expr, { kind: "Match" }>, depth: number, target: string): string[] {
    const p = IND.repeat(depth);
    const out = [`${p}match ${this.expr(m.subject)}:`];
    for (const a of m.arms) {
      out.push(`${p}${IND}case ${this.pattern(a.pattern)}${a.guard ? " if " + this.expr(a.guard) : ""}:`);
      const last = a.body[a.body.length - 1];
      const init = a.body.slice(0, last && last.kind === "ExprStmt" ? -1 : undefined);
      out.push(...this.stmts(init, depth + 2).filter(l => l.trim() !== "pass"));
      out.push(`${p}${IND}${IND}${target} = ${last && last.kind === "ExprStmt" ? this.expr(last.expr) : "None"}`);
    }
    return out;
  }

  /** Match used as an expression: hoist into a helper function returning the arm value. */
  matchExpr(m: Extract<Expr, { kind: "Match" }>): string {
    const name = `_match_${++this.matchCounter}`;
    const lines = [`def ${name}(_subject):`, `${IND}match _subject:`];
    for (const a of m.arms) {
      lines.push(`${IND}${IND}case ${this.pattern(a.pattern)}${a.guard ? " if " + this.expr(a.guard) : ""}:`);
      const last = a.body[a.body.length - 1];
      const init = a.body.slice(0, last && last.kind === "ExprStmt" ? -1 : undefined);
      lines.push(...this.stmts(init, 3).filter(l => l.trim() !== "pass"));
      lines.push(`${IND}${IND}${IND}return ${last && last.kind === "ExprStmt" ? this.expr(last.expr) : "None"}`);
    }
    this.hoisted.push(...lines);
    return `${name}(${this.expr(m.subject)})`;
  }

  pattern(pt: Pattern): string {
    switch (pt.kind) {
      case "PWild": return "_";
      case "PBind": return pt.name;
      case "PLit": return this.expr(pt.value);
      case "PRecord": return `${pt.name}(${pt.fields.map(f => `${f.name}=${this.pattern(f.pattern)}`).join(", ")})`;
    }
  }

  type(t: TypeExpr): string {
    switch (t.kind) {
      case "Nullable": this.uses.add("typing"); this.typing.add("Optional"); return `Optional[${this.type(t.inner)}]`;
      case "Fn": this.uses.add("typing"); this.typing.add("Callable"); return `Callable[[${t.params.map(x => this.type(x)).join(", ")}], ${this.type(t.ret)}]`;
      case "Named":
        switch (t.name) {
          case "Int": return "int"; case "Float": return "float"; case "String": return "str"; case "Bool": return "bool"; case "Complex": return "complex";
          case "List": return `list[${t.args[0] ? this.type(t.args[0]) : "object"}]`;
          case "Map": return `dict[${t.args.map(x => this.type(x)).join(", ") || "object, object"}]`;
          default: return t.name;
        }
    }
  }

  expr(e: Expr, parentPrec = 0): string {
    const paren = (s: string, prec: number) => prec < parentPrec ? `(${s})` : s;
    switch (e.kind) {
      case "IntLit": return e.value.toString();
      case "FloatLit": if (!Number.isFinite(e.value)) { this.uses.add("math"); return e.value > 0 ? "math.inf" : "-math.inf"; } return showFloat(e.value);
      case "ComplexLit": return `complex(${e.re}, ${e.im})`;
      case "StrLit": {
        if (e.parts.every(x => typeof x === "string")) return JSON.stringify(e.parts.join(""));
        return 'f"' + e.parts.map(x => typeof x === "string" ? JSON.stringify(x).slice(1, -1).replace(/\{/g, "{{").replace(/\}/g, "}}") : `{${this.expr(x)}}`).join("") + '"';
      }
      case "BoolLit": return e.value ? "True" : "False";
      case "NullLit": return "None";
      case "Ident": return e.name;
      case "ListLit": return `[${e.items.map(x => this.expr(x)).join(", ")}]`;
      case "MapLit": return `{${e.entries.map(en => `${this.expr(en.key)}: ${this.expr(en.value)}`).join(", ")}}`;
      case "Range": return `list(range(${this.expr(e.start)}, ${this.expr(e.end)}))`;
      case "Unary": return e.op === "not" ? paren(`not ${this.expr(e.expr, 8)}`, 3) : `-${this.expr(e.expr, 8)}`;
      case "Binary": {
        const prec = PREC[e.op];
        if (e.op === "??") { const l = this.expr(e.left, 2); return `(${l} if ${l} is not None else ${this.expr(e.right, 2)})`; }
        if (e.op === "is") return paren(`${this.expr(e.left, 5)} is ${this.expr(e.right, 5)}`, 4);
        if ((e.op === "/" || e.op === "%") && this.isIntExpr(e.left) && this.isIntExpr(e.right)) { this.uses.add("bdiv"); return `${e.op === "/" ? "_bdiv" : "_bmod"}(${this.expr(e.left)}, ${this.expr(e.right)})`; }
        return paren(`${this.expr(e.left, prec)} ${e.op} ${this.expr(e.right, prec + 1)}`, prec);
      }
      case "Call": return this.call(e);
      case "Index": {
        const obj = this.expr(e.obj, 9);
        if (e.index.kind === "Range") return `${obj}[${this.expr(e.index.start)}:${this.expr(e.index.end)}]`;
        if (e.obj.kind === "Ident" && /^m/.test(e.obj.name) && e.index.kind === "StrLit") return `${obj}.get(${this.expr(e.index)})`;   // map lookups are nullable
        return `${obj}[${this.expr(e.index)}]`;
      }
      case "Field": {
        const obj = this.expr(e.obj, 9);
        if (e.name === "length") return `len(${obj})`;
        if (e.name === "re") return `${obj}.real`;
        if (e.name === "im") return `${obj}.imag`;
        return `${obj}.${e.name}`;
      }
      case "Lambda": {
        const ps = e.params.map(x => x.name).join(", ");
        if (e.body.length === 1 && e.body[0].kind === "ExprStmt") return `lambda ${ps}: ${this.expr(e.body[0].expr)}`;
        const name = `_fn_${++this.matchCounter}`;
        this.hoisted.push(`def ${name}(${ps}):`, ...this.fnBody(e.body, 1));
        return name;
      }
      case "Match": return this.matchExpr(e);
      case "With": this.uses.add("dataclass"); return `replace(${this.expr(e.target)}, ${e.fields.map(f => `${f.name}=${this.expr(f.value)}`).join(", ")})`;
    }
  }

  /** Conservative syntactic test used to decide between `/` and `_bdiv`: Int literals, negations of them, and arithmetic over them. Identifiers are assumed Int unless they end in a Float-looking suffix; the checker guarantees homogeneity. */
  isIntExpr(e: Expr): boolean {
    switch (e.kind) {
      case "IntLit": return true;
      case "FloatLit": case "ComplexLit": case "StrLit": return false;
      case "Unary": return e.op === "-" && this.isIntExpr(e.expr);
      case "Binary": return ["+", "-", "*", "/", "%"].includes(e.op) && this.isIntExpr(e.left) && this.isIntExpr(e.right);
      case "Ident": return true;
      case "Field": return e.name === "length";
      case "Call": return !(e.callee.kind === "Ident" && e.callee.name === "Float") && !(e.callee.kind === "Field" && ["sqrt", "abs", "arg", "exp", "log", "floor", "ceil", "round"].includes(e.callee.name));
      default: return false;
    }
  }

  call(e: Extract<Expr, { kind: "Call" }>): string {
    const args = e.args.map(a => this.expr(a));
    if (e.callee.kind === "Ident") {
      const n = e.callee.name;
      if (e.named.length) return `${n}(${e.named.map(x => `${x.name}=${this.expr(x.value)}`).join(", ")})`;
      if (n === "String") return `str(${args[0]})`;
      if (n === "Int") return e.args[0].kind === "StrLit" || (e.args[0].kind === "Ident") ? `(int(${args[0]}) if str(${args[0]}).strip().lstrip("-").isdigit() else None)` : `int(${args[0]})`;
      if (n === "Float") return `float(${args[0]})`;
      if (n === "Complex") return `complex(${args[0]})`;
      return `${n}(${args.join(", ")})`;
    }
    if (e.callee.kind === "Field") {
      const obj = this.expr(e.callee.obj, 9); const m = e.callee.name;
      switch (m) {
        case "upper": return `${obj}.upper()`; case "lower": return `${obj}.lower()`; case "trim": return `${obj}.strip()`;
        case "split": return `${obj}.split(${args[0]})`; case "contains": return `(${args[0]} in ${obj})`;
        case "startsWith": return `${obj}.startswith(${args[0]})`; case "endsWith": return `${obj}.endswith(${args[0]})`;
        case "replace": return `${obj}.replace(${args[0]}, ${args[1]})`;
        case "push": return `(${obj} + [${args[0]}])`;
        case "map": return `[(${args[0]})(_x) for _x in ${obj}]`;
        case "filter": return `[_x for _x in ${obj} if (${args[0]})(_x)]`;
        case "reduce": this.uses.add("functools"); return `__import__("functools").reduce(${args[0]}, ${obj}, ${args[1]})`;
        case "join": return `${args[0]}.join(str(_x) for _x in ${obj})`;
        case "reverse": return `list(reversed(${obj}))`; case "sort": return `sorted(${obj})`;
        case "sum": return `sum(${obj})`; case "min": return `(min(${obj}) if ${obj} else None)`; case "max": return `(max(${obj}) if ${obj} else None)`;
        case "keys": return `list(${obj}.keys())`; case "values": return `list(${obj}.values())`; case "has": return `(${args[0]} in ${obj})`;
        case "abs": return `abs(${obj})`; case "pow": return `${obj} ** ${args[0]}`;
        case "gcd": this.uses.add("math"); return `math.gcd(${obj}, ${args[0]})`;
        case "factorial": this.uses.add("math"); return `math.factorial(${obj})`;
        case "floor": this.uses.add("math"); return `float(math.floor(${obj}))`; case "ceil": this.uses.add("math"); return `float(math.ceil(${obj}))`;
        case "round": return `float(round(${obj}${args.length ? ", " + args[0] : ""}))`;
        case "sqrt": case "sin": case "cos": case "tan": case "asin": case "acos": case "atan": case "exp": case "log":
          this.uses.add("math"); return `math.${m}(${obj})`;
        case "atan2": this.uses.add("math"); return `math.atan2(${obj}, ${args[0]})`;
        case "conj": return `${obj}.conjugate()`; case "arg": this.uses.add("math"); return `math.atan2(${obj}.imag, ${obj}.real)`;
      }
      return `${obj}.${m}(${args.join(", ")})`;
    }
    return `${this.expr(e.callee, 9)}(${args.join(", ")})`;
  }
}
```

Note: `isIntExpr` cannot see checker types, so the emitter guesses. Identifiers default to Int, which is right for the examples and for counted loops; a Float variable divided by another Float variable would emit `_bdiv` wrongly. Fix this properly in Step 4 by threading checker types: add `export function checkWithTypes(program): { diags, typeOf: (e: Expr) => Type }` to `checker.ts` that records `this.types.set(e, t)` in `expr()` before returning, and have `emitPython` call it and use `typeOf(e).k === "Int"` in place of `isIntExpr`. Do the same for the map-lookup heuristic (`typeOf(e.obj).k === "Map"` instead of the name test) and for `Int(x)` (String argument gives the null-returning form).

- [ ] **Step 4: Thread checker types into the emitter**

In `checker.ts`:
```ts
export function checkWithTypes(program: Program): { diags: Diagnostic[]; typeOf: (e: Expr) => Type } {
  const c = new Checker();
  c.block(program.body, c.global);
  return { diags: c.diags.sort((a, b) => a.line - b.line), typeOf: (e) => c.types.get(e) ?? { k: "Unknown" } };
}
```
Add `types = new WeakMap<Expr, Type>();` to `Checker`, rename the existing `expr` method to `exprInner`, and add:
```ts
expr(e: Expr, scope: Scope, expected?: Type): Type { const t = this.exprInner(e, scope, expected); this.types.set(e, t); return t; }
```
In `python.ts`, `emitPython` becomes `const { typeOf } = checkWithTypes(p); const em = new Py(typeOf);`, the constructor stores it, `isIntExpr(e)` becomes `this.typeOf(e).k === "Int"`, the Index case tests `this.typeOf(e.obj).k === "Map"`, and the `Int(` conversion tests `this.typeOf(e.args[0]).k === "String"`.

- [ ] **Step 5: Run tests and tsc**

Run: `npx vitest run src/blessed/__tests__/translate.test.ts && npx tsc --noEmit`
Expected: all pass. Adjust the expected strings only where the emitted Python is semantically right and the test string was wrong, and say so in the commit message.

- [ ] **Step 6: Commit**

```bash
git add src/blessed/translate/python.ts src/blessed/checker.ts src/blessed/__tests__/translate.test.ts
git commit -m "feat(translate): AST-based BLESSED to Python emitter using checker types

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: TypeScript emitter

**Files:**
- Replace: `src/blessed/translate/typescript.ts`
- Test: `src/blessed/__tests__/translate.test.ts` (append TypeScript half)

**Interfaces:**
- Consumes: AST, `checkWithTypes`, `showFloat`.
- Produces: `emitTypeScript(program: Program): string`. Int becomes `bigint` with `n` literals. A prelude is emitted only for features used: `blessedEq` (deep equality), `blessedRange`, `blessedDiv`/`blessedMod`, `blessedCheck` (NaN refusal), class `Complex`, `blessedIntParse`.

- [ ] **Step 1: Append the failing tests**

```ts
// append to src/blessed/__tests__/translate.test.ts
import { emitTypeScript } from "../translate/typescript";
const ts = (src: string) => { const { program, errors } = parse(src); expect(errors).toEqual([]); return emitTypeScript(program); };

describe("typescript emitter", () => {
  it("hello world", () => {
    expect(ts('-- hello.blessed\nlet recipients = ["World", "Nurse"]\n\nloop r in recipients {\n    print("Hello, ${r}!")\n}')).toBe(
      '// hello.blessed\nlet recipients = ["World", "Nurse"];\n\nfor (const r of recipients) {\n    console.log(`Hello, ${r}!`);\n}');
  });
  it("types, Int as bigint, nullable, ??, if let", () => {
    expect(ts('let n: String? = null\nlet k: Int = 5\nprint(n ?? "x")\nif let v = n {\n    print(v)\n}')).toBe(
      'let n: string | null = null;\nlet k: bigint = 5n;\nconsole.log(n ?? "x");\n{\n    const v = n;\n    if (v !== null) {\n        console.log(v);\n    }\n}');
  });
  it("structural equality uses a helper; is uses ===", () => {
    expect(ts("let a = [1]\nprint(a == [1], a is a)")).toBe(
      'function blessedEq(a: unknown, b: unknown): boolean {\n    if (a === b) return true;\n    if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;\n    if (Array.isArray(a) !== Array.isArray(b)) return false;\n    if (a instanceof Map && b instanceof Map) return a.size === b.size && [...a].every(([k, v]) => b.has(k) && blessedEq(v, b.get(k)));\n    const ka = Object.keys(a as object), kb = Object.keys(b as object);\n    return ka.length === kb.length && ka.every(k => blessedEq((a as any)[k], (b as any)[k]));\n}\n\nlet a = [1n];\nconsole.log(blessedEq(a, [1n]), a === a);');
  });
  it("loops, despite errors, fail, if chain, Int division", () => {
    expect(ts('let i = 0\nloop i < 2 {\n    i = i + 1\n}\nloop x in [1, 2] despite errors as e {\n    if x == 2 {\n        fail "two"\n    } else if x == 1 {\n        print(7 / x)\n    } else {\n        print("no")\n    }\n}')).toBe(
      'function blessedDiv(a: bigint, b: bigint): bigint {\n    if (b === 0n) throw new Error("Division by zero. Int is a count and there is no infinite count.");\n    return a / b;\n}\n\nlet i = 0n;\nwhile (i < 2n) {\n    i = i + 1n;\n}\nlet e: string | null = null;\nfor (const x of [1n, 2n]) {\n    try {\n        if (x === 2n) {\n            throw new Error("two");\n        } else if (x === 1n) {\n            console.log(blessedDiv(7n, x));\n        } else {\n            console.log("no");\n        }\n    } catch (err) {\n        e = err instanceof Error ? err.message : String(err);\n    }\n}');
  });
  it("functions, records, with, match, ranges, complex", () => {
    const src = 'record Point { x: Int, y: Int }\nfn norm(p: Point) -> Int {\n    return p.x * p.x + p.y * p.y\n}\nlet p = Point(x: 3, y: 4)\nlet q = p with { x: 0 }\nlet label = match norm(p) {\n    25 -> "five"\n    n if n > 100 -> "big"\n    _ -> "other"\n}\nprint(match q {\n    Point(x: 0, y: yy) -> "axis ${yy}"\n    _ -> "off"\n})\nloop i in 0..3 {\n    print(i)\n}\nlet z = 3 + 4i\nprint(z.abs(), Infinity, (2.0).sqrt(), [3, 1].sort(), "a,b".split(",").length)';
    expect(ts(src)).toBe(
      'function blessedRange(a: bigint, b: bigint): bigint[] {\n    const out: bigint[] = [];\n    for (let i = a; i < b; i++) out.push(i);\n    return out;\n}\n\nclass Complex {\n    constructor(public re: number, public im: number) {}\n    add(o: Complex) { return new Complex(this.re + o.re, this.im + o.im); }\n    sub(o: Complex) { return new Complex(this.re - o.re, this.im - o.im); }\n    mul(o: Complex) { return new Complex(this.re * o.re - this.im * o.im, this.re * o.im + this.im * o.re); }\n    div(o: Complex) { const d = o.re * o.re + o.im * o.im; if (d === 0) throw new Error("Division by zero. Int is a count and there is no infinite count."); return new Complex((this.re * o.re + this.im * o.im) / d, (this.im * o.re - this.re * o.im) / d); }\n    abs() { return Math.hypot(this.re, this.im); }\n    arg() { return Math.atan2(this.im, this.re); }\n    conj() { return new Complex(this.re, -this.im); }\n    toString() { return this.re === 0 ? `${this.im}i` : `${this.re} ${this.im < 0 ? "-" : "+"} ${Math.abs(this.im)}i`; }\n}\n\ninterface Point { x: bigint; y: bigint }\nconst Point = (f: Point): Point => ({ ...f });\n\nfunction norm(p: Point): bigint {\n    return p.x * p.x + p.y * p.y;\n}\n\nlet p = Point({ x: 3n, y: 4n });\nlet q = { ...p, x: 0n };\nlet label = ((_s) => {\n    if (_s === 25n) return "five";\n    { const n = _s; if (n > 100n) return "big"; }\n    return "other";\n})(norm(p));\nconsole.log(((_s) => {\n    if (_s.x === 0n) { const yy = _s.y; return `axis ${yy}`; }\n    return "off";\n})(q));\nfor (const i of blessedRange(0n, 3n)) {\n    console.log(i);\n}\nlet z = new Complex(3, 4);\nconsole.log(z.abs(), Infinity, Math.sqrt(2.0), [...[3n, 1n]].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), BigInt("a,b".split(",").length));');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/blessed/__tests__/translate.test.ts -t "typescript"`
Expected: FAIL with "not implemented".

- [ ] **Step 3: Write the TypeScript emitter**

```ts
// src/blessed/translate/typescript.ts
import type { Program, Stmt, Expr, TypeExpr, Pattern } from "../ast";
import { showFloat } from "../values";
import { D } from "../diagnostics";
import { checkWithTypes, Type } from "../checker";

const IND = "    ";
const PREC: Record<string, number> = { "??": 1, "or": 2, "and": 3, "==": 4, "!=": 4, "is": 4, "<": 5, "<=": 5, ">": 5, ">=": 5, "+": 6, "-": 6, "*": 7, "/": 7, "%": 7 };

const PRELUDE: Record<string, string> = {
  blessedEq: `function blessedEq(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (a instanceof Map && b instanceof Map) return a.size === b.size && [...a].every(([k, v]) => b.has(k) && blessedEq(v, b.get(k)));
    const ka = Object.keys(a as object), kb = Object.keys(b as object);
    return ka.length === kb.length && ka.every(k => blessedEq((a as any)[k], (b as any)[k]));
}`,
  blessedDiv: `function blessedDiv(a: bigint, b: bigint): bigint {
    if (b === 0n) throw new Error(${JSON.stringify(D.divByZero())});
    return a / b;
}`,
  blessedMod: `function blessedMod(a: bigint, b: bigint): bigint {
    if (b === 0n) throw new Error(${JSON.stringify(D.divByZero())});
    return a % b;
}`,
  blessedCheck: `function blessedCheck(x: number): number {
    if (Number.isNaN(x)) throw new Error("Result is not a number. We will not pretend it is.");
    return x;
}`,
  blessedRange: `function blessedRange(a: bigint, b: bigint): bigint[] {
    const out: bigint[] = [];
    for (let i = a; i < b; i++) out.push(i);
    return out;
}`,
  blessedIntParse: `function blessedIntParse(s: string): bigint | null {
    return /^\\s*-?\\d+\\s*$/.test(s) ? BigInt(s.trim()) : null;
}`,
  Complex: `class Complex {
    constructor(public re: number, public im: number) {}
    add(o: Complex) { return new Complex(this.re + o.re, this.im + o.im); }
    sub(o: Complex) { return new Complex(this.re - o.re, this.im - o.im); }
    mul(o: Complex) { return new Complex(this.re * o.re - this.im * o.im, this.re * o.im + this.im * o.re); }
    div(o: Complex) { const d = o.re * o.re + o.im * o.im; if (d === 0) throw new Error(${JSON.stringify(D.divByZero())}); return new Complex((this.re * o.re + this.im * o.im) / d, (this.im * o.re - this.re * o.im) / d); }
    abs() { return Math.hypot(this.re, this.im); }
    arg() { return Math.atan2(this.im, this.re); }
    conj() { return new Complex(this.re, -this.im); }
    toString() { return this.re === 0 ? \`\${this.im}i\` : \`\${this.re} \${this.im < 0 ? "-" : "+"} \${Math.abs(this.im)}i\`; }
}`,
};
const PRELUDE_ORDER = ["blessedEq", "blessedDiv", "blessedMod", "blessedCheck", "blessedRange", "blessedIntParse", "Complex"];

export function emitTypeScript(p: Program): string {
  const { typeOf } = checkWithTypes(p);
  const em = new Ts(typeOf);
  const body = em.stmts(p.body, 0);
  const pre = PRELUDE_ORDER.filter(k => em.uses.has(k)).map(k => PRELUDE[k]);
  const lines = [...(pre.length ? [pre.join("\n\n"), ""] : []), ...body, ...p.trailingComments.map(c => "//" + c.slice(2))];
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

class Ts {
  uses = new Set<string>();
  constructor(private typeOf: (e: Expr) => Type) {}
  k(e: Expr) { return this.typeOf(e).k; }

  stmts(body: Stmt[], depth: number): string[] {
    const out: string[] = [];
    body.forEach((s, i) => {
      if (i > 0 && (s.blankBefore > 0 || body[i - 1].kind === "FnDecl" || body[i - 1].kind === "RecordDecl")) out.push("");
      for (const c of s.leading) out.push(IND.repeat(depth) + "//" + c.slice(2));
      const ls = this.stmt(s, depth);
      if (s.trailing) ls[ls.length - 1] += " //" + s.trailing.slice(2);
      out.push(...ls);
    });
    return out;
  }

  stmt(s: Stmt, depth: number): string[] {
    const p = IND.repeat(depth);
    switch (s.kind) {
      case "Let": return [`${p}let ${s.name}${s.type ? ": " + this.type(s.type) : ""} = ${this.expr(s.init, depth)};`];
      case "Assign": return [`${p}${this.expr(s.target, depth)} = ${this.expr(s.value, depth)};`];
      case "ExprStmt": return [`${p}${this.expr(s.expr, depth)};`];
      case "If": return this.ifChain(s, depth, `${p}if (${this.expr(s.cond, depth)}) {`);
      case "IfLet": return [`${p}{`, `${p}${IND}const ${s.name} = ${this.expr(s.expr, depth + 1)};`, ...this.ifChain(s, depth + 1, `${p}${IND}if (${s.name} !== null) {`), `${p}}`];
      case "Loop": {
        if (s.shape === "forever") return [`${p}while (true) {`, ...this.stmts(s.body, depth + 1), `${p}}`];
        if (s.shape === "while") return [`${p}while (${this.expr(s.cond!, depth)}) {`, ...this.stmts(s.body, depth + 1), `${p}}`];
        const head = `${p}for (const ${s.item} of ${this.expr(s.iter!, depth)}) {`;
        if (!s.despite) return [head, ...this.stmts(s.body, depth + 1), `${p}}`];
        const name = s.despite.errName;
        const pre = name ? [`${p}let ${name}: string | null = null;`] : [];
        const bind = name ? [`${p}${IND}${IND}${name} = err instanceof Error ? err.message : String(err);`] : [];
        return [...pre, head, `${p}${IND}try {`, ...this.stmts(s.body, depth + 2), `${p}${IND}} catch (err) {`, ...bind, `${p}${IND}}`, `${p}}`];
      }
      case "FnDecl": {
        const ps = s.params.map(x => `${x.name}${x.type ? ": " + this.type(x.type) : ""}`).join(", ");
        return [`${p}function ${s.name}(${ps})${s.ret ? ": " + this.type(s.ret) : ""} {`, ...this.fnBody(s.body, depth + 1), `${p}}`];
      }
      case "RecordDecl": return [
        `${p}interface ${s.name} { ${s.fields.map(f => `${f.name}: ${this.type(f.type)}`).join("; ")} }`,
        `${p}const ${s.name} = (f: ${s.name}): ${s.name} => ({ ...f });`,
      ];
      case "Return": return [`${p}return${s.expr ? " " + this.expr(s.expr, depth) : ""};`];
      case "Fail": return [`${p}throw new Error(${this.expr(s.expr, depth)});`];
    }
  }

  fnBody(body: Stmt[], depth: number): string[] {
    const last = body[body.length - 1];
    if (last && last.kind === "ExprStmt") return [...this.stmts(body.slice(0, -1), depth), `${IND.repeat(depth)}return ${this.expr(last.expr, depth)};`];
    return this.stmts(body, depth);
  }

  ifChain(s: Extract<Stmt, { kind: "If" | "IfLet" }>, depth: number, head: string): string[] {
    const p = IND.repeat(depth);
    const out = [head, ...this.stmts(s.then, depth + 1)];
    let els = s.else;
    while (els) {
      if (els.length === 1 && els[0].kind === "If" && els[0].leading.length === 0) { out.push(`${p}} else if (${this.expr(els[0].cond, depth)}) {`, ...this.stmts(els[0].then, depth + 1)); els = els[0].else; continue; }
      out.push(`${p}} else {`, ...this.stmts(els, depth + 1)); break;
    }
    out.push(`${p}}`);
    return out;
  }

  type(t: TypeExpr): string {
    switch (t.kind) {
      case "Nullable": return `${this.type(t.inner)} | null`;
      case "Fn": return `(${t.params.map((x, i) => `a${i}: ${this.type(x)}`).join(", ")}) => ${this.type(t.ret)}`;
      case "Named":
        switch (t.name) {
          case "Int": return "bigint"; case "Float": return "number"; case "String": return "string"; case "Bool": return "boolean";
          case "Complex": this.uses.add("Complex"); return "Complex";
          case "List": return `${t.args[0] ? this.wrap(this.type(t.args[0])) : "unknown"}[]`;
          case "Map": return `Map<${t.args.map(x => this.type(x)).join(", ") || "unknown, unknown"}>`;
          default: return t.name;
        }
    }
  }
  wrap(s: string) { return s.includes("|") || s.includes("=>") ? `(${s})` : s; }

  expr(e: Expr, depth = 0, parentPrec = 0): string {
    const paren = (s: string, prec: number) => prec < parentPrec ? `(${s})` : s;
    const p = IND.repeat(depth);
    switch (e.kind) {
      case "IntLit": return `${e.value}n`;
      case "FloatLit": return e.value === Infinity ? "Infinity" : e.value === -Infinity ? "-Infinity" : showFloat(e.value);
      case "ComplexLit": this.uses.add("Complex"); return `new Complex(${e.re}, ${e.im})`;
      case "StrLit":
        if (e.parts.every(x => typeof x === "string")) return JSON.stringify(e.parts.join(""));
        return "`" + e.parts.map(x => typeof x === "string" ? x.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") : `\${${this.expr(x, depth)}}`).join("") + "`";
      case "BoolLit": return String(e.value);
      case "NullLit": return "null";
      case "Ident": return e.name;
      case "ListLit": return `[${e.items.map(x => this.expr(x, depth)).join(", ")}]`;
      case "MapLit": return `new Map([${e.entries.map(en => `[${this.expr(en.key, depth)}, ${this.expr(en.value, depth)}]`).join(", ")}])`;
      case "Range": this.uses.add("blessedRange"); return `blessedRange(${this.expr(e.start, depth)}, ${this.expr(e.end, depth)})`;
      case "Unary": return e.op === "not" ? `!${this.expr(e.expr, depth, 8)}` : `-${this.expr(e.expr, depth, 8)}`;
      case "Binary": {
        const prec = PREC[e.op]; const lk = this.k(e.left);
        if (e.op === "??") return paren(`${this.expr(e.left, depth, 2)} ?? ${this.expr(e.right, depth, 2)}`, 1);
        if (e.op === "and") return paren(`${this.expr(e.left, depth, 3)} && ${this.expr(e.right, depth, 4)}`, 3);
        if (e.op === "or") return paren(`${this.expr(e.left, depth, 2)} || ${this.expr(e.right, depth, 3)}`, 2);
        if (e.op === "is") return paren(`${this.expr(e.left, depth, 5)} === ${this.expr(e.right, depth, 5)}`, 4);
        if (e.op === "==" || e.op === "!=") {
          if (["List", "Map", "Record", "Complex", "Unknown"].includes(lk) || ["List", "Map", "Record", "Complex"].includes(this.k(e.right))) { this.uses.add("blessedEq"); const s = `blessedEq(${this.expr(e.left, depth)}, ${this.expr(e.right, depth)})`; return e.op === "==" ? s : `!${s}`; }
          return paren(`${this.expr(e.left, depth, 5)} ${e.op}= ${this.expr(e.right, depth, 5)}`, 4);
        }
        if (lk === "Complex") { const m = { "+": "add", "-": "sub", "*": "mul", "/": "div" }[e.op]!; return `${this.expr(e.left, depth, 9)}.${m}(${this.expr(e.right, depth)})`; }
        if (lk === "Int" && e.op === "/") { this.uses.add("blessedDiv"); return `blessedDiv(${this.expr(e.left, depth)}, ${this.expr(e.right, depth)})`; }
        if (lk === "Int" && e.op === "%") { this.uses.add("blessedMod"); return `blessedMod(${this.expr(e.left, depth)}, ${this.expr(e.right, depth)})`; }
        if (lk === "Float" && ["+", "-", "*", "/", "%"].includes(e.op)) { this.uses.add("blessedCheck"); return `blessedCheck(${this.expr(e.left, depth, prec)} ${e.op} ${this.expr(e.right, depth, prec + 1)})`; }
        return paren(`${this.expr(e.left, depth, prec)} ${e.op} ${this.expr(e.right, depth, prec + 1)}`, prec);
      }
      case "Call": return this.call(e, depth);
      case "Index": {
        const obj = this.expr(e.obj, depth, 9); const ok = this.k(e.obj);
        if (e.index.kind === "Range") return `${obj}.slice(Number(${this.expr(e.index.start, depth)}), Number(${this.expr(e.index.end, depth)}))`;
        if (ok === "Map") return `(${obj}.get(${this.expr(e.index, depth)}) ?? null)`;
        return `${obj}.at(Number(${this.expr(e.index, depth)}))!`;
      }
      case "Field": {
        const obj = this.expr(e.obj, depth, 9);
        if (e.name === "length") return `BigInt(${obj}.length)`;
        return `${obj}.${e.name}`;
      }
      case "Lambda": {
        const ps = e.params.map(x => `${x.name}${x.type ? ": " + this.type(x.type) : ""}`).join(", ");
        if (e.body.length === 1 && e.body[0].kind === "ExprStmt") return `(${ps}) => ${this.expr(e.body[0].expr, depth)}`;
        return [`(${ps}) => {`, ...this.fnBody(e.body, depth + 1), `${p}}`].join("\n");
      }
      case "Match": {
        const lines = [`((_s) => {`];
        for (const a of e.arms) {
          const cond = this.patternCond(a.pattern, "_s"); const binds = this.patternBinds(a.pattern, "_s");
          const last = a.body[a.body.length - 1];
          const bodyLines = [...this.stmts(a.body.slice(0, last && last.kind === "ExprStmt" ? -1 : undefined), 0).map(l => l.trim()), `return ${last && last.kind === "ExprStmt" ? this.expr(last.expr, depth + 1) : "null"};`];
          const inner = [...binds, ...(a.guard ? [`if (${this.expr(a.guard, depth + 1)}) ${bodyLines.length === 1 ? bodyLines[0] : "{ " + bodyLines.join(" ") + " }"}`] : bodyLines)];
          if (cond === "true" && binds.length === 0 && !a.guard) lines.push(`${p}${IND}${inner.join(" ")}`);
          else if (cond === "true") lines.push(`${p}${IND}{ ${inner.join(" ")} }`);
          else lines.push(`${p}${IND}if (${cond}) ${inner.length === 1 ? inner[0] : "{ " + inner.join(" ") + " }"}`);
        }
        lines.push(`${p}})(${this.expr(e.subject, depth)})`);
        return lines.join("\n");
      }
      case "With": return `{ ...${this.expr(e.target, depth, 9)}, ${e.fields.map(f => `${f.name}: ${this.expr(f.value, depth)}`).join(", ")} }`;
    }
  }

  patternCond(pt: Pattern, s: string): string {
    switch (pt.kind) {
      case "PWild": case "PBind": return "true";
      case "PLit": {
        const v = this.expr(pt.value);
        if (pt.value.kind === "ComplexLit") { this.uses.add("blessedEq"); return `blessedEq(${s}, ${v})`; }
        return `${s} === ${v}`;
      }
      case "PRecord": return pt.fields.map(f => this.patternCond(f.pattern, `${s}.${f.name}`)).filter(c => c !== "true").join(" && ") || "true";
    }
  }
  patternBinds(pt: Pattern, s: string): string[] {
    switch (pt.kind) {
      case "PBind": return [`const ${pt.name} = ${s};`];
      case "PRecord": return pt.fields.flatMap(f => this.patternBinds(f.pattern, `${s}.${f.name}`));
      default: return [];
    }
  }

  call(e: Extract<Expr, { kind: "Call" }>, depth: number): string {
    const args = e.args.map(a => this.expr(a, depth));
    if (e.callee.kind === "Ident") {
      const n = e.callee.name;
      if (e.named.length) return `${n}({ ${e.named.map(x => `${x.name}: ${this.expr(x.value, depth)}`).join(", ")} })`;
      if (n === "print") return `console.log(${args.join(", ")})`;
      const ak = e.args[0] ? this.k(e.args[0]) : "Unknown";
      if (n === "String") return `String(${args[0]})`;
      if (n === "Int") { if (ak === "String") { this.uses.add("blessedIntParse"); return `blessedIntParse(${args[0]})`; } return ak === "Float" ? `BigInt(Math.trunc(${args[0]}))` : args[0]; }
      if (n === "Float") return ak === "String" ? `(Number.isFinite(Number(${args[0]})) ? Number(${args[0]}) : null)` : `Number(${args[0]})`;
      if (n === "Complex") { this.uses.add("Complex"); return ak === "Complex" ? args[0] : `new Complex(Number(${args[0]}), 0)`; }
      return `${n}(${args.join(", ")})`;
    }
    if (e.callee.kind === "Field") {
      const obj = this.expr(e.callee.obj, depth, 9); const m = e.callee.name; const ok = this.k(e.callee.obj);
      const num = (s: string) => { this.uses.add("blessedCheck"); return `blessedCheck(${s})`; };
      switch (m) {
        case "upper": return `${obj}.toUpperCase()`; case "lower": return `${obj}.toLowerCase()`; case "trim": return `${obj}.trim()`;
        case "split": return `${obj}.split(${args[0]})`; case "contains": return ok === "List" ? `${obj}.some(_x => blessedEq(_x, ${args[0]}))` : `${obj}.includes(${args[0]})`;
        case "startsWith": return `${obj}.startsWith(${args[0]})`; case "endsWith": return `${obj}.endsWith(${args[0]})`;
        case "replace": return `${obj}.split(${args[0]}).join(${args[1]})`;
        case "push": return `[...${obj}, ${args[0]}]`;
        case "map": return `${obj}.map(${args[0]})`; case "filter": return `${obj}.filter(${args[0]})`; case "reduce": return `${obj}.reduce(${args[0]}, ${args[1]})`;
        case "join": return `${obj}.map(String).join(${args[0]})`;
        case "reverse": return `[...${obj}].reverse()`;
        case "sort": return `[...${obj}].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))`;
        case "sum": return this.typeOf(e.callee.obj).k === "List" && (this.typeOf(e.callee.obj) as any).el.k === "Float" ? `${obj}.reduce((a, b) => a + b, 0)` : `${obj}.reduce((a, b) => a + b, 0n)`;
        case "min": return `(${obj}.length ? ${obj}.reduce((a, b) => (b < a ? b : a)) : null)`;
        case "max": return `(${obj}.length ? ${obj}.reduce((a, b) => (b > a ? b : a)) : null)`;
        case "keys": return `[...${obj}.keys()]`; case "values": return `[...${obj}.values()]`; case "has": return `${obj}.has(${args[0]})`;
        case "abs": return ok === "Int" ? `(${obj} < 0n ? -${obj} : ${obj})` : ok === "Complex" ? `${obj}.abs()` : `Math.abs(${obj})`;
        case "pow": return ok === "Int" ? `${obj} ** ${args[0]}` : ok === "Complex" ? `${obj}.pow(${args[0]})` : num(`${obj} ** Number(${args[0]})`);
        case "gcd": return `((a: bigint, b: bigint) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; })(${obj}, ${args[0]})`;
        case "factorial": return `((n: bigint) => { let r = 1n; for (let i = 2n; i <= n; i++) r *= i; return r; })(${obj})`;
        case "floor": return `Math.floor(${obj})`; case "ceil": return `Math.ceil(${obj})`;
        case "round": return args.length ? `(Math.round(${obj} * 10 ** Number(${args[0]})) / 10 ** Number(${args[0]}))` : `Math.round(${obj})`;
        case "sqrt": return ok === "Complex" ? `${obj}.sqrt()` : `Math.sqrt(${obj})`;
        case "sin": case "cos": case "tan": case "asin": case "acos": case "atan": return num(`Math.${m}(${obj})`);
        case "exp": case "log": return ok === "Complex" ? `${obj}.${m}()` : num(`Math.${m}(${obj})`);
        case "atan2": return `Math.atan2(${obj}, ${args[0]})`;
        case "arg": case "conj": case "re": case "im": return `${obj}.${m}()`;
      }
      return `${obj}.${m}(${args.join(", ")})`;
    }
    return `${this.expr(e.callee, depth, 9)}(${args.join(", ")})`;
  }
}
```

The `sqrt`, `exp`, `log`, `pow` methods on the emitted `Complex` class are needed when a program uses them; add them to the `Complex` prelude string:
```ts
    sqrt() { const r = Math.sqrt(this.abs()), t = this.arg() / 2; return new Complex(r * Math.cos(t), r * Math.sin(t)); }
    exp() { const m = Math.exp(this.re); return new Complex(m * Math.cos(this.im), m * Math.sin(this.im)); }
    log() { return new Complex(Math.log(this.abs()), this.arg()); }
    pow(n: number | bigint) { const k = Number(n), r = this.abs() ** k, t = this.arg() * k; return new Complex(r * Math.cos(t), r * Math.sin(t)); }
```
Insert those four lines after `conj()` in `PRELUDE.Complex` and update the test's expected prelude text to include them in that position.

- [ ] **Step 4: Run tests and tsc**

Run: `npx vitest run src/blessed/__tests__/translate.test.ts && npx tsc --noEmit`
Expected: all pass. The exact-match tests are strict on whitespace; make the emitter match them.

- [ ] **Step 5: Commit**

```bash
git add src/blessed/translate/typescript.ts src/blessed/__tests__/translate.test.ts
git commit -m "feat(translate): AST-based BLESSED to TypeScript emitter with bigint Int and helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Shared examples, the twenty commandments as data, and App wiring

**Files:**
- Create: `src/blessed/examples.ts`
- Create: `src/blessed/commandments.ts`
- Modify: `src/App.tsx` (replace the `EXAMPLES` constant at lines 23-120 with an import; replace the hand-written spec cards at lines 719-930 with a `map` over `COMMANDMENTS`; label the reverse translators "best effort")
- Test: `src/blessed/__tests__/examples.test.ts`

**Interfaces:**
- Produces:
```ts
// examples.ts
export interface Example { name: string; description: string; code: string; expectStdout: string[]; expectError?: string }
export const EXAMPLES: Record<string, Example>
// commandments.ts
export interface Commandment { n: number; tag: string; title: string; verdict: "Obvious" | "Sensible" | "Correct" | "Overdue" | "Necessary"; body: string; snippet: string; example?: keyof typeof EXAMPLES }
export const COMMANDMENTS: Commandment[]      // exactly 20 entries, n = 1..20
```
- Every `snippet` must parse, check with zero errors, and run with no runtime error. `examples.test.ts` enforces this.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/blessed/__tests__/examples.test.ts`
Expected: FAIL, cannot resolve `../examples`.

- [ ] **Step 3: Write examples.ts**

```ts
// src/blessed/examples.ts
export interface Example { name: string; description: string; code: string; expectStdout: string[]; expectError?: string }

export const EXAMPLES: Record<string, Example> = {
  hello: {
    name: "Hello World",
    description: "The canonical demonstration of zero-suffering list iteration.",
    code: `-- hello.blessed
let recipients = ["World", "Nurse", "Darkness my old friend"]

loop r in recipients {
    print("Hello, \${r}!")
}
`,
    expectStdout: ["Hello, World!", "Hello, Nurse!", "Hello, Darkness my old friend!"],
  },
  nullSafe: {
    name: "Safe Null Handling",
    description: "Explicit nullability, null-coalescing, and if let. Reusing a binding name is fine because scopes are real.",
    code: `-- Safe null handling
let name: String = "Alice"
let nick: String? = null

-- This line would be a compile error if uncommented:
-- print(nick)

-- But this is fine:
print("Nickname: \${nick ?? "no nickname"}")

if let actualNick = nick {
    print("Nickname is indeed: \${actualNick}")
} else {
    print("\${name} has no nickname. Respect it.")
}

let activeNick: String? = "Al"
if let actualNick = activeNick {
    print("Nickname is indeed: \${actualNick}")
}
`,
    expectStdout: ["Nickname: no nickname", "Alice has no nickname. Respect it.", "Nickname is indeed: Al"],
  },
  strictTypes: {
    name: "Strict Types",
    description: "Witness the compiler save you from silent conversions.",
    code: `-- Strict Types. BLESSED never coerces types silently.
let x = 5
let y = 10
let z = x + y
print("Sum is: \${z}")

-- Int is arbitrary precision. Overflow is not our problem.
print(2.pow(64))

-- TRY UN-COMMENTING THE ERRORS BELOW TO SEE THE COMPILER PREVENT DISASTER:
-- let badCoercion = "five"
-- let total = x + badCoercion
`,
    expectStdout: ["Sum is: 15", "18446744073709551616"],
  },
  oneEquality: {
    name: "One Equality & Identity",
    description: "Values compare structurally with ==. Identity is a different question with a different operator.",
    code: `-- BLESSED has exactly one equality operator: ==
let listA = [1, 2, 3]
let listB = [1, 2, 3]
let listC = listA

print("Is listA equivalent in values to listB? \${listA == listB}")
print("Are listA and listB the SAME memory object? \${listA is listB}")
print("Are listA and listC the SAME memory object? \${listA is listC}")

-- BLESSED prevents type-mismatch comparisons:
-- let five = 5
-- let strFive = "5"
-- print(five == strFive) -- CompileError: Int ≠ String. We won't guess.
`,
    expectStdout: ["Is listA equivalent in values to listB? true", "Are listA and listB the SAME memory object? false", "Are listA and listC the SAME memory object? true"],
  },
  loopModifier: {
    name: "The Graceful Loop",
    description: "One loop keyword, four shapes, and an error margin that actually catches errors.",
    code: `-- BLESSED has exactly one loop keyword: loop

-- 1. Iterating a collection
let fruits = ["apple", "banana", "mango"]
loop f in fruits {
    print("Munching on \${f}")
}

-- 2. Repeating while a condition holds
let count = 1
loop count <= 3 {
    print("Countdown: \${count}")
    count = count + 1
}

-- 3. Despite errors: keep going even if some items fail
let divisors = [5, 0, 2]
loop d in divisors despite errors as e {
    print("100 / \${d} = \${100 / d}")
}
print("Survived the zero. Last complaint: \${e ?? "none"}")
`,
    expectStdout: ["Munching on apple", "Munching on banana", "Munching on mango", "Countdown: 1", "Countdown: 2", "Countdown: 3", "100 / 5 = 20", "100 / 2 = 50", "Survived the zero. Last complaint: Division by zero. Int is a count and there is no infinite count."],
  },
  functions: {
    name: "Functions & Closures",
    description: "fn declares, lambdas capture, and single-expression bodies skip the ceremony.",
    code: `-- Functions are values. Recursion is allowed. Depth is finite, like patience.
fn factorial(n: Int) -> Int {
    if n <= 1 {
        return 1
    }
    return n * factorial(n - 1)
}
print(factorial(20))

fn makeAdder(n: Int) -> Fn(Int) -> Int {
    return fn(x: Int) { x + n }
}
let addFive = makeAdder(5)
print(addFive(10))

let squares = (1..6).map(fn(k) { k * k })
print(squares)
print(squares.filter(fn(s) { s % 2 == 0 }).sum())
`,
    expectStdout: ["2432902008176640000", "15", "[1, 4, 9, 16, 25]", "20"],
  },
  records: {
    name: "Records & Maps",
    description: "Named fields on construction, immutable records, and maps whose lookups admit they might miss.",
    code: `record Point { x: Int, y: Int }

let p = Point(x: 3, y: 4)
let q = p with { x: 0 }
print(p)
print(q)
print(p == Point(y: 4, x: 3))

let ages = {"al": 30, "bo": 25}
ages["cy"] = 41
print(ages["cy"] ?? -1)
print(ages["zed"] ?? -1)
print(ages.keys())
`,
    expectStdout: ["Point(x: 3, y: 4)", "Point(x: 0, y: 4)", "true", "41", "-1", '["al", "bo", "cy"]'],
  },
  matching: {
    name: "Match",
    description: "Literals, bindings, guards, record destructuring, and a wildcard the compiler insists on.",
    code: `record Point { x: Int, y: Int }

fn describe(p: Point) -> String {
    return match p {
        Point(x: 0, y: 0) -> "origin"
        Point(x: 0, y: y) -> "on the y axis at \${y}"
        Point(x: x, y: 0) -> "on the x axis at \${x}"
        Point(x: x, y: y) if x == y -> "diagonal"
        _ -> "somewhere"
    }
}

loop p in [Point(x: 0, y: 0), Point(x: 0, y: 7), Point(x: 3, y: 0), Point(x: 2, y: 2), Point(x: 1, y: 5)] {
    print(describe(p))
}

let size = match 42 {
    n if n > 100 -> "big"
    n if n > 10 -> "medium"
    _ -> "small"
}
print(size)
`,
    expectStdout: ["origin", "on the y axis at 7", "on the x axis at 3", "diagonal", "somewhere", "medium"],
  },
  errors: {
    name: "Errors",
    description: "fail raises. Only despite errors catches. There is no third thing.",
    code: `fn withdraw(balance: Int, amount: Int) -> Int {
    if amount > balance {
        fail "Insufficient funds: wanted \${amount}, had \${balance}"
    }
    return balance - amount
}

loop amount in [10, 500, 20] despite errors as e {
    print("Remaining: \${withdraw(100, amount)}")
}
print("Account survived. \${e ?? "No complaints."}")
`,
    expectStdout: ["Remaining: 90", "Remaining: 80", "Account survived. Insufficient funds: wanted 500, had 100"],
  },
  math: {
    name: "All The Math",
    description: "Infinity is real. NaN is not. Imaginary numbers are also real. Overflow is someone else's problem.",
    code: `-- Float has Infinity. It does not have NaN.
print(1.0 / 0.0)
print(Infinity > 10.0.pow(308))

-- Int never overflows.
print(30.factorial())

-- Imaginary numbers are real.
let z = 3 + 4i
print(z.abs())
print(z * z)
print(Complex(-4.0).sqrt())

-- The line below is a runtime error: (-4.0).sqrt() is not a number.
-- print((-4.0).sqrt())

let data = [2.5, 7.5, 5.0]
print(data.sum() / Float(data.length))
print((data.max() ?? 0.0) - (data.min() ?? 0.0))
print(PI.round(4))
`,
    expectStdout: ["Infinity", "true", "265252859812191058636308480000000", "5.0", "-7 + 24i", "2i", "5.0", "5.0", "3.1416"],
  },
  budget: {
    name: "The Step Budget",
    description: "An infinite loop ends with a diagnostic, not a frozen tab.",
    code: `-- This loop never terminates. BLESSED does.
let n = 0
loop {
    n = n + 1
}
`,
    expectStdout: [],
    expectError: "exceeded 1,000,000 steps",
  },
};
```

- [ ] **Step 4: Write commandments.ts**

```ts
// src/blessed/commandments.ts
import type { EXAMPLES } from "./examples";

export interface Commandment {
  n: number; tag: string; title: string;
  verdict: "Obvious" | "Sensible" | "Correct" | "Overdue" | "Necessary";
  body: string; snippet: string; example?: keyof typeof EXAMPLES;
}

export const COMMANDMENTS: Commandment[] = [
  { n: 1, tag: "THE INDEX PRINCIPLE", title: "Arrays are zero-indexed, and the index is the offset from the start", verdict: "Obvious",
    body: "An index is an offset: how far from the beginning? The beginning is zero distance from itself. This is geometry. Slices are half-open, so length = end - start, and negative indices count from the end because that is the only sensible thing they could mean.",
    snippet: `let fruits = ["apple", "banana", "mango"]\nprint(fruits[0..2])\nprint(fruits[-1])`, example: "hello" },
  { n: 2, tag: "THE TYPE SANCTITY", title: "Types are inferred, explicit when ambiguous, and never coerced silently", verdict: "Sensible",
    body: "BLESSED infers types from assignment. You may annotate for clarity. What BLESSED will not do, under any circumstances, is silently convert one type to another and pretend nothing happened. If you add a String and an Int, BLESSED stops and asks what you meant. Out loud.",
    snippet: `let x = 5\nlet label: String = "five"\nprint(String(x) + " is " + label)`, example: "strictTypes" },
  { n: 3, tag: "THE EQUALITY COMMAND", title: "There is one equality operator, and it compares values", verdict: "Obvious",
    body: "== compares values, structurally, all the way down. Comparing an Int to a String is a compile error, not false. If you want to know whether two things are the same object, that is a different question, so it has a different operator: is.",
    snippet: `let a = [1, [2, 3]]\nlet b = [1, [2, 3]]\nprint(a == b)\nprint(a is b)`, example: "oneEquality" },
  { n: 4, tag: "THE STYLE BOUNDARY", title: "Four spaces, braces, and a formatter that is not a suggestion", verdict: "Overdue",
    body: "Indentation is four spaces. Blocks use braces, so copy-pasting code never silently changes its meaning. The formatter enforces all of it. Every argument about style has already been had, and it has been resolved.",
    snippet: `let total = 0\nloop n in [1, 2, 3] {\n    total = total + n\n}\nprint(total)` },
  { n: 5, tag: "THE NULL REDEMPTION", title: "Nullability is in the type, and the compiler makes you handle it", verdict: "Necessary",
    body: "String? can be null. String cannot. Using a nullable value without handling it is a compile error. Handle it with ??, with if let, or with match. There is exactly one kind of nothing.",
    snippet: `let nick: String? = null\nprint(nick ?? "no nickname")\nif let n = nick {\n    print(n)\n}`, example: "nullSafe" },
  { n: 6, tag: "THE NAMING CODE", title: "camelCase for variables, SCREAMING_SNAKE for constants, and nothing else", verdict: "Sensible",
    body: "A snake_case variable is reformatted to camelCase with a note. An ALL_CAPS name is a constant and cannot be reassigned. Leading underscores belong to the compiler. Double underscores on both sides are not a thing. This is BLESSED, not Python.",
    snippet: `let MAX_RETRIES = 3\nlet retryCount = 0\nprint(MAX_RETRIES - retryCount)` },
  { n: 7, tag: "THE SEMICOLON PEACE", title: "Semicolons are optional, and the formatter removes them", verdict: "Obvious",
    body: "A line ends a statement. Type a semicolon if your fingers insist. The formatter will vaporize it and let you know. Suffer no more.",
    snippet: `let x = 1\nprint(x)` },
  { n: 8, tag: "THE INTERPOLATION HARMONY", title: "Strings interpolate with ${}, and that is the only way to build them", verdict: "Sensible",
    body: "No format strings, no concatenation ladders, no printf. Put the expression in the string. The expression can be anything, including another string.",
    snippet: `let who = "World"\nprint("Hello, \${who.upper()}! You have \${[1, 2, 3].length} messages.")` },
  { n: 9, tag: "THE BOOLEAN PURITY", title: "Conditions are Bool, and only Bool", verdict: "Correct",
    body: "Bool is a type. true and false are its values. An Int is not a Bool, an empty String is not a Bool, and null is not a Bool. BLESSED is not interested in truthy and falsy load-bearing conventions that were always wrong. Say what you mean.",
    snippet: `let name = ""\nif name != "" {\n    print("named")\n} else {\n    print("anonymous")\n}` },
  { n: 10, tag: "THE SINGLE LOOP", title: "There is one loop keyword, and its shape adapts to what you give it", verdict: "Obvious",
    body: "loop { } runs forever. loop cond { } repeats while true. loop x in xs { } iterates. Add despite errors to keep going when an iteration fails, and as e to get a String? holding the most recent complaint, null until there is one. One concept, one keyword.",
    snippet: `loop d in [2, 0, 5] despite errors as e {\n    print(10 / d)\n}\nprint(e ?? "no complaints")`, example: "loopModifier" },
  { n: 11, tag: "THE BRANCH", title: "if, else if, else, and nothing cleverer", verdict: "Obvious",
    body: "Branches read top to bottom. The condition is a Bool. There is no ternary, no switch on fallthrough, no goto wearing a hat.",
    snippet: `let n = 7\nif n < 5 {\n    print("small")\n} else if n < 10 {\n    print("medium")\n} else {\n    print("large")\n}` },
  { n: 12, tag: "THE FUNCTION", title: "fn declares a function, functions are values, and a single expression needs no return", verdict: "Sensible",
    body: "Parameters are typed. The return type is inferred unless you say otherwise. Anonymous functions use the same keyword, because it is the same thing. No overloading, no default arguments, no magic. Recursion is allowed up to 500 frames, which is deeper than your call stack of excuses.",
    snippet: `fn twice(f: Fn(Int) -> Int, x: Int) -> Int { f(f(x)) }\nprint(twice(fn(n: Int) { n * 3 }, 2))`, example: "functions" },
  { n: 13, tag: "THE RECORD", title: "Records are immutable, constructed with named fields, and compared by value", verdict: "Correct",
    body: "Positional arguments were always a guessing game. Name every field, every time. Records do not change; make a copy with `with`. Two records with the same fields are equal, because of course they are.",
    snippet: `record Point { x: Int, y: Int }\nlet p = Point(x: 1, y: 2)\nlet q = p with { y: 5 }\nprint(q)\nprint(p == Point(x: 1, y: 2))`, example: "records" },
  { n: 14, tag: "THE MAP", title: "Maps are typed, keyed by String or Int, and a missing key is null", verdict: "Sensible",
    body: "A lookup might miss. The type says so: looking up an Int value gives you Int?, and the null rules apply. No exceptions, no default-value arguments, no silence.",
    snippet: `let ages = {"al": 30}\nprint(ages["al"] ?? 0)\nprint(ages["bo"] ?? 0)\nprint(ages.has("al"))`, example: "records" },
  { n: 15, tag: "THE MATCH", title: "match destructures, guards, and refuses to leave a case uncovered", verdict: "Necessary",
    body: "Arms are literals, bindings, bindings with guards, record patterns, or the wildcard. A match without a wildcard or a binding is a compile error. Match is an expression. BLESSED does not do surprise endings.",
    snippet: `let label = match 7 {\n    0 -> "zero"\n    n if n > 5 -> "big"\n    _ -> "small"\n}\nprint(label)`, example: "matching" },
  { n: 16, tag: "THE ERROR", title: "fail raises a message, and only despite errors catches it", verdict: "Correct",
    body: "There are no try blocks, no exception hierarchies, no checked and unchecked. Something goes wrong, you say so in words. The loop that can tolerate it says despite errors. Everything else stops, which is what you wanted.",
    snippet: `loop x in [1, 2, 3] despite errors as e {\n    if x == 2 {\n        fail "two is not welcome"\n    }\n    print(x)\n}`, example: "errors" },
  { n: 17, tag: "INFINITY, AND THE NUMBER THAT IS NOT", title: "Float has Infinity. It does not have NaN.", verdict: "Correct",
    body: "1.0 / 0.0 is Infinity, which is a perfectly good number for limits and sentinels. 0.0 / 0.0 is not a number, and BLESSED will not pretend it is: it fails. Int has no infinity, because Int is a count and there is no infinite count.",
    snippet: `print(1.0 / 0.0)\nprint(Infinity > 1000000.0)\nprint(-Infinity < 0.0)`, example: "math" },
  { n: 18, tag: "IMAGINARY NUMBERS ARE REAL", title: "Complex is a type, written the way mathematicians write it", verdict: "Overdue",
    body: "3 + 4i is a Complex. Complex only mixes with Complex, so convert on purpose. Complex numbers have no order; neither does your argument. The square root of -4.0 is a runtime error on Float and 2i on Complex.",
    snippet: `let z = 3 + 4i\nprint(z.abs())\nprint(z * z.conj())\nprint(Complex(-4.0).sqrt())`, example: "math" },
  { n: 19, tag: "RANGES ARE VALUES", title: "a..b is a List<Int>, half-open, and it goes wherever a list goes", verdict: "Obvious",
    body: "0..3 is [0, 1, 2]. Use it in a loop, map over it, slice with it. A range large enough to exhaust memory fails before it tries.",
    snippet: `print(0..5)\nprint((1..4).map(fn(n) { n * n }))\nprint(["a", "b", "c", "d"][1..3])` },
  { n: 20, tag: "OVERFLOW IS NOT OUR PROBLEM", title: "Int is arbitrary precision", verdict: "Necessary",
    body: "There is no MAX_INT, no wraparound, no silent precision loss past 2^53. 25.factorial() is exact. Overflow was a hardware limitation. BLESSED declined to inherit it.",
    snippet: `print(2.pow(100))\nprint(25.factorial())\nprint(9007199254740993 + 1)`, example: "strictTypes" },
];
```

- [ ] **Step 5: Wire App.tsx**

1. Delete the `EXAMPLES` constant (`src/App.tsx:23-120`) and add `import { EXAMPLES } from './blessed/examples';` and `import { COMMANDMENTS } from './blessed/commandments';`.
2. Replace the ten hand-written commandment cards inside the `{activeTab === 'spec' && ...}` block with:

```tsx
{COMMANDMENTS.map(c => {
  const verdictClass = c.verdict === "Obvious" ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/40"
    : c.verdict === "Sensible" ? "bg-yellow-950/40 text-yellow-400 border-yellow-900/40"
    : c.verdict === "Correct" ? "bg-sky-950/40 text-sky-400 border-sky-900/40"
    : c.verdict === "Overdue" ? "bg-rose-950/40 text-rose-400 border-rose-900/40"
    : "bg-amber-950/40 text-amber-400 border-amber-900/40";
  return (
    <div key={c.n} className="bg-stone-900 border border-stone-800 rounded-xl p-6 space-y-4 hover:border-amber-500/25 transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <span className="text-xs text-amber-500 font-mono tracking-wider">§{c.n}. {c.tag}</span>
          <h3 className="text-lg font-bold text-stone-100">{c.title}</h3>
        </div>
        <span className={`text-xs px-2.5 py-1 border rounded-full font-mono uppercase font-bold whitespace-nowrap ${verdictClass}`}>Verdict: {c.verdict}</span>
      </div>
      <p className="text-stone-400 text-sm leading-relaxed">{c.body}</p>
      <pre className="bg-stone-950 rounded-lg p-3 border border-stone-800/80 font-mono text-xs text-stone-300 overflow-x-auto whitespace-pre">{c.snippet}</pre>
      <div className="flex justify-end gap-4">
        <button onClick={() => { setBlessedCode(c.snippet); setActiveTab('playground'); setTerminalOutput([]); setTerminalErrors([]); setFormatterLogs([]); }}
          className="text-xs text-amber-500 hover:text-amber-400 transition-colors flex items-center gap-1">
          Try it <ArrowRight className="h-3.5 w-3.5" />
        </button>
        {c.example && (
          <button onClick={() => { loadExample(c.example!); setActiveTab('playground'); }}
            className="text-xs text-amber-500 hover:text-amber-400 transition-colors flex items-center gap-1">
            Load {EXAMPLES[c.example].name} <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
})}
```
3. Change the heading text "The 10 Commandments of BLESSED" to "The 20 Commandments of BLESSED" in both the nav button and the spec heading (`src/App.tsx:434`, `:711`, and the mobile nav label).
4. In the Translation Bureau tab, where the source language selector offers Python or TypeScript as the source, add a line under the output panel: `{transSourceLang !== 'blessed' && <p className="text-xs text-stone-500 italic">Best effort. Python and TypeScript are read line by line, not parsed. BLESSED output is exact.</p>}`.
5. The example picker already iterates `Object.entries(EXAMPLES)`; it now shows eleven examples.

- [ ] **Step 6: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npx vite build 2>&1 | tail -3`
Expected: all tests pass including every example and every snippet; build succeeds. Where an example's `expectStdout` disagrees with the interpreter, decide which is right against the spec and fix that side. The `math` example's `PI.round(4)` prints `3.1416`; `data.sum() / Float(data.length)` prints `5.0`.

- [ ] **Step 7: Run the app and look at it**

Run: `npx vite --port 5173 &` then open `http://localhost:5173`, click through all five tabs, run each example, click "Try it" on three commandments, and run the Step Budget example to confirm the tab does not freeze. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add src/blessed/examples.ts src/blessed/commandments.ts src/blessed/__tests__/examples.test.ts src/App.tsx
git commit -m "feat(app): twenty commandments as data, eleven verified examples, best-effort label on reverse translation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Round-trip tests for the emitters, README

**Files:**
- Create: `src/blessed/__tests__/roundtrip.test.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: `EXAMPLES`, `translateBlessedToPython`, `translateBlessedToTypeScript`.

- [ ] **Step 1: Write the round-trip test**

```ts
// src/blessed/__tests__/roundtrip.test.ts
import { describe, it, expect } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXAMPLES } from "../examples";
import { translateBlessedToPython, translateBlessedToTypeScript } from "../index";

const has = (cmd: string) => { try { execSync(`${cmd} --version`, { stdio: "ignore" }); return true; } catch { return false; } };
const hasPython = has("python3");
const dir = mkdtempSync(join(tmpdir(), "blessed-rt-"));
const runnable = Object.entries(EXAMPLES).filter(([k]) => k !== "budget");

describe("emitted TypeScript type-checks and runs", () => {
  for (const [key, ex] of runnable) {
    it(key, () => {
      const file = join(dir, `${key}.ts`);
      writeFileSync(file, translateBlessedToTypeScript(ex.code));
      const tsc = spawnSync("npx", ["tsc", "--noEmit", "--strict", "--target", "es2020", "--lib", "es2020,dom", file], { encoding: "utf8" });
      expect(tsc.stdout + tsc.stderr).toBe("");
      const node = spawnSync("npx", ["tsx", file], { encoding: "utf8" });
      expect(node.status).toBe(0);
    });
  }
});

describe.skipIf(!hasPython)("emitted Python runs", () => {
  for (const [key, ex] of runnable) {
    it(key, () => {
      const file = join(dir, `${key}.py`);
      writeFileSync(file, translateBlessedToPython(ex.code));
      const py = spawnSync("python3", [file], { encoding: "utf8" });
      expect(py.stderr).toBe("");
      expect(py.status).toBe(0);
    });
  }
});
```

- [ ] **Step 2: Install tsx as a dev dependency and run**

```bash
npm install --save-dev tsx
npx vitest run src/blessed/__tests__/roundtrip.test.ts
```
Expected: TypeScript round trips pass for all ten runnable examples. Python round trips pass where python3 exists. Fix emitter output, never the test, when something fails. Typical fixes: `BigInt(...)` mixing with `number` in emitted arithmetic (make sure `Float(x)` of an Int emits `Number(x)`), `console.log` of a bigint printing `5n` is acceptable for this test since only exit status is checked.

- [ ] **Step 3: Write the README**

```markdown
# BLESSED

A programming language that made the obvious correct choices. All of them.

BLESSED is a satire with a real interpreter. The playground formats, type-checks,
and runs BLESSED programs in the browser, translates them to Python and
TypeScript, and explains its twenty commandments with the confidence they
deserve.

## Run it

    npm install
    npm run dev        # playground at http://localhost:5173
    npm test           # vitest
    npm run build      # single-file dist/index.html

## The language in one screen

    record Point { x: Int, y: Int }

    fn describe(p: Point) -> String {
        return match p {
            Point(x: 0, y: 0) -> "origin"
            Point(x: 0, y: y) -> "on the y axis at ${y}"
            _ -> "somewhere"
        }
    }

    let nick: String? = null
    print(nick ?? "no nickname")

    loop d in [5, 0, 2] despite errors as e {
        print(100 / d)
    }

    print(3 + 4i)          -- Complex is a type
    print(1.0 / 0.0)       -- Infinity is a number
    print(30.factorial())  -- Int does not overflow

See `docs/superpowers/specs/2026-10-03-blessed-engine-design.md` for the full
spec and `src/blessed/commandments.ts` for the twenty rules as the playground
shows them.

## Layout

    src/blessed/lexer.ts        source -> tokens
    src/blessed/parser.ts       tokens -> AST
    src/blessed/checker.ts      types, nullability, exhaustiveness, style
    src/blessed/interpreter.ts  tree-walking evaluator with a step budget
    src/blessed/formatter.ts    AST -> canonical source
    src/blessed/translate/      AST -> Python, AST -> TypeScript, plus best-effort reverse heuristics
    src/blessed/diagnostics.ts  every message, in character
```

- [ ] **Step 4: Full verification**

Run: `npx vitest run && npx tsc --noEmit && npx vite build 2>&1 | tail -3`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/blessed/__tests__/roundtrip.test.ts README.md
git commit -m "test: round-trip emitted TypeScript and Python; add README

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
