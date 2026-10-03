export type Severity = "error" | "warning";
export interface Diagnostic { line: number; severity: Severity; message: string }

export function formatDiagnostic(d: Diagnostic): string {
  return d.severity === "error"
    ? `Line ${d.line}: CompileError: ${d.message}`
    : `Line ${d.line}: Warning: ${d.message}`;
}

export const D = {
  // lexer / parser
  unexpectedChar: (c: string) => `Unexpected character '${c}'. BLESSED read the whole alphabet and this was not in it.`,
  unterminatedString: () => `Unterminated string. The quote opened and nothing closed it. Closure matters.`,
  unterminatedInterpolation: () => `Unterminated '\${' in string. Every opening deserves a closing brace.`,
  expected: (what: string, got: string) => `Expected ${what} but found ${got}.`,
  tripleEquals: () => `What is '==='? We only need '==' because it actually checks equality. There is no other kind of equality. We do not have the JS scar here.`,
  positionalRecordArgs: (name: string) => `${name}(...) needs named fields. Positional arguments were always a guessing game. Did you mean: ${name}(field: value)?`,
  letNeedsInit: (name: string) => `'let ${name}' needs a value. A variable with no value is a promise with no plan.`,
  // checker
  undefinedName: (n: string) => `'${n}' is not defined. BLESSED checked everywhere. Twice.`,
  redeclared: (n: string) => `'${n}' is already declared in this scope. One name, one meaning.`,
  constReassign: (n: string) => `'${n}' is SCREAMING_SNAKE, which means constant. It does not change. That is the whole point of screaming.`,
  notBool: (t: string, cond: string) =>
    t === "String" ? `String is not Bool. Did you mean: if ${cond} != ""?`
    : t === "Int" || t === "Float" ? `${t} is not Bool. Did you mean: if ${cond} > 0?`
    : `Condition is ${t}, not Bool. BLESSED is not interested in truthy/falsy load-bearing conventions that were always wrong. Please make it explicit.`,
  cannotAdd: (a: string, b: string, x: string, y: string) => `cannot add ${a} and ${b}. Did you mean: String(${x}) + ${y}? BLESSED will wait. Take your time.`,
  cannotAddToString: (a: string, b: string, x: string, y: string) => `cannot add ${a} and ${b}. Did you mean: ${x} + String(${y})? BLESSED will wait. Take your time.`,
  cannotNegate: (t: string) => `cannot negate ${t}. Only numbers have an opposite.`,
  conversionArg: (conv: string, accepts: string[], got: string) => `${conv}() accepts ${accepts.join(", ")}. ${got} is not on the list.`,
  cannotOperate: (op: string, a: string, b: string) => `cannot apply '${op}' to ${a} and ${b}. We won't guess.`,
  cannotCompare: (a: string, b: string, x: string, y: string) => `${a} ≠ ${b}. We won't guess. Did you mean: ${x} == ${a}(${y})?`,
  complexOrder: () => `Complex numbers have no order. Neither does your argument.`,
  complexMix: (x: string) => `Complex only mixes with Complex. Did you mean: Complex(${x})?`,
  isOnValue: (t: string) => `'is' asks whether two things are the same object. ${t} values are not objects. Did you mean '=='?`,
  mayBeNull: (n: string) => `Variable '${n}' may be null. Handle it first. Did you mean '${n} ?? "default"' or using 'if let'?`,
  nullToNonNullable: (n: string, t: string) => `Variable '${n}' of type '${t}' cannot be null. Declare it as '${t}?' to make it nullable.`,
  typeMismatch: (expected: string, got: string) => `Expected ${expected} but got ${got}. Types are not suggestions.`,
  noField: (rec: string, f: string) => `${rec} has no field '${f}'. Records do not improvise.`,
  missingFields: (rec: string, fs: string[]) => `${rec}(...) is missing ${fs.map(f => `'${f}'`).join(", ")}. Every field, every time.`,
  duplicateField: (f: string) => `Field '${f}' given twice. Once was enough.`,
  immutableRecord: (rec: string) => `${rec} is a record and records do not change. Did you mean: let next = value with { field: newValue }?`,
  notExhaustive: () => `This match does not cover every case. Add '_ ->' or a binding arm. BLESSED does not do surprise endings.`,
  armTypeMismatch: (a: string, b: string) => `Match arms disagree: ${a} vs ${b}. One match, one type.`,
  namedArgsOnFn: (name: string) => `${name} is a function, not a record. Functions take arguments in order. Records take fields by name. Choose one.`,
  missingReturn: (name: string, t: string) => `'${name}' promises ${t} but can finish without returning one. Promises matter.`,
  returnOutsideFn: () => `'return' outside a function. Return to where?`,
  failNotString: (t: string) => `'fail' takes a String message, not ${t}. Say what went wrong in words.`,
  lengthIsProperty: () => `'length' is a property, not a call. It is not doing anything. Just write .length.`,
  noMethod: (t: string, m: string) => `${t} has no method '${m}'. BLESSED looked.`,
  noProperty: (t: string, p: string) => `${t} has no property '${p}'.`,
  wrongArgCount: (name: string, want: number, got: number) => `${name} takes ${want} argument(s), got ${got}. Counting is the one thing we agreed on.`,
  notCallable: (t: string) => `${t} is not callable. You cannot ring a number.`,
  notIndexable: (t: string) => `${t} cannot be indexed.`,
  mapKeyType: (want: string, got: string) => `This map has ${want} keys. ${got} is not one of them.`,
  emptyMapNeedsType: () => `'{}' has no way of knowing what it holds. Annotate it: let m: Map<String, Int> = {}`,
  rangeEndsInt: () => `Range ends must be Int. 0.5..1.5 is not a sequence of anything.`,
  negativeIntPow: () => `Int.pow() with a negative exponent is a fraction. Use Float.`,
  cannotInfer: (n: string) => `Cannot infer the type of parameter '${n}'. Annotate it.`,
  doubleUnderscore: () => `Double underscores on both sides are not a thing. This is Blessed, not Python.`,
  leadingUnderscore: () => `Leading underscores are reserved for the compiler's internal use. Please stick to camelCase.`,
  snakeCase: (from: string, to: string) => `Renamed variable '${from}' to '${to}'. camelCase is the variable convention. You are welcome.`,
  semicolon: () => `Formatter will remove this semicolon. Semicolons are optional. Don't think about it.`,
  // runtime
  divByZero: () => `Division by zero. Int is a count and there is no infinite count.`,
  notANumber: (expr: string) => `${expr} is not a number. We will not pretend it is.`,
  unhashableKey: (t: string) => `Map keys are String or Int. ${t} is neither, and BLESSED is not going to guess what it hashes to.`,
  indexOutOfRange: (i: string, len: number) => `Index ${i} is out of range for a list of length ${len}. Offsets have edges.`,
  rangeTooBig: () => `That range would not fit in anyone's memory. BLESSED will not pretend otherwise.`,
  stepBudget: () => `Execution exceeded 1,000,000 steps. Either the loop is infinite or the universe is. Check the loop first.`,
  recursionLimit: () => `Call depth exceeded 500. The function called itself more times than anyone has called you.`,
  runtimeType: (op: string, a: string, b: string) => `cannot apply '${op}' to ${a} and ${b} at runtime. The types were only knowable now, and now we know.`,
  runtimeUnary: (op: string, t: string) => `cannot apply '${op}' to ${t} at runtime. The type was only knowable now, and now we know.`,
  notBoolRuntime: (t: string) => `Condition is ${t}, not Bool. BLESSED is not interested in truthy/falsy load-bearing conventions that were always wrong. Please make it explicit.`,
  intFromInfinity: () => `Int(Infinity) is not a count. There is no infinite count.`,
  floatFromComplex: () => `Float(z) only works when z.im == 0.0. Did you mean z.re?`,
  // formatter
  semicolonsVaporized: (n: number) => `Semicolon detected and vaporized ${n} time(s). Semicolons are optional and the formatter removes them. Suffer no more.`,
  formatterClean: () => `Formatter finished: Code was already perfectly aligned with the spec.`,
  // execution wrapper
  compileHeader: () => `--- BLESSED COMPILE ERRORS ---`,
  compileFooter: () => `Execution halted because you did not make the obvious correct choices.`,
};
