import { useEffect, useState } from "react";
import { ArrowRight, Play } from "lucide-react";
import { COMMANDMENTS } from "../blessed/commandments";
import { EXAMPLES } from "../blessed/examples";
import { Badge, Button, SectionIntro } from "../components/ui";
import { roman } from "../lib/route";
import { VERDICTS, VERDICT_TONE, type Verdict } from "../lib/verdicts";
import { cn } from "../utils/cn";

interface Props {
  params: URLSearchParams;
  openInPlayground: (code: string) => void;
  loadExample: (key: string) => void;
}

export function Commandments({ params, openInPlayground, loadExample }: Props) {
  const initial = params.get("verdict");
  const [filter, setFilter] = useState<Verdict | "All">(VERDICTS.includes(initial as Verdict) ? (initial as Verdict) : "All");

  useEffect(() => {
    const v = params.get("verdict");
    if (v && VERDICTS.includes(v as Verdict)) setFilter(v as Verdict);
    const n = params.get("n");
    if (n) {
      setFilter("All");
      requestAnimationFrame(() => document.getElementById(`c-${n}`)?.scrollIntoView({ block: "start" }));
    }
  }, [params]);

  const shown = filter === "All" ? COMMANDMENTS : COMMANDMENTS.filter((c) => c.verdict === filter);

  return (
    <div className="space-y-10 max-w-4xl mx-auto">
      <SectionIntro
        align="center"
        eyebrow="The specification"
        title={<>The {roman(COMMANDMENTS.length)} Commandments</>}
        lede="Every decision in BLESSED was made by asking a single question: what would cause the least suffering, to the most people, for the longest time? Every snippet below parses, checks and runs. The test suite insists."
      />

      <div className="flex flex-wrap justify-center gap-2">
        {(["All", ...VERDICTS] as const).map((v) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer",
              filter === v ? "border-gold bg-gold text-gold-ink font-semibold" : "border-border bg-surface text-muted hover:text-text hover:border-border-strong",
            )}
          >
            {v}
            {v !== "All" && <span className="ml-1.5 opacity-60">{COMMANDMENTS.filter((c) => c.verdict === v).length}</span>}
          </button>
        ))}
      </div>

      <ol className="space-y-6">
        {shown.map((c) => (
          <li
            key={c.n}
            id={`c-${c.n}`}
            className="scroll-mt-24 rounded-2xl border border-border bg-surface p-6 sm:p-8 space-y-5 hover:border-gold/40 transition-colors shadow-card"
          >
            <div className="flex items-start gap-5">
              <span className="font-display text-4xl sm:text-5xl font-light text-gold leading-none w-14 sm:w-20 shrink-0 pt-1" aria-label={`Commandment ${c.n}`}>
                {roman(c.n)}
              </span>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-gold/80">{c.tag}</span>
                  <Badge tone={VERDICT_TONE[c.verdict]}>Verdict · {c.verdict}</Badge>
                </div>
                <h3 className="font-display text-2xl font-medium text-text text-balance leading-snug">{c.title}</h3>
              </div>
            </div>
            <p className="dropcap text-muted leading-relaxed text-[15px]">{c.body}</p>
            <pre className="rounded-xl border border-border bg-code p-4 text-[13px] leading-6 text-text overflow-x-auto">{c.snippet}</pre>
            <div className="flex flex-wrap justify-end gap-2">
              {c.example && (
                <Button size="sm" variant="ghost" onClick={() => loadExample(c.example!)}>
                  Load “{EXAMPLES[c.example].name}” <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => openInPlayground(c.snippet)}>
                <Play className="h-3 w-3 fill-current" /> Run this
              </Button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
