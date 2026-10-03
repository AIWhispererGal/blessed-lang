// src/blessed/stdlib.ts   
import { Value, Env, NULL, int, float, str, complex, BlessedError, show, typeName, checkFloat, list, bool, equals, mapKey, makeComplex } from "./values";
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
    throw new BlessedError(D.runtimeUnary("Int()", typeName(v)));
  }));
  g.define("Float", builtin("Float", 1, ([v]) => {
    if (v.t === "Float") return v;
    if (v.t === "Int") return float(Number(v.v));
    if (v.t === "String") { const s = v.v.trim(); if (!/^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return NULL; const n = Number(s); return Number.isFinite(n) ? float(n) : NULL; }
    if (v.t === "Complex") { if (v.im !== 0) throw new BlessedError(D.floatFromComplex()); return float(v.re); }
    throw new BlessedError(D.runtimeUnary("Float()", typeName(v)));
  }));
  g.define("Complex", builtin("Complex", 1, ([v]) => {
    if (v.t === "Complex") return v;
    if (v.t === "Int") return complex(Number(v.v), 0);
    if (v.t === "Float") return complex(checkFloat(v.v, "Complex()"), 0);
    throw new BlessedError(D.runtimeUnary("Complex()", typeName(v)));
  }));
  g.define("PI", float(Math.PI));
  g.define("E", float(Math.E));
  return g;
}

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
function argOf(args: Value[], i: number, t: Value["t"], _name: string): any {
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
