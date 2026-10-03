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

/** Joins two branch/element types: equal types stay, Null with T becomes T?, T with T? becomes T?. Returns undefined on disagreement. */
function unify(a: Type, b: Type): Type | undefined {
  if (a.k === "Unknown") return b;
  if (b.k === "Unknown") return a;
  if (a.k === "Null") return T.nullable(b);
  if (b.k === "Null") return T.nullable(a);
  const ai = a.k === "Nullable" ? a.inner : a, bi = b.k === "Nullable" ? b.inner : b;
  if (!same(ai, bi)) return undefined;
  if (ai.k === "List" && bi.k === "List" && ai.el.k === "Unknown") return b;   // [] joins with [x]
  return a.k === "Nullable" || b.k === "Nullable" ? T.nullable(ai) : a;
}

/** A statement list diverges if it always leaves via `fail` or `return` (so it produces no value). */
function diverges(stmts: Stmt[]): boolean {
  const last = stmts[stmts.length - 1];
  if (!last) return false;
  if (last.kind === "Fail" || last.kind === "Return") return true;
  if (last.kind === "If" || last.kind === "IfLet") return !!last.else && diverges(last.then) && diverges(last.else);
  return false;
}

/** Conservative: a function body terminates if every path ends in return, fail, or a forever loop. A trailing expression is an implicit
 *  return only at the top level of the body (`top`); inside if/else branches its value is discarded at runtime. */
function terminates(stmts: Stmt[], top = false): boolean {
  const last = stmts[stmts.length - 1];
  if (!last) return false;
  switch (last.kind) {
    case "Return": case "Fail": return true;
    case "ExprStmt": return top;
    case "Loop": return last.shape === "forever";
    case "If": case "IfLet": return !!last.else && terminates(last.then) && terminates(last.else);
    default: return false;
  }
}

/** `at`: index of the declaring statement in its block, for `let`-like bindings (see Checker.fnView). */
interface Binding { type: Type; isConst: boolean; at?: number }
class Scope {
  vars = new Map<string, Binding>();
  /** For each hoisted fn of this scope's block: the index of the first statement that can run it. */
  fnFirstRun?: Map<string, number>;
  /** Index of the statement being checked in this scope's block. */
  at = 0;
  constructor(public parent?: Scope, public fnRet?: { declared?: Type; inferred: Type[] }) {}
  lookup(n: string): Binding | undefined { return this.vars.get(n) ?? this.parent?.lookup(n); }
  fn(): Scope | undefined { return this.fnRet ? this : this.parent?.fn(); }
}

const isConstName = (n: string) => /^[A-Z][A-Z0-9_]*$/.test(n) && n.length > 1;

/** Every identifier mentioned anywhere inside an AST node (nested functions included). */
function mentions(node: unknown, out = new Set<string>()): Set<string> {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) { for (const n of node) mentions(n, out); return out; }
  const n = node as { kind?: string; name?: string };
  if (n.kind === "Ident") out.add(n.name!);
  for (const v of Object.values(node)) if (v && typeof v === "object") mentions(v, out);
  return out;
}

/** For each fn declared in a block: the index of the first statement that can run it. That is its own declaration, or an earlier
 *  statement that mentions it, directly or through another hoisted fn it runs first. Its body may only read the block's `let`s
 *  declared above that point; anything later would not exist yet when it runs. */
function firstRuns(stmts: Stmt[]): Map<string, number> {
  const first = new Map<string, number>(); const bodies = new Map<string, Set<string>>();
  stmts.forEach((s, i) => { if (s.kind === "FnDecl" && !first.has(s.name)) { first.set(s.name, i); bodies.set(s.name, mentions(s.body)); } });
  if (!first.size) return first;
  stmts.forEach((s, i) => {
    if (s.kind === "FnDecl") return;
    for (const n of mentions(s)) if (first.has(n) && i < first.get(n)!) first.set(n, i);
  });
  for (let changed = true; changed;) {
    changed = false;
    for (const [f, names] of bodies) for (const n of names) {
      if (first.has(n) && first.get(f)! < first.get(n)!) { first.set(n, first.get(f)!); changed = true; }
    }
  }
  return first;
}

export function check(program: Program): Diagnostic[] {
  const c = new Checker();
  c.block(program.body, c.global);
  return c.diags.sort((a, b) => a.line - b.line);
}

/** Like check(), and also exposes the type the checker assigned to every expression (translators use it). */
export function checkWithTypes(program: Program): { diags: Diagnostic[]; typeOf: (e: Expr) => Type } {
  const c = new Checker();
  c.block(program.body, c.global);
  return { diags: c.diags.sort((a, b) => a.line - b.line), typeOf: (e) => c.types.get(e) ?? T.Unknown };
}

class Checker {
  diags: Diagnostic[] = [];
  records = new Map<string, Map<string, Type>>();
  global = new Scope();
  types = new WeakMap<Expr, Type>();

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
    const declared = stmts.filter((s): s is Extract<Stmt, { kind: "RecordDecl" }> => s.kind === "RecordDecl" && this.declareRecord(s));   // records are visible before use
    for (const s of declared) this.resolveRecordFields(s);                              // field types too, so earlier code can construct and read them
    for (const s of stmts) if (s.kind === "FnDecl") this.declareFn(s, scope);          // functions can be mutually recursive
    scope.fnFirstRun = firstRuns(stmts);
    stmts.forEach((s, i) => { scope.at = i; this.stmt(s, scope); });
  }

  /** The scope a hoisted fn body sees: its block's `let`s only when declared before the first statement that can run the fn. */
  fnView(scope: Scope, name: string): Scope {
    const cut = scope.fnFirstRun?.get(name);
    if (cut === undefined) return scope;
    const view = new Scope(scope.parent, scope.fnRet);
    for (const [k, b] of scope.vars) if (b.at === undefined || b.at < cut) view.vars.set(k, b);
    view.fnFirstRun = scope.fnFirstRun;
    return view;
  }

  declareRecord(s: Extract<Stmt, { kind: "RecordDecl" }>): boolean {
    if (this.records.has(s.name)) { this.err(s.span.line, D.redeclared(s.name)); return false; }
    this.records.set(s.name, new Map());
    return true;
  }
  resolveRecordFields(s: Extract<Stmt, { kind: "RecordDecl" }>) {
    const fields = this.records.get(s.name)!;
    for (const f of s.fields) { if (fields.has(f.name)) this.err(s.span.line, D.duplicateField(f.name)); else fields.set(f.name, this.resolveType(f.type)); }
  }
  declareFn(s: Extract<Stmt, { kind: "FnDecl" }>, scope: Scope) {
    if (scope.vars.has(s.name)) { this.err(s.span.line, D.redeclared(s.name)); return; }
    const params = s.params.map(p => p.type ? this.resolveType(p.type) : this.err(p.span.line, D.cannotInfer(p.name)));
    scope.vars.set(s.name, { type: T.fn(params, s.ret ? this.resolveType(s.ret) : T.Unknown), isConst: false });
  }

  checkName(line: number, name: string) {
    if (name.startsWith("__") && name.endsWith("__") && name.length > 4) return this.err(line, D.doubleUnderscore());
    if (name.startsWith("_") && name !== "_") this.warn(line, D.leadingUnderscore());
    else if (name.includes("_") && !isConstName(name)) this.warn(line, D.snakeCase(name, name.replace(/_+([a-zA-Z0-9])/g, (_, l: string) => l.toUpperCase())));
    return undefined;
  }

  stmt(s: Stmt, scope: Scope) {
    if (s.semicolon) this.warn(s.span.line, D.semicolon());
    switch (s.kind) {
      case "Let": {
        this.checkName(s.span.line, s.name);
        if (scope.vars.has(s.name)) { this.err(s.span.line, D.redeclared(s.name)); return; }
        const declared = s.type ? this.resolveType(s.type) : undefined;
        const actual = this.expr(s.init, scope, declared);
        let type = declared ?? actual;
        if (declared) {
          if (actual.k === "Null" && declared.k !== "Nullable" && declared.k !== "Unknown") this.err(s.span.line, D.nullToNonNullable(s.name, showType(declared)));
          else this.expect(s.span.line, declared, actual, s.init);
        } else if (actual.k === "List" && actual.el.k === "Unknown") type = actual;
        if (!declared && s.init.kind === "MapLit" && s.init.entries.length === 0) this.err(s.span.line, D.emptyMapNeedsType());
        scope.vars.set(s.name, { type, isConst: isConstName(s.name), at: scope.at });
        return;
      }
      case "Assign": {
        if (s.target.kind === "Ident") {
          const b = scope.lookup(s.target.name);
          if (!b) { this.err(s.span.line, D.undefinedName(s.target.name)); return; }
          if (b.isConst) { this.err(s.span.line, D.constReassign(s.target.name)); return; }
          const v = this.expr(s.value, scope, b.type);
          if (v.k === "Null" && b.type.k !== "Nullable" && b.type.k !== "Unknown") this.err(s.span.line, D.nullToNonNullable(s.target.name, showType(b.type)));
          else if (b.type.k === "List" && b.type.el.k === "Unknown" && v.k === "List") b.type = v;        // `let xs = []` then `xs = [1]`
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
        const target = s.target;
        if (target.kind !== "Index") { this.expr(target, scope); this.expr(s.value, scope); return; }   // parser only produces Ident | Field | Index
        const obj = this.expr(target.obj, scope);
        if (obj.k === "Map") { this.expect(s.span.line, obj.key, this.expr(target.index, scope, obj.key), target.index, true); this.expect(s.span.line, obj.val, this.expr(s.value, scope, obj.val), s.value); return; }
        if (obj.k === "List") { this.expect(s.span.line, T.Int, this.expr(target.index, scope), target.index); this.expect(s.span.line, obj.el, this.expr(s.value, scope, obj.el), s.value); return; }
        this.expr(target.index, scope); this.expr(s.value, scope);
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
        this.checkName(s.span.line, s.name);
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
          this.checkName(s.span.line, s.item!);
          const t = this.exprNonNull(s.iter!, scope);
          const el = t.k === "List" ? t.el : (t.k === "Unknown" ? T.Unknown : this.err(s.span.line, D.typeMismatch("List", showType(t))));
          inner.vars.set(s.item!, { type: el, isConst: false });
          if (s.despite?.errName) {
            this.checkName(s.span.line, s.despite.errName);
            if (scope.vars.has(s.despite.errName)) this.err(s.span.line, D.redeclared(s.despite.errName));
            scope.vars.set(s.despite.errName, { type: T.nullable(T.String), isConst: false, at: scope.at });   // String?, visible in the body and after the loop
          }
        }
        this.block(s.body, inner);
        return;
      }
      case "FnDecl": {
        const b = scope.vars.get(s.name); if (!b || b.type.k !== "Fn") return;
        const ret = this.fnBody(s.params, b.type.params, s.ret ? b.type.ret : undefined, s.body, this.fnView(scope, s.name), s.span.line, s.name);
        if (!s.ret) b.type = T.fn(b.type.params, ret);
        return;
      }
      case "RecordDecl": return;     // declared and resolved in block()'s pre-pass
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
  fnBody(params: Param[], paramTypes: Type[], declaredRet: Type | undefined, body: Stmt[], outer: Scope, line: number, name: string): Type {
    const scope = new Scope(outer, { declared: declaredRet, inferred: [] });
    params.forEach((p, i) => {
      this.checkName(p.span.line, p.name);
      if (scope.vars.has(p.name)) this.err(p.span.line, D.redeclared(p.name));
      scope.vars.set(p.name, { type: paramTypes[i] ?? T.Unknown, isConst: false });
    });
    const tail = this.blockValue(body, scope, declaredRet);
    if (tail) {
      if (declaredRet) this.expect(tail.line, declaredRet, tail.type, tail.expr); else scope.fnRet!.inferred.push(tail.type);
    }
    if (declaredRet) {
      if (declaredRet.k !== "Nullable" && declaredRet.k !== "Unknown" && !terminates(body, true)) this.err(line, D.missingReturn(name, showType(declaredRet)));
      return declaredRet;
    }
    const inferred = scope.fnRet!.inferred;
    if (!terminates(body, true)) inferred.push(T.Null);     // falling off the end returns null
    if (inferred.length === 0) return T.Null;
    let ret = inferred[0];
    for (const t of inferred.slice(1)) {
      const u = unify(ret, t);
      if (!u) { this.err(line, D.typeMismatch(showType(ret), showType(t))); continue; }
      ret = u;
    }
    return ret;
  }

  /** Checks a block whose last expression statement is its value (function bodies, match arms). Returns that value, or undefined when the block has no tail expression. */
  blockValue(body: Stmt[], scope: Scope, expected?: Type): { type: Type; expr: Expr; line: number } | undefined {
    const last = body[body.length - 1];
    if (!last || last.kind !== "ExprStmt") { this.block(body, scope); return undefined; }
    this.block(body.slice(0, -1), scope);
    if (last.semicolon) this.warn(last.span.line, D.semicolon());
    return { type: this.expr(last.expr, scope, expected), expr: last.expr, line: last.span.line };
  }

  condition(e: Expr, scope: Scope) {
    const t = this.exprNonNull(e, scope, T.Bool);
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

  /** Renders an expression as an operand of a binary fix-it, parenthesized when it is itself a binary. */
  operand(e: Expr): string { return e.kind === "Binary" ? `(${this.src(e)})` : this.src(e); }

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
      case "Binary": return `${this.operand(e.left)} ${e.op} ${this.operand(e.right)}`;
      default: return "expression";
    }
  }

  // ---------- expressions
  expr(e: Expr, scope: Scope, expected?: Type): Type { const t = this.exprInner(e, scope, expected); this.types.set(e, t); return t; }

  exprInner(e: Expr, scope: Scope, expected?: Type): Type {
    switch (e.kind) {
      case "IntLit": return T.Int;
      case "FloatLit": return T.Float;
      case "ComplexLit": return T.Complex;
      case "BoolLit": return T.Bool;
      case "NullLit": return T.Null;
      case "StrLit": for (const p of e.parts) if (typeof p !== "string") this.exprNonNull(p, scope); return T.String;
      case "Ident": {
        const b = scope.lookup(e.name);
        if (!b) return this.err(e.span.line, this.records.has(e.name) ? D.recordAsValue(e.name) : D.undefinedName(e.name));
        return b.type;
      }
      case "ListLit": {
        const want = expected?.k === "List" && expected.el.k !== "Unknown" ? expected.el : undefined;   // List<Unknown> (from `[]`) is no expectation
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
        return this.err(e.span.line, D.cannotNegate(showType(t)));
      }
      case "Binary": return this.binary(e, scope);
      case "Lambda": {
        const want = expected?.k === "Fn" ? expected : undefined;
        const params = e.params.map((p, i) => p.type ? this.resolveType(p.type) : want?.params[i] ?? this.err(p.span.line, D.cannotInfer(p.name)));
        const ret = this.fnBody(e.params, params, e.ret ? this.resolveType(e.ret) : undefined, e.body, scope, e.span.line, "fn");
        return T.fn(params, ret);
      }
      case "Call": return this.call(e, scope);
      case "Index": {
        const obj = this.exprNonNull(e.obj, scope);
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
      if (l.k === "Null") return r;
      this.expect(line, inner, r.k === "Nullable" ? r.inner : r, e.right);
      return r.k === "Nullable" || r.k === "Null" ? T.nullable(inner) : inner;     // a nullable fallback keeps the result nullable
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
      if (e.op === "+" && ((l.k === "Int" || l.k === "Float") && r.k === "String")) return this.err(line, D.cannotAdd(l.k, r.k, this.operand(e.left), this.operand(e.right)));
      if (e.op === "+" && (l.k === "String" && (r.k === "Int" || r.k === "Float"))) return this.err(line, D.cannotAddToString(r.k, l.k, this.operand(e.left), this.operand(e.right)));
      return this.err(line, D.cannotOperate(e.op, showType(l), showType(r))) && (cmp ? T.Bool : T.Unknown);
    }
    if (cmp) { if (["Int", "Float", "String"].includes(l.k)) return T.Bool; return this.err(line, D.cannotOperate(e.op, showType(l), showType(r))) && T.Bool; }
    if (l.k === "Int" || l.k === "Float") return l;
    if (l.k === "String" && e.op === "+") return T.String;
    if (l.k === "List" && e.op === "+") { const u = unify(l, r); if (u) return u; return this.err(line, D.cannotOperate(e.op, showType(l), showType(r))); }
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
    // print is variadic: one or more arguments of any non-null type
    if (e.callee.kind === "Ident" && e.callee.name === "print" && scope.lookup("print") === this.global.vars.get("print")) {
      this.exprNonNull(e.callee, scope);
      this.namedArgs(e, scope, true);
      if (e.args.length === 0) return this.err(line, D.wrongArgCount("print", 1, 0));
      for (const a of e.args) this.exprNonNull(a, scope);
      return T.Null;
    }
    // conversions
    if (e.callee.kind === "Ident" && ["String", "Int", "Float", "Complex"].includes(e.callee.name) && !scope.lookup(e.callee.name)) {
      if (e.args.length !== 1) return this.err(line, D.wrongArgCount(e.callee.name, 1, e.args.length));
      const name = e.callee.name;
      if (name === "String") { this.expr(e.args[0], scope); return T.String; }    // String(x) works on any value, null included
      const a = this.exprNonNull(e.args[0], scope);
      const accepts: Record<string, string[]> = { Int: ["Int", "Float", "String"], Float: ["Int", "Float", "String", "Complex"], Complex: ["Int", "Float", "Complex"] };
      if (a.k !== "Unknown" && !accepts[name].includes(a.k)) this.err(line, D.conversionArg(name, accepts[name], showType(a)));
      if (name === "Int") return a.k === "String" ? T.nullable(T.Int) : T.Int;
      if (name === "Float") return a.k === "String" ? T.nullable(T.Float) : T.Float;
      return T.Complex;
    }
    // method call
    if (e.callee.kind === "Field") {
      const obj = this.exprNonNull(e.callee.obj, scope); const m = e.callee.name;
      this.namedArgs(e, scope, obj.k !== "Unknown");
      if (obj.k === "Record") {
        const ft = this.records.get(obj.name)?.get(m);
        if (!ft) return this.err(line, D.noField(obj.name, m));
        return this.applyFn(ft, e.args, scope, line, m);
      }
      if (obj.k === "Unknown") { e.args.forEach(a => this.expr(a, scope)); return T.Unknown; }
      if (m === "length" && (obj.k === "String" || obj.k === "List")) return this.err(line, D.lengthIsProperty());
      const arity = METHODS[obj.k]?.[m];
      if (arity === undefined) { e.args.forEach(a => this.expr(a, scope)); return this.err(line, D.noMethod(showType(obj), m)); }
      if ((arity >= 0 && e.args.length !== arity) || (arity < 0 && e.args.length > 1)) { e.args.forEach(a => this.expr(a, scope)); return this.err(line, D.wrongArgCount(m, Math.max(arity, 1), e.args.length)); }
      return this.method(obj, m, e.args, scope, line);
    }
    const f = this.exprNonNull(e.callee, scope);
    this.namedArgs(e, scope, f.k === "Fn");
    if (f.k === "Unknown") { e.args.forEach(a => this.expr(a, scope)); return T.Unknown; }
    if (f.k !== "Fn") { e.args.forEach(a => this.expr(a, scope)); return this.err(line, D.notCallable(showType(f))); }
    return this.applyFn(f, e.args, scope, line, this.src(e.callee));
  }

  /** Named arguments only belong to record construction. Their values are still checked so names inside them resolve. */
  namedArgs(e: Extract<Expr, { kind: "Call" }>, scope: Scope, isFn: boolean) {
    if (!e.named.length) return;
    if (isFn) this.err(e.span.line, D.namedArgsOnFn(this.src(e.callee)));
    for (const n of e.named) this.expr(n.value, scope);
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
          case "push": { if (el.k === "Unknown") return T.list(argT(0)); need(0, el); return obj; }   // [].push(x) learns its element type
          case "map": { const want = T.fn([el], T.Unknown); const ft = argT(0, want); this.expect(line, want, ft, args[0]); return T.list(ft.k === "Fn" ? ft.ret : T.Unknown); }
          case "filter": { const want = T.fn([el], T.Bool); const ft = argT(0, want); this.expect(line, want, ft, args[0]); return obj; }
          case "reduce": { const init = argT(1); const want = T.fn([init, el], init); const ft = argT(0, want); this.expect(line, want, ft, args[0]); return init; }
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
      if (p.kind === "PLit" && p.value.kind === "BoolLit" && !arm.guard) { if (p.value.value) sawTrue = true; else sawFalse = true; }
      // a binding or wildcard before any `null ->` arm can still see null
      const patSubject = p.kind === "PLit" && p.value.kind === "NullLit" ? subj : (p.kind === "PBind" || p.kind === "PWild") && !sawNull ? subj : inner;
      if (p.kind === "PLit" && p.value.kind === "NullLit") sawNull = true;
      this.pattern(p, patSubject, armScope, arm.span.line);
      if (arm.guard) this.condition(arm.guard, armScope);
      const t = this.blockValue(arm.body, armScope, result ?? expected)?.type ?? T.Null;
      if (diverges(arm.body)) continue;      // an arm that fails or returns contributes no value
      if (!result) { result = t; continue; }
      const u = unify(result, t);
      if (u) result = u; else this.err(arm.span.line, D.armTypeMismatch(showType(result), showType(t)));
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
