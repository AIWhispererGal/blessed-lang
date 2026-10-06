import { useState } from "react";
import { Calculator as CalcIcon } from "lucide-react";
import { Panel, SectionIntro } from "../components/ui";
import { cn } from "../utils/cn";

function Field({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (n: number) => void }) {
  return (
    <label className="space-y-1.5 block">
      <span className="font-mono text-[11px] uppercase tracking-widest text-faint block">{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))}
        className="w-full rounded-xl border border-border bg-code px-3 py-2 font-mono text-sm text-text outline-none focus:border-gold"
      />
    </label>
  );
}

export function Calculator() {
  const [loc, setLoc] = useState(2500);
  const [team, setTeam] = useState(5);
  const [copies, setCopies] = useState(12);

  const savedSemicolons = Math.round(loc * 0.45);
  const avoidedTripleEquals = Math.round(loc * 0.08);
  const styleFights = team * 3;
  const pasteErrors = Math.round(copies * 0.6);
  const coercionHours = Math.round((loc / 100) * team * 1.5);
  const stability = Math.min(100, Math.round(50 + savedSemicolons / 50 + styleFights));

  const stats = [
    { label: "Semicolons avoided", value: savedSemicolons, note: "Vaporised by the formatter" },
    { label: "Triple-equals saved", value: avoidedTripleEquals, note: "One == is sufficient" },
    { label: "Style arguments resolved", value: styleFights, note: "Four spaces. It is settled." },
    { label: "Paste errors averted", value: pasteErrors, note: "Braces do not care about whitespace" },
    { label: "Coercion debug hours", value: `${coercionHours} h`, note: "No “5five” mysteries" },
    { label: "Mental stability quotient", value: `${stability}/100`, note: "Guaranteed peace", ok: true },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <SectionIntro
        align="center"
        eyebrow="The suffer-savings calculator"
        title="How much of your life do you get back?"
        lede="Keystrokes, arguments, and debugging hours recovered by moving away from legacy language design. The methodology is rigorous. We made it up with great care."
      />

      <Panel className="p-6 sm:p-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Lines of code" value={loc} min={1} onChange={setLoc} />
          <Field label="Engineering team size" value={team} min={1} onChange={setTeam} />
          <Field label="Daily code-clipboard copies" value={copies} min={0} onChange={setCopies} />
        </div>

        <div className="space-y-3">
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-faint flex items-center gap-2">
            <CalcIcon className="h-3.5 w-3.5 text-gold" /> Your saved mental load
          </h3>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-code p-4 space-y-1">
                <dt className="font-mono text-[11px] text-faint">{s.label}</dt>
                <dd className={cn("font-display text-3xl font-medium tabular-nums", s.ok ? "text-ok" : "text-gold")}>{s.value}</dd>
                <dd className="text-[11px] text-muted">{s.note}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="rounded-xl border border-gold/25 bg-gold/5 p-4 text-sm text-muted leading-relaxed">
          <strong className="text-text">Why this matters.</strong> While a Python team debugs an extra space pasted into a pull request and a JavaScript
          team debates <code className="text-gold">null</code> against <code className="text-gold">undefined</code>, your BLESSED team has
          finished early. There is no argument about style. It has been resolved. Suffer no more.
        </p>
      </Panel>
    </div>
  );
}
