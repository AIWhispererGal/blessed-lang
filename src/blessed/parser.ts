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
