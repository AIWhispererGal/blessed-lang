import type { Commandment } from "../blessed/commandments";
import type { Tone } from "../components/ui";

export type Verdict = Commandment["verdict"];
export const VERDICTS: Verdict[] = ["Obvious", "Sensible", "Correct", "Overdue", "Necessary"];
export const VERDICT_TONE: Record<Verdict, Tone> = {
  Obvious: "ok",
  Sensible: "warn",
  Correct: "info",
  Overdue: "err",
  Necessary: "gold",
};
export const VERDICT_GLOSS: Record<Verdict, string> = {
  Obvious: "Nobody needed to think about this. Somebody did anyway.",
  Sensible: "The reasonable answer. Most things are Sensible.",
  Correct: "Provably right. The alternatives are provably wrong.",
  Overdue: "Other languages had decades. BLESSED had an afternoon.",
  Necessary: "Without it, programs lie. With it, they cannot.",
};
