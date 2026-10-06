import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Badge, Button, Panel, SectionIntro } from "../components/ui";
import { QUIZ_QUESTIONS } from "../lib/quiz";
import { cn } from "../utils/cn";

export function Quiz() {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  const submit = () => {
    let total = 0;
    for (const q of QUIZ_QUESTIONS) {
      const idx = answers[q.id];
      if (idx !== undefined) total += q.options[idx].score;
    }
    setScore(total);
    setSubmitted(true);
    window.scrollTo({ top: 0 });
  };

  const reset = () => {
    setAnswers({});
    setSubmitted(false);
    setScore(0);
  };

  const percent = Math.max(0, Math.min(100, Math.round((score / (QUIZ_QUESTIONS.length * 10)) * 100)));
  const rank = score >= 45 ? "Fully Blessed Practitioner" : score >= 25 ? "Recovering Sufferer" : "Unholy Syntactician";
  const rankText =
    score >= 45
      ? "You choose geometry over habit. Blocks are blocks, bindings are explicit, and an index is an offset. The literature was read, and you agreed."
      : score >= 25
        ? "You understand sanity but carry scars from legacy ecosystems. Semicolons still comfort you. Truthy values are a crutch you lean on in private. BLESSED can help."
        : "You actively seek friction. You compare string integers with triple-equals in your dreams. Go back to JavaScript and paste some tab-indented Python into Slack.";

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <SectionIntro
        align="center"
        eyebrow="The philosophy quiz"
        title="Blessed, or sufferer?"
        lede="Five questions. Sincerity yields truth. Snark is expected."
      />

      <Panel className="p-6 sm:p-8 space-y-8">
        {!submitted ? (
          <>
            {QUIZ_QUESTIONS.map((q, qi) => (
              <fieldset key={q.id} className="space-y-3">
                <legend className="flex gap-3 text-[15px] font-medium text-text">
                  <span className="font-display text-gold">{qi + 1}.</span>
                  {q.question}
                </legend>
                <div className="space-y-2">
                  {q.options.map((opt, oi) => (
                    <label
                      key={oi}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors",
                        answers[q.id] === oi ? "border-gold bg-gold/10 text-text" : "border-border bg-code text-muted hover:border-border-strong",
                      )}
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        checked={answers[q.id] === oi}
                        onChange={() => setAnswers({ ...answers, [q.id]: oi })}
                        className="mt-1 accent-[var(--gold)]"
                      />
                      <span className="font-mono text-xs sm:text-[13px] leading-relaxed">{opt.text}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <Button variant="primary" size="lg" className="w-full" disabled={Object.keys(answers).length < QUIZ_QUESTIONS.length} onClick={submit}>
              <HelpCircle className="h-4 w-4" /> Calculate my Blessed Quotient
            </Button>
          </>
        ) : (
          <>
            <div className="text-center space-y-3 rounded-2xl border border-gold/30 bg-gold/5 p-8">
              <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-faint">Assessment complete</span>
              <div className="font-display text-7xl font-light text-gold tabular-nums">{percent}%</div>
              <h3 className="font-display text-2xl font-medium text-text">{rank}</h3>
              <p className="text-sm text-muted leading-relaxed max-w-md mx-auto">{rankText}</p>
            </div>
            <div className="space-y-3">
              <h4 className="font-mono text-[11px] uppercase tracking-widest text-faint">Detailed feedback</h4>
              {QUIZ_QUESTIONS.map((q, i) => {
                const opt = q.options[answers[q.id]];
                return (
                  <div key={q.id} className="rounded-xl border border-border bg-code p-4 space-y-2">
                    <p className="text-sm font-medium text-text">
                      {i + 1}. {q.question}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={opt.score > 0 ? "ok" : "err"}>{opt.score > 0 ? `+${opt.score}` : opt.score}</Badge>
                      <span className="font-mono text-xs text-muted">{opt.text.split("  (")[0]}</span>
                    </div>
                    <p className="text-sm text-gold italic leading-relaxed">“{opt.feedback}”</p>
                  </div>
                );
              })}
            </div>
            <Button variant="subtle" className="w-full" onClick={reset}>
              Take it again
            </Button>
          </>
        )}
      </Panel>
    </div>
  );
}
