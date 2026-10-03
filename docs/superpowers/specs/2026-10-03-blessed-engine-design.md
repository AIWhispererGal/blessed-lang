# BLESSED Engine Design

Date: 2026-10-03
Status: approved by project owner, pending implementation plan

## Purpose

BLESSED is a satirical programming language with a serious playground. The
current implementation is a set of regex passes over source lines that
transpile to JavaScript and run through `new Function`. Two of the five
shipped examples do not behave as their comments claim, structural equality is
not implemented, runtime type strictness does not exist, and infinite loops
freeze the browser tab.

This design replaces the regex passes with a real language front end and a
tree-walking interpreter, and grows the language from ten rules to sixteen so
that small real programs can be written in it. The satirical voice of every
diagnostic is preserved and becomes part of the tested contract.

Success criteria:

- Every example in the UI prints exactly what its comments say it prints.
- Every code snippet on a spec card parses, checks, and runs.
- A user can write a few dozen lines of BLESSED using functions, records,
  maps, match, and the standard library and get predictable behaviour.
- A runaway loop stops with a diagnostic instead of freezing the tab.
- The BLESSED to Python and BLESSED to TypeScript emitters produce code that
  runs under python3 and tsc respectively for all shipped examples.

Out of scope for this round: modules and imports, classes or inheritance,
async, a CLI or file runner, editor syntax highlighting, and real parsers for
Python or TypeScript input.

## 1. Language

### Existing rules kept as-is (Commandments 1 to 10)

Zero-indexed lists with `a[0..2]` half-open slices and `a[-1]` negative
indexing; inferred types with optional annotations and no silent coercion;
exactly one equality operator `==` plus `is` for identity; four-space
formatter-enforced indentation; nullable types with `T?`, `??`, and `if let`;
camelCase variables and SCREAMING_SNAKE constants; optional semicolons that
the formatter removes; `"${expr}"` interpolation; Bool-only conditions; and a
single `loop` keyword with four shapes (`loop {`, `loop cond {`,
`loop x in xs {`, `loop x in xs despite errors {`).

### §11 Branches

```
if cond {
} else if cond {
} else {
}
```

Conditions must be Bool. `else if` is a token pair, not a nested statement.

### §12 Functions

```
fn greet(name: String) -> String {
    return "Hi, ${name}"
}
let f = greet
```

- Parameter types are required. Return type is optional and inferred from
  `return` statements; mismatched return types are a checker error.
- A function whose body is a single expression may omit `return`.
- Functions are first-class values. No overloading, no default arguments,
  no variadics.
- Anonymous functions use the same keyword: `fn(x: Int) { x * 2 }`.
  Parameter types on anonymous functions may be omitted when the checker can
  infer them from the call site (list element type for `map`, `filter`,
  `reduce`). Otherwise they are required.
- Recursion is allowed. Depth is limited to 500 frames.

### §13 Records

```
record Point { x: Int, y: Int }
let p = Point(x: 1, y: 2)
print(p.x)
```

- Construction uses mandatory named arguments in any order. Positional
  construction is a parse error.
- Records are immutable. `p.x = 3` is a checker error. Use
  `let q = p with { x: 3 }` to produce a copy.
- `==` on records is structural. `is` is reference identity.
- Field types may be nullable, list, map, function, or other records.

### §14 Maps

```
let ages = {"al": 30, "bo": 25}
let a = ages["al"]        -- type Int?
```

- Literal syntax `{k: v, ...}`. Empty map is `{}`; `{}` with no annotation
  is a checker error asking for `Map<String, Int>` style annotation.
- Keys are String or Int, homogeneous per map. Values are homogeneous.
- Lookup of a missing key returns null, so the result type is `V?` and the
  null rules apply. There is no key-not-found error.
- Maps are mutable: `ages["cy"] = 40` is allowed.

### §15 Match

```
let label = match n {
    0 -> "zero"
    x if x > 10 -> "big"
    Point(x: 0, y: y) -> "on the y axis at ${y}"
    _ -> "other"
}
```

- Arms are, in order of specificity: literal, record destructuring with
  nested patterns, binding identifier, binding with `if` guard, wildcard `_`.
- Match is an expression. Arm bodies are either a single expression or a
  block `{ ... }` whose last expression is the value.
- All arms must produce the same type.
- Exhaustiveness: Bool matches are exhaustive if both `true` and `false`
  appear. Everything else requires `_` or an unguarded binding arm.
  Missing exhaustiveness is a checker error.

### §16 Errors

```
fail "disk is on fire"

loop item in items despite errors as e {
    print("skipped: ${e}")
}
```

- `fail expr` raises with a String message. `fail` with a non-String is a
  checker error.
- Only `despite errors` catches. The optional `as name` binds the message as
  a String for the rest of the loop body. The failing iteration's remaining
  statements are skipped and the loop continues.
- Runtime failures raised by the interpreter (division by zero, Int plus
  String on dynamically typed values, index out of range, recursion limit)
  are the same kind of error and are caught the same way. The step budget is
  not catchable.
- There is no try block and no error type hierarchy.

### Standard library

Methods on values. No free functions except `print` and the conversions.

| Type | Methods |
|---|---|
| String | `length`, `upper()`, `lower()`, `trim()`, `split(sep)`, `contains(s)`, `startsWith(s)`, `endsWith(s)`, `replace(a, b)` |
| List | `length`, `push(x)` (returns new list), `map(f)`, `filter(f)`, `reduce(f, init)`, `join(sep)`, `contains(x)`, `reverse()`, `sort()` |
| Map | `keys()`, `values()`, `has(k)` |
| Int, Float | `abs()`, `floor()`, `round()` |

Conversions: `String(x)` works on any value. `Int(s)` and `Float(s)` return
`Int?` and `Float?` and yield null on unparseable input. `Int(f)` truncates a
Float. `Float(i)` widens an Int.

`length` is a property, not a call. Calling it is a checker error with a
pointed message.

### Lexical details

- Comments start with `--` and run to end of line. They attach to the
  following statement as leading trivia so the formatter can preserve them.
- Identifiers: `[A-Za-z_][A-Za-z0-9_]*`. Leading underscore is a warning.
  Double underscore both sides is an error. snake_case in a `let` is
  reformatted to camelCase with a warning. All-caps names are constants.
- Keywords: `let fn record match if else loop in despite errors as return
  fail with true false null is`.
- Operators by precedence, lowest first: `??`; `or`; `and`; `== != is`;
  `< <= > >=`; `+ -`; `* / %`; unary `- not`; postfix call, index, slice,
  field access. Type names `Int Float String Bool` are also callable for
  conversion.
- String literals use double quotes with `${expr}` interpolation and
  `\n \t \" \\ \$` escapes.

## 2. Module layout

All under `src/blessed/`. The existing `compiler.ts` is deleted.

```
src/blessed/
  index.ts              public API, same five functions App.tsx uses today
  lexer.ts              source -> Token[] (kind, text, line, col)
  ast.ts                node type definitions, Span on every node
  parser.ts             Token[] -> Program | ParseDiagnostic[]
  checker.ts            Program -> Diagnostic[] plus type annotations
  interpreter.ts        Program -> { stdout, error?, steps }
  values.ts             runtime value model and structural equality
  stdlib.ts             method tables per value type
  formatter.ts          Program -> source text
  diagnostics.ts        every message string, keyed by code
  translate/
    python.ts           Program -> Python source
    typescript.ts       Program -> TypeScript source
    fromPython.ts       line heuristics, unchanged behaviour, labelled best effort
    fromTypescript.ts   line heuristics, unchanged behaviour, labelled best effort
```

### Public API (`index.ts`)

```ts
formatBlessed(code): { formatted: string; logs: string[] }
analyzeBlessed(code): { errors: string[]; warnings: string[] }
executeBlessed(code): { stdout: string[]; errors: string[]; executionTime: number }
translateBlessedToPython(code): string
translateBlessedToTypeScript(code): string
translatePythonToBlessed(code): string
translateTypeScriptToBlessed(code): string
```

Signatures are unchanged so `App.tsx` keeps working. `executeBlessed` runs
parse, check, then interpret, and stops at the first stage that produces
errors. Parse errors and checker errors are reported with line numbers in
the existing `Line N: CompileError: ...` shape.

### Diagnostics

Every message lives in `diagnostics.ts` as a function from parameters to
string, keyed by a stable code like `E_ADD_INT_STRING`. Tests assert on the
exact text. The App shows the text only.

## 3. Runtime semantics

### Value model (`values.ts`)

Tagged union: `Int`, `Float`, `String`, `Bool`, `Null`, `List`, `Map`,
`Record`, `Function`. Int and Float are both JavaScript numbers but carry
different tags and never mix. Int arithmetic: `/` truncates toward zero,
`/ 0` and `% 0` fail. Float `/ 0.0` fails too; BLESSED has no Infinity.

Structural equality `==` compares tags first, then contents recursively.
List order matters, Map order does not, Record compares by type name and
fields. Functions compare by identity. Null equals only Null.

`is` compares JavaScript object identity and is a checker error on Int,
Float, String, Bool, Null, or Function.

### Interpreter

Recursive AST walker with an environment chain. Each statement and each
loop iteration costs one step. Execution halts after 1,000,000 steps with a
diagnostic in character. Function call depth above 500 fails as a catchable
error. `print` appends `String(value)` of its argument to stdout; lists and
maps print in BLESSED literal syntax, records as `Point(x: 1, y: 2)`.

`despite errors` catches catchable errors raised anywhere inside the
iteration body, including inside called functions, binds the message, and
continues with the next item.

### Checker

Single pass with a scope chain, producing a type for every expression.
Types: the eight value types, `List<T>`, `Map<K, V>`, record types by
name, `Fn(A, B) -> R`, `T?`, and `Unknown` for recovery. Rules enforced:

- Undefined names and duplicate declarations in the same scope.
- `let` without initialiser is an error. Reassignment keeps the declared
  type. Reassigning a constant (all-caps) is an error.
- Bool-only conditions for `if`, `loop cond`, and guards.
- No arithmetic or comparison across Int, Float, String, Bool.
- Nullable values may only be used via `??`, `if let`, `== null`,
  `!= null`, `match`, or passed to a parameter typed `T?`.
- Record field access must name an existing field. Record construction must
  name every field exactly once.
- Match exhaustiveness and arm type agreement.
- `return` outside a function, `fail` with non-String, `length()` as a call.
- Style: snake_case `let` names, leading underscores, semicolons, `===`.

Style issues are warnings, everything else is an error. Warnings never block
execution.

### Formatter

Parses, then pretty-prints the AST with four-space indentation and no
semicolons, preserving comments and blank lines between statements. If the
source does not parse, the formatter returns the input unchanged with the
parse error as a log entry. The snake_case rename happens here, and the
checker warns about it separately so the two agree.

## 4. Translators

`translate/python.ts` and `translate/typescript.ts` are AST emitters.

| BLESSED | Python | TypeScript |
|---|---|---|
| `let x: Int? = null` | `x: Optional[int] = None` | `let x: number \| null = null` |
| `"${a}"` | `f"{a}"` | `` `${a}` `` |
| `a == b` | `a == b` | `blessedEq(a, b)` helper emitted once |
| `a is b` | `a is b` | `a === b` |
| `a[-1]`, `a[0..2]` | same, `a[0:2]` | `a.at(-1)`, `a.slice(0, 2)` |
| `loop x in xs despite errors as e` | `for` + `try/except Exception as e` | `for of` + `try/catch (e)` |
| `fn f(a: Int) -> Int` | `def f(a: int) -> int:` | `function f(a: number): number` |
| `record Point {...}` | `@dataclass(frozen=True)` | `interface Point` plus a factory |
| `match` | Python 3.10 `match` | if/else chain with a temp |
| `fail "m"` | `raise Exception("m")` | `throw new Error("m")` |
| `??` | `a if a is not None else b` | `a ?? b` |

`fromPython.ts` and `fromTypescript.ts` keep the current heuristic
behaviour. The UI labels them "best effort". The one existing bug where
`f` lands on `print` is fixed in the forward Python emitter by construction.

## 5. Testing

Vitest, run with `npm test`. Layout under `src/blessed/__tests__/`:

- `lexer.test.ts` and `parser.test.ts`: one case per construct, including
  error recovery positions.
- `checker.test.ts`: one case per rule, asserting the exact diagnostic text.
- `interpreter.test.ts`: semantics per feature, step budget, recursion
  limit, despite-errors catching inside called functions.
- `examples.test.ts`: every example and every spec card snippet exported
  from a shared `examples.ts` module that App.tsx also imports, each with
  expected stdout.
- `translate.test.ts`: emitted Python and TypeScript for every example
  compared against checked-in golden files; plus a round trip where
  emitted TypeScript is compiled with the project's tsc and emitted Python
  is run with python3 when present on PATH, skipped otherwise.

## 6. App changes

Minimal. `App.tsx` imports examples from `src/blessed/examples.ts`,
gains six new spec cards for §11 to §16 with verdict badges, gains examples
for functions, records, maps, match, and errors, and labels the two reverse
translators as best effort. The infinite-loop case gets an example so users
can see the step budget message.
