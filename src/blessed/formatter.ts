import type { Program, Stmt, Expr, TypeExpr, Pattern, Param } from "./ast";
import { parse } from "./parser";
import { tokenize } from "./lexer";
import { D, formatDiagnostic, camelCaseName } from "./diagnostics";
import { showFloatLiteral, plainDecimal } from "./values";

const IND = "    ";
const PREC: Record<string, number> = { "??": 1, "or": 2, "and": 3, "==": 4, "!=": 4, "is": 4, "<": 5, "<=": 5, ">": 5, ">=": 5, "..": 6, "+": 7, "-": 7, "*": 8, "/": 8, "%": 8 };

export function formatSource(code: string): { formatted: string; logs: string[] } {
  const { program, errors } = parse(code);
  if (errors.length) return { formatted: code, logs: errors.map(formatDiagnostic) };
  const logs: string[] = [];
  const renames = new Map<string, string>();
  let semis = 0;
  walkStmts(program.body, s => { if (s.semicolon) semis++; });
  // every name the program already uses: a rename onto one of them would merge two variables
  const taken = new Set<string>();
  walkNames(program, n => { taken.add(n); return n; }, false);
  const decls = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as { kind?: string; name?: string };
    if ((n.kind === "FnDecl" || n.kind === "RecordDecl") && n.name) taken.add(n.name);
    for (const v of Object.values(node)) decls(v);
  };
  decls(program.body);
  const skipped = new Set<string>();
  walkNames(program, (n, decl) => {
    if (decl && n.includes("_") && !/^[A-Z][A-Z0-9_]*$/.test(n) && !n.startsWith("_") && !renames.has(n) && !skipped.has(n)) {
      const to = camelCaseName(n);
      if (to === n) return n;
      if (taken.has(to)) { skipped.add(n); logs.push(`Formatter Notice: ${D.renameSkipped(n, to)}`); return n; }
      renames.set(n, to); taken.add(to); logs.push(`Formatter Warning: ${D.snakeCase(n, to)}`);
    }
    return n;
  }, false);
  if (renames.size) walkNames(program, n => renames.get(n) ?? n, true);
  if (semis) logs.push(`Formatter Notice: ${D.semicolonsVaporized(semis)}`);
  const formatted = format(program);
  // comments inside expressions (a list literal, call arguments) are not in the AST: never format them away
  if (countComments(formatted) < countComments(code)) return { formatted: code, logs: [`Formatter Notice: ${D.formatterCommentsAtRisk()}`] };
  return { formatted, logs };
}

function countComments(src: string): number {
  try { return tokenize(src).filter(t => t.kind === "Comment").length; } catch { return -1; }
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
    for (const c of s.after ?? []) out.push(IND.repeat(depth) + c);
  });
  return out;
}

function inner(body: Stmt[], depth: number, holder?: { c?: string[] }): string[] {
  if (body.length === 0 && holder?.c) { const c = holder.c; holder.c = undefined; return c.map(x => IND.repeat(depth) + x); }
  return stmts(body, depth);
}

function block(body: Stmt[], depth: number, open: string, s?: Stmt, close = "}"): string[] {
  return [open, ...inner(body, depth + 1, { c: s?.innerComments }), IND.repeat(depth) + close];
}

function stmt(s: Stmt, depth: number): string[] {
  const p = IND.repeat(depth);
  switch (s.kind) {
    case "Let": return [`${p}let ${s.name}${s.type ? ": " + type(s.type) : ""} = ${expr(s.init, depth)}`];
    case "Assign": return [`${p}${expr(s.target, depth)} = ${expr(s.value, depth)}`];
    case "ExprStmt": return [p + expr(s.expr, depth)];
    case "If": return ifChain(s, depth, `${p}if ${expr(s.cond, depth)} {`);
    case "IfLet": return ifChain(s, depth, `${p}if let ${s.name} = ${expr(s.expr, depth)} {`);
    case "Loop": {
      const head = s.shape === "forever" ? "loop {" : s.shape === "while" ? `loop ${expr(s.cond!, depth)} {`
        : `loop ${s.item} in ${expr(s.iter!, depth)}${s.despite ? " despite errors" + (s.despite.errName ? " as " + s.despite.errName : "") : ""} {`;
      return block(s.body, depth, p + head, s);
    }
    case "FnDecl": return block(s.body, depth, `${p}fn ${s.name}(${params(s.params)})${s.ret ? " -> " + type(s.ret) : ""} {`, s);
    case "RecordDecl": return [`${p}record ${s.name} { ${s.fields.map(f => `${f.name}: ${type(f.type)}`).join(", ")} }`];
    case "Return": return [`${p}return${s.expr ? " " + expr(s.expr, depth) : ""}`];
    case "Fail": return [`${p}fail ${expr(s.expr, depth)}`];
  }
}

// When both the then-block and a plain else-block are empty and there are 2+ comments, the split point is unknowable;
// the first comment goes in the then-block and the rest in the else-block (stable under re-parse).
function thenPart(n: Extract<Stmt, { kind: "If" | "IfLet" }>, depth: number, holder: { c?: string[] }): string[] {
  const plainElse = n.else && !(n.else.length === 1 && (n.else[0].kind === "If" || n.else[0].kind === "IfLet") && n.else[0].leading.length === 0);
  if (n.then.length === 0 && plainElse && n.else!.length === 0 && holder.c && holder.c.length >= 2) {
    const [first, ...rest] = holder.c; holder.c = rest;
    return [IND.repeat(depth + 1) + first];
  }
  return inner(n.then, depth + 1, holder);
}

function ifChain(s: Extract<Stmt, { kind: "If" | "IfLet" }>, depth: number, head: string): string[] {
  const p = IND.repeat(depth);
  const out = [head];
  let holder = { c: s.innerComments };
  out.push(...thenPart(s, depth, holder));
  let els = s.else;
  while (els) {
    if (els.length === 1 && (els[0].kind === "If" || els[0].kind === "IfLet") && els[0].leading.length === 0) {
      const n = els[0];
      out.push(`${p}} else ${n.kind === "If" ? `if ${expr(n.cond, depth)}` : `if let ${n.name} = ${expr(n.expr, depth)}`} {`);
      holder = { c: n.innerComments };
      out.push(...thenPart(n, depth, holder));
      els = n.else; continue;
    }
    out.push(`${p}} else {`, ...inner(els, depth + 1, holder)); break;
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
    case "FloatLit": return paren(showFloatLiteral(e.value), e.value < 0 && parentPrec > 9);
    case "ComplexLit":
      // `3 + 4i` reads back as an addition (precedence 7); `-4i` as a negation
      if (e.re === 0) return paren(`${plainDecimal(e.im)}i`, e.im < 0 && parentPrec > 9);
      return paren(`${plainDecimal(e.re)} ${e.im < 0 ? "-" : "+"} ${plainDecimal(Math.abs(e.im))}i`, parentPrec > 7);
    case "StrLit": return '"' + e.parts.map(x => typeof x === "string" ? escape(x) : "${" + expr(x) + "}").join("") + '"';
    case "BoolLit": return String(e.value);
    case "NullLit": return "null";
    case "Ident": return e.name;
    case "ListLit": return `[${e.items.map(x => expr(x, depth)).join(", ")}]`;
    case "MapLit": return `{${e.entries.map(en => `${expr(en.key)}: ${expr(en.value, depth)}`).join(", ")}}`;
    case "Range": return paren(`${expr(e.start, depth, 7)}..${expr(e.end, depth, 7)}`, parentPrec > 6);
    case "Unary": {
      const dbl = e.op === "-" && e.expr.kind === "Unary" && e.expr.op === "-";
      return paren(`${e.op === "not" ? "not " : "-"}${paren(expr(e.expr, depth, 9), dbl)}`, parentPrec > 9);
    }
    case "Binary": {
      const prec = PREC[e.op];
      const s = `${expr(e.left, depth, prec)} ${e.op} ${expr(e.right, depth, prec + 1)}`;
      return paren(s, prec < parentPrec);
    }
    case "Call": {
      const args = [...e.args.map(a => expr(a, depth)), ...e.named.map(n => `${n.name}: ${expr(n.value, depth)}`)];
      return `${expr(e.callee, depth, 10)}(${args.join(", ")})`;
    }
    case "Index": return `${expr(e.obj, depth, 10)}[${expr(e.index, depth)}]`;
    case "Field": return `${expr(e.obj, depth, 10)}.${e.name}`;
    case "Lambda": {
      const head = `fn(${params(e.params)})${e.ret ? " -> " + type(e.ret) : ""}`;
      if (e.body.length === 1 && e.body[0].kind === "ExprStmt" && e.body[0].leading.length === 0) return `${head} { ${expr(e.body[0].expr, depth)} }`;
      return [`${head} {`, ...stmts(e.body, depth + 1), `${p}}`].join("\n");
    }
    case "Match": {
      const arms = e.arms.map(a => {
        const head = `${IND.repeat(depth + 1)}${pattern(a.pattern)}${a.guard ? " if " + expr(a.guard, depth + 1) : ""} -> `;
        if (a.body.length === 1 && a.body[0].kind === "ExprStmt" && a.body[0].leading.length === 0) return head + expr(a.body[0].expr, depth + 1);
        return [head + "{", ...stmts(a.body, depth + 2), `${IND.repeat(depth + 1)}}`].join("\n");
      });
      return [`match ${expr(e.subject, depth)} {`, ...arms, `${p}}`].join("\n");
    }
    case "With": return paren(`${expr(e.target, depth, 10)} with { ${e.fields.map(f => `${f.name}: ${expr(f.value, depth)}`).join(", ")} }`, parentPrec > 0);
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

// Visits every declaration-site name and every Ident use; f maps each name. When apply is true the result is written back.
function walkNames(p: Program, f: (n: string, decl: boolean) => string, apply: boolean) {
  const rn = (n: string, decl = true) => { const r = f(n, decl); return apply ? r : n; };
  const pat = (q: Pattern): void => {
    if (q.kind === "PBind") q.name = rn(q.name);
    else if (q.kind === "PRecord") q.fields.forEach(x => pat(x.pattern));
  };
  const prm = (ps: Param[]) => ps.forEach(x => { x.name = rn(x.name); });
  const ex = (e: Expr): void => {
    switch (e.kind) {
      case "Ident": e.name = rn(e.name, false); return;
      case "StrLit": e.parts.forEach(x => typeof x !== "string" && ex(x)); return;
      case "ListLit": e.items.forEach(ex); return;
      case "MapLit": e.entries.forEach(en => { ex(en.key); ex(en.value); }); return;
      case "Range": ex(e.start); ex(e.end); return;
      case "Unary": ex(e.expr); return;
      case "Binary": ex(e.left); ex(e.right); return;
      case "Call": ex(e.callee); e.args.forEach(ex); e.named.forEach(n => ex(n.value)); return;
      case "Index": ex(e.obj); ex(e.index); return;
      case "Field": ex(e.obj); return;
      case "Lambda": prm(e.params); st(e.body); return;
      case "Match": ex(e.subject); e.arms.forEach(a => { pat(a.pattern); if (a.guard) ex(a.guard); st(a.body); }); return;
      case "With": ex(e.target); e.fields.forEach(x => ex(x.value)); return;
      default: return;
    }
  };
  const st = (body: Stmt[]) => body.forEach(s => {
    switch (s.kind) {
      case "Let": s.name = rn(s.name); ex(s.init); return;
      case "Assign": ex(s.target); ex(s.value); return;
      case "ExprStmt": ex(s.expr); return;
      case "If": ex(s.cond); st(s.then); if (s.else) st(s.else); return;
      case "IfLet": s.name = rn(s.name); ex(s.expr); st(s.then); if (s.else) st(s.else); return;
      case "Loop":
        if (s.cond) ex(s.cond); if (s.iter) ex(s.iter);
        if (s.item) s.item = rn(s.item);
        if (s.despite?.errName) s.despite.errName = rn(s.despite.errName);
        st(s.body); return;
      case "FnDecl": prm(s.params); st(s.body); return;
      case "Return": if (s.expr) ex(s.expr); return;
      case "Fail": ex(s.expr); return;
      default: return;
    }
  });
  st(p.body);
}
