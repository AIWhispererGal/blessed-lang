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
    return { stdout: interp.stdout, error: `RuntimeError: ${D.internalError(e instanceof Error ? e.message : String(e))}`, steps: interp.steps };
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
  execBlock(stmts: Stmt[], env: Env) { this.hoist(stmts, env); for (const s of stmts) this.exec(s, env); }

  /** Pre-defines every fn and registers every record in a block, so they can be used before their declaration line (mutual recursion included). */
  hoist(stmts: Stmt[], env: Env) {
    for (const s of stmts) {
      if (s.kind === "FnDecl") env.define(s.name, { t: "Function", name: s.name, params: s.params, body: s.body, env });
      else if (s.kind === "RecordDecl") this.records.set(s.name, s.fields.map(f => f.name));
    }
  }

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
        if (s.target.kind !== "Field") throw new BlessedError(D.undefinedName("target"));
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
      case "FnDecl": {
        const cur = env.has(s.name) ? env.lookup(s.name) : undefined;
        if (cur?.t === "Function" && cur.body === s.body) return;     // already hoisted by execBlock/evalBlockValue
        env.define(s.name, { t: "Function", name: s.name, params: s.params, body: s.body, env }); return;
      }
      case "RecordDecl": if (!this.records.has(s.name)) this.records.set(s.name, s.fields.map(f => f.name)); return;
      case "Return": throw new ReturnSignal(s.expr ? this.evalExpr(s.expr, env) : NULL);
      case "Fail": {
        const v = this.evalExpr(s.expr, env);
        if (v.t !== "String") throw new BlessedError(D.failNotString(typeName(v)));
        throw new BlessedError(v.v);
      }
    }
  }

  truth(v: Value): boolean {
    if (v.t !== "Bool") throw new BlessedError(D.notBoolRuntime(typeName(v)));
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
        throw new BlessedError(D.runtimeUnary("-", typeName(v)));
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
        if (e.index.kind === "Range" && (obj.t === "List" || obj.t === "String")) {
          const a = this.evalExpr(e.index.start, env), b = this.evalExpr(e.index.end, env);
          if (a.t !== "Int" || b.t !== "Int") throw new BlessedError(D.rangeEndsInt());
          if (obj.t === "List") return list(obj.items.slice(Number(a.v), Number(b.v)));
          return str([...obj.v].slice(Number(a.v), Number(b.v)).join(""));
        }
        const idx = this.evalExpr(e.index, env);
        if (obj.t === "List") return obj.items[this.listIndex(obj.items, idx)];
        if (obj.t === "Map") return obj.entries.get(mapKey(idx))?.value ?? NULL;
        if (obj.t === "String") {
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
    this.hoist(body, env);
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
      if (f.arity === -1) { if (args.length === 0) throw new BlessedError(D.wrongArgCount(f.name, 1, 0)); }
      else if (args.length !== f.arity) throw new BlessedError(D.wrongArgCount(f.name, f.arity, args.length));
      return f.fn(args);
    }
    if (f.t !== "Function") throw new BlessedError(D.notCallable(typeName(f)));
    if (args.length !== f.params.length) throw new BlessedError(D.wrongArgCount(f.name, f.params.length, args.length));
    if (++this.depth > this.depthLimit) { this.depth--; throw new BlessedError(D.recursionLimit()); }
    const env = new Env(f.env);
    f.params.forEach((p, i) => env.define(p.name, args[i]));
    try { return this.evalBlockValue(f.body, env); }
    catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      // the host stack ran out before the depth limit did: still a recursion limit, still catchable by `despite`
      if (e instanceof RangeError && e.message.includes("call stack")) throw new BlessedError(D.recursionLimit());
      throw e;
    }
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
    const text = () => `${show(a)} ${op} ${show(b)}`;     // built only when a result is not a number
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
