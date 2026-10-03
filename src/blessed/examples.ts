// src/blessed/examples.ts
export interface Example { name: string; description: string; code: string; expectStdout: string[]; expectError?: string }

export const EXAMPLES: Record<string, Example> = {
  hello: {
    name: "Hello World",
    description: "The canonical demonstration of zero-suffering list iteration.",
    code: `-- hello.blessed
let recipients = ["World", "Nurse", "Darkness my old friend"]

loop r in recipients {
    print("Hello, \${r}!")
}
`,
    expectStdout: ["Hello, World!", "Hello, Nurse!", "Hello, Darkness my old friend!"],
  },
  nullSafe: {
    name: "Safe Null Handling",
    description: "Explicit nullability, null-coalescing, and if let. Reusing a binding name is fine because scopes are real.",
    code: `-- Safe null handling
let name: String = "Alice"
let nick: String? = null

-- This line would be a compile error if uncommented:
-- print(nick)

-- But this is fine:
print("Nickname: \${nick ?? "no nickname"}")

if let actualNick = nick {
    print("Nickname is indeed: \${actualNick}")
} else {
    print("\${name} has no nickname. Respect it.")
}

let activeNick: String? = "Al"
if let actualNick = activeNick {
    print("Nickname is indeed: \${actualNick}")
}
`,
    expectStdout: ["Nickname: no nickname", "Alice has no nickname. Respect it.", "Nickname is indeed: Al"],
  },
  strictTypes: {
    name: "Strict Types",
    description: "Witness the compiler save you from silent conversions.",
    code: `-- Strict Types. BLESSED never coerces types silently.
let x = 5
let y = 10
let z = x + y
print("Sum is: \${z}")

-- Int is arbitrary precision. Overflow is not our problem.
print(2.pow(64))

-- TRY UN-COMMENTING THE ERRORS BELOW TO SEE THE COMPILER PREVENT DISASTER:
-- let badCoercion = "five"
-- let total = x + badCoercion
`,
    expectStdout: ["Sum is: 15", "18446744073709551616"],
  },
  oneEquality: {
    name: "One Equality & Identity",
    description: "Values compare structurally with ==. Identity is a different question with a different operator.",
    code: `-- BLESSED has exactly one equality operator: ==
let listA = [1, 2, 3]
let listB = [1, 2, 3]
let listC = listA

print("Is listA equivalent in values to listB? \${listA == listB}")
print("Are listA and listB the SAME memory object? \${listA is listB}")
print("Are listA and listC the SAME memory object? \${listA is listC}")

-- BLESSED prevents type-mismatch comparisons:
-- let five = 5
-- let strFive = "5"
-- print(five == strFive) -- CompileError: Int ≠ String. We won't guess.
`,
    expectStdout: ["Is listA equivalent in values to listB? true", "Are listA and listB the SAME memory object? false", "Are listA and listC the SAME memory object? true"],
  },
  loopModifier: {
    name: "The Graceful Loop",
    description: "One loop keyword, four shapes, and an error margin that actually catches errors.",
    code: `-- BLESSED has exactly one loop keyword: loop

-- 1. Iterating a collection
let fruits = ["apple", "banana", "mango"]
loop f in fruits {
    print("Munching on \${f}")
}

-- 2. Repeating while a condition holds
let count = 1
loop count <= 3 {
    print("Countdown: \${count}")
    count = count + 1
}

-- 3. Despite errors: keep going even if some items fail
let divisors = [5, 0, 2]
loop d in divisors despite errors as e {
    print("100 / \${d} = \${100 / d}")
}
print("Survived the zero. Last complaint: \${e ?? "none"}")
`,
    expectStdout: ["Munching on apple", "Munching on banana", "Munching on mango", "Countdown: 1", "Countdown: 2", "Countdown: 3", "100 / 5 = 20", "100 / 2 = 50", "Survived the zero. Last complaint: Division by zero. Int is a count and there is no infinite count."],
  },
  functions: {
    name: "Functions & Closures",
    description: "fn declares, lambdas capture, and single-expression bodies skip the ceremony.",
    code: `-- Functions are values. Recursion is allowed. Depth is finite, like patience.
fn factorial(n: Int) -> Int {
    if n <= 1 {
        return 1
    }
    return n * factorial(n - 1)
}
print(factorial(20))

fn makeAdder(n: Int) -> Fn(Int) -> Int {
    return fn(x: Int) { x + n }
}
let addFive = makeAdder(5)
print(addFive(10))

let squares = (1..6).map(fn(k) { k * k })
print(squares)
print(squares.filter(fn(s) { s % 2 == 0 }).sum())
`,
    expectStdout: ["2432902008176640000", "15", "[1, 4, 9, 16, 25]", "20"],
  },
  records: {
    name: "Records & Maps",
    description: "Named fields on construction, immutable records, and maps whose lookups admit they might miss.",
    code: `record Point { x: Int, y: Int }

let p = Point(x: 3, y: 4)
let q = p with { x: 0 }
print(p)
print(q)
print(p == Point(y: 4, x: 3))

let ages = {"al": 30, "bo": 25}
ages["cy"] = 41
print(ages["cy"] ?? -1)
print(ages["zed"] ?? -1)
print(ages.keys())
`,
    expectStdout: ["Point(x: 3, y: 4)", "Point(x: 0, y: 4)", "true", "41", "-1", '["al", "bo", "cy"]'],
  },
  matching: {
    name: "Match",
    description: "Literals, bindings, guards, record destructuring, and a wildcard the compiler insists on.",
    code: `record Point { x: Int, y: Int }

fn describe(p: Point) -> String {
    return match p {
        Point(x: 0, y: 0) -> "origin"
        Point(x: 0, y: y) -> "on the y axis at \${y}"
        Point(x: x, y: 0) -> "on the x axis at \${x}"
        Point(x: x, y: y) if x == y -> "diagonal"
        _ -> "somewhere"
    }
}

loop p in [Point(x: 0, y: 0), Point(x: 0, y: 7), Point(x: 3, y: 0), Point(x: 2, y: 2), Point(x: 1, y: 5)] {
    print(describe(p))
}

let size = match 42 {
    n if n > 100 -> "big"
    n if n > 10 -> "medium"
    _ -> "small"
}
print(size)
`,
    expectStdout: ["origin", "on the y axis at 7", "on the x axis at 3", "diagonal", "somewhere", "medium"],
  },
  errors: {
    name: "Errors",
    description: "fail raises. Only despite errors catches. There is no third thing.",
    code: `fn withdraw(balance: Int, amount: Int) -> Int {
    if amount > balance {
        fail "Insufficient funds: wanted \${amount}, had \${balance}"
    }
    return balance - amount
}

loop amount in [10, 500, 20] despite errors as e {
    print("Remaining: \${withdraw(100, amount)}")
}
print("Account survived. \${e ?? "No complaints."}")
`,
    expectStdout: ["Remaining: 90", "Remaining: 80", "Account survived. Insufficient funds: wanted 500, had 100"],
  },
  math: {
    name: "All The Math",
    description: "Infinity is real. NaN is not. Imaginary numbers are also real. Overflow is someone else's problem.",
    code: `-- Float has Infinity. It does not have NaN.
print(1.0 / 0.0)
print(Infinity > 10.0.pow(308))

-- Int never overflows.
print(30.factorial())

-- Imaginary numbers are real.
let z = 3 + 4i
print(z.abs())
print(z * z)
print(Complex(-4.0).sqrt())

-- The line below is a runtime error: (-4.0).sqrt() is not a number.
-- print((-4.0).sqrt())

let data = [2.5, 7.5, 5.0]
print(data.sum() / Float(data.length))
print((data.max() ?? 0.0) - (data.min() ?? 0.0))
print(PI.round(4))
`,
    expectStdout: ["Infinity", "true", "265252859812191058636308480000000", "5.0", "-7 + 24i", "2i", "5.0", "5.0", "3.1416"],
  },
  budget: {
    name: "The Step Budget",
    description: "An infinite loop ends with a diagnostic, not a frozen tab.",
    code: `-- This loop never terminates. BLESSED does.
let n = 0
loop {
    n = n + 1
}
`,
    expectStdout: [],
    expectError: "exceeded 1,000,000 steps",
  },
};
