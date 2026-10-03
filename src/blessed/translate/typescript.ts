// src/blessed/translate/typescript.ts
// AST -> TypeScript emitter. Int becomes bigint; checker types choose Int, Float and Complex semantics.
import type { Program, Stmt, Expr, TypeExpr, Pattern } from "../ast";
import { showFloatLiteral, plainDecimal } from "../values";
import { D } from "../diagnostics";
import { checkWithTypes, type Type } from "../checker";

const IND = "    ";
/** BLESSED binary precedence (see parser). Range is 6 but becomes a call. Unary is 9, postfix (call, index, field) is 10. */
const PREC: Record<string, number> = { "??": 1, "or": 2, "and": 3, "==": 4, "!=": 4, "is": 4, "<": 5, "<=": 5, ">": 5, ">=": 5, "+": 7, "-": 7, "*": 8, "/": 8, "%": 8 };
const UNARY = 9, POSTFIX = 10;
/** JS forbids mixing `??` with `||`/`&&` unparenthesized: `??` operands render above `and`/`or`. */
const ABOVE_LOGIC = 4;
const BUILTINS = new Set(["print", "String", "Int", "Float", "Complex"]);

/** The out-of-range message as a template literal over the helper's `i` and `xs`. */
const OUT_OF_RANGE = "`" + D.indexOutOfRange("\u0001", 1e9).replace(/[`\\]/g, c => "\\" + c).replace(/\$\{/g, "\\${").replace("\u0001", "${i}").replace("1000000000", "${xs.length}") + "`";

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
    if (Number.isNaN(x)) throw new Error(${JSON.stringify(D.notANumber("Result"))});
    return x;
}`,
  blessedRange: `function blessedRange(a: bigint, b: bigint): bigint[] {
    const out: bigint[] = [];
    for (let i = a; i < b; i++) out.push(i);
    return out;
}`,
  blessedAt: `function blessedAt<T>(xs: ArrayLike<T>, i: bigint): T {
    const n = Number(i), j = n < 0 ? xs.length + n : n;
    if (j < 0 || j >= xs.length) throw new Error(${OUT_OF_RANGE});
    return xs[j];
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
    sqrt() { const r = Math.sqrt(this.abs()), t = this.arg() / 2; return new Complex(r * Math.cos(t), r * Math.sin(t)); }
    exp() { const m = Math.exp(this.re); return new Complex(m * Math.cos(this.im), m * Math.sin(this.im)); }
    log() { return new Complex(Math.log(this.abs()), this.arg()); }
    pow(n: number | bigint) { const k = Number(n), r = this.abs() ** k, t = this.arg() * k; return new Complex(r * Math.cos(t), r * Math.sin(t)); }
    toString() { return this.re === 0 ? \`\${this.im}i\` : \`\${this.re} \${this.im < 0 ? "-" : "+"} \${Math.abs(this.im)}i\`; }
}`,
};
const PRELUDE_ORDER = ["blessedEq", "blessedDiv", "blessedMod", "blessedCheck", "blessedRange", "blessedAt", "blessedIntParse", "Complex"];

type Match = Extract<Expr, { kind: "Match" }>;
type IfNode = Extract<Stmt, { kind: "If" | "IfLet" }>;
/** Comments of blocks that were empty in the source, waiting for the first empty block that can hold them. */
interface Holder { c?: string[] }

export function emitTypeScript(p: Program): string {
  const { typeOf } = checkWithTypes(p);
  const em = new Ts(typeOf);
  const body = em.stmts(p.body, 0);
  const pre = PRELUDE_ORDER.filter(k => em.uses.has(k)).map(k => PRELUDE[k]);
  const lines = [...(pre.length ? [pre.join("\n\n"), ""] : []), ...body, ...p.trailingComments.map(c => em.comment(c))];
  // `export {}` makes the file a module, so top-level names cannot collide with lib.dom globals (`name`, `status`, `close`)
  return ("export {};\n" + lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()).trim();
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

/** BLESSED functions and records are visible to the whole block. JS hoists `function` but not the `const` record factories, and a
 *  hoisted function may itself use a factory: when code before a declaration may call into one, move the declarations (records
 *  first) to the top, as the Python emitter does. */
function orderDecls(body: Stmt[]): Stmt[] {
  const isDecl = (s: Stmt) => s.kind === "FnDecl" || s.kind === "RecordDecl";
  let lastDecl = -1;
  body.forEach((s, i) => { if (isDecl(s)) lastDecl = i; });
  if (lastDecl < 0) return body;
  const names = new Set(body.filter(isDecl).map(s => (s as { name: string }).name));
  if (!body.slice(0, lastDecl).some(s => !isDecl(s) && runsUserCode(s, names))) return body;
  return [...body.filter(s => s.kind === "RecordDecl"), ...body.filter(s => s.kind === "FnDecl"), ...body.filter(s => !isDecl(s))];
}

class Ts {
  uses = new Set<string>();
  constructor(private typeOf: (e: Expr) => Type) {}

  comment(c: string) { return "//" + c.slice(2); }
  /** The checker's type for an expression, looking through `T?`. */
  t(e: Expr): Type { const t = this.typeOf(e); return t.k === "Nullable" ? t.inner : t; }
  k(e: Expr): Type["k"] { return this.t(e).k; }

  // ---------- statements

  stmts(body: Stmt[], depth: number, holder?: Holder): string[] {
    const p = IND.repeat(depth);
    const out: string[] = [];
    if (body.length === 0 && holder?.c) { out.push(...holder.c.map(c => p + this.comment(c))); holder.c = undefined; }
    const ordered = orderDecls(body);
    ordered.forEach((s, i) => {
      const prevDecl = i > 0 && (ordered[i - 1].kind === "FnDecl" || ordered[i - 1].kind === "RecordDecl");
      if (i > 0 && (s.blankBefore > 0 || prevDecl || s.kind === "FnDecl")) out.push("");
      for (const c of s.leading) out.push(p + this.comment(c));
      const ls = this.stmt(s, depth);
      if (s.trailing) ls[ls.length - 1] += " " + this.comment(s.trailing);
      out.push(...ls);
      for (const c of s.after ?? []) out.push(p + this.comment(c));
    });
    return out;
  }

  stmt(s: Stmt, depth: number): string[] {
    const p = IND.repeat(depth);
    const holder: Holder = { c: s.innerComments };
    const out = this.stmtInner(s, depth, holder);
    if (holder.c?.length) out.unshift(...holder.c.map(c => p + this.comment(c)));   // comments with no empty block to live in
    return out;
  }

  stmtInner(s: Stmt, depth: number, holder: Holder): string[] {
    const p = IND.repeat(depth);
    switch (s.kind) {
      case "Let": return [`${p}let ${s.name}${s.type ? ": " + this.type(s.type) : ""} = ${this.expr(s.init, depth, s.type ? -1 : 0)};`];   // -1: a declared type gives a lambda its context
      case "Assign": {
        const t = s.target;
        if (t.kind === "Index" && t.index.kind !== "Range") {   // a store, never the checked lookup
          const obj = this.expr(t.obj, depth, POSTFIX);
          if (this.k(t.obj) === "Map") return [`${p}${obj}.set(${this.expr(t.index, depth)}, ${this.expr(s.value, depth)});`];
          return [`${p}${obj}[Number(${this.expr(t.index, depth)})] = ${this.expr(s.value, depth)};`];
        }
        return [`${p}${this.expr(t, depth)} = ${this.expr(s.value, depth)};`];
      }
      case "ExprStmt": return [`${p}${this.expr(s.expr, depth)};`];
      case "If": return this.ifChain(s, depth, `${p}if (${this.expr(s.cond, depth)}) {`, holder);
      case "IfLet": return [`${p}{`, `${p}${IND}const ${s.name} = ${this.expr(s.expr, depth + 1)};`, ...this.ifChain(s, depth + 1, `${p}${IND}if (${s.name} !== null) {`, holder), `${p}}`];
      case "Loop": {
        const block = (d: number) => this.stmts(s.body, d, holder);
        if (s.shape === "forever") return [`${p}while (true) {`, ...block(depth + 1), `${p}}`];
        if (s.shape === "while") return [`${p}while (${this.expr(s.cond!, depth)}) {`, ...block(depth + 1), `${p}}`];
        const head = `${p}for (const ${s.item} of ${this.expr(s.iter!, depth)}) {`;
        if (!s.despite) return [head, ...block(depth + 1), `${p}}`];
        const name = s.despite.errName;
        const pre = name ? [`${p}let ${name}: string | null = null;`] : [];
        const bind = name ? [`${p}${IND}${IND}${name} = _blessedErr instanceof Error ? _blessedErr.message : String(_blessedErr);`] : [];
        return [...pre, head, `${p}${IND}try {`, ...block(depth + 2), `${p}${IND}} catch (_blessedErr) {`   /* not `err`: that is a BLESSED name a program may use */, ...bind, `${p}${IND}}`, `${p}}`];
      }
      case "FnDecl": {
        const ps = s.params.map(x => `${x.name}: ${x.type ? this.type(x.type) : "any"}`).join(", ");
        return [`${p}function ${s.name}(${ps})${s.ret ? ": " + this.type(s.ret) : ""} {`, ...this.fnBody(s.body, depth + 1, holder), `${p}}`];
      }
      case "RecordDecl": return [
        `${p}interface ${s.name} { ${s.fields.map(f => `${f.name}: ${this.type(f.type)}`).join("; ")} }`,
        `${p}const ${s.name} = (f: ${s.name}): ${s.name} => ({ ...f });`,
      ];
      case "Return": return [`${p}return${s.expr ? " " + this.expr(s.expr, depth) : ""};`];
      case "Fail": return [`${p}throw new Error(${this.expr(s.expr, depth)});`];
    }
  }

  /** A function body whose last expression statement is its value. */
  fnBody(body: Stmt[], depth: number, holder?: Holder): string[] {
    const last = body[body.length - 1];
    if (!last || last.kind !== "ExprStmt") return this.stmts(body, depth, holder);
    const ret: Stmt = { ...last, kind: "Return", expr: last.expr };
    return this.stmts([...body.slice(0, -1), ret], depth, holder);
  }

  ifChain(s: IfNode, depth: number, head: string, holder: Holder): string[] {
    const p = IND.repeat(depth);
    const out = [head, ...this.stmts(s.then, depth + 1, holder)];
    let els = s.else;
    while (els) {
      const n = els[0];
      if (els.length === 1 && n.kind === "If" && n.leading.length === 0) {
        const h: Holder = { c: n.innerComments };
        out.push(`${p}} else if (${this.expr(n.cond, depth)}) {`, ...this.stmts(n.then, depth + 1, h));
        if (h.c?.length) out.push(...h.c.map(c => p + IND + this.comment(c)));
        els = n.else; holder = h; continue;
      }
      out.push(`${p}} else {`, ...this.stmts(els, depth + 1, holder)); break;
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

  // ---------- expressions

  expr(e: Expr, depth = 0, parentPrec = 0): string {
    const paren = (s: string, prec: number) => prec < parentPrec ? `(${s})` : s;
    const p = IND.repeat(depth);
    switch (e.kind) {
      case "IntLit": return `${e.value}n`;
      case "FloatLit": return e.value === Infinity ? "Infinity" : e.value === -Infinity ? paren("-Infinity", UNARY) : paren(showFloatLiteral(e.value), e.value < 0 ? UNARY : POSTFIX);
      case "ComplexLit": this.uses.add("Complex"); return `new Complex(${plainDecimal(e.re)}, ${plainDecimal(e.im)})`;
      case "StrLit":
        if (e.parts.every(x => typeof x === "string")) return JSON.stringify(e.parts.join(""));
        return "`" + e.parts.map(x => typeof x === "string" ? x.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") : `\${${this.expr(x, depth)}}`).join("") + "`";
      case "BoolLit": return String(e.value);
      case "NullLit": return "null";
      case "Ident": return e.name === "PI" ? "Math.PI" : e.name === "E" ? "Math.E" : e.name;
      case "ListLit": return `[${e.items.map(x => this.expr(x, depth)).join(", ")}]`;
      case "MapLit": return `new Map([${e.entries.map(en => `[${this.expr(en.key, depth)}, ${this.expr(en.value, depth)}]`).join(", ")}])`;
      case "Range": this.uses.add("blessedRange"); return `blessedRange(${this.expr(e.start, depth)}, ${this.expr(e.end, depth)})`;
      case "Unary": {
        if (e.op === "not") return paren(`!${this.expr(e.expr, depth, UNARY)}`, UNARY);
        if (this.k(e.expr) === "Complex") { this.uses.add("Complex"); return `new Complex(0, 0).sub(${this.expr(e.expr, depth)})`; }
        const inner = this.expr(e.expr, depth, UNARY);
        const s = `-${inner.startsWith("-") ? `(${inner})` : inner}`;
        return paren(s, UNARY);
      }
      case "Binary": return this.binary(e, depth, parentPrec);
      case "Call": return this.call(e, depth);
      case "Index": {
        if (e.index.kind === "Range") return `${this.expr(e.obj, depth, POSTFIX)}.slice(Number(${this.expr(e.index.start, depth)}), Number(${this.expr(e.index.end, depth)}))`;
        if (this.k(e.obj) === "Map") return `(${this.expr(e.obj, depth, POSTFIX)}.get(${this.expr(e.index, depth)}) ?? null)`;
        this.uses.add("blessedAt");
        return `blessedAt(${this.expr(e.obj, depth)}, ${this.expr(e.index, depth)})`;
      }
      case "Field": {
        const obj = this.expr(e.obj, depth, POSTFIX);
        if (e.name === "length") return `BigInt(${obj}.length)`;
        return `${obj}.${e.name}`;
      }
      case "Lambda": {
        // a lambda passed straight to a call is typed by context; anywhere else an untyped parameter would be an implicit any
        const typed = (x: { type?: TypeExpr }) => x.type ? ": " + this.type(x.type) : parentPrec === -1 ? "" : ": any";
        const ps = e.params.map(x => `${x.name}${typed(x)}`).join(", ");
        const last = e.body[e.body.length - 1];
        const s = e.body.length === 1 && last.kind === "ExprStmt" && last.leading.length === 0 && !last.trailing && !last.after?.length
          ? `(${ps}) => ${this.lambdaValue(last.expr, depth)}`
          : [`(${ps}) => {`, ...this.fnBody(e.body, depth + 1), `${p}}`].join("\n");
        return parentPrec > 0 ? `(${s})` : s;
      }
      case "Match": return this.match(e, depth);
      case "With": return `{ ...${this.expr(e.target, depth, POSTFIX)}, ${e.fields.map(f => `${f.name}: ${this.expr(f.value, depth)}`).join(", ")} }`;
    }
  }

  /** An arrow body: an object literal (from `with`) needs parentheses or it reads as a block. */
  lambdaValue(e: Expr, depth: number): string {
    const s = this.expr(e, depth);
    return s.startsWith("{") ? `(${s})` : s;
  }

  binary(e: Extract<Expr, { kind: "Binary" }>, depth: number, parentPrec: number): string {
    const paren = (s: string, prec: number) => prec < parentPrec ? `(${s})` : s;
    const prec = PREC[e.op]; const lk = this.k(e.left);
    const L = (pp: number) => this.expr(e.left, depth, pp), R = (pp: number) => this.expr(e.right, depth, pp);
    if (e.op === "??") return paren(`${L(ABOVE_LOGIC)} ?? ${R(ABOVE_LOGIC)}`, 1);
    if (e.op === "and") return paren(`${L(3)} && ${R(4)}`, 3);
    if (e.op === "or") return paren(`${L(2)} || ${R(3)}`, 2);
    if (e.op === "is") return paren(`${L(5)} === ${R(5)}`, 4);
    if (e.op === "==" || e.op === "!=") {
      const structural = ["List", "Map", "Record", "Complex", "Unknown"];
      if (structural.includes(lk) || structural.includes(this.k(e.right))) {
        this.uses.add("blessedEq");
        const s = `blessedEq(${L(0)}, ${R(0)})`;
        return e.op === "==" ? s : paren(`!${s}`, UNARY);
      }
      return paren(`${L(5)} ${e.op}= ${R(5)}`, 4);
    }
    if (lk === "Complex" && e.op in CMETHOD) return `${L(POSTFIX)}.${CMETHOD[e.op]}(${R(0)})`;
    if (this.k(e) === "Int" && e.op === "/") { this.uses.add("blessedDiv"); return `blessedDiv(${L(0)}, ${R(0)})`; }
    if (this.k(e) === "Int" && e.op === "%") { this.uses.add("blessedMod"); return `blessedMod(${L(0)}, ${R(0)})`; }
    if (this.k(e) === "Float" && ["+", "-", "*", "/", "%"].includes(e.op)) { this.uses.add("blessedCheck"); return `blessedCheck(${L(prec)} ${e.op} ${R(prec + 1)})`; }
    return paren(`${L(prec)} ${e.op} ${R(prec + 1)}`, prec);
  }

  /** `match` becomes an immediately invoked arrow over a temp, one `if` per arm. */
  match(e: Match, depth: number): string {
    const p = IND.repeat(depth), q = p + IND;
    const lines = [`((_s) => {`];
    for (const a of e.arms) {
      const cond = this.patternCond(a.pattern, "_s"); const binds = this.patternBinds(a.pattern, "_s");
      const last = a.body[a.body.length - 1];
      const simple = a.body.length === 1 && last.kind === "ExprStmt" && last.leading.length === 0 && !last.trailing && !last.after?.length && !last.innerComments?.length;
      if (simple) {
        const ret = `return ${this.expr(last.expr, depth + 1)};`;
        const inner = [...binds, ...(a.guard ? [`if (${this.expr(a.guard, depth + 1)}) ${ret}`] : [ret])];
        if (cond === "true" && binds.length === 0 && !a.guard) lines.push(`${q}${inner.join(" ")}`);
        else if (cond === "true") lines.push(`${q}{ ${inner.join(" ")} }`);
        else lines.push(`${q}if (${cond}) ${inner.length === 1 ? inner[0] : "{ " + inner.join(" ") + " }"}`);
        continue;
      }
      // a block arm: one statement per line; a body without a final value gives null
      const valued = last && last.kind === "ExprStmt";
      const bodyAt = (d: number) => [...this.fnBody(a.body, d), ...(valued ? [] : [`${IND.repeat(d)}return null;`])];
      if (cond === "true" && binds.length === 0 && !a.guard) { lines.push(...bodyAt(depth + 1)); continue; }
      const r = q + IND;
      lines.push(cond === "true" ? `${q}{` : `${q}if (${cond}) {`, ...binds.map(b => r + b));
      if (a.guard) lines.push(`${r}if (${this.expr(a.guard, depth + 2)}) {`, ...bodyAt(depth + 3), `${r}}`);
      else lines.push(...bodyAt(depth + 2));
      lines.push(`${q}}`);
    }
    lines.push(`${p}})(${this.expr(e.subject, depth)})`);
    return lines.join("\n");
  }

  patternCond(pt: Pattern, s: string): string {
    switch (pt.kind) {
      case "PWild": case "PBind": return "true";
      case "PLit": {
        const v = this.expr(pt.value);
        if (pt.value.kind === "ComplexLit") { this.uses.add("blessedEq"); return `blessedEq(${s}, ${v})`; }
        return `${s} === ${v}`;
      }
      // the subject may be `T | null`: test it before reading any field, even when every field is a binding
      case "PRecord": return [`${s} !== null`, ...pt.fields.map(f => this.patternCond(f.pattern, `${s}.${f.name}`)).filter(c => c !== "true")].join(" && ");
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
    // -1 marks an argument whose parameter TypeScript knows to be a function, so a lambda there is typed by context
    const fnParam = (i: number): boolean => {
      const c = e.callee;
      if (c.kind === "Field") { const ot = this.t(c.obj); return ["map", "filter", "reduce"].includes(c.name) && ot.k === "List" && ot.el.k !== "Unknown"; }
      const ct = this.t(c);
      return ct.k === "Fn" && ct.params[i]?.k === "Fn";
    };
    const arg = (i: number) => this.expr(e.args[i], depth, fnParam(i) ? -1 : 0);
    const args = e.args.map((_, i) => arg(i));
    if (e.callee.kind === "Ident") {
      const n = e.callee.name;
      if (e.named.length) return `${n}({ ${e.named.map(x => `${x.name}: ${this.expr(x.value, depth)}`).join(", ")} })`;
      if (n === "print") return `console.log(${args.join(", ")})`;
      const ak = e.args[0] ? this.k(e.args[0]) : "Unknown";
      if (n === "String") return `String(${args[0]})`;
      if (n === "Int") {
        if (ak === "String") { this.uses.add("blessedIntParse"); return `blessedIntParse(${args[0]})`; }
        return ak === "Float" ? `BigInt(Math.trunc(${args[0]}))` : args[0];
      }
      if (n === "Float") return ak === "String" ? `((_v) => (/^\\s*-?(\\d+\\.?\\d*|\\.\\d+)([eE][-+]?\\d+)?\\s*$/.test(_v) && Number.isFinite(Number(_v)) ? Number(_v) : null))(${args[0]})` : `Number(${args[0]})`;
      if (n === "Complex") { this.uses.add("Complex"); return ak === "Complex" ? args[0] : `new Complex(Number(${args[0]}), 0)`; }
      return `${n}(${args.join(", ")})`;
    }
    if (e.callee.kind === "Field") {
      const objE = e.callee.obj; const obj = this.expr(objE, depth, POSTFIX); const m = e.callee.name; const ot = this.t(objE); const ok = ot.k;
      const plain = () => this.expr(objE, depth);
      const num = (s: string) => { this.uses.add("blessedCheck"); return `blessedCheck(${s})`; };
      switch (m) {
        case "upper": return `${obj}.toUpperCase()`; case "lower": return `${obj}.toLowerCase()`; case "trim": return `${obj}.trim()`;
        case "split": return `${obj}.split(${args[0]})`;
        case "contains":
          if (ok === "List") { this.uses.add("blessedEq"); return `${obj}.some(_x => blessedEq(_x, ${args[0]}))`; }
          return `${obj}.includes(${args[0]})`;
        case "startsWith": return `${obj}.startsWith(${args[0]})`; case "endsWith": return `${obj}.endsWith(${args[0]})`;
        case "replace": return `${obj}.split(${args[0]}).join(${args[1]})`;
        case "push": return `[...${plain()}, ${args[0]}]`;
        case "map": return `${obj}.map(${args[0]})`; case "filter": return `${obj}.filter(${args[0]})`; case "reduce": return `${obj}.reduce(${args[0]}, ${args[1]})`;
        case "join": return `${obj}.map(String).join(${args[0]})`;
        case "reverse": return `[...${plain()}].reverse()`;
        case "sort": return `[...${plain()}].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))`;
        case "sum": return ot.k === "List" && ot.el.k === "Float" ? `${obj}.reduce((a, b) => a + b, 0)` : `${obj}.reduce((a, b) => a + b, 0n)`;
        case "min": return `((_l) => (_l.length ? _l.reduce((a, b) => (b < a ? b : a)) : null))(${plain()})`;
        case "max": return `((_l) => (_l.length ? _l.reduce((a, b) => (b > a ? b : a)) : null))(${plain()})`;
        case "keys": return `[...${obj}.keys()]`; case "values": return `[...${obj}.values()]`; case "has": return `${obj}.has(${args[0]})`;
        case "abs": return ok === "Int" ? `((_v: bigint) => (_v < 0n ? -_v : _v))(${plain()})` : ok === "Complex" ? `${obj}.abs()` : `Math.abs(${plain()})`;
        case "pow":
          if (ok === "Int") return `(${obj} ** ${this.expr(e.args[0], depth, POSTFIX)})`;
          return ok === "Complex" ? `${obj}.pow(${args[0]})` : num(`${obj} ** Number(${args[0]})`);
        case "gcd": return `((a: bigint, b: bigint) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; })(${plain()}, ${args[0]})`;
        case "factorial": return `((n: bigint) => { let r = 1n; for (let i = 2n; i <= n; i++) r *= i; return r; })(${plain()})`;
        case "floor": return `Math.floor(${plain()})`; case "ceil": return `Math.ceil(${plain()})`;
        case "round": return args.length ? `(Math.round(${this.expr(objE, depth, 8)} * 10 ** Number(${args[0]})) / 10 ** Number(${args[0]}))` : `Math.round(${plain()})`;
        case "sin": case "cos": case "tan": case "asin": case "acos": case "atan": return num(`Math.${m}(${plain()})`);
        case "sqrt": case "exp": case "log":
          if (ok === "Complex") return `${obj}.${m}()`;
          // a non-negative literal cannot produce NaN here, so it needs no check
          return objE.kind === "FloatLit" && objE.value >= 0 ? `Math.${m}(${plain()})` : num(`Math.${m}(${plain()})`);
        case "atan2": return `Math.atan2(${plain()}, ${args[0]})`;
      }
      return `${obj}.${m}(${args.join(", ")})`;
    }
    return `${this.expr(e.callee, depth, POSTFIX)}(${args.join(", ")})`;
  }
}

const CMETHOD: Record<string, string> = { "+": "add", "-": "sub", "*": "mul", "/": "div" };
