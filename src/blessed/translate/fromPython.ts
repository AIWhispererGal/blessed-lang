// Best-effort line-based heuristics. Not a real Python parser.
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

