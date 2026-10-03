// src/blessed/translate/python.ts
// AST -> Python 3.10+ emitter. Uses checker types to choose between Int and Float semantics.
import type { Program, Stmt, Expr, TypeExpr, Pattern } from "../ast";
import { showFloat } from "../values";
import { D } from "../diagnostics";
import { checkWithTypes, type Type } from "../checker";

const IND = "    ";
/** BLESSED binary precedence (see parser). Unary is 9, postfix (call, index, field) is 10. */
const PREC: Record<string, number> = { "??": 1, "or": 2, "and": 3, "==": 4, "!=": 4, "is": 4, "<": 5, "<=": 5, ">": 5, ">=": 5, "+": 7, "-": 7, "*": 8, "/": 8, "%": 8 };
const UNARY = 9, POSTFIX = 10;
/** Python chains comparisons (`a < b == c`), BLESSED does not: operands of a comparison render above every comparison level. */
const ABOVE_CMP = 6;
const BUILTINS = new Set(["print", "String", "Int", "Float", "Complex"]);

type Match = Extract<Expr, { kind: "Match" }>;
type IfNode = Extract<Stmt, { kind: "If" | "IfLet" }>;
/** How the value of a block's last expression statement is used: `wrap` renders it, `noValue` fills in when the block has none. */
interface Tail { wrap: (code: string) => string; noValue?: string }
interface Holder { c?: string[] }
interface FnScope { locals: Set<string>; globals: Set<string>; nonlocals: Set<string> }

export function emitPython(p: Program): string {
  const { typeOf } = checkWithTypes(p);
  const em = new Py(typeOf);
  const body = em.stmts(p.body, 0);
  const lines: string[] = [];
  const imports: string[] = [];
  if (em.uses.has("dataclass")) imports.push("from dataclasses import dataclass, replace");
  if (em.uses.has("typing")) imports.push(`from typing import ${[...em.typing].sort().join(", ")}`);
  for (const m of ["cmath", "functools", "math", "re"]) if (em.uses.has(m)) imports.push(`import ${m}`);
  if (imports.length) lines.push(...imports, "");
  if (em.uses.has("bdiv")) lines.push(
    "def _bdiv(a, b):", `${IND}if b == 0:`, `${IND}${IND}raise ZeroDivisionError(${JSON.stringify(D.divByZero())})`,
    `${IND}q = abs(a) // abs(b)`, `${IND}return q if (a >= 0) == (b >= 0) else -q`, "",
    "def _bmod(a, b):", `${IND}if b == 0:`, `${IND}${IND}raise ZeroDivisionError(${JSON.stringify(D.divByZero())})`,
    `${IND}return a - b * _bdiv(a, b)`, "");
  if (em.uses.has("fcheck")) lines.push(
    "def _fcheck(x):", `${IND}if math.isnan(x):`, `${IND}${IND}raise ArithmeticError(${JSON.stringify(D.notANumber("result"))})`, `${IND}return x`, "");
  if (em.uses.has("fdiv")) lines.push(
    "def _fdiv(a, b):", `${IND}if b == 0.0:`, `${IND}${IND}if a == 0.0:`,
    `${IND}${IND}${IND}raise ArithmeticError(${JSON.stringify(D.notANumber("0.0 / 0.0"))})`,
    `${IND}${IND}return math.inf if (a > 0) == (math.copysign(1.0, b) > 0) else -math.inf`, `${IND}return _fcheck(a / b)`, "");
  if (em.uses.has("fmod")) lines.push(
    "def _fmod(a, b):", `${IND}if b == 0.0 or math.isinf(a) or math.isinf(b):`,
    `${IND}${IND}raise ArithmeticError(${JSON.stringify(D.notANumber("result"))})`, `${IND}return math.fmod(a, b)`, "");
  if (em.uses.has("bint")) lines.push(
    "def _bint(s):", `${IND}s = s.strip()`, `${IND}return int(s) if re.fullmatch(r"-?[0-9]+", s) else None`, "");
  if (em.uses.has("bfloat")) lines.push(
    "def _bfloat(s):", `${IND}s = s.strip()`, `${IND}if not re.fullmatch(r"-?([0-9]+\\.?[0-9]*|\\.[0-9]+)([eE][-+]?[0-9]+)?", s):`,
    `${IND}${IND}return None`, `${IND}x = float(s)`, `${IND}return x if math.isfinite(x) else None`, "");
  lines.push(...em.hoisted, ...body);
  for (const c of p.trailingComments) lines.push(em.comment(c));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** A statement list that always leaves via `fail` or `return`. */
function diverges(stmts: Stmt[]): boolean {
  const last = stmts[stmts.length - 1];
  if (!last) return false;
  if (last.kind === "Fail" || last.kind === "Return") return true;
  if (last.kind === "If" || last.kind === "IfLet") return !!last.else && diverges(last.then) && diverges(last.else);
  return false;
}

/** The match expression a statement turns into an inline Python `match` statement, if any. */
function inlineMatch(s: Stmt): Match | undefined {
  const e = s.kind === "Let" ? s.init : s.kind === "Assign" && s.target.kind === "Ident" ? s.value
    : s.kind === "Return" ? s.expr : s.kind === "ExprStmt" ? s.expr : undefined;
  return e?.kind === "Match" ? e : undefined;
}

function patternNames(p: Pattern, out: Set<string>) {
  if (p.kind === "PBind") out.add(p.name);
  if (p.kind === "PRecord") p.fields.forEach(f => patternNames(f.pattern, out));
}

/** Names a Python function body binds (its locals) and names it assigns, not descending into nested functions. */
function collectNames(stmts: Stmt[], locals: Set<string>, assigned: Set<string>) {
  for (const s of stmts) {
    switch (s.kind) {
      case "Let": locals.add(s.name); break;
      case "Assign": if (s.target.kind === "Ident") assigned.add(s.target.name); break;
      case "IfLet": locals.add(s.name); break;
      case "Loop": if (s.item) locals.add(s.item); if (s.despite?.errName) locals.add(s.despite.errName); break;
      case "FnDecl": case "RecordDecl": locals.add(s.name); break;
    }
    if (s.kind === "If" || s.kind === "IfLet") { collectNames(s.then, locals, assigned); if (s.else) collectNames(s.else, locals, assigned); }
    if (s.kind === "Loop") collectNames(s.body, locals, assigned);
    const m = inlineMatch(s);
    if (m) for (const a of m.arms) { patternNames(a.pattern, locals); collectNames(a.body, locals, assigned); }
  }
}

/** Does this statement run user-defined code (so a function or record it uses must already exist)? */
function runsUserCode(node: unknown, decls: Set<string>): boolean {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some(n => runsUserCode(n, decls));
  const n = node as { kind?: string; name?: string; callee?: { kind: string; name?: string } };
  if ((n.kind === "Ident" || n.kind === "PRecord") && decls.has(n.name!)) return true;
  if (n.kind === "Call" && !(n.callee!.kind === "Ident" && BUILTINS.has(n.callee!.name!))) return true;
  return Object.values(node).some(v => runsUserCode(v, decls));
}

/** BLESSED functions and records are visible to the whole block; Python's are not until their `def` runs. When code before a
 *  declaration may call into one, move the block's declarations (records first) to the top. */
function orderDecls(body: Stmt[]): Stmt[] {
  const isDecl = (s: Stmt) => s.kind === "FnDecl" || s.kind === "RecordDecl";
  let lastDecl = -1;
  body.forEach((s, i) => { if (isDecl(s)) lastDecl = i; });
  if (lastDecl < 0) return body;
  const names = new Set(body.filter(isDecl).map(s => (s as { name: string }).name));
  if (!body.slice(0, lastDecl).some(s => !isDecl(s) && runsUserCode(s, names))) return body;
  return [...body.filter(s => s.kind === "RecordDecl"), ...body.filter(s => s.kind === "FnDecl"), ...body.filter(s => !isDecl(s))];
}

class Py {
  uses = new Set<string>();
  typing = new Set<string>();
  hoisted: string[] = [];     // helper functions, spliced in before the statement that needs them
  matchCounter = 0; fnCounter = 0; tmpCounter = 0;
  records = new Set<string>();   // records whose class has been emitted; later references are forward references
  scopes: FnScope[] = [];        // enclosing Python functions, innermost last

  constructor(private typeOf: (e: Expr) => Type) {}

  comment(c: string) { return "#" + c.slice(2); }
  /** The checker's type kind for an expression, looking through `T?`. */
  kind(e: Expr): Type["k"] { const t = this.typeOf(e); return t.k === "Nullable" ? t.inner.k : t.k; }

  // ---------- statements

  stmts(body: Stmt[], depth: number, tail?: Tail, holder?: Holder): string[] {
    const p = IND.repeat(depth);
    const out: string[] = [];
    if (body.length === 0 && holder?.c) { out.push(...holder.c.map(c => p + this.comment(c))); holder.c = undefined; }
    const ordered = orderDecls(body);
    ordered.forEach((s, i) => {
      const prevDecl = i > 0 && (ordered[i - 1].kind === "FnDecl" || ordered[i - 1].kind === "RecordDecl");
      if (i > 0 && (s.blankBefore > 0 || prevDecl || s.kind === "FnDecl")) out.push("");
      for (const c of s.leading) out.push(p + this.comment(c));
      const before = this.hoisted.length;
      const isTail = !!tail && i === ordered.length - 1 && s.kind === "ExprStmt";
      const ls = isTail ? this.tailExpr((s as { expr: Expr }).expr, depth, tail!) : this.stmt(s, depth);
      const hoisted = this.hoisted.splice(before);
      out.push(...hoisted.map(l => l === "" ? l : p + l));
      if (s.trailing) { if (ls.length === 1) ls[0] += "  " + this.comment(s.trailing); else ls.push(p + this.comment(s.trailing)); }
      out.push(...ls);
      for (const c of s.after ?? []) out.push(p + this.comment(c));
    });
    const last = body[body.length - 1];
    if (tail?.noValue && !(last && last.kind === "ExprStmt") && !diverges(body)) out.push(p + tail.noValue);
    if (!out.some(l => l.trim() !== "" && !l.trim().startsWith("#"))) out.push(p + "pass");
    return out;
  }

  /** The last expression of a value-producing block. A match there becomes a nested inline match. */
  tailExpr(e: Expr, depth: number, tail: Tail): string[] {
    if (e.kind === "Match") return this.matchInline(e, depth, tail);
    return [IND.repeat(depth) + tail.wrap(this.expr(e))];
  }

  stmt(s: Stmt, depth: number): string[] {
    const p = IND.repeat(depth);
    const holder: Holder = { c: s.innerComments };
    const out = this.stmtInner(s, depth, holder);
    if (holder.c?.length) out.unshift(...holder.c.map(c => p + this.comment(c)));   // comments from blocks Python has no place for
    return out;
  }

  stmtInner(s: Stmt, depth: number, holder: Holder): string[] {
    const p = IND.repeat(depth);
    const m = inlineMatch(s);
    switch (s.kind) {
      case "Let": {
        if (m) return [...(s.type ? [`${p}${s.name}: ${this.type(s.type)}`] : []), ...this.matchInline(m, depth, { wrap: c => `${s.name} = ${c}`, noValue: `${s.name} = None` })];
        return [`${p}${s.name}${s.type ? ": " + this.type(s.type) : ""} = ${this.expr(s.init)}`];
      }
      case "Assign": {
        if (m && s.target.kind === "Ident") { const n = s.target.name; return this.matchInline(m, depth, { wrap: c => `${n} = ${c}`, noValue: `${n} = None` }); }
        const t = s.target;   // an Index target is a store, never the nullable `.get()` lookup
        const target = t.kind === "Index" && t.index.kind !== "Range" ? `${this.expr(t.obj, POSTFIX)}[${this.expr(t.index)}]` : this.expr(t);
        return [`${p}${target} = ${this.expr(s.value)}`];
      }
      case "ExprStmt": return m ? this.matchInline(m, depth, { wrap: c => c }) : [`${p}${this.expr(s.expr)}`];
      case "If": return this.ifChain(s, depth, `${p}if ${this.expr(s.cond)}:`, holder);
      case "IfLet": return [`${p}${s.name} = ${this.expr(s.expr)}`, ...this.ifChain(s, depth, `${p}if ${s.name} is not None:`, holder)];
      case "Loop": {
        if (s.shape === "forever") return [`${p}while True:`, ...this.stmts(s.body, depth + 1, undefined, holder)];
        if (s.shape === "while") return [`${p}while ${this.expr(s.cond!)}:`, ...this.stmts(s.body, depth + 1, undefined, holder)];
        const iter = s.iter!.kind === "Range" ? `range(${this.expr(s.iter!.start)}, ${this.expr(s.iter!.end)})` : this.expr(s.iter!);
        const head = `${p}for ${s.item} in ${iter}:`;
        if (!s.despite) return [head, ...this.stmts(s.body, depth + 1, undefined, holder)];
        const name = s.despite.errName;
        const pre = name ? [`${p}${name} = None`] : [];
        const handler = name ? [`${p}${IND}except Exception as _err:`, `${p}${IND}${IND}${name} = str(_err)`] : [`${p}${IND}except Exception:`, `${p}${IND}${IND}pass`];
        return [...pre, head, `${p}${IND}try:`, ...this.stmts(s.body, depth + 2, undefined, holder), ...handler];
      }
      case "FnDecl": {
        const ps = s.params.map(x => `${x.name}${x.type ? ": " + this.type(x.type) : ""}`).join(", ");
        const head = `${p}def ${s.name}(${ps})${s.ret ? " -> " + this.type(s.ret) : ""}:`;
        return [head, ...this.fnScope(s.params.map(x => x.name), s.body, new Set(), depth + 1,
          () => this.stmts(s.body, depth + 1, { wrap: c => `return ${c}` }, holder))];
      }
      case "RecordDecl": {
        this.uses.add("dataclass");
        const fields = s.fields.length ? s.fields.map(f => `${p}${IND}${f.name}: ${this.type(f.type)}`) : [`${p}${IND}pass`];
        this.records.add(s.name);
        return [`${p}@dataclass(frozen=True)`, `${p}class ${s.name}:`, ...fields];
      }
      case "Return": return m ? this.matchInline(m, depth, { wrap: c => `return ${c}` }) : [`${p}return${s.expr ? " " + this.expr(s.expr) : ""}`];
      case "Fail": return [`${p}raise Exception(${this.expr(s.expr)})`];
    }
  }

  /** Emits a Python function body: `global`/`nonlocal` for outer variables it assigns, then the body itself. */
  fnScope(params: string[], body: Stmt[], extraLocals: Set<string>, depth: number, emit: () => string[]): string[] {
    const locals = new Set<string>([...params, ...extraLocals]); const assigned = new Set<string>();
    collectNames(body, locals, assigned);
    const scope: FnScope = { locals, globals: new Set(), nonlocals: new Set() };
    for (const n of [...assigned].filter(n => !locals.has(n))) {
      let found: "global" | "nonlocal" = "global";
      for (let i = this.scopes.length - 1; i >= 0; i--) {
        const sc = this.scopes[i];
        if (sc.locals.has(n) || sc.nonlocals.has(n)) { found = "nonlocal"; break; }
        if (sc.globals.has(n)) break;
      }
      (found === "global" ? scope.globals : scope.nonlocals).add(n);
    }
    this.scopes.push(scope);
    try {
      const p = IND.repeat(depth);
      const decls = [...(scope.globals.size ? [`${p}global ${[...scope.globals].join(", ")}`] : []),
        ...(scope.nonlocals.size ? [`${p}nonlocal ${[...scope.nonlocals].join(", ")}`] : [])];
      return [...decls, ...emit()];
    } finally { this.scopes.pop(); }
  }

  ifChain(s: IfNode, depth: number, head: string, holder: Holder): string[] {
    const p = IND.repeat(depth);
    const out = [head, ...this.thenPart(s, depth, holder)];
    let els = s.else;
    while (els) {
      const n = els[0];
      if (els.length === 1 && (n.kind === "If" || n.kind === "IfLet") && n.leading.length === 0) {
        out.push(n.kind === "If" ? `${p}elif ${this.expr(n.cond)}:` : `${p}elif (${n.name} := ${this.expr(n.expr)}) is not None:`);
        const h: Holder = { c: n.innerComments };
        out.push(...this.thenPart(n, depth, h));
        holder = h; els = n.else; continue;
      }
      out.push(`${p}else:`, ...this.stmts(els, depth + 1, undefined, holder)); break;
    }
    return out;
  }

  /** Mirrors the formatter: with an empty then-block and an empty plain else-block, the first inner comment goes in the then-block. */
  thenPart(n: IfNode, depth: number, holder: Holder): string[] {
    const plainElse = n.else && !(n.else.length === 1 && (n.else[0].kind === "If" || n.else[0].kind === "IfLet") && n.else[0].leading.length === 0);
    if (n.then.length === 0 && plainElse && n.else!.length === 0 && holder.c && holder.c.length >= 2) {
      const [first, ...rest] = holder.c; holder.c = rest;
      return this.stmts([], depth + 1, undefined, { c: [first] });
    }
    return this.stmts(n.then, depth + 1, undefined, holder);
  }

  armHead(a: Match["arms"][number], depth: number): string {
    return `${IND.repeat(depth)}case ${this.pattern(a.pattern)}${a.guard ? " if " + this.expr(a.guard) : ""}:`;
  }

  /** A match whose value goes to `tail` (assignment, return, or discard) becomes a Python `match` statement in place. */
  matchInline(m: Match, depth: number, tail: Tail): string[] {
    const out = [`${IND.repeat(depth)}match ${this.expr(m.subject)}:`];
    for (const a of m.arms) out.push(this.armHead(a, depth + 1), ...this.stmts(a.body, depth + 2, tail));
    return out;
  }

  /** Match used inside a larger expression: hoisted into a helper function returning the arm value. */
  matchExpr(m: Match): string {
    const name = `_match_${++this.matchCounter}`;
    const subject = this.expr(m.subject);
    const binds = new Set<string>();
    m.arms.forEach(a => patternNames(a.pattern, binds));
    const lines = [`def ${name}(_subject):`, ...this.fnScope(["_subject"], m.arms.flatMap(a => a.body), binds, 1, () => {
      const before = this.hoisted.length;
      const arms: string[] = [];
      for (const a of m.arms) arms.push(this.armHead(a, 2), ...this.stmts(a.body, 3, { wrap: c => `return ${c}` }));
      const guardHelpers = this.hoisted.splice(before).map(l => l === "" ? l : IND + l);   // helpers for guards live inside this function
      return [...guardHelpers, `${IND}match _subject:`, ...arms];
    })];
    this.hoisted.push(...lines);
    return `${name}(${subject})`;
  }

  pattern(pt: Pattern): string {
    switch (pt.kind) {
      case "PWild": return "_";
      case "PBind": return pt.name;
      case "PLit": {
        const v = pt.value;
        if (v.kind === "ComplexLit") return v.re === 0 ? `${v.im}j` : `${v.re} ${v.im < 0 ? "-" : "+"} ${Math.abs(v.im)}j`;   // complex(...) is not a pattern
        return this.expr(v);
      }
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
          default: return this.records.has(t.name) ? t.name : JSON.stringify(t.name);   // forward reference to a record declared later
        }
    }
  }

  // ---------- expressions

  /** Side-effect-free and cheap to repeat (so `??` may evaluate it twice). */
  pure(e: Expr): boolean {
    switch (e.kind) {
      case "Ident": case "IntLit": case "FloatLit": case "StrLit": case "BoolLit": case "NullLit": return e.kind !== "StrLit" || e.parts.every(x => typeof x === "string");
      case "Field": return this.pure(e.obj);
      case "Index": return this.pure(e.obj) && this.pure(e.index);
      default: return false;
    }
  }

  expr(e: Expr, parentPrec = 0): string {
    const paren = (s: string, prec: number) => prec < parentPrec ? `(${s})` : s;
    switch (e.kind) {
      case "IntLit": return e.value.toString();
      case "FloatLit": if (!Number.isFinite(e.value)) { this.uses.add("math"); return paren(e.value > 0 ? "math.inf" : "-math.inf", UNARY); } return paren(showFloat(e.value), e.value < 0 ? UNARY : POSTFIX);
      case "ComplexLit": return `complex(${e.re}, ${e.im})`;
      case "StrLit": return this.str(e.parts);
      case "BoolLit": return e.value ? "True" : "False";
      case "NullLit": return "None";
      case "Ident": if ((e.name === "PI" || e.name === "E") && this.typeOf(e).k === "Float") { this.uses.add("math"); return e.name === "PI" ? "math.pi" : "math.e"; } return e.name;
      case "ListLit": return `[${e.items.map(x => this.expr(x)).join(", ")}]`;
      case "MapLit": return `{${e.entries.map(en => `${this.expr(en.key)}: ${this.expr(en.value)}`).join(", ")}}`;
      case "Range": return `list(range(${this.expr(e.start)}, ${this.expr(e.end)}))`;
      case "Unary": return e.op === "not" ? paren(`not ${this.expr(e.expr, UNARY)}`, 3) : paren(`-${this.expr(e.expr, UNARY)}`, UNARY);
      case "Binary": return this.binary(e, parentPrec);
      case "Call": return this.call(e, parentPrec);
      case "Index": {
        const obj = this.expr(e.obj, POSTFIX);
        if (e.index.kind === "Range") return `${obj}[${this.expr(e.index.start)}:${this.expr(e.index.end)}]`;
        if (this.kind(e.obj) === "Map") return `${obj}.get(${this.expr(e.index)})`;   // map lookups are nullable
        return `${obj}[${this.expr(e.index)}]`;
      }
      case "Field": {
        if (e.name === "length") return `len(${this.expr(e.obj)})`;
        const obj = this.expr(e.obj, POSTFIX);
        if (e.name === "re") return `${obj}.real`;
        if (e.name === "im") return `${obj}.imag`;
        return `${obj}.${e.name}`;
      }
      case "Lambda": return this.lambda(e, parentPrec);
      case "Match": return this.matchExpr(e);
      case "With": this.uses.add("dataclass"); return `replace(${this.expr(e.target)}, ${e.fields.map(f => `${f.name}=${this.expr(f.value)}`).join(", ")})`;
    }
  }

  str(parts: (string | Expr)[]): string {
    if (parts.every(x => typeof x === "string")) return JSON.stringify(parts.join(""));
    const lit = (s: string) => JSON.stringify(s).slice(1, -1).replace(/\{/g, "{{").replace(/\}/g, "}}");
    const codes = parts.map(x => typeof x === "string" ? x : this.expr(x));
    // Python before 3.12 forbids quotes and backslashes inside f-string braces; braces, `:` and `#` are also unsafe there
    if (codes.some((c, i) => typeof parts[i] !== "string" && /["\\{}#:]/.test(c)))
      return `"${parts.map(x => typeof x === "string" ? lit(x) : "{}").join("")}".format(${codes.filter((_, i) => typeof parts[i] !== "string").join(", ")})`;
    return 'f"' + parts.map((x, i) => typeof x === "string" ? lit(x) : `{${codes[i]}}`).join("") + '"';
  }

  binary(e: Extract<Expr, { kind: "Binary" }>, parentPrec: number): string {
    const paren = (s: string, prec: number) => prec < parentPrec ? `(${s})` : s;
    const prec = PREC[e.op];
    if (e.op === "??") {
      const r = this.expr(e.right, 1);
      if (this.pure(e.left)) { const l = this.expr(e.left, ABOVE_CMP); return `(${l} if ${l} is not None else ${r})`; }
      const t = `_n${++this.tmpCounter}`;
      return `(${t} if (${t} := ${this.expr(e.left)}) is not None else ${r})`;
    }
    if (prec === 4 || prec === 5) return paren(`${this.expr(e.left, ABOVE_CMP)} ${e.op} ${this.expr(e.right, ABOVE_CMP)}`, prec);
    if ((e.op === "/" || e.op === "%") && this.kind(e) === "Int") {
      this.uses.add("bdiv");
      return `${e.op === "/" ? "_bdiv" : "_bmod"}(${this.expr(e.left)}, ${this.expr(e.right)})`;
    }
    if (e.op === "/" && this.kind(e) === "Float") {
      this.uses.add("fdiv"); this.uses.add("fcheck"); this.uses.add("math");
      return `_fdiv(${this.expr(e.left)}, ${this.expr(e.right)})`;
    }
    if ((e.op === "+" || e.op === "-" || e.op === "*") && this.kind(e) === "Float"
      && !(e.left.kind === "FloatLit" && e.right.kind === "FloatLit" && Number.isFinite(e.left.value) && Number.isFinite(e.right.value))) {
      this.uses.add("fcheck"); this.uses.add("math");   // Infinity - Infinity and Infinity * 0.0 would be NaN
      return `_fcheck(${this.expr(e.left, prec)} ${e.op} ${this.expr(e.right, prec + 1)})`;
    }
    if (e.op === "%" && this.kind(e) === "Float") { this.uses.add("fmod"); this.uses.add("math"); return `_fmod(${this.expr(e.left)}, ${this.expr(e.right)})`; }   // sign of the dividend, like BLESSED
    return paren(`${this.expr(e.left, prec)} ${e.op} ${this.expr(e.right, prec + 1)}`, prec);
  }

  lambda(e: Extract<Expr, { kind: "Lambda" }>, parentPrec: number): string {
    const params = e.params.map(x => x.name);
    if (e.body.length === 1 && e.body[0].kind === "ExprStmt" && e.body[0].leading.length === 0 && !e.body[0].trailing) {
      const before = this.hoisted.length;
      this.scopes.push({ locals: new Set(params), globals: new Set(), nonlocals: new Set() });
      const body = this.expr(e.body[0].expr);
      this.scopes.pop();
      // a helper hoisted out of the lambda could not see its parameters: use a def instead
      if (this.hoisted.length === before) { const s = `lambda ${params.join(", ")}: ${body}`; return parentPrec > 0 ? `(${s})` : s; }
      this.hoisted.splice(before);
    }
    const name = `_fn_${++this.fnCounter}`;
    const lines = [`def ${name}(${params.join(", ")}):`, ...this.fnScope(params, e.body, new Set(), 1, () => this.stmts(e.body, 1, { wrap: c => `return ${c}` }))];
    this.hoisted.push(...lines);
    return name;
  }

  call(e: Extract<Expr, { kind: "Call" }>, parentPrec: number): string {
    if (e.callee.kind === "Ident") {
      const n = e.callee.name;
      if (e.named.length) return `${n}(${e.named.map(x => `${x.name}=${this.expr(x.value)}`).join(", ")})`;
      const args = e.args.map(a => this.expr(a));
      if (n === "String") return `str(${args[0]})`;
      if (n === "Int") { if (this.kind(e.args[0]) === "String") { this.uses.add("bint"); this.uses.add("re"); return `_bint(${args[0]})`; } return `int(${args[0]})`; }
      if (n === "Float") { if (this.kind(e.args[0]) === "String") { this.uses.add("bfloat"); this.uses.add("re"); this.uses.add("math"); return `_bfloat(${args[0]})`; } return `float(${args[0]})`; }
      if (n === "Complex") return `complex(${args[0]})`;
      return `${n}(${args.join(", ")})`;
    }
    if (e.callee.kind === "Field") {
      const objE = e.callee.obj; const m = e.callee.name;
      const k = this.kind(objE);
      const plain = () => this.expr(objE);              // obj as a function argument
      const post = () => this.expr(objE, POSTFIX);       // obj before `.method`
      const arg = (i: number) => this.expr(e.args[i]);
      const math = (f: string) => { const mod = k === "Complex" ? "cmath" : "math"; this.uses.add(mod); return `${mod}.${f}(${plain()})`; };
      switch (m) {
        case "upper": return `${post()}.upper()`; case "lower": return `${post()}.lower()`; case "trim": return `${post()}.strip()`;
        case "split": return `${post()}.split(${arg(0)})`;
        case "contains": return `(${arg(0)} in ${this.expr(objE, ABOVE_CMP)})`;
        case "startsWith": return `${post()}.startswith(${arg(0)})`; case "endsWith": return `${post()}.endswith(${arg(0)})`;
        case "replace": return `${post()}.replace(${arg(0)}, ${arg(1)})`;
        case "push": return `(${this.expr(objE, 7)} + [${arg(0)}])`;
        // no comprehensions: a walrus from `??` in a comprehension's iterable is a SyntaxError
        case "map": { const o = plain(); return `list(map(${this.expr(e.args[0])}, ${o}))`; }
        case "filter": { const o = plain(); return `list(filter(${this.expr(e.args[0])}, ${o}))`; }
        case "reduce": { this.uses.add("functools"); const o = plain(); return `functools.reduce(${arg(0)}, ${o}, ${arg(1)})`; }
        case "join": { const o = plain(); return `${this.expr(e.args[0], POSTFIX)}.join(map(str, ${o}))`; }
        case "reverse": return `list(reversed(${plain()}))`; case "sort": return `sorted(${plain()})`;
        case "sum": return `sum(${plain()})`;
        case "min": return `min(${plain()}, default=None)`; case "max": return `max(${plain()}, default=None)`;
        case "keys": return `list(${post()}.keys())`; case "values": return `list(${post()}.values())`;
        case "has": return `(${arg(0)} in ${this.expr(objE, ABOVE_CMP)})`;
        case "abs": return `abs(${plain()})`;
        case "pow": { const s = `${post()} ** ${this.expr(e.args[0], POSTFIX)}`; return parentPrec >= UNARY ? `(${s})` : s; }
        case "gcd": this.uses.add("math"); return `math.gcd(${plain()}, ${arg(0)})`;
        case "factorial": this.uses.add("math"); return `math.factorial(${plain()})`;
        case "floor": this.uses.add("math"); return `float(math.floor(${plain()}))`;
        case "ceil": this.uses.add("math"); return `float(math.ceil(${plain()}))`;
        case "round": {   // BLESSED rounds half up; Python's round() rounds half to even
          this.uses.add("math");
          if (!e.args.length) return `float(math.floor(${this.expr(objE, 7)} + 0.5))`;
          const d = this.expr(e.args[0], POSTFIX);
          return `(math.floor(${this.expr(objE, 8)} * 10 ** ${d} + 0.5) / 10 ** ${d})`;
        }
        case "sqrt": case "exp": case "log": return math(m);
        case "sin": case "cos": case "tan": case "asin": case "acos": case "atan": return math(m);
        case "atan2": this.uses.add("math"); return `math.atan2(${plain()}, ${arg(0)})`;
        case "conj": return `${post()}.conjugate()`;
        case "arg": this.uses.add("cmath"); return `cmath.phase(${plain()})`;
      }
      return `${post()}.${m}(${e.args.map(a => this.expr(a)).join(", ")})`;
    }
    return `${this.expr(e.callee, POSTFIX)}(${e.args.map(a => this.expr(a)).join(", ")})`;
  }
}
