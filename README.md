# BLESSED

A programming language that made the obvious correct choices. All of them.

**Playground:** https://blessed-lang.netlify.app
[![Netlify Status](https://api.netlify.com/api/v1/badges/5c252606-ba19-4bfe-a06c-8f375bb0a7d5/deploy-status)](https://app.netlify.com/projects/blessed-lang/deploys)

BLESSED is a satire with a real interpreter. The playground formats, type-checks,
and runs BLESSED programs in the browser, translates them to Python and
TypeScript, and explains its twenty-one commandments with the confidence they
deserve.

## Run it

    npm install
    npm run dev        # playground at http://localhost:5173
    npm test           # vitest
    npm run build      # single-file dist/index.html

The site is the build output and nothing else. `netlify.toml` holds the build
command and the single-page redirect; Netlify builds `master` on every push
and gives each pull request a deploy preview. Share links from the
playground carry the program in the URL, so a bug report can be a link.

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
implementation plan, and `src/blessed/commandments.ts` for the twenty-one rules as
the playground shows them.

## Proposing a commandment

BLESSED has twenty-one commandments because that is how many obvious correct
choices we have found so far. If you have found another, open an issue or a
pull request. The bar is the one every existing commandment cleared:

1. **Name the suffering.** What do other languages do here, and who does it
   hurt? "I prefer it" is a preference. A commandment removes a wound.
2. **State the rule in one sentence.** If it needs a paragraph, it is two
   rules or none.
3. **Pick the verdict.** Obvious, Sensible, Correct, Overdue, or Necessary.
   Be honest. Most things are Sensible.
4. **Write the snippet.** It has to parse, check with zero errors, and run.
   The test suite enforces this for every card.
5. **Say what it costs.** Every rule rejects some program somebody wanted to
   write. Name that program and explain why they are better off.

A pull request for a commandment touches four places: a `D` message in
`src/blessed/diagnostics.ts` if the compiler gains something to say, the rule
itself in the checker or interpreter with tests, a card in
`src/blessed/commandments.ts`, and a `§N` section in the spec. Keep the
compiler's voice: short sentences, no hedging, and a joke only if it is also
true.

## Building on BLESSED

The engine is plain TypeScript with no runtime dependencies, and each stage
is a module with one job (see Layout). `src/blessed/index.ts` is the public
surface. Things people have asked about:

- **A standard library module.** Methods live in `src/blessed/stdlib.ts` as
  one switch per type, and the checker reads the same `METHODS` table for
  arity. Add the method in both places and a test in `stdlib.test.ts`.
- **A new translation target.** Copy the shape of
  `src/blessed/translate/typescript.ts`: walk the AST, emit text, use
  `checkWithTypes` for types, gate any prelude on use. Add the target to the
  round-trip test so its output is compiled and run against the interpreter.
- **An editor or CLI.** Everything you need is `parse`, `check`, `run`, and
  `formatSource`. There is no CLI yet. Someone should write one in BLESSED's
  voice.

Run `npm test` before you open the pull request. 380 tests pass today, and
the number should only go up.

Open work lives in the [roadmap](https://github.com/AIWhispererGal/blessed-lang/issues/16):
standard library modules, a CLI, editor grammars, a language server, a third
translation target. Each issue names the files it touches and what done
means. `CONTRIBUTING.md` has the rest.

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
