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
const OPS1 = "+-*/%<>=!(){}[],:.|_?;";

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
        let toks: Token[];
        try { toks = tokenize(inner); }
        catch (e) { if (e instanceof LexError) throw new LexError(startLine + e.line - 1, e.message); throw e; }
        toks = toks.map(t => ({ ...t, line: startLine + t.line - 1 }));
        parts.push({ kind: "expr", tokens: toks, line: startLine });
        continue;
      }
      text += ch;
    }
    flush();
    return { kind: "String", text: "", line: l, col: cl, parts };
  }
}
