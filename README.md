# BLESSED

A programming language that made the obvious correct choices. All of them.

BLESSED is a satire with a real interpreter. The playground formats, type-checks,
and runs BLESSED programs in the browser, translates them to Python and
TypeScript, and explains its twenty commandments with the confidence they
deserve.

## Run it

    npm install
    npm run dev        # playground at http://localhost:5173
    npm test           # vitest
    npm run build      # single-file dist/index.html

## The language in one screen

    record Point { x: Int, y: Int }

    fn describe(p: Point) -> String {
        return match p {
            Point(x: 0, y: 0) -> "origin"
            Point(x: 0, y: y) -> "on the y axis at ${y}"
            _ -> "somewhere"
        }
    }

    let nick: String? = null
    print(nick ?? "no nickname")

    loop d in [5, 0, 2] despite errors as e {
        print(100 / d)
    }

    print(3 + 4i)          -- Complex is a type
    print(1.0 / 0.0)       -- Infinity is a number
    print(30.factorial())  -- Int does not overflow

Notes:

- `print` is variadic.
- `despite errors as e` binds a `String?` that is visible after the loop
  (`null` if nothing was skipped).

See `docs/superpowers/specs/2026-10-03-blessed-engine-design.md` for the full
spec, `docs/superpowers/plans/2026-10-03-blessed-engine.md` for the
implementation plan, and `src/blessed/commandments.ts` for the twenty rules as
the playground shows them.

## Layout

    src/blessed/lexer.ts        source -> tokens
    src/blessed/parser.ts       tokens -> AST
    src/blessed/checker.ts      types, nullability, exhaustiveness, style
    src/blessed/interpreter.ts  tree-walking evaluator with a step budget
    src/blessed/formatter.ts    AST -> canonical source
    src/blessed/translate/      AST -> Python, AST -> TypeScript, plus best-effort reverse heuristics
    src/blessed/diagnostics.ts  every message, in character

## Translator limits

The Python and TypeScript translations aim to print exactly what the
interpreter prints (the round-trip tests check every example). Known gaps:

- **Block-scope shadowing (Python).** BLESSED blocks are scopes; Python's
  `if`/`for`/`while` bodies are not. `let x = 2` inside an `if` that shadows an
  outer `x` overwrites the outer one in the emitted Python. Closures made in a
  loop body do keep that iteration's values (they capture by default argument).
- **`return` inside a nested `match` (Python).** A `match` used inside a
  larger expression becomes a helper function `_match_N`. A `return`
  statement inside one of its block arms returns from that helper, not from
  the enclosing function.
- **Printing.** Handled: `print`, interpolation, `String()` and `join` go
  through a show helper (`_show` in Python, `blessedShow` in TypeScript) that
  renders Int, Float, Bool, null, lists, maps, records and Complex the way the
  interpreter does. Functions print as `fn name` in both, but an anonymous
  TypeScript arrow stored in a `let` takes that variable's name.
