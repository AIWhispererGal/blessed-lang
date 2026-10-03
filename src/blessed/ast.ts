// src/blessed/ast.ts
export interface Span { line: number }

export type TypeExpr =
  | { kind: "Named"; name: string; args: TypeExpr[]; span: Span }      // Int, String, List<Int>, Map<String, Int>, Point
  | { kind: "Fn"; params: TypeExpr[]; ret: TypeExpr; span: Span }
  | { kind: "Nullable"; inner: TypeExpr; span: Span };

export type Expr =
  | { kind: "IntLit"; value: bigint; span: Span }
  | { kind: "FloatLit"; value: number; span: Span }                     // Infinity keyword becomes FloatLit(Infinity)
  | { kind: "ComplexLit"; re: number; im: number; span: Span }
  | { kind: "StrLit"; parts: (string | Expr)[]; span: Span }
  | { kind: "BoolLit"; value: boolean; span: Span }
  | { kind: "NullLit"; span: Span }
  | { kind: "Ident"; name: string; span: Span }
  | { kind: "ListLit"; items: Expr[]; span: Span }
  | { kind: "MapLit"; entries: { key: Expr; value: Expr }[]; span: Span }
  | { kind: "Range"; start: Expr; end: Expr; span: Span }
  | { kind: "Unary"; op: "-" | "not"; expr: Expr; span: Span }
  | { kind: "Binary"; op: BinOp; left: Expr; right: Expr; span: Span }
  | { kind: "Call"; callee: Expr; args: Expr[]; named: { name: string; value: Expr }[]; span: Span }
  | { kind: "Index"; obj: Expr; index: Expr; span: Span }
  | { kind: "Field"; obj: Expr; name: string; span: Span }
  | { kind: "Lambda"; params: Param[]; ret?: TypeExpr; body: Stmt[]; span: Span }
  | { kind: "Match"; subject: Expr; arms: MatchArm[]; span: Span }
  | { kind: "With"; target: Expr; fields: { name: string; value: Expr }[]; span: Span };

export type BinOp = "+" | "-" | "*" | "/" | "%" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "and" | "or" | "??" | "is";

export interface Param { name: string; type?: TypeExpr; span: Span }
export interface MatchArm { pattern: Pattern; guard?: Expr; body: Stmt[]; span: Span }   // body: single ExprStmt or block

export type Pattern =
  | { kind: "PLit"; value: Expr; span: Span }                            // IntLit, FloatLit, StrLit (no interpolation), BoolLit, NullLit, ComplexLit, negative numbers
  | { kind: "PBind"; name: string; span: Span }
  | { kind: "PWild"; span: Span }
  | { kind: "PRecord"; name: string; fields: { name: string; pattern: Pattern }[]; span: Span };

export type Stmt = (
  | { kind: "Let"; name: string; type?: TypeExpr; init: Expr }
  | { kind: "Assign"; target: Expr; value: Expr }                          // target: Ident | Index | Field
  | { kind: "ExprStmt"; expr: Expr }
  | { kind: "If"; cond: Expr; then: Stmt[]; else?: Stmt[] }               // else-if is nested If in else
  | { kind: "IfLet"; name: string; expr: Expr; then: Stmt[]; else?: Stmt[] }
  | { kind: "Loop"; shape: "forever" | "while" | "in"; cond?: Expr; item?: string; iter?: Expr; despite?: { errName?: string }; body: Stmt[] }
  | { kind: "FnDecl"; name: string; params: Param[]; ret?: TypeExpr; body: Stmt[] }
  | { kind: "RecordDecl"; name: string; fields: { name: string; type: TypeExpr }[] }
  | { kind: "Return"; expr?: Expr }
  | { kind: "Fail"; expr: Expr }
) & { span: Span; leading: string[]; blankBefore: number; trailing?: string; semicolon?: boolean; after?: string[]; innerComments?: string[] };

export interface Program { body: Stmt[]; trailingComments: string[] }
