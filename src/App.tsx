import { useCallback, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { EXAMPLES } from "./blessed/examples";
import { GitHubIcon } from "./components/ui";
import { decodeCode, hrefFor, ISSUES_URL, REPO_URL, ROADMAP_URL, useHashRoute, useTheme, type Route } from "./lib/route";
import { Calculator } from "./sections/Calculator";
import { Commandments } from "./sections/Commandments";
import { Home } from "./sections/Home";
import { Playground } from "./sections/Playground";
import { Quiz } from "./sections/Quiz";
import { Translation } from "./sections/Translation";
import { cn } from "./utils/cn";

const NAV: { route: Route; label: string; short: string }[] = [
  { route: "playground", label: "Playground", short: "Play" },
  { route: "commandments", label: "The 21 Commandments", short: "Commandments" },
  { route: "translate", label: "Translation Bureau", short: "Translate" },
  { route: "quiz", label: "Philosophy Quiz", short: "Quiz" },
  { route: "calculator", label: "Suffer-Savings", short: "Savings" },
];

export default function App() {
  const { route, params, navigate, cleanParams } = useHashRoute();
  const [theme, toggleTheme] = useTheme();
  const [code, setCode] = useState<string>(EXAMPLES.hello.code);
  const [selectedExample, setSelectedExample] = useState<string | null>("hello");

  // A share link carries the program in the hash. Load it once, then tidy the URL.
  useEffect(() => {
    if (route !== "playground") return;
    const shared = params.get("code");
    if (!shared) return;
    const decoded = decodeCode(shared);
    if (decoded !== null) {
      setCode(decoded);
      setSelectedExample(null);
    }
    cleanParams();
  }, [route, params, cleanParams]);

  const editCode = useCallback((next: string) => {
    setCode(next);
    setSelectedExample(null);
  }, []);

  const loadExample = useCallback(
    (key: string) => {
      setCode(EXAMPLES[key].code);
      setSelectedExample(key);
      navigate("playground");
    },
    [navigate],
  );

  const openInPlayground = useCallback(
    (source: string) => {
      setCode(source);
      setSelectedExample(null);
      navigate("playground");
    },
    [navigate],
  );

  return (
    <div className="min-h-screen flex flex-col bg-bg text-text">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <a href={hrefFor("home")} className="flex items-center gap-3 group" aria-label="BLESSED home">
            <span className="h-9 w-9 rounded-lg bg-gold text-gold-ink font-display font-bold text-xl flex items-center justify-center shadow-sm shadow-gold/30">
              B
            </span>
            <span className="leading-tight">
              <span className="block font-mono font-bold tracking-[0.25em] text-gold text-sm">BLESSED</span>
              <span className="block font-mono text-[10px] text-faint tracking-wider">v1.0 · the considered spec</span>
            </span>
          </a>

          <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
            {NAV.map((item) => (
              <a
                key={item.route}
                href={hrefFor(item.route)}
                aria-current={route === item.route ? "page" : undefined}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm transition-colors",
                  route === item.route ? "bg-gold text-gold-ink font-semibold" : "text-muted hover:text-text hover:bg-surface-2",
                )}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-lg text-muted hover:text-text hover:bg-surface-2 transition-colors"
              aria-label="Source on GitHub"
              title="Source on GitHub"
            >
              <GitHubIcon className="h-4.5 w-4.5" />
            </a>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-muted hover:text-text hover:bg-surface-2 transition-colors cursor-pointer"
              aria-label={theme === "dark" ? "Switch to parchment" : "Switch to ink"}
              title={theme === "dark" ? "Parchment" : "Ink"}
            >
              {theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>
          </div>
        </div>

        <nav className="md:hidden flex overflow-x-auto gap-1 px-3 pb-2 -mt-1" aria-label="Primary (mobile)">
          {NAV.map((item) => (
            <a
              key={item.route}
              href={hrefFor(item.route)}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-xs transition-colors border",
                route === item.route ? "bg-gold text-gold-ink border-gold font-semibold" : "text-muted border-border",
              )}
            >
              {item.short}
            </a>
          ))}
        </nav>
      </header>

      <main className={cn("flex-1 w-full", route === "home" && "hero-glow")}>
        <div key={route} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 fade-up">
          {route === "home" && <Home navigate={navigate} openInPlayground={openInPlayground} />}
          {route === "playground" && <Playground code={code} setCode={editCode} selectedExample={selectedExample} loadExample={loadExample} />}
          {route === "commandments" && <Commandments params={params} openInPlayground={openInPlayground} loadExample={loadExample} />}
          {route === "translate" && <Translation openInPlayground={openInPlayground} />}
          {route === "quiz" && <Quiz />}
          {route === "calculator" && <Calculator />}
        </div>
      </main>

      <footer className="border-t border-border bg-surface/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
          <div className="space-y-2">
            <span className="font-mono font-bold tracking-[0.25em] text-gold">BLESSED</span>
            <p className="text-muted leading-relaxed max-w-xs">
              A programming language that made the obvious correct choices. All of them. A satire with a real interpreter and 380 tests.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {NAV.map((item) => (
              <a key={item.route} href={hrefFor(item.route)} className="text-muted hover:text-gold transition-colors">
                {item.label}
              </a>
            ))}
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-muted hover:text-gold transition-colors">Source</a>
            <a href={ROADMAP_URL} target="_blank" rel="noreferrer" className="text-muted hover:text-gold transition-colors">Roadmap</a>
            <a href={ISSUES_URL} target="_blank" rel="noreferrer" className="text-muted hover:text-gold transition-colors">Help wanted</a>
          </div>
          <div className="md:text-right font-mono text-xs text-faint space-y-1">
            <div>v1.0 · “It wasn't hard. It just required caring.”</div>
            <div>No semicolons were harmed. They were vaporised.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
