export interface QuizOption { text: string; score: number; feedback: string }
export interface QuizQuestion { id: number; question: string; options: QuizOption[] }

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    question: "You want to check whether the string variable userName is empty. How do you write the condition?",
    options: [
      { text: "if userName { ... }  (clean and falsy)", score: 0, feedback: "Incorrect. BLESSED is not interested in load-bearing falsy conventions that were always wrong. What if userName is \"0\"? Suffer." },
      { text: "if userName != \"\" { ... }  (say what you mean)", score: 10, feedback: "Perfect. Bool is a type; true and false are its values. Strings are not booleans. §9." },
      { text: "if (!!userName) { ... }  (the double-bang dance)", score: -5, feedback: "Severe suffering detected. Go back to JavaScript and apologise to your keyboard." },
    ],
  },
  {
    id: 2,
    question: "You are indexing a list. What is the index of the first element?",
    options: [
      { text: "0, because it is the offset from the start.", score: 10, feedback: "Obvious. This is geometry. The beginning is zero distance from itself. Anything else breaks the slicing algebra. §1." },
      { text: "1, because humans count from one.", score: 0, feedback: "Incorrect. Human language is full of mistakes. Slicing with 1-based indices is a tragedy. We considered it for four minutes." },
      { text: "It depends on the runtime's mood.", score: -10, feedback: "Chaos reigns. Please step away from the compiler." },
    ],
  },
  {
    id: 3,
    question: "How do you ask whether two variables are the very same object?",
    options: [
      { text: "===", score: 0, feedback: "The existence of both == and === is a scar. BLESSED does not have the scar. §3." },
      { text: "is", score: 10, feedback: "Correct. Same object is \"is\". Same value is \"==\". Two questions, two operators." },
      { text: "Object.is(a, b)", score: -5, feedback: "Verbose compensation for a design mistake. BLESSED is clean." },
    ],
  },
  {
    id: 4,
    question: "A variable may occasionally hold nothing. How do you declare it?",
    options: [
      { text: "let nick: String = null  (let the runtime deal with it)", score: -5, feedback: "Null pointer exceptions await you. This is the billion-dollar mistake, and you just took out a loan." },
      { text: "let nick: String? = null  (declared, and checked at compile time)", score: 10, feedback: "Blessed. The ? puts nullability in the type, and the compiler makes you handle it before use. §5." },
      { text: "let nick = undefined  (let's have both undefined and null)", score: -15, feedback: "Absolute heresy. Why have two kinds of nothing?" },
    ],
  },
  {
    id: 5,
    question: "You need a loop. Which keyword?",
    options: [
      { text: "loop, and let its shape follow what you give it.", score: 10, feedback: "Indeed. Iterate, repeat while true, or run forever: it is one concept. One keyword is sufficient. §10." },
      { text: "for, while, do-while and foreach, depending on the minute of the day.", score: 2, feedback: "Flexible and redundant. BLESSED prefers a small vocabulary." },
      { text: "A recursive generator with async yield streams.", score: -5, feedback: "Over-engineered suffering. Use a loop, we beg of you." },
    ],
  },
];
