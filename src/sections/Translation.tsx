import { useEffect, useState } from "react";
import { ArrowRight, Languages } from "lucide-react";
import {
  translateBlessedToPython,
  translateBlessedToTypeScript,
  translatePythonToBlessed,
  translateTypeScriptToBlessed,
} from "../blessed";
import { EXAMPLES } from "../blessed/examples";
import { Badge, Button, Panel, PanelHeader, PanelTitle, SectionIntro } from "../components/ui";

type Lang = "blessed" | "python" | "typescript";
const LABEL: Record<Lang, string> = { blessed: "BLESSED", python: "Python", typescript: "TypeScript" };

const SAMPLES: Record<Lang, string> = {
  blessed: EXAMPLES.hello.code,
  python: `recipients = ["World", "Nurse", "Darkness my old friend"]\nfor r in recipients:\n    print(f"Hello, {r}!")`,
  typescript: `const recipients: string[] = ["World", "Nurse", "Darkness my old friend"];\nfor (const r of recipients) {\n    console.log(\`Hello, \${r}!\`);\n}`,
};

function translate(source: Lang, target: Lang, input: string): string {
  if (source === target) return input;
  if (source === "blessed") return target === "python" ? translateBlessedToPython(input) : translateBlessedToTypeScript(input);
  const blessed = source === "python" ? translatePythonToBlessed(input) : translateTypeScriptToBlessed(input);
  if (target === "blessed") return blessed;
  return target === "python" ? translateBlessedToPython(blessed) : translateBlessedToTypeScript(blessed);
}

const selectClass =
  "bg-surface text-text border border-border-strong rounded-lg px-2 py-1 text-xs font-mono outline-none cursor-pointer focus:border-gold disabled:opacity-60";

export function Translation({ openInPlayground }: { openInPlayground: (code: string) => void }) {
  const [source, setSource] = useState<Lang>("blessed");
  const [target, setTarget] = useState<Lang>("python");
  const [input, setInput] = useState<string>(SAMPLES.blessed);
  const [output, setOutput] = useState<string>("");

  useEffect(() => {
    setOutput(translate(source, target, input));
  }, [source, target, input]);

  const changeSource = (next: Lang) => {
    setSource(next);
    setInput(SAMPLES[next]);
    if (next === "blessed") setTarget(target === "blessed" ? "python" : target);
    else setTarget("blessed");
  };

  return (
    <div className="space-y-6">
      <SectionIntro
        eyebrow="The translation bureau"
        title="Leave with dignity. Arrive with hope."
        lede="BLESSED to Python or TypeScript is exact: every example is compiled and run under both and prints what the interpreter prints. The other direction is read line by line, and labelled honestly."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel className="flex flex-col overflow-hidden">
          <PanelHeader>
            <PanelTitle icon={<Languages className="h-3.5 w-3.5" />}>
              Source
              <select value={source} onChange={(e) => changeSource(e.target.value as Lang)} className={selectClass} aria-label="Source language">
                <option value="blessed">BLESSED</option>
                <option value="python">Python</option>
                <option value="typescript">TypeScript</option>
              </select>
            </PanelTitle>
            <Badge tone="muted">editable</Badge>
          </PanelHeader>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            className="flex-1 min-h-[380px] bg-code p-4 text-[13px] leading-6 text-text outline-none resize-none whitespace-pre overflow-auto"
            aria-label={`${LABEL[source]} source`}
          />
        </Panel>

        <Panel className="flex flex-col overflow-hidden">
          <PanelHeader>
            <PanelTitle icon={<ArrowRight className="h-3.5 w-3.5" />}>
              Target
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value as Lang)}
                disabled={source !== "blessed"}
                className={selectClass}
                aria-label="Target language"
              >
                {source === "blessed" ? (
                  <>
                    <option value="python">Python</option>
                    <option value="typescript">TypeScript</option>
                  </>
                ) : (
                  <option value="blessed">BLESSED</option>
                )}
              </select>
            </PanelTitle>
            <div className="flex items-center gap-2">
              {target === "blessed" ? (
                <Button size="sm" variant="primary" onClick={() => openInPlayground(output)}>
                  Send to playground <ArrowRight className="h-3 w-3" />
                </Button>
              ) : (
                <Badge tone="ok">exact</Badge>
              )}
              {source !== "blessed" && <Badge tone="warn">best effort</Badge>}
            </div>
          </PanelHeader>
          <pre className="flex-1 min-h-[380px] bg-code p-4 text-[13px] leading-6 text-gold overflow-auto whitespace-pre-wrap select-all">
            {output || "// The translation appears here."}
          </pre>
          {source !== "blessed" && (
            <p className="border-t border-border px-4 py-2 text-xs text-muted italic">
              Python and TypeScript are read line by line, not parsed. A real parser is an open issue. BLESSED output is exact.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
