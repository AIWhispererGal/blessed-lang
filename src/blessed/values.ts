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
  throw new BlessedError(D.unhashableKey(typeName(k)));
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
  const r = Number(n.toPrecision(15));
  return Number.isInteger(r) ? r.toFixed(1) : String(r);
}

/** A number as plain source digits: exact round-trip (shortest repr), never exponent form. Infinity becomes the keyword. */
export function plainDecimal(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? "Infinity" : "-Infinity";
  const s = String(n);
  const m = /^(-?)(\d+)(?:\.(\d+))?e([-+]\d+)$/.exec(s);
  if (!m) return s;
  const [, sign, whole, frac = "", exp] = m;
  const digits = whole + frac; const point = whole.length + Number(exp);
  if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return sign + digits + "0".repeat(point - digits.length);
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

/** A Float as a BLESSED source literal: round-trips exactly, plain decimal digits, `.0` on integers. Runtime printing uses showFloat. */
export function showFloatLiteral(n: number): string {
  const s = plainDecimal(n);
  return Number.isFinite(n) && !s.includes(".") ? s + ".0" : s;
}

export function show(v: Value): string {
  switch (v.t) {
    case "Int": return v.v.toString();
    case "Float": return showFloat(v.v);
    case "Complex": {
      const r = (n: number) => Math.abs(n) < 1e-12 ? 0 : Number(n.toPrecision(15));
      const re = r(v.re), im = r(v.im);
      const plain = (n: number) => String(Math.abs(n));
      if (re === 0) return `${im < 0 ? "-" : ""}${plain(im)}i`;
      return `${String(re)} ${im < 0 ? "-" : "+"} ${plain(im)}i`;
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
