/**
 * BLESSED: The Programming Language - Compiler, Analyser, Formatter & Translator
 * Version 1.0 · The Considered Spec
 */

export interface FormatterResult {
    formatted: string;
    logs: string[];
}

export interface AnalysisResult {
    errors: string[];
    warnings: string[];
}

export interface ExecutionResult {
    stdout: string[];
    errors: string[];
    executionTime: number;
}

// ==========================================
// 1. FORMATTER
// ==========================================
export function formatBlessed(code: string): FormatterResult {
    const logs: string[] = [];
    const lines = code.split('\n');
    let formattedLines: string[] = [];
    let indentLevel = 0;
    let semicolonCount = 0;
    let snakeCaseCount = 0;
    let braceAdjustments = 0;

    for (let line of lines) {
        let trimmed = line.trim();

        // Preserve comments or empty lines but adjust indentation
        if (trimmed === "") {
            formattedLines.push("");
            continue;
        }

        // Handle comment normalization
        if (trimmed.startsWith("--")) {
            formattedLines.push("    ".repeat(indentLevel) + trimmed);
            continue;
        }

        // Remove semicolons at the end of expressions (but not in string literals)
        // Basic check: if it ends with a semicolon and doesn't end inside a quote
        if (trimmed.endsWith(";")) {
            // Strip trailing semicolons
            while (trimmed.endsWith(";")) {
                trimmed = trimmed.slice(0, -1).trim();
                semicolonCount++;
            }
        }

        // Convert snake_case variables to camelCase in let statements
        // Let's capture declarations like `let user_name =` or `let max_size =`
        // Excluding CAPS constants like `MAX_SIZE` which are SCREAMING_SNAKE (§6)
        if (trimmed.startsWith("let ")) {
            const match = trimmed.match(/^let\s+([a-zA-Z_][a-zA-Z0-9_]*)(.*)$/);
            if (match) {
                const varName = match[1];
                const rest = match[2];
                // Check if snake_case and not SCREAMING_SNAKE
                if (varName.includes('_') && varName !== varName.toUpperCase()) {
                    const camelName = varName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
                    trimmed = `let ${camelName}${rest}`;
                    snakeCaseCount++;
                    logs.push(`Formatter Warning: Renamed variable '${varName}' to '${camelName}'. camelCase is the variable convention. You are welcome.`);
                }
            }
        }

        // Adjust indent level for braces
        // If the line starts with a closing brace, reduce indent before writing
        if (trimmed.startsWith("}")) {
            indentLevel = Math.max(0, indentLevel - 1);
            braceAdjustments++;
        }

        // Add line with current indentation
        formattedLines.push("    ".repeat(indentLevel) + trimmed);

        // If the line ends with an opening brace, increase indent for subsequent lines
        if (trimmed.endsWith("{")) {
            indentLevel++;
            braceAdjustments++;
        }
    }

    if (semicolonCount > 0) {
        logs.push(`Formatter Notice: Semicolon detected and vaporized ${semicolonCount} time(s). Semicolons are optional and the formatter removes them. Suffer no more.`);
    }

    // Join lines
    let formatted = formattedLines.join('\n');

    // Strip trailing empty lines or excessive whitespaces
    formatted = formatted.trim();

    return {
        formatted,
        logs
    };
}

// ==========================================
// 2. STATIC ANALYSER
// ==========================================
export function analyzeBlessed(code: string): AnalysisResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const lines = code.split('\n');

    // Keep track of defined variables and their types
    const variables: Record<string, { type: string; nullable: boolean }> = {};

    // First Pass: Basic syntax checks, types, and strict rules
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;
        const trimmed = line.trim();

        if (trimmed.startsWith("--") || trimmed === "") {
            continue;
        }

        // 1. Double equality scar (=== or !==)
        if (trimmed.includes("===") || trimmed.includes("!==")) {
            errors.push(`Line ${lineNum}: CompileError: What is '==='? We only need '==' because it actually checks equality. There is no other kind of equality. We do not have the JS scar here.`);
        }

        // 2. Semicolons warnings
        if (trimmed.endsWith(";")) {
            warnings.push(`Line ${lineNum}: Formatter will remove this semicolon. Semicolons are optional. Don't think about it.`);
        }

        // 3. Variable declarations tracking & type inference
        if (trimmed.startsWith("let ")) {
            // Check let x = 5 or let x: String = "hello" or let nick: String? = null
            const declMatch = trimmed.match(/^let\s+([a-zA-Z0-9_]+)(?:\s*:\s*([a-zA-Z0-9?\[\]]+))?\s*=\s*(.*)$/);
            if (declMatch) {
                const name = declMatch[1];
                let typeAnno = declMatch[2] || "";
                const valExpr = declMatch[3] ? declMatch[3].trim() : "";

                let isNullable = false;
                if (typeAnno.endsWith("?")) {
                    isNullable = true;
                    typeAnno = typeAnno.slice(0, -1);
                }

                // Infer type if not explicitly annotated
                let inferredType = typeAnno || "Unknown";
                if (!typeAnno) {
                    if (valExpr.startsWith('"') || valExpr.startsWith('`') || valExpr.startsWith("'")) {
                        inferredType = "String";
                    } else if (valExpr === "true" || valExpr === "false") {
                        inferredType = "Bool";
                    } else if (valExpr === "null") {
                        inferredType = "Null";
                        isNullable = true;
                    } else if (/^\d+$/.test(valExpr)) {
                        inferredType = "Int";
                    } else if (/^\d+\.\d+$/.test(valExpr)) {
                        inferredType = "Float";
                    } else if (valExpr.startsWith("[") && valExpr.endsWith("]")) {
                        inferredType = "Array";
                    }
                }

                variables[name] = { type: inferredType, nullable: isNullable };

                // If declared nullable but has no ? and assigned null
                if (valExpr === "null" && !isNullable && typeAnno) {
                    errors.push(`Line ${lineNum}: CompileError: Variable '${name}' of type '${typeAnno}' cannot be null. Declare it as '${typeAnno}?' to make it nullable.`);
                }
            }
        }

        // 4. Strict Type coercion checks (e.g. Adding string and number)
        // Search for things like `+` with potential string and integer coercion
        // For simplicity, we detect common additions with numbers and strings
        if (trimmed.includes("+")) {
            // Regex to check if we are adding a string literal and a number literal
            if (/"[^"]*"\s*\+\s*\d+|\d+\s*\+\s*"[^"]*"/.test(trimmed)) {
                errors.push(`Line ${lineNum}: CompileError: cannot add Int and String. Did you mean: String(x) + y? Or x + Int(y)? BLESSED will wait. Take your time.`);
            }

            // Check if we are adding a variable of type Int and a variable of type String
            for (const [v1, meta1] of Object.entries(variables)) {
                for (const [v2, meta2] of Object.entries(variables)) {
                    if (v1 !== v2) {
                        const plusRegex = new RegExp(`\\b${v1}\\s*\\+\\s*${v2}\\b|\\b${v2}\\s*\\+\\s*${v1}\\b`);
                        if (plusRegex.test(trimmed)) {
                            if ((meta1.type === "Int" || meta1.type === "Float") && meta2.type === "String") {
                                errors.push(`Line ${lineNum}: CompileError: cannot add '${meta1.type}' and '${meta2.type}'. Did you mean: String(${v1}) + ${v2}? BLESSED will wait. Take your time.`);
                            }
                        }
                    }
                }
            }
        }

        // 5. Comparing across types is a compile error
        if (trimmed.includes("==")) {
            // Check if comparing variables of different types
            for (const [v1, meta1] of Object.entries(variables)) {
                for (const [v2, meta2] of Object.entries(variables)) {
                    if (v1 !== v2) {
                        const eqRegex = new RegExp(`\\b${v1}\\s*==\\s*${v2}\\b`);
                        if (eqRegex.test(trimmed)) {
                            if (meta1.type !== meta2.type && meta1.type !== "Unknown" && meta2.type !== "Unknown" && meta1.type !== "Null" && meta2.type !== "Null") {
                                errors.push(`Line ${lineNum}: CompileError: ${meta1.type} ≠ ${meta2.type}. We won't guess. Did you mean: ${v1} == ${meta1.type}(${v2})?`);
                            }
                        }
                    }
                }
            }
            // Check literal comparisons
            if (/"[^"]*"\s*==\s*\d+|\d+\s*==\s*"[^"]*"/.test(trimmed)) {
                errors.push(`Line ${lineNum}: CompileError: String ≠ Int. We won't guess.`);
            }
            if (/\btrue\s*==\s*\d+|\d+\s*==\s*true\b/.test(trimmed) || /\bfalse\s*==\s*\d+|\d+\s*==\s*false\b/.test(trimmed)) {
                errors.push(`Line ${lineNum}: CompileError: Bool ≠ Int. We won't guess.`);
            }
        }

        // 6. Non-boolean conditional checks (§9)
        // If statements should be of the form: `if boolean {`
        if (trimmed.startsWith("if ") && !trimmed.startsWith("if let ")) {
            const condMatch = trimmed.match(/^if\s+(.*?)\s*\{/);
            if (condMatch) {
                const cond = condMatch[1].trim();
                // If it is a known variable of non-boolean type
                if (variables[cond]) {
                    const varMeta = variables[cond];
                    if (varMeta.type === "String") {
                        errors.push(`Line ${lineNum}: CompileError: String is not Bool. Did you mean: if ${cond} != ""?`);
                    } else if (varMeta.type === "Int" || varMeta.type === "Float") {
                        errors.push(`Line ${lineNum}: CompileError: ${varMeta.type} is not Bool. Did you mean: if ${cond} > 0?`);
                    }
                } else if (!cond.includes("==") && !cond.includes("!=") && !cond.includes("<") && !cond.includes(">") && cond !== "true" && cond !== "false" && !cond.includes("is") && !cond.startsWith("!")) {
                    // Try to guess if it's a raw variable or expression
                    if (/^[a-zA-Z0-9_]+$/.test(cond)) {
                        errors.push(`Line ${lineNum}: CompileError: Condition is not Bool. BLESSED is not interested in truthy/falsy load-bearing conventions that were always wrong. Please make it explicit.`);
                    }
                }
            }
        }

        // 7. Nullability checks (§5)
        // If a variable is declared nullable (String?), you cannot use it without handling it
        for (const [name, meta] of Object.entries(variables)) {
            if (meta.nullable) {
                // If the variable is printed or assigned without coalescing '??' or safe handling
                // We check if it is passed directly to a function or used in an expression
                // Exclude lines with coalescing `??` or inside `if let name = name`
                const isCoalesced = trimmed.includes(`${name} ??`);
                const isIfLet = trimmed.includes(`if let `) && trimmed.includes(`= ${name}`);
                const isDeclaration = trimmed.startsWith(`let ${name}`);
                const isReassignment = trimmed.startsWith(`${name} =`);
                
                // If used elsewhere in an unsafe way
                if (trimmed.includes(name) && !isCoalesced && !isIfLet && !isDeclaration && !isReassignment) {
                    errors.push(`Line ${lineNum}: CompileError: Variable '${name}' may be null. Handle it first. Did you mean '${name} ?? "default"' or using 'if let'?`);
                }
            }
        }

        // 8. Reserved underscoring check
        if (trimmed.includes("_")) {
            // Warn if variable names start with double underscore or have other unusual underscoring styles
            const words = trimmed.split(/[^a-zA-Z0-9_]+/);
            for (const word of words) {
                if (word.startsWith("__") && word.endsWith("__")) {
                    errors.push(`Line ${lineNum}: CompileError: Double underscores on both sides are not a thing. This is Blessed, not Python.`);
                } else if (word.startsWith("_") && word !== "_") {
                    warnings.push(`Line ${lineNum}: Warning: Leading underscores are reserved for the compiler's internal use. Please stick to camelCase.`);
                }
            }
        }
    }

    return {
        errors,
        warnings
    };
}

// ==========================================
// 3. EXECUTION SANDBOX
// ==========================================
export function executeBlessed(code: string): ExecutionResult {
    const stdout: string[] = [];
    const errors: string[] = [];
    const startTime = performance.now();

    try {
        // Formatter and analyser checks first
        const formatted = formatBlessed(code).formatted;
        const analysis = analyzeBlessed(formatted);

        if (analysis.errors.length > 0) {
            return {
                stdout,
                errors: [
                    "--- BLESSED COMPILE ERRORS ---",
                    ...analysis.errors,
                    "",
                    "Execution halted because you did not make the obvious correct choices."
                ],
                executionTime: performance.now() - startTime
            };
        }

        // We transpile Blessed into executable JavaScript
        // Let's create a custom sandbox transpiler
        const jsCode = transpileBlessedToJS(formatted);

        // Define standard library for sandbox
        const printBuffer: string[] = [];
        const sandboxConsole = {
            log: (...args: any[]) => {
                printBuffer.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
            }
        };

        // Execute transpiled JavaScript in a scoped function
        const runner = new Function("console", "print", jsCode);
        runner(sandboxConsole, sandboxConsole.log);

        stdout.push(...printBuffer);

    } catch (e: any) {
        errors.push(`RuntimeError: ${e.message}`);
    }

    const endTime = performance.now();

    return {
        stdout,
        errors,
        executionTime: endTime - startTime
    };
}

// Internal JS Transpiler for executing the code in browser
function transpileBlessedToJS(code: string): string {
    const lines = code.split('\n');
    const jsLines: string[] = [];

    // To track loops and 'despite errors' modifier
    let braceStack: string[] = []; // tracks what kind of block we closed

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();

        if (line === "" || line.startsWith("--")) {
            jsLines.push("// " + line.slice(2));
            continue;
        }

        // Handle Variable declarations
        // let x = 5 -> let x = 5
        // let fruits = ["apple", "banana"] -> let fruits = ["apple", "banana"]
        if (line.startsWith("let ")) {
            // Strip out type annotations like `: String` or `: String?`
            // match `let name: Type = expr`
            line = line.replace(/let\s+([a-zA-Z0-9_]+)\s*:\s*[a-zA-Z0-9?\[\]]+\s*=\s*(.*)$/, "let $1 = $2");
        }

        // Handle string interpolation `${expr}`
        // In JS we can just translate double quotes string interpolation into backtick strings if they contain ${
        if (line.includes('"${') || line.includes('${')) {
            // Simple replace of double quotes enclosing ${...} with backticks
            // Regex to find double-quoted strings with ${} inside
            line = line.replace(/"([^"]*\$\{.*?\}[^"]*)"/g, "`$1`");
        }

        // Handle null coalescing operator `??`
        // JS already supports `??`
        
        // Handle negative array indexingfruits[-1] and slicing fruits[0..2]
        // BLESSED: fruits[-1] is fruits[fruits.length - 1]
        // fruits[0..2] is fruits.slice(0, 2)
        // First handle slicing: `[expr..expr]`
        line = line.replace(/([a-zA-Z0-9_]+)\[\s*(.*?)\s*\.\.\s*(.*?)\s*\]/g, "$1.slice($2, $3)");
        // Then negative indexing: `[ -1 ]` or `[-index]`
        // Since JS doesn't do native negative indexes, let's substitute a custom helper
        // We'll declare standard helpers at the top of js code, like `getAt(arr, index)`
        line = line.replace(/([a-zA-Z0-9_]+)\[\s*-\s*([0-9a-zA-Z_]+)\s*\]/g, "at($1, -$2)");

        // Handle 'if let' syntax: `if let n = nick {`
        // In JS: `const n = nick; if (n !== null && n !== undefined) {`
        if (line.startsWith("if let ")) {
            const ifLetMatch = line.match(/^if let\s+([a-zA-Z0-9_]+)\s*=\s*(.*?)\s*\{/);
            if (ifLetMatch) {
                const varName = ifLetMatch[1];
                const expr = ifLetMatch[2];
                jsLines.push(`const ${varName} = ${expr};`);
                jsLines.push(`if (${varName} !== null && ${varName} !== undefined) {`);
                braceStack.push("iflet");
                continue;
            }
        }

        // Handle Standard conditionals:
        // `if cond {` -> `if (cond) {`
        if (line.startsWith("if ") && !line.includes("let")) {
            const ifMatch = line.match(/^if\s+(.*?)\s*\{/);
            if (ifMatch) {
                const cond = ifMatch[1];
                // Replace identity `is` with `===`
                const jsCond = cond.replace(/\bis\b/g, "===");
                jsLines.push(`if (${jsCond}) {`);
                braceStack.push("if");
                continue;
            }
        }

        // Handle Loops:
        // 1. `loop item in collection despite errors {`
        if (line.startsWith("loop ") && line.includes("despite errors")) {
            const loopMatch = line.match(/^loop\s+([a-zA-Z0-9_]+)\s+in\s+(.*?)\s+despite\s+errors\s*\{/);
            if (loopMatch) {
                const item = loopMatch[1];
                const coll = loopMatch[2];
                jsLines.push(`for (const ${item} of ${coll}) {`);
                jsLines.push(`  try {`);
                braceStack.push("loop_despite_errors");
                continue;
            }
        }
        // 2. `loop item in collection {`
        else if (line.startsWith("loop ") && line.includes(" in ")) {
            const loopMatch = line.match(/^loop\s+([a-zA-Z0-9_]+)\s+in\s+(.*?)\s*\{/);
            if (loopMatch) {
                const item = loopMatch[1];
                const coll = loopMatch[2];
                jsLines.push(`for (const ${item} of ${coll}) {`);
                braceStack.push("loop_in");
                continue;
            }
        }
        // 3. `loop condition {` -> `while (condition) {`
        else if (line.startsWith("loop ") && line.endsWith("{")) {
            const loopMatch = line.match(/^loop\s+(.*?)\s*\{/);
            if (loopMatch) {
                const cond = loopMatch[1];
                const jsCond = cond.replace(/\bis\b/g, "===");
                jsLines.push(`while (${jsCond}) {`);
                braceStack.push("loop_cond");
                continue;
            }
        }
        // 4. `loop {` -> `while (true) {`
        else if (line === "loop {") {
            jsLines.push(`while (true) {`);
            braceStack.push("loop_forever");
            continue;
        }

        // Handle closing braces
        if (line === "}") {
            const closed = braceStack.pop();
            if (closed === "loop_despite_errors") {
                jsLines.push(`  } catch(e) { print("[LOOP ERROR CONTINUED] " + e.message); }`);
                jsLines.push(`}`);
            } else {
                jsLines.push(`}`);
            }
            continue;
        }

        // General identifier replacements
        // Replace identity `is` with `===`
        line = line.replace(/\s+is\s+/g, " === ");

        // Convert print() call to print wrapper
        // If line is `print(...)` or has `print(...)`
        
        jsLines.push(line);
    }

    // Wrap with helper declarations
    const helpers = `
function at(arr, idx) {
    if (idx < 0) return arr[arr.length + idx];
    return arr[idx];
}
// Stub division by zero to throw actual errors like python
const oldDiv = Number.prototype.toString;
// We can also throw a custom error on division by zero
    `;

    return helpers + "\n" + jsLines.join('\n');
}

// ==========================================
// 4. TRANSLATIONS (BACK AND FORTH)
// ==========================================

// --- Blessed -> Python ---
export function translateBlessedToPython(code: string): string {
    const lines = code.split('\n');
    const pyLines: string[] = [];
    let indent = 0;
    let insideDespiteLoop = false;

    for (let line of lines) {
        let trimmed = line.trim();

        if (trimmed === "") {
            pyLines.push("");
            continue;
        }

        if (trimmed.startsWith("--")) {
            pyLines.push("    ".repeat(indent) + "#" + trimmed.slice(2));
            continue;
        }

        // Variable declarations
        if (trimmed.startsWith("let ")) {
            // Remove let, types, and semicolons
            // let name: Type = val
            let cleaned = trimmed.replace(/^let\s+([a-zA-Z0-9_]+)(?:\s*:\s*[a-zA-Z0-9?\[\]]+)?\s*=\s*(.*)$/, "$1 = $2");
            cleaned = cleaned.replace(/;\s*$/, "");
            cleaned = cleaned.replace(/\bnull\b/g, "None");
            cleaned = cleaned.replace(/\btrue\b/g, "True");
            cleaned = cleaned.replace(/\bfalse\b/g, "False");
            // Null coalescing: a ?? b -> a if a is not None else b
            if (cleaned.includes("??")) {
                cleaned = cleaned.replace(/(.*?)\s*\?\?\s*(.*)/, "$1 if $1 is not None else $2");
            }
            pyLines.push("    ".repeat(indent) + cleaned);
            continue;
        }

        // Curly brace closing
        if (trimmed === "}") {
            indent = Math.max(0, indent - 1);
            if (insideDespiteLoop) {
                // close try/except block
                indent = Math.max(0, indent - 1);
                insideDespiteLoop = false;
            }
            continue;
        }

        // Loops
        // 1. Loop with despite errors
        if (trimmed.startsWith("loop ") && trimmed.includes("despite errors")) {
            const match = trimmed.match(/^loop\s+([a-zA-Z0-9_]+)\s+in\s+(.*?)\s+despite/);
            if (match) {
                const item = match[1];
                const coll = match[2];
                pyLines.push("    ".repeat(indent) + `for ${item} in ${coll}:`);
                indent++;
                pyLines.push("    ".repeat(indent) + `try:`);
                indent++;
                insideDespiteLoop = true;
                continue;
            }
        }
        // 2. Loop in collection
        else if (trimmed.startsWith("loop ") && trimmed.includes(" in ")) {
            const match = trimmed.match(/^loop\s+([a-zA-Z0-9_]+)\s+in\s+(.*?)\s*\{/);
            if (match) {
                const item = match[1];
                const coll = match[2];
                pyLines.push("    ".repeat(indent) + `for ${item} in ${coll}:`);
                indent++;
                continue;
            }
        }
        // 3. Loop condition
        else if (trimmed.startsWith("loop ") && trimmed.endsWith("{")) {
            const match = trimmed.match(/^loop\s+(.*?)\s*\{/);
            if (match) {
                let cond = match[1];
                cond = cond.replace(/\bis\b/g, "is");
                cond = cond.replace(/\bnull\b/g, "None");
                pyLines.push("    ".repeat(indent) + `while ${cond}:`);
                indent++;
                continue;
            }
        }
        // 4. Infinite loop
        else if (trimmed === "loop {") {
            pyLines.push("    ".repeat(indent) + "while True:");
            indent++;
            continue;
        }

        // If Let
        if (trimmed.startsWith("if let ")) {
            const match = trimmed.match(/^if let\s+([a-zA-Z0-9_]+)\s*=\s*(.*?)\s*\{/);
            if (match) {
                const varName = match[1];
                const expr = match[2].replace(/\bnull\b/g, "None");
                pyLines.push("    ".repeat(indent) + `${varName} = ${expr}`);
                pyLines.push("    ".repeat(indent) + `if ${varName} is not None:`);
                indent++;
                continue;
            }
        }

        // If condition
        if (trimmed.startsWith("if ") && trimmed.endsWith("{")) {
            const match = trimmed.match(/^if\s+(.*?)\s*\{/);
            if (match) {
                let cond = match[1];
                cond = cond.replace(/\bis\b/g, "is");
                cond = cond.replace(/\bnull\b/g, "None");
                cond = cond.replace(/\btrue\b/g, "True");
                cond = cond.replace(/\bfalse\b/g, "False");
                pyLines.push("    ".repeat(indent) + `if ${cond}:`);
                indent++;
                continue;
            }
        }

        // Translations inside generic statements
        let cleanedStatement = trimmed;
        cleanedStatement = cleanedStatement.replace(/\bnull\b/g, "None");
        cleanedStatement = cleanedStatement.replace(/\btrue\b/g, "True");
        cleanedStatement = cleanedStatement.replace(/\bfalse\b/g, "False");
        cleanedStatement = cleanedStatement.replace(/\bis\b/g, "is");
        // Slice formatting: fruits[0..2] -> fruits[0:2]
        cleanedStatement = cleanedStatement.replace(/\[\s*(.*?)\s*\.\.\s*(.*?)\s*\]/g, "[$1:$2]");
        // String interpolation: "Hello, ${r}!" -> f"Hello, {r}!"
        if (cleanedStatement.includes("${")) {
            cleanedStatement = "f" + cleanedStatement.replace(/\$\{(.*?)\}/g, "{$1}");
        }

        pyLines.push("    ".repeat(indent) + cleanedStatement);
    }

    // Add exception catch block if there was a despite errors loop that wasn't closed
    if (insideDespiteLoop) {
        indent = Math.max(0, indent - 1);
        pyLines.push("    ".repeat(indent) + "except Exception as e:");
        pyLines.push("    ".repeat(indent + 1) + "print(f'[LOOP ERROR CONTINUED] {e}')");
    }

    return pyLines.join('\n');
}

// --- Python -> Blessed ---
export function translatePythonToBlessed(code: string): string {
    const lines = code.split('\n');
    const blLines: string[] = [];
    const indentStack: number[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed === "") {
            blLines.push("");
            continue;
        }

        const currentIndent = line.length - line.trimStart().length;

        // Check if we decreased indent level
        while (indentStack.length > 0 && currentIndent < indentStack[indentStack.length - 1]) {
            indentStack.pop();
            blLines.push("    ".repeat(indentStack.length) + "}");
        }

        if (trimmed.startsWith("#")) {
            blLines.push("    ".repeat(indentStack.length) + "--" + trimmed.slice(1));
            continue;
        }

        // Handle if statements
        if (trimmed.startsWith("if ") && trimmed.endsWith(":")) {
            let cond = trimmed.slice(3, -1).trim();
            cond = cond.replace(/\bis\s+not\s+None\b/g, "!= null");
            cond = cond.replace(/\bis\s+None\b/g, "== null");
            cond = cond.replace(/\bis\b/g, "is");
            cond = cond.replace(/\bNone\b/g, "null");
            cond = cond.replace(/\bTrue\b/g, "true");
            cond = cond.replace(/\bFalse\b/g, "false");
            
            blLines.push("    ".repeat(indentStack.length) + `if ${cond} {`);
            indentStack.push(currentIndent);
            continue;
        }

        // Handle for loops
        if (trimmed.startsWith("for ") && trimmed.endsWith(":")) {
            const match = trimmed.match(/^for\s+([a-zA-Z0-9_]+)\s+in\s+(.*?)\s*:/);
            if (match) {
                const item = match[1];
                const coll = match[2];
                blLines.push("    ".repeat(indentStack.length) + `loop ${item} in ${coll} {`);
                indentStack.push(currentIndent);
                continue;
            }
        }

        // Handle while loops
        if (trimmed.startsWith("while ") && trimmed.endsWith(":")) {
            let cond = trimmed.slice(6, -1).trim();
            if (cond === "True") {
                blLines.push("    ".repeat(indentStack.length) + `loop {`);
            } else {
                cond = cond.replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false").replace(/\bNone\b/g, "null");
                blLines.push("    ".repeat(indentStack.length) + `loop ${cond} {`);
            }
            indentStack.push(currentIndent);
            continue;
        }

        // Handle assignment
        if (trimmed.includes("=") && !trimmed.startsWith("print") && !trimmed.startsWith("if") && !trimmed.includes("==")) {
            // Check if variable declaration
            const parts = trimmed.split("=");
            const varName = parts[0].trim();
            let val = parts.slice(1).join("=").trim();

            val = val.replace(/\bNone\b/g, "null");
            val = val.replace(/\bTrue\b/g, "true");
            val = val.replace(/\bFalse\b/g, "false");

            // Safe translation of slice from [start:end] to [start..end]
            val = val.replace(/\[\s*(.*?)\s*:\s*(.*?)\s*\]/g, "[$1..$2]");

            // Check if f-string translation: f"Hello {r}" -> "Hello ${r}"
            if (val.startsWith("f\"") || val.startsWith("f'")) {
                val = val.slice(1); // remove f
                val = val.replace(/\{(.*?)\}/g, "${$1}");
            }

            // We output with Blessed's 'let'
            blLines.push("    ".repeat(indentStack.length) + `let ${varName} = ${val}`);
            continue;
        }

        // Handle print
        if (trimmed.startsWith("print(")) {
            let inner = trimmed.slice(6, -1).trim();
            if (inner.startsWith("f\"") || inner.startsWith("f'")) {
                inner = inner.slice(1);
                inner = inner.replace(/\{(.*?)\}/g, "${$1}");
            }
            inner = inner.replace(/\bNone\b/g, "null");
            inner = inner.replace(/\bTrue\b/g, "true");
            inner = inner.replace(/\bFalse\b/g, "false");
            
            blLines.push("    ".repeat(indentStack.length) + `print(${inner})`);
            continue;
        }

        // General statement fallback
        let cleaned = trimmed;
        cleaned = cleaned.replace(/\bNone\b/g, "null");
        cleaned = cleaned.replace(/\bTrue\b/g, "true");
        cleaned = cleaned.replace(/\bFalse\b/g, "false");
        blLines.push("    ".repeat(indentStack.length) + cleaned);
    }

    // Close remaining open indent blocks
    while (indentStack.length > 0) {
        indentStack.pop();
        blLines.push("    ".repeat(indentStack.length) + "}");
    }

    return blLines.join('\n');
}

// --- Blessed -> TypeScript ---
export function translateBlessedToTypeScript(code: string): string {
    const lines = code.split('\n');
    const tsLines: string[] = [];
    let indent = 0;

    for (let line of lines) {
        let trimmed = line.trim();

        if (trimmed === "") {
            tsLines.push("");
            continue;
        }

        if (trimmed.startsWith("--")) {
            tsLines.push("    ".repeat(indent) + "//" + trimmed.slice(2));
            continue;
        }

        // Variable declarations
        // let x: Int = 5 -> let x: number = 5
        // let nick: String? = null -> let nick: string | null = null
        if (trimmed.startsWith("let ")) {
            let decl = trimmed;
            // Map types to JS types
            decl = decl.replace(/:\s*Int\b/g, ": number");
            decl = decl.replace(/:\s*Float\b/g, ": number");
            decl = decl.replace(/:\s*String\b/g, ": string");
            decl = decl.replace(/:\s*Bool\b/g, ": boolean");
            
            // Nullable types: Type? -> Type | null
            decl = decl.replace(/:\s*([a-zA-Z0-9]+)\?\s*=/g, ": $1 | null =");
            
            // Clean up left overs like: `let name: string | null =`
            decl = decl.replace(/:\s*string\?\s*=/g, ": string | null =");
            decl = decl.replace(/:\s*number\?\s*=/g, ": number | null =");
            decl = decl.replace(/:\s*boolean\?\s*=/g, ": boolean | null =");

            // Convert print statements if any inside
            tsLines.push("    ".repeat(indent) + decl);
            continue;
        }

        // Closing braces
        if (trimmed === "}") {
            indent = Math.max(0, indent - 1);
            tsLines.push("    ".repeat(indent) + "}");
            continue;
        }

        // Loops
        // 1. Loop with despite errors
        if (trimmed.startsWith("loop ") && trimmed.includes("despite errors")) {
            const match = trimmed.match(/^loop\s+([a-zA-Z0-9_]+)\s+in\s+(.*?)\s+despite/);
            if (match) {
                const item = match[1];
                const coll = match[2];
                tsLines.push("    ".repeat(indent) + `for (const ${item} of ${coll}) {`);
                indent++;
                tsLines.push("    ".repeat(indent) + `try {`);
                indent++;
                continue;
            }
        }
        // 2. Loop in collection
        else if (trimmed.startsWith("loop ") && trimmed.includes(" in ")) {
            const match = trimmed.match(/^loop\s+([a-zA-Z0-9_]+)\s+in\s+(.*?)\s*\{/);
            if (match) {
                const item = match[1];
                const coll = match[2];
                tsLines.push("    ".repeat(indent) + `for (const ${item} of ${coll}) {`);
                indent++;
                continue;
            }
        }
        // 3. Loop condition
        else if (trimmed.startsWith("loop ") && trimmed.endsWith("{")) {
            const match = trimmed.match(/^loop\s+(.*?)\s*\{/);
            if (match) {
                let cond = match[1];
                cond = cond.replace(/\bis\b/g, "===");
                tsLines.push("    ".repeat(indent) + `while (${cond}) {`);
                indent++;
                continue;
            }
        }
        // 4. Infinite loop
        else if (trimmed === "loop {") {
            tsLines.push("    ".repeat(indent) + "while (true) {");
            indent++;
            continue;
        }

        // If let
        if (trimmed.startsWith("if let ")) {
            const match = trimmed.match(/^if let\s+([a-zA-Z0-9_]+)\s*=\s*(.*?)\s*\{/);
            if (match) {
                const varName = match[1];
                const expr = match[2];
                tsLines.push("    ".repeat(indent) + `const ${varName} = ${expr};`);
                tsLines.push("    ".repeat(indent) + `if (${varName} !== null && ${varName} !== undefined) {`);
                indent++;
                continue;
            }
        }

        // If condition
        if (trimmed.startsWith("if ") && trimmed.endsWith("{")) {
            const match = trimmed.match(/^if\s+(.*?)\s*\{/);
            if (match) {
                let cond = match[1];
                cond = cond.replace(/\bis\b/g, "===");
                tsLines.push("    ".repeat(indent) + `if (${cond}) {`);
                indent++;
                continue;
            }
        }

        // Slice translation
        let cleaned = trimmed;
        cleaned = cleaned.replace(/\[\s*(.*?)\s*\.\.\s*(.*?)\s*\]/g, ".slice($1, $2)");
        
        // Print statement conversion
        cleaned = cleaned.replace(/\bprint\((.*?)\)/g, "console.log($1)");
        
        // Identity check replacement
        cleaned = cleaned.replace(/\bis\b/g, "===");

        tsLines.push("    ".repeat(indent) + cleaned);
    }

    return tsLines.join('\n');
}

// --- TypeScript -> Blessed ---
export function translateTypeScriptToBlessed(code: string): string {
    const lines = code.split('\n');
    const blLines: string[] = [];

    for (let line of lines) {
        let trimmed = line.trim();

        if (trimmed === "") {
            blLines.push("");
            continue;
        }

        if (trimmed.startsWith("//")) {
            blLines.push("--" + trimmed.slice(2));
            continue;
        }

        // Map let/const variables
        // const x: number = 5 -> let x = 5
        if (trimmed.startsWith("const ") || trimmed.startsWith("let ") || trimmed.startsWith("var ")) {
            let decl = trimmed;
            // replace const/var with let
            decl = decl.replace(/^(const|let|var)\s+/, "let ");
            
            // strip type annotations if any
            decl = decl.replace(/:\s*number\b/g, "");
            decl = decl.replace(/:\s*string\b/g, "");
            decl = decl.replace(/:\s*boolean\b/g, "");
            decl = decl.replace(/:\s*[a-zA-Z0-9| |?]+\s*=/g, " ="); // strip more complex unions like `string | null`
            
            blLines.push(decl);
            continue;
        }

        // Handle JS for-of loops
        if (trimmed.startsWith("for ") && trimmed.includes(" of ")) {
            const match = trimmed.match(/^for\s*\(\s*(?:const|let)\s+([a-zA-Z0-9_]+)\s+of\s+(.*?)\s*\)\s*\{/);
            if (match) {
                const item = match[1];
                const coll = match[2];
                blLines.push(`loop ${item} in ${coll} {`);
                continue;
            }
        }

        // Handle JS while loops
        if (trimmed.startsWith("while ") && trimmed.includes("(")) {
            const match = trimmed.match(/^while\s*\(\s*(.*?)\s*\)\s*\{/);
            if (match) {
                let cond = match[1];
                if (cond === "true") {
                    blLines.push(`loop {`);
                } else {
                    cond = cond.replace(/===\s*/g, "is ");
                    cond = cond.replace(/!==\s*/g, "!= ");
                    blLines.push(`loop ${cond} {`);
                }
                continue;
            }
        }

        // console.log -> print
        let cleaned = trimmed;
        cleaned = cleaned.replace(/\bconsole\.log\((.*?)\)/g, "print($1)");
        
        // slice -> .. range (simplified)
        cleaned = cleaned.replace(/\.slice\((.*?),\s*(.*?)\)/g, "[$1..$2]");
        
        // triple equals to is
        cleaned = cleaned.replace(/\s*===\s*/g, " is ");

        blLines.push(cleaned);
    }

    return blLines.join('\n');
}
