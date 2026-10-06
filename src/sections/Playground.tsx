import { useRef, useState, type KeyboardEvent } from "react";
import { Check, Play, Share2, Sparkles, Terminal, Timer, Trash2 } from "lucide-react";
import { analyzeBlessed, executeBlessed, formatBlessed } from "../blessed";
import { EXAMPLES } from "../blessed/examples";
import { Badge, Button, Kbd, Panel, PanelHeader, PanelTitle, SectionIntro } from "../components/ui";
import { encodeCode, hrefFor } from "../lib/route";
import { cn } from "../utils/cn";

interface Props {
  code: string;
  setCode: (code: string) => void;
  selectedExample: string | null;
  loadExample: (key: string) => void;
}

type Status = "idle" | "ok" | "halt" | "failed";

export function Playground({ code, setCode, selectedExample, loadExample }: Props) {
  const [stdout, setStdout] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [formatterLogs, setFormatterLogs] = useState<string[]>([]);
  const [execMs, setExecMs] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [copied, setCopied] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);

  const run = () => {
    const analysis = analyzeBlessed(code);
    if (analysis.errors.length > 0) {
      setErrors(analysis.errors);
      setWarnings([]);
      setStdout([]);
      setExecMs(null);
      setStatus("halt");
      return;
    }
    const result = executeBlessed(code);
    setWarnings(analysis.warnings);
    setErrors(result.errors);
    setStdout(result.stdout);
    setExecMs(result.executionTime);
    setStatus(result.errors.length > 0 ? "failed" : "ok");
  };

  const format = () => {
    const result = formatBlessed(code);
    setCode(result.formatted);
    setFormatterLogs(result.logs);
  };

  const clearTerminal = () => {
    setStdout([]);
    setErrors([]);
    setWarnings([]);
    setExecMs(null);
    setStatus("idle");
  };

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}${hrefFor("playground", { code: encodeCode(code) })}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      run();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart, selectionEnd } = el;
      const next = code.slice(0, selectionStart) + "    " + code.slice(selectionEnd);
      setCode(next);
      requestAnimationFrame(() => el.setSelectionRange(selectionStart + 4, selectionStart + 4));
    }
  };

  const lines = code.split("\n");
  const statusTone = status === "ok" ? "ok" : status === "halt" ? "err" : status === "failed" ? "warn" : "muted";
  const statusText = status === "ok" ? "Ran clean" : status === "halt" ? "Halted at compile" : status === "failed" ? "Stopped at runtime" : "Idle";

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <SectionIntro
          eyebrow="Playground"
          title="Write it. The compiler has opinions."
          lede="Static analysis checks your moral discipline, then the program runs in a sandbox with a step budget. Semicolons will be vaporised."
        />
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <span className="font-mono text-[11px] uppercase tracking-widest text-faint mr-1">Examples</span>
          {Object.entries(EXAMPLES).map(([key, ex]) => (
            <button
              key={key}
              onClick={() => loadExample(key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors cursor-pointer",
                selectedExample === key
                  ? "border-gold bg-gold text-gold-ink font-semibold"
                  : "border-border bg-surface text-muted hover:text-text hover:border-border-strong",
              )}
            >
              {ex.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* EDITOR */}
        <Panel className="flex flex-col overflow-hidden">
          <PanelHeader>
            <PanelTitle icon={<span className="h-2.5 w-2.5 rounded-full bg-gold inline-block" />}>workspace.blessed</PanelTitle>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={format} title="Remove semicolons, fix indentation, rename snake_case">
                <Sparkles className="h-3.5 w-3.5 text-gold" /> Format
              </Button>
              <Button size="sm" variant="ghost" onClick={share} title="Copy a link to this program">
                {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Share2 className="h-3.5 w-3.5" />} {copied ? "Copied" : "Share"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCode("")} title="Clear the workspace" className="hover:text-err">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </PanelHeader>

          <div className="relative flex-1 flex min-h-[380px] max-h-[62vh] overflow-auto bg-code text-[13px] leading-6">
            <div className="sticky left-0 shrink-0 w-11 pr-3 py-4 text-right select-none text-faint border-r border-border bg-code" aria-hidden="true">
              {lines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={editor}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={onKeyDown}
              rows={Math.max(lines.length, 12)}
              placeholder="-- Write BLESSED here. The compiler is listening."
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="flex-1 min-w-0 bg-transparent px-4 py-4 text-text outline-none resize-none overflow-hidden whitespace-pre"
              aria-label="BLESSED source"
            />
          </div>

          <div className="border-t border-border bg-surface-2/60 px-4 py-2.5 flex items-center justify-between gap-3 rounded-b-2xl">
            <span className="font-mono text-[11px] text-faint">
              {lines.length} lines · {code.length} chars · <Kbd>⌘</Kbd> <Kbd>Enter</Kbd> runs
            </span>
            <Button variant="primary" onClick={run}>
              <Play className="h-4 w-4 fill-current" /> Compile & Run
            </Button>
          </div>
        </Panel>

        {/* OUTPUT */}
        <div className="flex flex-col gap-6">
          <Panel className="flex-1 flex flex-col overflow-hidden min-h-[300px]">
            <PanelHeader>
              <PanelTitle icon={<Terminal className="h-3.5 w-3.5" />}>Safe terminal</PanelTitle>
              <div className="flex items-center gap-2">
                {execMs !== null && (
                  <span className="hidden sm:inline-flex items-center gap-1 font-mono text-[11px] text-faint">
                    <Timer className="h-3 w-3" /> {execMs.toFixed(2)} ms
                  </span>
                )}
                <Badge tone={statusTone}>{statusText}</Badge>
                <Button size="sm" variant="ghost" onClick={clearTerminal}>Clear</Button>
              </div>
            </PanelHeader>
            <div className="flex-1 overflow-auto p-4 bg-code font-mono text-[13px] leading-6 space-y-3">
              {status === "idle" && (
                <p className="text-faint italic text-center py-16 text-sm font-sans">
                  The terminal is empty. Run something and BLESSED will say what it thinks.
                </p>
              )}
              {errors.length > 0 && (
                <div className="rounded-xl border border-err/30 bg-err/10 p-3 text-err text-xs leading-relaxed space-y-1">
                  {errors.map((line, i) => (
                    <div key={i} className={cn(/Halt|CompileError|DIAGNOSTIC/.test(line) && "font-bold")}>{line || " "}</div>
                  ))}
                </div>
              )}
              {warnings.length > 0 && (
                <div className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-warn text-xs leading-relaxed space-y-1">
                  <div className="font-bold uppercase tracking-wider text-[10px]">Warnings · BLESSED let you slide, but holds an opinion</div>
                  {warnings.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
              {status !== "idle" && stdout.length === 0 && errors.length === 0 && (
                <p className="text-faint italic text-xs">(The program ran and said nothing. That is allowed.)</p>
              )}
              {stdout.length > 0 && (
                <ol className="text-text">
                  {stdout.map((line, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-6 shrink-0 text-right text-faint select-none text-[11px] leading-6">{i + 1}</span>
                      <span className="whitespace-pre-wrap break-words">{line}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader>
              <PanelTitle icon={<Sparkles className="h-3.5 w-3.5" />}>The formatter's verdict</PanelTitle>
            </PanelHeader>
            <div className="p-4 bg-code max-h-40 overflow-auto font-mono text-xs leading-relaxed">
              {formatterLogs.length === 0 ? (
                <p className="text-faint italic font-sans text-sm">Nothing formatted yet. Semicolons are currently free to roam.</p>
              ) : (
                <ul className="space-y-1.5 text-gold">
                  {formatterLogs.map((log, i) => (
                    <li key={i}>{log}</li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
