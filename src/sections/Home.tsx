import { useMemo } from "react";
import { ArrowRight, Ban, ExternalLink, Feather, Flame, Gavel, Infinity as InfinityIcon, Play, Scale, Terminal } from "lucide-react";
import { executeBlessed } from "../blessed";
import { COMMANDMENTS } from "../blessed/commandments";
import { Badge, Button, Eyebrow, GitHubIcon, LinkButton, Panel, PanelHeader, PanelTitle, SectionIntro } from "../components/ui";
import { ISSUES_URL, REPO_URL, ROADMAP_URL, type Route } from "../lib/route";
import { VERDICTS, VERDICT_GLOSS, VERDICT_TONE } from "../lib/verdicts";

interface Props {
  navigate: (route: Route, params?: Record<string, string>) => void;
  openInPlayground: (code: string) => void;
}

export const HERO_PROGRAM = `record Point { x: Int, y: Int }

fn describe(p: Point) -> String {
    return match p {
        Point(x: 0, y: 0) -> "origin"
        Point(x: 0, y: y) -> "on the y axis at \${y}"
        _ -> "somewhere"
    }
}

let nick: String? = null
print(nick ?? "no nickname")
print(describe(Point(x: 0, y: 4)))
print(30.factorial())
print(1.0 / 0.0)
print(3 + 4i)
`;

const REFUSALS = [
  { icon: Scale, title: "Two equality operators", line: "== compares values, all the way down. is compares identity. There is no third.", n: 3 },
  { icon: Ban, title: "Truthy strings", line: "\"0\" is not false. \"\" is not false. Bool is a type and only Bool goes in an if.", n: 9 },
  { icon: InfinityIcon, title: "NaN", line: "1.0 / 0.0 is Infinity. 0.0 / 0.0 is an error, not a number that is not a number.", n: 17 },
  { icon: Flame, title: "Integer overflow", line: "25.factorial() is exact. Overflow was a hardware limitation. BLESSED declined to inherit it.", n: 20 },
  { icon: Feather, title: "The semicolon debate", line: "Type one if your fingers insist. The formatter removes it and lets you know.", n: 7 },
  { icon: Gavel, title: "Tabs versus spaces", line: "Four spaces, braces, and a formatter that is not a suggestion. The argument has been had.", n: 4 },
];

const HELP_WANTED = [
  { n: 1, title: "String deserves more than eight methods", tag: "good first issue" },
  { n: 2, title: "List needs take, drop, zip, enumerate and friends", tag: "good first issue" },
  { n: 3, title: "Map can be read but not built", tag: "good first issue" },
  { n: 7, title: "A command-line runner, in the compiler's voice", tag: "tooling" },
  { n: 8, title: "Syntax highlighting for VS Code", tag: "good first issue" },
  { n: 11, title: "A third translation target: Go, Rust, or Lua", tag: "translators" },
];

const STATS = [
  { value: String(COMMANDMENTS.length), label: "commandments" },
  { value: "380", label: "tests, every card snippet among them" },
  { value: "1", label: "kind of nothing" },
  { value: "0", label: "semicolons survive the formatter" },
  { value: "0", label: "NaN" },
];

export function Home({ navigate, openInPlayground }: Props) {
  const heroRun = useMemo(() => executeBlessed(HERO_PROGRAM), []);
  const verdictCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of COMMANDMENTS) counts.set(c.verdict, (counts.get(c.verdict) ?? 0) + 1);
    return counts;
  }, []);

  return (
    <div className="space-y-20 sm:space-y-28 pb-8">
      {/* HERO */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-14 items-center pt-6 sm:pt-12">
        <div className="space-y-7 fade-up">
          <Eyebrow>A programming language · v1.0 · the considered spec</Eyebrow>
          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-medium leading-[1.02] tracking-tight text-text text-balance">
            The obvious correct choices.
            <br />
            <em className="text-gold font-light">All of them.</em>
          </h1>
          <p className="text-lg text-muted leading-relaxed max-w-xl text-pretty">
            BLESSED is a satire with a real interpreter. One equality operator. One kind of nothing. No NaN, no overflow,
            no semicolon debate. It formats, type-checks and runs in your browser, and it translates to Python and
            TypeScript when you need to leave.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" size="lg" onClick={() => navigate("playground")}>
              <Play className="h-4 w-4 fill-current" /> Open the playground
            </Button>
            <Button variant="outline" size="lg" onClick={() => navigate("commandments")}>
              Read the commandments <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <p className="font-mono text-xs text-faint italic">"We read the literature. We did not do those."</p>
        </div>

        <Panel className="overflow-hidden fade-up" style={{ animationDelay: "120ms" }}>
          <PanelHeader>
            <PanelTitle icon={<Terminal className="h-3.5 w-3.5" />}>hero.blessed</PanelTitle>
            <Button size="sm" variant="ghost" onClick={() => openInPlayground(HERO_PROGRAM)}>
              Edit this <ArrowRight className="h-3 w-3" />
            </Button>
          </PanelHeader>
          <pre className="px-5 py-4 text-[13px] leading-6 text-text overflow-x-auto bg-code">{HERO_PROGRAM.trimEnd()}</pre>
          <div className="border-t border-border px-5 py-3 bg-surface-2/40">
            <div className="font-mono text-[10px] uppercase tracking-widest text-faint mb-1.5">stdout, computed on this page just now</div>
            <pre className="text-[13px] leading-6 text-ok">{heroRun.stdout.join("\n")}</pre>
          </div>
        </Panel>
      </section>

      {/* STATS */}
      <section className="space-y-6">
        <div className="rule-gold" />
        <dl className="grid grid-cols-2 md:grid-cols-5 gap-6">
          {STATS.map((s) => (
            <div key={s.label} className="space-y-1">
              <dt className="font-display text-4xl font-medium text-gold tabular-nums">{s.value}</dt>
              <dd className="text-sm text-muted leading-snug">{s.label}</dd>
            </div>
          ))}
        </dl>
        <div className="rule-gold" />
      </section>

      {/* REFUSALS */}
      <section className="space-y-8">
        <SectionIntro
          eyebrow="What BLESSED refused"
          title="Every decision was made by asking one question."
          lede="What would cause the least suffering, to the most people, for the longest time? These are the answers other languages got wrong, each one with a commandment and a card you can run."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {REFUSALS.map((r) => (
            <button
              key={r.n}
              onClick={() => navigate("commandments", { n: String(r.n) })}
              className="group text-left rounded-2xl border border-border bg-surface p-5 space-y-3 hover:border-gold/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            >
              <div className="flex items-center justify-between">
                <span className="h-9 w-9 rounded-xl bg-gold/10 border border-gold/20 text-gold flex items-center justify-center">
                  <r.icon className="h-4 w-4" />
                </span>
                <span className="font-mono text-xs text-faint group-hover:text-gold transition-colors">§{r.n}</span>
              </div>
              <h3 className="font-display text-xl font-medium text-text">{r.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{r.line}</p>
            </button>
          ))}
        </div>
      </section>

      {/* VERDICTS */}
      <section className="space-y-8">
        <SectionIntro
          eyebrow="The verdicts"
          title="Twenty-one rules, five kinds of certainty."
          lede="Each commandment carries a verdict. Click one to read every rule that earned it."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {VERDICTS.map((v) => (
            <button
              key={v}
              onClick={() => navigate("commandments", { verdict: v })}
              className="text-left rounded-2xl border border-border bg-surface p-4 space-y-2 hover:border-gold/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            >
              <div className="flex items-center justify-between">
                <Badge tone={VERDICT_TONE[v]}>{v}</Badge>
                <span className="font-display text-2xl text-text">{verdictCounts.get(v) ?? 0}</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">{VERDICT_GLOSS[v]}</p>
            </button>
          ))}
        </div>
      </section>

      {/* HELP WANTED */}
      <section className="rounded-3xl border border-gold/25 bg-gold/5 p-6 sm:p-10 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <SectionIntro
            eyebrow="Help wanted"
            title="The language is done. The libraries are not."
            lede="Strings, lists, maps, math, JSON, a CLI, editor grammars, a third translation target. Each one is an open issue with the files it touches and what done means. Claim one."
          />
          <div className="flex flex-wrap gap-3 shrink-0">
            <LinkButton variant="primary" href={ROADMAP_URL} target="_blank" rel="noreferrer">
              The roadmap <ExternalLink className="h-4 w-4" />
            </LinkButton>
            <LinkButton variant="outline" href={REPO_URL} target="_blank" rel="noreferrer">
              <GitHubIcon /> Source
            </LinkButton>
          </div>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {HELP_WANTED.map((h) => (
            <li key={h.n}>
              <a
                href={`${ISSUES_URL}/${h.n}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3 hover:border-gold/50 transition-colors group"
              >
                <span className="font-mono text-xs text-faint w-8 shrink-0">#{h.n}</span>
                <span className="flex-1 text-sm text-text group-hover:text-gold transition-colors">{h.title}</span>
                <Badge tone={h.tag === "good first issue" ? "ok" : "muted"} className="hidden sm:inline-flex">{h.tag}</Badge>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
