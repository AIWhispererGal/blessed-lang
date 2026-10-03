// Best-effort line-based heuristics. Not a real TypeScript parser.
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
