import { useState, useEffect } from 'react';
import { 
  Play, 
  Sparkles, 
  RefreshCw, 
  HelpCircle, 
  Calculator, 
  Terminal, 
  Trash2, 
  ArrowRight
} from 'lucide-react';
import { 
  formatBlessed, 
  analyzeBlessed, 
  executeBlessed, 
  translateBlessedToPython, 
  translatePythonToBlessed, 
  translateBlessedToTypeScript, 
  translateTypeScriptToBlessed 
} from './blessed/compiler';

// Predefined examples
const EXAMPLES: Record<string, { name: string; description: string; code: string }> = {
  hello: {
    name: "Hello World",
    description: "The canonical demonstration of zero-suffering list iteration.",
    code: `-- hello.blessed
let recipients = ["World", "Nurse", "Darkness my old friend"]

loop r in recipients {
    print("Hello, \${r}!")
}
`
  },
  nullSafe: {
    name: "Safe Null Handling",
    description: "Demonstrating explicit nullability checks and null-coalescing.",
    code: `-- Safe Null handling
let name: String = "Alice"
let nick: String? = null

-- This line would trigger a compile error if uncommented:
-- print(nick)

-- But this is fine:
print("Nickname: \${nick ?? "no nickname"}")

if let actualNick = nick {
    print("Nickname is indeed: \${actualNick}")
}

let activeNick: String? = "Al"
if let actualNick = activeNick {
    print("Nickname is indeed: \${actualNick}")
}
`
  },
  strictTypes: {
    name: "Strict Types",
    description: "Witness the compiler save you from silent conversions.",
    code: `-- Strict Types. BLESSED never coerces types silently.
let x = 5
let y = 10
let z = x + y
print("Sum is: \${z}")

-- TRY UN-COMMENTING THE ERRORS BELOW TO SEE THE COMPILER PREVENT DISASTER:
-- let badCoercion = "five"
-- let total = x + badCoercion
`
  },
  oneEquality: {
    name: "One Equality & Identity",
    description: "Comparing values and instances without the scars of dynamic identity.",
    code: `-- BLESSED has exactly one equality operator: ==
let listA = [1, 2, 3]
let listB = [1, 2, 3]
let listC = listA

print("Is listA equivalent in values to listB? \${listA == listB}") -- true
print("Are listA and listB the SAME memory object? \${listA is listB}") -- false
print("Are listA and listC the SAME memory object? \${listA is listC}") -- true

-- BLESSED prevents type-mismatch comparisons:
-- let five = 5
-- let strFive = "5"
-- print(five == strFive) -- CompileError: String ≠ Int. We won't guess.
`
  },
  loopModifier: {
    name: "The Graceful Loop",
    description: "Using the single loop keyword with different shapes and error margins.",
    code: `-- BLESSED has exactly one loop keyword: loop

-- 1. Iterating a collection
let fruits = ["apple", "banana", "mango"]
loop f in fruits {
    print("Munching on \${f}")
}

-- 2. Repeating while condition holds
let count = 1
loop count <= 3 {
    print("Countdown: \${count}")
    count = count + 1
}

-- 3. Despite errors: Keep going even if some items fail
let mixedCollection = [100, 0, "corrupted_payload", 50]
loop item in mixedCollection despite errors {
    if item == "corrupted_payload" {
        -- Simulating throwing error by doing illegal operation
        let division = item + 10
    }
    print("Processed valid unit: \${item}")
}
`
  }
};

// Quiz questions
const QUIZ_QUESTIONS = [
  {
    id: 1,
    question: "You want to check if the string variable 'userName' is empty. How do you construct your conditional?",
    options: [
      { text: "if userName { ... } (Clean and falsy!)", score: 0, feedback: "Incorrect. BLESSED is not interested in load-bearing falsy conventions that were always wrong. What if 'userName' is '0'? Suffer." },
      { text: "if userName != \"\" { ... } (Say what you mean)", score: 10, feedback: "Perfect. BLESSED values absolute clarity. Boolean is a type; true and false are its values. Strings are not booleans." },
      { text: "if (!!userName) { ... } (The double bang dance)", score: -5, feedback: "Severe suffering detected. Go back to JavaScript and apologize to your keyboard." }
    ]
  },
  {
    id: 2,
    question: "You are designing an array index logic. What is the index of the first element?",
    options: [
      { text: "0, because it is the offset (distance) from the start.", score: 10, feedback: "Obvious! This is geometry. The beginning is zero distance from itself. Anything else breaks slicing algebra." },
      { text: "1, because humans count starting at one.", score: 0, feedback: "Incorrect. Human language is full of mistakes. Slicing with 1-based index is a tragedy. We considered this for 4 minutes." },
      { text: "Dynamic, depending on runtime mood.", score: -10, feedback: "Chaos reigns. Please step away from the compiler." }
    ]
  },
  {
    id: 3,
    question: "How do you check if two variables have the exact same reference in memory?",
    options: [
      { text: "===", score: 0, feedback: "The existence of both == and === is a scar. We do not have the scar." },
      { text: "is", score: 10, feedback: "Correct! Checking if two items are the same object is 'is'. Checking values is '=='. Two distinct questions, two distinct operators." },
      { text: "Object.is(a, b)", score: -5, feedback: "Overly verbose compensation for poor language design. Blessed is clean." }
    ]
  },
  {
    id: 4,
    question: "You have a variable that could occasionally be null. How do you declare it?",
    options: [
      { text: "let nick: String = null (Let the runtime deal with it)", score: -5, feedback: "Null pointer exceptions await you. This is the billion-dollar mistake." },
      { text: "let nick: String? = null (Declared explicitly, checked at compile-time)", score: 10, feedback: "Blessed! Declaring nullability with '?' forces you (and the compiler) to handle it before access." },
      { text: "let nick = undefined (Let's have both undefined AND null)", score: -15, feedback: "Absolute heresy. Why have two kinds of nothingness?" }
    ]
  },
  {
    id: 5,
    question: "You need to write a loop. Which keyword do you use?",
    options: [
      { text: "loop, and let its shape adjust to what you pass it.", score: 10, feedback: "Indeed. Whether iterating, repeating while a condition is true, or running forever, the concept is doing something repeatedly. One keyword is sufficient." },
      { text: "for, while, do-while, and foreach depending on the minute of the day.", score: 2, feedback: "Dynamic but redundant. Blessed prefers vocabulary efficiency." },
      { text: "A recursive generator with async yield streams.", score: -5, feedback: "Over-engineered suffering. Use a loop, we beg of you." }
    ]
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'playground' | 'spec' | 'translation' | 'quiz' | 'calculator'>('playground');
  const [selectedExample, setSelectedExample] = useState<string>('hello');
  const [blessedCode, setBlessedCode] = useState<string>(EXAMPLES.hello.code);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [terminalErrors, setTerminalErrors] = useState<string[]>([]);
  const [formatterLogs, setFormatterLogs] = useState<string[]>([]);

  // Translation States
  const [transSourceLang, setTransSourceLang] = useState<'blessed' | 'python' | 'typescript'>('blessed');
  const [transTargetLang, setTransTargetLang] = useState<'python' | 'typescript' | 'blessed'>('python');
  const [translationInput, setTranslationInput] = useState<string>(EXAMPLES.hello.code);
  const [translationOutput, setTranslationOutput] = useState<string>('');

  // Quiz States
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<boolean>(false);
  const [quizScore, setQuizScore] = useState<number>(0);

  // Calculator States
  const [calcLoc, setCalcLoc] = useState<number>(2500);
  const [calcTeamSize, setCalcTeamSize] = useState<number>(5);
  const [calcCopyPastes, setCalcCopyPastes] = useState<number>(12);

  // Effect to load example code
  const loadExample = (key: string) => {
    setSelectedExample(key);
    setBlessedCode(EXAMPLES[key].code);
    // Clear logs on loading example
    setTerminalOutput([]);
    setTerminalErrors([]);
    setFormatterLogs([]);
  };

  // Run the code compiler & interpreter
  const handleRun = () => {
    const analysis = analyzeBlessed(blessedCode);
    const execution = executeBlessed(blessedCode);

    if (analysis.errors.length > 0) {
      setTerminalErrors([
        "--- BLESSED COMPILER DIAGNOSTIC ---",
        ...analysis.errors,
        "",
        "Status: Halt. Take your time, BLESSED will wait."
      ]);
      setTerminalOutput([]);
    } else {
      setTerminalErrors(analysis.warnings.length > 0 ? [
        "--- COMPILER WARNINGS (Blessed let you slide, but holds an opinion) ---",
        ...analysis.warnings
      ] : []);
      setTerminalOutput(execution.stdout.length > 0 ? execution.stdout : ["(Program executed successfully with no output)"]);
    }
  };

  // Format the code
  const handleFormat = () => {
    const result = formatBlessed(blessedCode);
    setBlessedCode(result.formatted);
    setFormatterLogs(result.logs.length > 0 ? result.logs : ["Formatter finished: Code was already perfectly aligned with the spec."]);
  };

  // Perform Translation
  const handleTranslate = () => {
    let output = '';
    if (transSourceLang === 'blessed') {
      if (transTargetLang === 'python') {
        output = translateBlessedToPython(translationInput);
      } else if (transTargetLang === 'typescript') {
        output = translateBlessedToTypeScript(translationInput);
      } else {
        output = translationInput;
      }
    } else if (transSourceLang === 'python') {
      if (transTargetLang === 'blessed') {
        output = translatePythonToBlessed(translationInput);
      } else {
        // Python to TS via Blessed intermediate
        const bl = translatePythonToBlessed(translationInput);
        output = translateBlessedToTypeScript(bl);
      }
    } else if (transSourceLang === 'typescript') {
      if (transTargetLang === 'blessed') {
        output = translateTypeScriptToBlessed(translationInput);
      } else {
        // TS to Python via Blessed intermediate
        const bl = translateTypeScriptToBlessed(translationInput);
        output = translateBlessedToPython(bl);
      }
    }
    setTranslationOutput(output);
  };

  // Synchronize translation target language when source changes
  useEffect(() => {
    if (transSourceLang === 'blessed') {
      setTransTargetLang(transTargetLang === 'blessed' ? 'python' : transTargetLang);
    } else {
      setTransTargetLang('blessed');
    }
  }, [transSourceLang]);

  // Run translation on input change
  useEffect(() => {
    handleTranslate();
  }, [translationInput, transSourceLang, transTargetLang]);

  // Quiz submission
  const handleSubmitQuiz = () => {
    let total = 0;
    QUIZ_QUESTIONS.forEach((q) => {
      const idx = quizAnswers[q.id];
      if (idx !== undefined) {
        total += q.options[idx].score;
      }
    });
    setQuizScore(total);
    setQuizSubmitted(true);
  };

  const handleResetQuiz = () => {
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizScore(0);
  };

  // Calculator computations
  const calculateMetrics = () => {
    const linesOfCode = Number(calcLoc) || 0;
    const team = Number(calcTeamSize) || 0;
    const copies = Number(calcCopyPastes) || 0;

    const savedSemicolons = Math.round(linesOfCode * 0.45); // roughly 45% lines have semicolons in other languages
    const avoidedTripleEquals = Math.round(linesOfCode * 0.08); // roughly 8% comparisons
    const tabsSpacesFightsResolved = team * 3; // 3 major arguments per developer averted
    const copyPasteErrorsAverted = Math.round(copies * 0.6); // Python copy paste block alignment issues averted
    const hoursSpentDebuggingCoercion = Math.round((linesOfCode / 100) * team * 1.5);
    const mentalStabilityIndex = Math.min(100, Math.round(50 + (savedSemicolons / 50) + tabsSpacesFightsResolved));

    return {
      savedSemicolons,
      avoidedTripleEquals,
      tabsSpacesFightsResolved,
      copyPasteErrorsAverted,
      hoursSpentDebuggingCoercion,
      mentalStabilityIndex
    };
  };

  const metrics = calculateMetrics();

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-100">
      
      {/* HEADER NAVBAR */}
      <header className="border-b border-stone-800 bg-stone-900/60 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-lg bg-amber-600 flex items-center justify-center shadow-lg shadow-amber-900/20 border border-amber-500">
              <Sparkles className="h-5 w-5 text-stone-900" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-wider text-amber-500 font-mono">BLESSED</span>
              <span className="text-xs text-stone-400 block -mt-1 font-mono">v1.0 · The Considered Spec</span>
            </div>
          </div>
          
          <nav className="hidden md:flex space-x-1">
            <button 
              onClick={() => setActiveTab('playground')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'playground' ? 'bg-amber-600 text-stone-900' : 'text-stone-300 hover:bg-stone-800'}`}
            >
              Playground & Compiler
            </button>
            <button 
              onClick={() => setActiveTab('translation')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'translation' ? 'bg-amber-600 text-stone-900' : 'text-stone-300 hover:bg-stone-800'}`}
            >
              Translation Bureau
            </button>
            <button 
              onClick={() => setActiveTab('spec')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'spec' ? 'bg-amber-600 text-stone-900' : 'text-stone-300 hover:bg-stone-800'}`}
            >
              The 10 Commandments
            </button>
            <button 
              onClick={() => setActiveTab('quiz')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'quiz' ? 'bg-amber-600 text-stone-900' : 'text-stone-300 hover:bg-stone-800'}`}
            >
              Philosophy Quiz
            </button>
            <button 
              onClick={() => setActiveTab('calculator')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'calculator' ? 'bg-amber-600 text-stone-900' : 'text-stone-300 hover:bg-stone-800'}`}
            >
              Suffer-Savings Calc
            </button>
          </nav>

          <div className="text-xs text-stone-500 font-mono italic hidden lg:block">
            "We read the literature. We did not do those."
          </div>
        </div>
      </header>

      {/* MOBILE NAV (SCROLLABLE BAR) */}
      <div className="md:hidden flex overflow-x-auto border-b border-stone-800 bg-stone-900 text-sm py-1 px-2 space-x-1 scrollbar-none">
        <button 
          onClick={() => setActiveTab('playground')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-md transition-colors ${activeTab === 'playground' ? 'bg-amber-600 text-stone-900 font-semibold' : 'text-stone-300'}`}
        >
          Compiler
        </button>
        <button 
          onClick={() => setActiveTab('translation')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-md transition-colors ${activeTab === 'translation' ? 'bg-amber-600 text-stone-900 font-semibold' : 'text-stone-300'}`}
        >
          Translation
        </button>
        <button 
          onClick={() => setActiveTab('spec')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-md transition-colors ${activeTab === 'spec' ? 'bg-amber-600 text-stone-900 font-semibold' : 'text-stone-300'}`}
        >
          Commandments
        </button>
        <button 
          onClick={() => setActiveTab('quiz')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-md transition-colors ${activeTab === 'quiz' ? 'bg-amber-600 text-stone-900 font-semibold' : 'text-stone-300'}`}
        >
          Quiz
        </button>
        <button 
          onClick={() => setActiveTab('calculator')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-md transition-colors ${activeTab === 'calculator' ? 'bg-amber-600 text-stone-900 font-semibold' : 'text-stone-300'}`}
        >
          Suffer-Savings
        </button>
      </div>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col">
        
        {/* PLAYGROUND & COMPILER TAB */}
        {activeTab === 'playground' && (
          <div className="space-y-6 flex-1 flex flex-col">
            
            {/* INTRO SPELL */}
            <div className="bg-stone-900/40 rounded-xl p-4 sm:p-6 border border-stone-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-bold tracking-tight text-stone-100 flex items-center gap-2">
                  <Terminal className="text-amber-500 h-5 w-5" />
                  Blessed Playground & Live Compiler
                </h2>
                <p className="text-stone-400 text-sm max-w-2xl">
                  Write Blessed code below. Our strict browser compiler will run static analysis to check your moral discipline, then execute it safely in an isolated sandbox. Semicolons will be vaporized.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-stone-400 font-mono">Load Spec Presets:</span>
                <div className="inline-flex rounded-lg bg-stone-950 p-1 border border-stone-800">
                  {Object.keys(EXAMPLES).map((key) => (
                    <button
                      key={key}
                      onClick={() => loadExample(key)}
                      className={`text-xs px-2.5 py-1 rounded transition-colors ${selectedExample === key ? 'bg-amber-600 text-stone-950 font-bold' : 'text-stone-400 hover:text-stone-100'}`}
                    >
                      {EXAMPLES[key].name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* INTERACTIVE WORKSPACE */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
              
              {/* CODE EDITOR BOX */}
              <div className="flex flex-col bg-stone-900 rounded-xl border border-stone-800 overflow-hidden shadow-2xl">
                <div className="bg-stone-950/80 px-4 py-3 border-b border-stone-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="h-3 w-3 rounded-full bg-amber-500" />
                    <span className="font-mono text-xs font-bold text-stone-300">workspace.blessed</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button 
                      onClick={handleFormat}
                      title="Format Blessed Code (Removes semicolons, standardizes indentation to 4 spaces, converts snake_case)"
                      className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-amber-500 text-xs rounded border border-amber-500/20 font-mono transition-colors flex items-center gap-1.5"
                    >
                      <Sparkles className="h-3 w-3" />
                      Format Specs
                    </button>
                    <button 
                      onClick={() => setBlessedCode('')}
                      className="p-1 text-stone-400 hover:text-red-400 hover:bg-stone-800 rounded transition-colors"
                      title="Clear Workspace"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* TEXTAREA EDITOR WITH SIMPLE LINE NUMBERS */}
                <div className="flex-1 flex min-h-[350px] relative font-mono text-sm">
                  <div className="w-12 bg-stone-950/40 text-stone-600 py-4 text-right pr-3 select-none border-r border-stone-800 select-none">
                    {blessedCode.split('\n').map((_, idx) => (
                      <div key={idx} className="h-6">{idx + 1}</div>
                    ))}
                  </div>
                  <textarea
                    value={blessedCode}
                    onChange={(e) => setBlessedCode(e.target.value)}
                    placeholder="-- Write your Blessed code here..."
                    className="flex-1 bg-transparent py-4 px-4 text-stone-200 outline-none resize-none overflow-y-auto leading-6 font-mono focus:ring-1 focus:ring-amber-500/30"
                    spellCheck="false"
                  />
                </div>

                <div className="bg-stone-950/80 px-4 py-3 border-t border-stone-800 flex items-center justify-between">
                  <span className="text-xs text-stone-500 font-mono">
                    {blessedCode.split('\n').length} lines · {blessedCode.length} characters
                  </span>
                  <button 
                    onClick={handleRun}
                    className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold rounded-lg text-sm transition-colors flex items-center gap-2 shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20"
                  >
                    <Play className="h-4 w-4 fill-current text-stone-950" />
                    Compile & Run
                  </button>
                </div>
              </div>

              {/* LIVE CONSOLE / COMPILER OUTPUT */}
              <div className="flex flex-col gap-4">
                
                {/* RUN TIME DIAGNOSTIC */}
                <div className="bg-stone-900 rounded-xl border border-stone-800 flex-1 flex flex-col overflow-hidden">
                  <div className="bg-stone-950/80 px-4 py-3 border-b border-stone-800 flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-stone-300 flex items-center gap-2">
                      <Terminal className="h-4 w-4 text-amber-500" />
                      Blessed Safe-Terminal Output
                    </span>
                    <button
                      onClick={() => {
                        setTerminalOutput([]);
                        setTerminalErrors([]);
                      }}
                      className="text-xs text-stone-500 hover:text-stone-300 transition-colors"
                    >
                      Clear Terminal
                    </button>
                  </div>
                  
                  <div className="flex-1 p-4 font-mono text-sm overflow-y-auto bg-stone-950/60 flex flex-col justify-between space-y-4">
                    {terminalErrors.length === 0 && terminalOutput.length === 0 && (
                      <div className="text-stone-600 italic text-center py-12">
                        Terminal is empty. Write code and hit 'Compile & Run' to begin standard analysis.
                      </div>
                    )}
                    
                    {/* Compile errors */}
                    {terminalErrors.length > 0 && (
                      <div className="p-3 bg-red-950/30 border border-red-900/50 rounded-lg text-red-200 text-xs leading-relaxed space-y-2">
                        {terminalErrors.map((err, idx) => (
                          <div key={idx} className={err.includes("CompileError") || err.includes("Halt") ? "font-bold text-red-400" : ""}>
                            {err}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Standard stdout output */}
                    {terminalOutput.length > 0 && (
                      <div className="space-y-1 bg-stone-900/80 p-3 rounded-lg border border-stone-800 flex-1 overflow-y-auto">
                        {terminalOutput.map((log, idx) => (
                          <div 
                            key={idx} 
                            className={`py-0.5 leading-relaxed text-xs ${
                              log.startsWith("[LOOP ERROR") ? "text-amber-500 italic bg-amber-500/10 px-2 py-1 rounded" : "text-stone-300"
                            }`}
                          >
                            {log.startsWith("[LOOP ERROR") ? "⚠️ " + log : "• " + log}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quick validation info */}
                    {(terminalOutput.length > 0 || terminalErrors.length > 0) && (
                      <div className="text-stone-500 text-xs text-right italic">
                        BLESSED v1.0. "It just required caring."
                      </div>
                    )}
                  </div>
                </div>

                {/* FORMATTER FEEDBACK / CHATTER */}
                <div className="bg-stone-900 rounded-xl border border-stone-800 p-4 space-y-3">
                  <span className="text-xs font-mono font-bold text-stone-300 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-amber-500 animate-pulse" />
                    The Formatter's Verdict
                  </span>
                  <div className="bg-stone-950 p-3 rounded-lg border border-stone-800 max-h-[140px] overflow-y-auto">
                    {formatterLogs.length === 0 ? (
                      <div className="text-xs text-stone-600 italic">
                        No code formatted yet. Semicolons are currently free to roam. Slay them with 'Format Specs'.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {formatterLogs.map((log, idx) => (
                          <div key={idx} className="text-xs text-amber-500/90 leading-relaxed font-mono">
                            {log}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* TRANSLATION BUREAU TAB */}
        {activeTab === 'translation' && (
          <div className="space-y-6 flex-1 flex flex-col">
            
            {/* INTRO */}
            <div className="bg-stone-900/40 rounded-xl p-6 border border-stone-800 space-y-2">
              <h2 className="text-xl font-bold tracking-tight text-stone-100 flex items-center gap-2">
                <RefreshCw className="text-amber-500 h-5 w-5" />
                The Blessed Translation Bureau
              </h2>
              <p className="text-stone-400 text-sm">
                Translate programming languages back and forth. Write standard BLESSED code and receive clean, production-ready Python or TypeScript. Or, paste Python or TypeScript code to see it gracefully elevated to the Blessed standard.
              </p>
            </div>

            {/* TRANSLATION GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
              
              {/* SOURCE LANG BOX */}
              <div className="flex flex-col bg-stone-900 rounded-xl border border-stone-800 overflow-hidden shadow-lg">
                <div className="bg-stone-950 px-4 py-3 border-b border-stone-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono text-stone-400">Source Language:</span>
                    <select
                      value={transSourceLang}
                      onChange={(e) => {
                        const val = e.target.value as 'blessed' | 'python' | 'typescript';
                        setTransSourceLang(val);
                        // Initialize placeholder
                        if (val === 'python') {
                          setTranslationInput(`recipients = ["World", "Nurse", "Darkness my old friend"]\nfor r in recipients:\n    print(f"Hello, {r}!")`);
                        } else if (val === 'typescript') {
                          setTranslationInput(`const recipients: string[] = ["World", "Nurse", "Darkness my old friend"];\nfor (const r of recipients) {\n    console.log(\`Hello, \${r}!\`);\n}`);
                        } else {
                          setTranslationInput(EXAMPLES.hello.code);
                        }
                      }}
                      className="bg-stone-800 text-stone-200 border border-stone-700 rounded px-2 py-0.5 text-xs font-mono outline-none cursor-pointer focus:border-amber-500"
                    >
                      <option value="blessed">BLESSED</option>
                      <option value="python">Python</option>
                      <option value="typescript">TypeScript</option>
                    </select>
                  </div>
                  <span className="text-xs text-stone-500 font-mono">Editable</span>
                </div>

                <div className="flex-1 flex min-h-[350px]">
                  <textarea
                    value={translationInput}
                    onChange={(e) => setTranslationInput(e.target.value)}
                    placeholder="Write code in source language here..."
                    className="flex-1 bg-stone-950/40 p-4 font-mono text-sm text-stone-200 outline-none resize-none leading-relaxed"
                    spellCheck="false"
                  />
                </div>
              </div>

              {/* TARGET LANG BOX */}
              <div className="flex flex-col bg-stone-900 rounded-xl border border-stone-800 overflow-hidden shadow-lg">
                <div className="bg-stone-950 px-4 py-3 border-b border-stone-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono text-stone-400">Target Language:</span>
                    <select
                      value={transTargetLang}
                      onChange={(e) => setTransTargetLang(e.target.value as 'python' | 'typescript' | 'blessed')}
                      className="bg-stone-800 text-stone-200 border border-stone-700 rounded px-2 py-0.5 text-xs font-mono outline-none cursor-pointer focus:border-amber-500"
                      disabled={transSourceLang !== 'blessed'}
                    >
                      {transSourceLang === 'blessed' ? (
                        <>
                          <option value="python">Python</option>
                          <option value="typescript">TypeScript (TS)</option>
                        </>
                      ) : (
                        <option value="blessed">BLESSED</option>
                      )}
                    </select>
                  </div>
                  <div className="flex items-center space-x-2">
                    {transTargetLang === 'blessed' && (
                      <button 
                        onClick={() => {
                          setBlessedCode(translationOutput);
                          setActiveTab('playground');
                        }}
                        className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-stone-950 text-xs font-semibold rounded font-mono transition-colors flex items-center gap-1"
                      >
                        Send to Playground
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                    <span className="text-xs text-stone-500 font-mono">Compiled Output</span>
                  </div>
                </div>

                <div className="flex-1 flex min-h-[350px] bg-stone-950/70 p-4 font-mono text-sm leading-relaxed overflow-y-auto">
                  <pre className="text-amber-400/90 select-all w-full whitespace-pre-wrap">{translationOutput || "// Translation will appear here"}</pre>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* SPECIFICATION READER TAB */}
        {activeTab === 'spec' && (
          <div className="space-y-8 max-w-4xl mx-auto">
            
            {/* INTRO */}
            <div className="text-center space-y-4 py-6">
              <span className="text-xs tracking-widest text-amber-500 font-mono uppercase bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">The Specification Document</span>
              <h2 className="text-3xl font-extrabold text-stone-100">The 10 Commandments of BLESSED</h2>
              <p className="text-stone-400 text-sm max-w-xl mx-auto leading-relaxed">
                "Every decision in BLESSED was made by asking a single question: what would cause the least suffering, to the most people, for the longest time?"
              </p>
            </div>

            {/* THE TEN RULES */}
            <div className="space-y-6">
              
              {/* Command 1 */}
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 space-y-4 hover:border-amber-500/25 transition-all">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-xs text-amber-500 font-mono tracking-wider">§1. THE INDEX PRINCIPLE</span>
                    <h3 className="text-lg font-bold text-stone-100">Arrays are zero-indexed, and the index is the offset from the start</h3>
                  </div>
                  <span className="text-xs px-2.5 py-1 bg-emerald-950/40 text-emerald-400 border border-emerald-900/40 rounded-full font-mono uppercase font-bold">Verdict: Obvious</span>
                </div>
                <p className="text-stone-400 text-sm leading-relaxed">
                  The first element is at index <strong>0</strong>. This is not arbitrary. An index is an offset: how far from the beginning? The beginning is zero distance from itself. This is geometry. Slicing values `0..2` excludes the end, making range calculation trivial: <code className="text-amber-400">length = end - start</code>.
                </p>
                <div className="bg-stone-950 rounded-lg p-3 border border-stone-800/80 font-mono text-xs text-stone-300">
                  <span className="text-stone-500">-- Slicing matches math perfectly</span>
                  <div>let fruits = ["apple", "banana", "mango"]</div>
                  <div>fruits[0..2] <span className="text-stone-500">-- ["apple", "banana"]. Length is 2 - 0 = 2.</span></div>
                </div>
                <div className="flex justify-end">
                  <button 
                    onClick={() => loadExample('hello')}
                    className="text-xs text-amber-500 hover:text-amber-400 transition-colors flex items-center gap-1"
                  >
                    Load Hello World Example <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Command 2 */}
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 space-y-4 hover:border-amber-500/25 transition-all">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-xs text-amber-500 font-mono tracking-wider">§2. THE TYPE SANCTITY</span>
                    <h3 className="text-lg font-bold text-stone-100">Types are inferred, explicit when ambiguous, and never coerced silently</h3>
                  </div>
                  <span className="text-xs px-2.5 py-1 bg-yellow-950/40 text-yellow-400 border border-yellow-900/40 rounded-full font-mono uppercase font-bold">Verdict: Sensible</span>
                </div>
                <p className="text-stone-400 text-sm leading-relaxed">
                  BLESSED infers types from assignment. You may annotate for clarity. What BLESSED will not do, under any circumstances, is silently convert one type to another and pretend nothing happened. If you add a string and an integer, BLESSED will stop and ask what you meant. Out loud.
                </p>
                <div className="bg-stone-950 rounded-lg p-3 border border-stone-800/80 font-mono text-xs text-stone-300">
                  <div>let x = 5 <span className="text-stone-500">-- Inferred: Int</span></div>
                  <div>let y = "five" <span className="text-stone-500">-- Inferred: String</span></div>
                  <div className="text-red-400">x + y <span className="text-stone-500">-- CompileError: cannot add Int and String. Did you mean String(x) + y?</span></div>
                </div>
                <div className="flex justify-end">
                  <button 
                    onClick={() => loadExample('strictTypes')}
                    className="text-xs text-amber-500 hover:text-amber-400 transition-colors flex items-center gap-1"
                  >
                    Load Strict Types Example <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Command 3 */}
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 space-y-4 hover:border-amber-500/25 transition-all">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-xs text-amber-500 font-mono tracking-wider">§3. THE EQUALITY COMMAND</span>
                    <h3 className="text-lg font-bold text-stone-100">There is one equality operator. It checks equality.</h3>
                  </div>
                  <span className="text-xs px-2.5 py-1 bg-emerald-950/40 text-emerald-400 border border-emerald-900/40 rounded-full font-mono uppercase font-bold">Verdict: Obvious</span>
                </div>
                <p className="text-stone-400 text-sm leading-relaxed">
                  <code className="text-amber-400">==</code> checks if two values are equal. Equal means: same type, same value. There is no <code className="text-amber-400">===</code> because <code className="text-amber-400">==</code> already does what <code className="text-amber-400">===</code> was invented to compensate for. If you want to check if two things are the same object in memory, that is <code className="text-amber-400">is</code>.
                </p>
                <div className="bg-stone-950 rounded-lg p-3 border border-stone-800/80 font-mono text-xs text-stone-300">
                  <div>5 == 5 <span className="text-stone-500">-- true</span></div>
                  <div className="text-red-400">"5" == 5 <span className="text-stone-500">-- CompileError: String ≠ Int. We won't guess.</span></div>
                </div>
                <div className="flex justify-end">
                  <button 
                    onClick={() => loadExample('oneEquality')}
                    className="text-xs text-amber-500 hover:text-amber-400 transition-colors flex items-center gap-1"
                  >
                    Load Equality Example <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Command 4 */}
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 space-y-4 hover:border-amber-500/25 transition-all">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-xs text-amber-500 font-mono tracking-wider">§4. THE STYLE BOUNDARY</span>
                    <h3 className="text-lg font-bold text-stone-100">Whitespace is not syntax. Braces are syntax. Indentation is style.</h3>
                  </div>
                  <span className="text-xs px-2.5 py-1 bg-yellow-950/40 text-yellow-400 border border-yellow-900/40 rounded-full font-mono uppercase font-bold">Verdict: Sensible</span>
                </div>
                <p className="text-stone-400 text-sm leading-relaxed">
                  Code blocks are delimited by <code className="text-amber-400">{`{ }`}</code>. Indentation is formatted automatically. Suffer no more layout issues on Slack copy-paste. The 4-space indent formatter is built-in and final.
                </p>
                <div className="bg-stone-950 rounded-lg p-3 border border-stone-800/80 font-mono text-xs text-stone-300">
                  <div>if x &gt; 0 &#123;</div>
                  <div>    print("positive") <span className="text-stone-500">-- Indented for humans, closed for compile</span></div>
                  <div>&#125;</div>
                </div>
              </div>

              {/* Command 5 */}
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 space-y-4 hover:border-amber-500/25 transition-all">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-xs text-amber-500 font-mono tracking-wider">§5. THE NULL REDEMPTION</span>
                    <h3 className="text-lg font-bold text-stone-100">There is one null. It is called null. It means "no value."</h3>
                  </div>
                  <span className="text-xs px-2.5 py-1 bg-emerald-950/40 text-emerald-400 border border-emerald-900/40 rounded-full font-mono uppercase font-bold">Verdict: Obvious</span>
                </div>
                <p className="text-stone-400 text-sm leading-relaxed">
                  A variable that might be null must be declared as nullable with <code className="text-amber-400">?</code>, and you must handle the null case using coalescing <code className="text-amber-400">??</code> or <code className="text-amber-400">if let</code> before you can access the inner value. No more runtime crash exceptions.
                </p>
                <div className="bg-stone-950 rounded-lg p-3 border border-stone-800/80 font-mono text-xs text-stone-300">
                  <div>let nick: String? = null</div>
                  <div className="text-red-400">print(nick) <span className="text-stone-500">-- CompileError: nick may be null. Handle it first.</span></div>
                  <div>print(nick ?? "no nickname") <span className="text-stone-500">-- Safe and elegant</span></div>
                </div>
                <div className="flex justify-end">
                  <button 
                    onClick={() => loadExample('nullSafe')}
                    className="text-xs text-amber-500 hover:text-amber-400 transition-colors flex items-center gap-1"
                  >
                    Load Safe Null Example <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Command 6 */}
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 space-y-4 hover:border-amber-500/25 transition-all">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-xs text-amber-500 font-mono tracking-wider">§6. THE NAMING CODE</span>
                    <h3 className="text-lg font-bold text-stone-100">Variable names are case-sensitive. camelCase is the convention.</h3>
                  </div>
                  <span className="text-xs px-2.5 py-1 bg-yellow-950/40 text-yellow-400 border border-yellow-900/40 rounded-full font-mono uppercase font-bold">Verdict: Weary</span>
                </div>
                <p className="text-stone-400 text-sm leading-relaxed">
                  <code className="text-amber-400">userName</code> is a variable (camelCase). <code className="text-amber-400">UserProfile</code> is a type (PascalCase). <code className="text-amber-400">MAX_SIZE</code> is a constant (SCREAMING_SNAKE). No double underscores on both sides. Formatter fixes this automatically.
                </p>
              </div>

              {/* Command 7 */}
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 space-y-4 hover:border-amber-500/25 transition-all">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-xs text-amber-500 font-mono tracking-wider">§7. THE SEMICOLON PEACE</span>
                    <h3 className="text-lg font-bold text-stone-100">Semicolons are optional. The formatter removes them.</h3>
                  </div>
                  <span className="text-xs px-2.5 py-1 bg-emerald-950/40 text-emerald-400 border border-emerald-900/40 rounded-full font-mono uppercase font-bold">Verdict: Obvious</span>
                </div>
                <p className="text-stone-400 text-sm leading-relaxed">
                  Write semicolons out of old habit, and let the formatter silently clean them. Semicolons are redundant noise. You have better things to think about.
                </p>
              </div>

              {/* Command 8 */}
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 space-y-4 hover:border-amber-500/25 transition-all">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-xs text-amber-500 font-mono tracking-wider">§8. THE INTERPOLATION HARMONY</span>
                    <h3 className="text-lg font-bold text-stone-100">There is one string interpolation syntax. It uses {"${ }"}</h3>
                  </div>
                  <span className="text-xs px-2.5 py-1 bg-emerald-950/40 text-emerald-400 border border-emerald-900/40 rounded-full font-mono uppercase font-bold">Verdict: Obvious</span>
                </div>
                <p className="text-stone-400 text-sm leading-relaxed">
                  No `f-string` flags, no `%s` format templates, no triple braces. Plain double quotes enclosing <code className="text-amber-400">{"${expression}"}</code> does the job everywhere.
                </p>
              </div>

              {/* Command 9 */}
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 space-y-4 hover:border-amber-500/25 transition-all">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-xs text-amber-500 font-mono tracking-wider">§9. THE BOOLEAN PURITY</span>
                    <h3 className="text-lg font-bold text-stone-100">Boolean is a type. True and false are its two values.</h3>
                  </div>
                  <span className="text-xs px-2.5 py-1 bg-yellow-950/40 text-yellow-400 border border-yellow-900/40 rounded-full font-mono uppercase font-bold">Verdict: Weary</span>
                </div>
                <p className="text-stone-400 text-sm leading-relaxed">
                  No "truthy" or "falsy" values. Conditionals accept only <code className="text-amber-400">Bool</code>. If you pass an empty string, an array, or an integer to an `if` statement, BLESSED will compile-fail and demand a true assertion.
                </p>
              </div>

              {/* Command 10 */}
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 space-y-4 hover:border-amber-500/25 transition-all">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-xs text-amber-500 font-mono tracking-wider">§10. THE SINGLE LOOP</span>
                    <h3 className="text-lg font-bold text-stone-100">There is one loop construct: loop.</h3>
                  </div>
                  <span className="text-xs px-2.5 py-1 bg-yellow-950/40 text-yellow-400 border border-yellow-900/40 rounded-full font-mono uppercase font-bold">Verdict: Graceful</span>
                </div>
                <p className="text-stone-400 text-sm leading-relaxed">
                  No distinction between `for`, `while`, or infinite `do-while`. Just use <code className="text-amber-400">loop</code>. Add <code className="text-amber-400">despite errors</code> to skip over lines that crash and resume iteration gracefully.
                </p>
                <div className="flex justify-end">
                  <button 
                    onClick={() => loadExample('loopModifier')}
                    className="text-xs text-amber-500 hover:text-amber-400 transition-colors flex items-center gap-1"
                  >
                    Load Loop Example <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* PHILOSOPHY QUIZ TAB */}
        {activeTab === 'quiz' && (
          <div className="space-y-6 max-w-2xl mx-auto flex-1 flex flex-col justify-center">
            
            <div className="bg-stone-900 rounded-2xl border border-stone-800 p-6 sm:p-8 space-y-6 shadow-2xl">
              <div className="text-center space-y-2">
                <div className="h-12 w-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto border border-amber-500/20">
                  <HelpCircle className="h-6 w-6" />
                </div>
                <h2 className="text-2xl font-black text-stone-100">Blessed or Sufferer?</h2>
                <p className="text-stone-400 text-xs sm:text-sm">
                  Let us evaluate your programming instincts. Sincerity yields truth. Snark is expected.
                </p>
              </div>

              {!quizSubmitted ? (
                <div className="space-y-8">
                  {QUIZ_QUESTIONS.map((q, qIdx) => (
                    <div key={q.id} className="space-y-3">
                      <h4 className="text-sm font-semibold text-stone-200">
                        {qIdx + 1}. {q.question}
                      </h4>
                      <div className="space-y-2">
                        {q.options.map((opt, oIdx) => (
                          <label 
                            key={oIdx}
                            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                              quizAnswers[q.id] === oIdx 
                                ? 'bg-amber-600/10 border-amber-500/80 text-amber-200' 
                                : 'bg-stone-950 border-stone-800 hover:border-stone-700 text-stone-300'
                            }`}
                          >
                            <input 
                              type="radio" 
                              name={`q-${q.id}`} 
                              checked={quizAnswers[q.id] === oIdx}
                              onChange={() => setQuizAnswers({ ...quizAnswers, [q.id]: oIdx })}
                              className="mt-1 accent-amber-500"
                            />
                            <span className="text-xs sm:text-sm font-mono leading-relaxed">{opt.text}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={handleSubmitQuiz}
                    disabled={Object.keys(quizAnswers).length < QUIZ_QUESTIONS.length}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-stone-950 font-black rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/10"
                  >
                    Calculate My Blessed Quotient
                  </button>
                </div>
              ) : (
                <div className="space-y-8 py-4">
                  
                  {/* SCORE DISPLAY */}
                  <div className="text-center space-y-3 p-6 bg-stone-950 rounded-2xl border border-stone-800">
                    <span className="text-xs font-mono text-stone-500 uppercase tracking-widest">Assessment Complete</span>
                    
                    <div className="flex justify-center items-center gap-1.5">
                      <span className="text-5xl font-black text-amber-500 font-mono">
                        {Math.max(0, Math.min(100, Math.round((quizScore / (QUIZ_QUESTIONS.length * 10)) * 100)))}%
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-stone-100 mt-2">
                      {quizScore >= 45 ? "Fully Blessed Practitioner" : quizScore >= 25 ? "Recovering Sufferer" : "Unholy Syntactician"}
                    </h3>
                    
                    <p className="text-stone-400 text-xs max-w-md mx-auto leading-relaxed">
                      {quizScore >= 45 
                        ? "You choose geometry over habits. You view code blocks as blocks, variables as explicit bindings, and arrays as simple offset lines. The literature was read, and you agreed." 
                        : quizScore >= 25 
                        ? "You understand sanity but retain some scars from legacy ecosystems. Semicolons still comfort you, and truthy values are a crutch you occasionally lean on. Let Blessed guide you." 
                        : "You actively seek mental friction. You enjoy comparing string integers with triple-equals in your dreams. Go back to JavaScript and copy-paste some deeply nested, indented-with-tab-spaces Python script via Slack."}
                    </p>
                  </div>

                  {/* FEEDBACK BREAKDOWN */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider font-mono">Detailed Feedback:</h4>
                    {QUIZ_QUESTIONS.map((q, idx) => {
                      const selectedIdx = quizAnswers[q.id];
                      const opt = q.options[selectedIdx];
                      return (
                        <div key={q.id} className="p-4 bg-stone-900 rounded-xl border border-stone-800/80 space-y-2">
                          <p className="text-xs font-semibold text-stone-300">{idx+1}. {q.question}</p>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-mono px-2 py-0.5 rounded ${opt.score > 0 ? 'bg-emerald-950/50 text-emerald-400' : 'bg-red-950/50 text-red-400'}`}>
                              Score: {opt.score > 0 ? `+${opt.score}` : opt.score}
                            </span>
                            <span className="text-xs text-stone-500 font-mono">Chosen option: {opt.text.split('(')[0]}</span>
                          </div>
                          <p className="text-xs text-amber-400/90 italic font-mono">"{opt.feedback}"</p>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={handleResetQuiz}
                    className="w-full py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold rounded-xl text-xs transition-colors font-mono"
                  >
                    Take Quiz Again
                  </button>

                </div>
              )}

            </div>

          </div>
        )}

        {/* SUFFER CALCULATOR TAB */}
        {activeTab === 'calculator' && (
          <div className="space-y-6 max-w-3xl mx-auto flex-1 flex flex-col justify-center">
            
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 sm:p-8 space-y-8 shadow-2xl">
              
              <div className="space-y-2 text-center">
                <div className="h-12 w-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto border border-amber-500/20">
                  <Calculator className="h-6 w-6" />
                </div>
                <h2 className="text-2xl font-black text-stone-100">Suffer-to-Blessing Savings Calculator</h2>
                <p className="text-stone-400 text-xs sm:text-sm">
                  Find out how much developer lifespan, keystrokes, and mental health index you recover by moving away from legacy language designs.
                </p>
              </div>

              {/* INPUT CONTROLS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-stone-950 p-4 rounded-xl border border-stone-800">
                
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-stone-400 block font-bold">Estimated lines of code (LOC):</label>
                  <input 
                    type="number"
                    value={calcLoc}
                    onChange={(e) => setCalcLoc(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-stone-900 text-stone-100 border border-stone-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-stone-400 block font-bold">Engineering team size:</label>
                  <input 
                    type="number"
                    value={calcTeamSize}
                    onChange={(e) => setCalcTeamSize(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-stone-900 text-stone-100 border border-stone-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-stone-400 block font-bold">Daily Code-Clipboard copies:</label>
                  <input 
                    type="number"
                    value={calcCopyPastes}
                    onChange={(e) => setCalcCopyPastes(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-stone-900 text-stone-100 border border-stone-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500 font-mono"
                  />
                </div>

              </div>

              {/* SAVINGS REPORT CARD */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider font-mono">Your Saved Mental Load Report</h3>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  
                  {/* Stat 1 */}
                  <div className="p-4 bg-stone-950 rounded-xl border border-stone-800/80 space-y-1">
                    <span className="text-xs text-stone-500 font-mono block">Semicolons Avoided</span>
                    <span className="text-2xl font-extrabold text-amber-500 font-mono">{metrics.savedSemicolons}</span>
                    <span className="text-[10px] text-stone-500 block">Vaporized by Formatter</span>
                  </div>

                  {/* Stat 2 */}
                  <div className="p-4 bg-stone-950 rounded-xl border border-stone-800/80 space-y-1">
                    <span className="text-xs text-stone-500 font-mono block">Triple-Equals Saved</span>
                    <span className="text-2xl font-extrabold text-amber-500 font-mono">{metrics.avoidedTripleEquals}</span>
                    <span className="text-[10px] text-stone-500 block">Single == is sufficient</span>
                  </div>

                  {/* Stat 3 */}
                  <div className="p-4 bg-stone-950 rounded-xl border border-stone-800/80 space-y-1">
                    <span className="text-xs text-stone-500 font-mono block">Format Slaps Saved</span>
                    <span className="text-2xl font-extrabold text-amber-500 font-mono">{metrics.tabsSpacesFightsResolved}</span>
                    <span className="text-[10px] text-stone-500 block">Arguments solved</span>
                  </div>

                  {/* Stat 4 */}
                  <div className="p-4 bg-stone-950 rounded-xl border border-stone-800/80 space-y-1">
                    <span className="text-xs text-stone-500 font-mono block">Copy-Paste Errors Saved</span>
                    <span className="text-2xl font-extrabold text-amber-500 font-mono">{metrics.copyPasteErrorsAverted}</span>
                    <span className="text-[10px] text-stone-500 block">No whitespace alignment bugs</span>
                  </div>

                  {/* Stat 5 */}
                  <div className="p-4 bg-stone-950 rounded-xl border border-stone-800/80 space-y-1">
                    <span className="text-xs text-stone-500 font-mono block">Coercion Debug Hours</span>
                    <span className="text-2xl font-extrabold text-amber-500 font-mono">{metrics.hoursSpentDebuggingCoercion} hrs</span>
                    <span className="text-[10px] text-stone-500 block">No "5five" mysteries</span>
                  </div>

                  {/* Stat 6 */}
                  <div className="p-4 bg-stone-950 rounded-xl border border-stone-800/80 space-y-1">
                    <span className="text-xs text-stone-500 font-mono block">Mental Stability Quotient</span>
                    <span className="text-2xl font-extrabold text-emerald-500 font-mono">{metrics.mentalStabilityIndex}/100</span>
                    <span className="text-[10px] text-emerald-600 block">Guaranteed peace</span>
                  </div>

                </div>

              </div>

              {/* COMPARATIVE SCENARIO */}
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs sm:text-sm text-stone-300 leading-relaxed font-mono">
                💡 <strong>Why this matters:</strong> While Python developers are debugging an extra space pasted into an email PR, and JavaScript developers are debating <code className="text-amber-400">null</code> vs <code className="text-amber-400">undefined</code>, your BLESSED team is drinking coffee, having finished work early. There is no argument about styles. It has been resolved. Suffer no more.
              </div>

            </div>

          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="border-t border-stone-900 bg-stone-950 text-stone-500 py-6 text-center text-xs space-y-1 font-mono">
        <div>BLESSED · A Programming Language that made the obvious correct choices (all of them).</div>
        <div className="text-stone-600">v1.0 · "It wasn't hard. It just required caring."</div>
      </footer>

    </div>
  );
}
