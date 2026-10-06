# Contributing to BLESSED

BLESSED is a satire with a real interpreter. The joke is the premise. The
engine is not a joke: 380 tests, no runtime dependencies, and every snippet on
every card is executed by the test suite. Contributions are held to the second
standard and written in the voice of the first.

## Start here

1. Read the [roadmap](https://github.com/AIWhispererGal/blessed-lang/issues/16).
   Every open piece of work is there, grouped, with the files it touches and
   what "done" means.
2. Comment on the issue you want. One sentence is enough.
3. If the issue says to settle a design question first, settle it in the issue
   before writing code. Nobody enjoys reviewing a thousand lines built on the
   wrong answer.

    npm install
    npm run dev        # playground at http://localhost:5173
    npm test           # vitest, 380 tests
    npm run build      # one self-contained dist/index.html

## Where things live

    src/blessed/lexer.ts        source -> tokens
    src/blessed/parser.ts       tokens -> AST
    src/blessed/checker.ts      types, nullability, exhaustiveness, style
    src/blessed/interpreter.ts  tree-walking evaluator with a step budget
    src/blessed/stdlib.ts       every method on every type, plus print and the conversions
    src/blessed/formatter.ts    AST -> canonical source
    src/blessed/translate/      AST -> Python, AST -> TypeScript
    src/blessed/diagnostics.ts  every message the compiler can say
    src/blessed/commandments.ts the twenty-one cards the playground shows
    src/blessed/examples.ts     the example programs, each with its exact expected output
    src/App.tsx, src/sections/  the playground UI

`src/blessed/index.ts` is the public surface: `formatBlessed`,
`analyzeBlessed`, `executeBlessed`, and the translators.

## The voice

Every diagnostic, card, and `--help` line reads the same way. Short
sentences. No hedging. State the rule, then the reason. A joke only if it is
also true. "We considered the alternative for four minutes" is the house
style; "you might want to consider" is not.

## Adding a stdlib method

Touch four places, in this order, and the test suite will tell you if you
missed one:

1. `METHODS` in `src/blessed/stdlib.ts` for the arity, and the `switch` for
   the behaviour.
2. The return type in `src/blessed/checker.ts`. If the method can miss,
   return `T?` so the null rules apply.
3. Both emitters in `src/blessed/translate/` so the round-trip test keeps
   passing. Gate any prelude helper on use.
4. A test in `src/blessed/__tests__/stdlib.test.ts`, including the failure
   case, and the row in the spec's Standard library table.

## Proposing a commandment

The bar is in the README: name the suffering, state the rule in one sentence,
pick the verdict, write the snippet, say what it costs. Use the issue
template.

## Before you open the pull request

- `npm test` passes and the count went up, not down.
- `npx tsc --noEmit` is clean. The config is strict and unused locals are
  errors, on purpose.
- `npm run build` produces `dist/index.html`. If you touched the UI, say what
  happened to the gzip size.
- New diagnostics are in character and have a test.
- No new runtime dependencies in the engine. The playground may add one if
  it earns it; say why.

Netlify builds the `master` branch into https://blessed-lang.netlify.app on
every push, and every pull request gets a deploy preview.
