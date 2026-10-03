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

export function getProperty(v: Value, name: string, _line: number): Value {
  throw new BlessedError(D.noProperty(typeName(v), name));
}

export function callMethod(_interp: Interpreter, v: Value, name: string, _args: Value[], _line: number): Value {
  throw new BlessedError(D.noMethod(typeName(v), name));
}
