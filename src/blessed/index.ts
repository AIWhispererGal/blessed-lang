import { parse } from "./parser";
import { check } from "./checker";
import { run } from "./interpreter";
import { formatSource } from "./formatter";
import { D, formatDiagnostic } from "./diagnostics";
import { emitPython } from "./translate/python";
import { emitTypeScript } from "./translate/typescript";
export { translatePythonToBlessed } from "./translate/fromPython";
export { translateTypeScriptToBlessed } from "./translate/fromTypescript";

export interface FormatterResult { formatted: string; logs: string[] }
export interface AnalysisResult { errors: string[]; warnings: string[] }
export interface ExecutionResult { stdout: string[]; errors: string[]; executionTime: number }

export function formatBlessed(code: string): FormatterResult {
  const r = formatSource(code);
  return { formatted: r.formatted, logs: r.logs.length ? r.logs : [D.formatterClean()] };
}

export function analyzeBlessed(code: string): AnalysisResult {
  const { program, errors } = parse(code);
  if (errors.length) return { errors: errors.map(formatDiagnostic), warnings: [] };
  const diags = check(program);
  return {
    errors: diags.filter(d => d.severity === "error").map(formatDiagnostic),
    warnings: diags.filter(d => d.severity === "warning").map(formatDiagnostic),
  };
}

export function executeBlessed(code: string): ExecutionResult {
  const start = performance.now();
  const { program, errors } = parse(code);
  const compileErrors = errors.length ? errors.map(formatDiagnostic) : check(program).filter(d => d.severity === "error").map(formatDiagnostic);
  if (compileErrors.length) {
    return { stdout: [], errors: [D.compileHeader(), ...compileErrors, "", D.compileFooter()], executionTime: performance.now() - start };
  }
  const r = run(program);
  return { stdout: r.stdout, errors: r.error ? [r.error] : [], executionTime: performance.now() - start };
}

export function translateBlessedToPython(code: string): string {
  const { program, errors } = parse(code);
  if (errors.length) return errors.map(d => `# ${formatDiagnostic(d)}`).join("\n");
  return emitPython(program);
}

export function translateBlessedToTypeScript(code: string): string {
  const { program, errors } = parse(code);
  if (errors.length) return errors.map(d => `// ${formatDiagnostic(d)}`).join("\n");
  return emitTypeScript(program);
}
