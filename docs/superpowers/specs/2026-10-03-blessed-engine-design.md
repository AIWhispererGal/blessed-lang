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
tree-walking interpreter, and grows the language from ten rules to twenty-one so
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
  no user-defined variadics; `print` is the exception (one or more
  arguments, printed separated by a space).
- Anonymous functions use the same keyword: `fn(x: Int) { x * 2 }`.
  Parameter types on anonymous functions may be omitted whenever an `Fn`
  type is expected where the lambda appears: a declared variable or
  parameter type, or the list element type for `map`, `filter`, `reduce`.
  Otherwise they are required.
- A declared non-nullable return type is a promise: a body that can finish
  without `return`, `fail`, a trailing expression, or a forever loop is a
  checker error ("'f' promises Int but can finish without returning one.").
  An inferred return type includes null (`T?`) when the body can fall off
  the end.
- `fn` declarations are visible to their whole block, before their line.
  A hoisted function's body may only read the block's `let`s declared before
  the first statement that can run it (its declaration, or an earlier
  statement that mentions it, directly or through another hoisted function).
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
- A key that is neither Int nor String (reachable through `Unknown` types)
  fails at runtime with "Map keys are String or Int. ... BLESSED is not going
  to guess what it hashes to."

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
    process(item)
}
print(e ?? "nothing was skipped")
```

- `fail expr` raises with a String message. `fail` with a non-String is a
  checker error.
- Only `despite errors` catches. The failing iteration's remaining
  statements are skipped and the loop continues.
- The optional `as name` declares `name` as a `String?` in the scope that
  contains the loop. It is null until an iteration fails, then holds the most
  recent failure's message. The body of later iterations can read it, and so
  can code after the loop. Because it is `String?`, the null rules apply.
- Runtime failures raised by the interpreter (division by zero, Int plus
  String on dynamically typed values, index out of range, recursion limit)
  are the same kind of error and are caught the same way. The step budget is
  not catchable.
- There is no try block and no error type hierarchy.

### §17 Infinity, and the Number That Is Not

Float follows IEEE 754 except for one value.

- `Infinity` and `-Infinity` are keywords and legal Float values.
  `1.0 / 0.0` is `Infinity`. `x < Infinity` is true for every finite x.
  `Infinity == Infinity` is true.
- NaN does not exist. Any operation that would produce it fails with a
  catchable error: `0.0 / 0.0`, `Infinity - Infinity`, `Infinity * 0.0`,
  `Infinity / Infinity`, `(-4.0).sqrt()`, `(-1.0).log()`, `Int(Infinity)`.
  Message: "0.0 / 0.0 is not a number. We will not pretend it is."
- Int has no infinity. `5 / 0` and `5 % 0` fail. Int is a count, and there
  is no infinite count. `Int(Infinity)` fails for the same reason.
- `Float("inf")` and `Float("nan")` return null. Infinity is spelled
  `Infinity` and nothing else is spelled at all.

### §18 Imaginary Numbers Are Real

A `Complex` type with two Float components.

```
let z = 3 + 4i
let w = Complex(2.0)          -- 2 + 0i
print(z.abs())                -- 5
print(z * w)                  -- 6 + 8i
print(Complex(-4.0).sqrt())   -- 2i
```

- Lexing: a numeric literal immediately followed by `i` is an imaginary
  literal of type Complex (`4i`, `2.5i`, `1i`). Bare `i` remains an
  ordinary identifier, so loop counters are safe.
- A literal of the form `<number> + <imaginary>` or `<number> - <imaginary>`
  is a single Complex literal. Elsewhere, Complex only mixes with Complex:
  `x + 4i` where `x` is Float is a checker error whose fix-it is
  `Complex(x) + 4i`. `Complex(v)` accepts Int, Float, or Complex.
- Operators: `+ - * /`, unary `-`, `==`. Division by `0i` fails. Ordering
  operators are a checker error: "Complex numbers have no order. Neither
  does your argument."
- Properties and methods: `re`, `im`, `abs()`, `arg()`, `conj()`, `sqrt()`,
  `exp()`, `log()`, `pow(n)`. `sqrt()` returns the principal root.
- Components follow §17: any component that would become NaN fails.
- Printing: `3 + 4i`, `3 - 4i`, `4i`, `3 + 0i`, `0i`. Components print as
  plain numbers (`3 + 4i`, never `3.0 + 4.0i`), at 15 significant digits.
- `Float(z)` fails unless `z.im == 0.0`, with a fix-it suggesting `z.re`.

### §19 Ranges Are Values

`a..b` is an expression of type `List<Int>`, half-open: `0..3` is
`[0, 1, 2]`. Both ends must be Int. `b <= a` gives an empty list. Ranges are
ordinary lists, so `(0..10).filter(fn(n) { n % 2 == 0 })` works and
`loop i in 0..10 {` is the idiomatic counted loop. Slices `xs[a..b]` are
unchanged; the parser treats the inside of the brackets as a range
expression and the index operation special-cases a range operand.
A range with more than 10,000,000 elements fails: "That range would not fit
in anyone's memory. BLESSED will not pretend otherwise."

### §20 Overflow Is Not Our Problem

Int is arbitrary precision, backed by JavaScript BigInt. `2.pow(64)` and
`25.factorial()` are exact. There is no wraparound, no MAX_INT, and no
silent precision loss. `Float(i)` on an Int beyond 2^53 is allowed and
rounds, because that is what Float means. Int literals have no size limit.
Int `/` truncates toward zero and `%` takes the sign of the dividend, matching
the existing rule.

### §21 The Order of Things

A variable exists after the line that creates it. Not before. Functions are
hoisted within their block, so a function may be called above the line that
declares it. Variables are not hoisted. Therefore a function body may read an
outer `let` only if that `let` is declared above the earliest statement that
could run the function: the function's own declaration, or an earlier
statement that mentions it directly or through another hoisted function.

```
let count = 3

fn show() -> Int {
    return count
}

print(show())
```

Reordering `let count` below `fn show` is a compile error, even if the only
call to `show` comes later. The compiler could trace every call path to prove
the call happens after the `let`. It declines to, because the author already
knows the order and can type it. Put the `let` above the function.

### Standard library

Methods on values. No free functions except `print` and the conversions.

| Type | Methods |
|---|---|
| String | `length`, `upper()`, `lower()`, `trim()`, `split(sep)`, `contains(s)`, `startsWith(s)`, `endsWith(s)`, `replace(a, b)` |
| List | `length`, `push(x)` (returns new list), `map(f)`, `filter(f)`, `reduce(f, init)`, `join(sep)`, `contains(x)`, `reverse()`, `sort()`, and on `List<Int>` or `List<Float>` only: `sum()`, `min()`, `max()` (the last two return `T?`, null on an empty list; `sum()` of an empty list fails: "sum() of nothing is a philosophical question, not a number. Check length first.") |
| Map | `keys()`, `values()`, `has(k)` |
| Int | `abs()`, `pow(n)` (n must be a non-negative Int of at most 10,000; the checker suggests Float for negative exponents), `gcd(b)`, `factorial()` |
| Float | `abs()`, `floor()`, `ceil()`, `round()`, `round(digits)`, `sqrt()`, `pow(n)`, `sin()`, `cos()`, `tan()`, `asin()`, `acos()`, `atan()`, `atan2(x)`, `exp()`, `log()` |
| Complex | `re`, `im`, `abs()`, `arg()`, `conj()`, `sqrt()`, `exp()`, `log()`, `pow(n)` |

Constants `PI` and `E` are predeclared Floats.

Conversions: `String(x)` works on any value. `Int(s)` and `Float(s)` return
`Int?` and `Float?` and yield null on unparseable input. `Int(f)` truncates a
Float and fails on Infinity. `Float(i)` widens an Int. `Complex(x)` accepts
Int, Float, or Complex.

`length` is a property, not a call. Calling it is a checker error with a
pointed message.

### Lexical details

- Comments start with `--` and run to end of line. They attach to the
  following statement as leading trivia so the formatter can preserve them.
- Identifiers: `[A-Za-z_][A-Za-z0-9_]*`. Leading underscore is a warning.
  Double underscore both sides is an error. snake_case in a `let` is
  reformatted to camelCase with a warning (the formatter skips a rename onto
  a name that already exists, with a note). All-caps names of two or more
  characters are constants; a single capital such as `N` is an ordinary
  variable.
- Keywords: `let fn record match if else loop in despite errors as return
  fail with true false null is Infinity`.
- Numeric literals: `42` Int, `4.2` Float, `4i` and `4.2i` imaginary
  (Complex). A number followed by whitespace and `i` is not imaginary.
- Operators by precedence, lowest first: `??`; `or`; `and`; `== != is`;
  `< <= > >=`; `..` (range, a binary operator that does not chain: `a..b..c`
  is a parse error, `(a..b)..c` parses); `+ -`; `* / %`; unary `- not`;
  postfix call, index, slice, field access. Type names
  `Int Float String Complex` are also callable for conversion (there is no
  `Bool(x)`).
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

Tagged union: `Int`, `Float`, `Complex`, `String`, `Bool`, `Null`, `List`,
`Map`, `Record`, `Function`. Int is a JavaScript BigInt (§20); Float is a
JavaScript number. They never mix without explicit conversion. Int arithmetic: `/` truncates toward
zero, `/ 0` and `% 0` fail. Float arithmetic follows IEEE 754 with Infinity
allowed; every Float and Complex operation is checked afterwards and fails
if any result component is NaN (§17). Complex is a pair of Floats.

Structural equality `==` compares tags first, then contents recursively.
List order matters, Map order does not, Record compares by type name and
fields. Functions compare by identity. Null equals only Null.

`is` compares JavaScript object identity and is a checker error on Int,
Float, String, Bool, Null, or Function.

### Interpreter

Recursive AST walker with an environment chain. Each statement and each
loop iteration costs one step. Execution halts after 1,000,000 steps with a
diagnostic in character. Function call depth above 500 fails as a catchable
error (so does running out of host stack first). `print` takes one or more
arguments and appends `String(value)` of each, separated by a space, to
stdout; lists and maps print in BLESSED literal syntax, records as
`Point(x: 1, y: 2)`. A host JavaScript error that is not a BLESSED error is
reported as a RuntimeError ("BLESSED hit something it did not expect: ...")
rather than thrown.

`despite errors` catches catchable errors raised anywhere inside the
iteration body, including inside called functions, binds the message, and
continues with the next item.

### Checker

Single pass with a scope chain, producing a type for every expression.
Types: the nine value types, `List<T>`, `Map<K, V>`, record types by
name, `Fn(A, B) -> R`, `T?`, and `Unknown` for recovery. Rules enforced:

- Undefined names and duplicate declarations in the same scope.
- `let` without initialiser is an error. Reassignment keeps the declared
  type. Reassigning a constant (all-caps) is an error.
- Bool-only conditions for `if`, `loop cond`, and guards.
- No arithmetic or comparison across Int, Float, Complex, String, Bool.
  Ordering operators on Complex are an error.
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
Emitted TypeScript starts with `export {};` so top-level names cannot
collide with lib.dom globals. Both emitters print through a show helper
(`blessedShow` / `_show`), emitted only when used, so emitted programs print
exactly what the interpreter prints.

| BLESSED | Python | TypeScript |
|---|---|---|
| `let x: Int? = null` | `x: Optional[int] = None` | `let x: number \| null = null` |
| `"${a}"` | `f"{a}"` | `` `${a}` `` |
| `a == b` | `a == b` | `blessedEq(a, b)` helper emitted once |
| `a is b` | `a is b` | `a === b` |
| `a[-1]`, `a[0..2]` | same, `a[0:2]` | `a.at(-1)`, `a.slice(0, 2)` |
| `0..n` as a value | `list(range(0, n))` | `Array.from({length: n}, (_, i) => i)` via a `blessedRange` helper |
| Int | `int` (arbitrary precision already) | `bigint` with `n` suffix literals |
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
- `translate.test.ts`: inline exact-string expectations for the emitted
  Python and TypeScript of each construct (these replaced the planned
  checked-in golden files).
- `roundtrip.test.ts`: every runnable example's emitted TypeScript is
  compiled with the project's tsc (`--strict`) and run with tsx, and its
  emitted Python is run with python3 when present on PATH (skipped
  otherwise); both must print exactly the interpreter's stdout.

## 6. App changes

Minimal. `App.tsx` imports examples from `src/blessed/examples.ts`,
gains eleven new spec cards for §11 to §21 with verdict badges, gains examples
for functions, records, maps, match, errors, and a math example that shows
Infinity, the NaN refusal, and complex square roots, and labels the two reverse
translators as best effort. The infinite-loop case gets an example so users
can see the step budget message.
