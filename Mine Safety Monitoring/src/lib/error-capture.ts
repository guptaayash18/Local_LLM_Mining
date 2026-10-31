// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

// h3's HTTPError serializes to {"status":500,"unhandled":true,"message":"HTTPError"} —
// no stack, no cause — so a plain console.error(error) reaches the log pipeline with
// the failure detail stripped. Expand Error-like args into a string that keeps the
// message, stack, and the full cause chain.
const CAUSE_DEPTH_LIMIT = 5;
const DESCRIPTION_LENGTH_LIMIT = 8_000;

export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < CAUSE_DEPTH_LIMIT && current != null; depth++) {
    if (!(current instanceof Error)) {
      parts.push(
        typeof current === "string" ? current : safeStringify(current),
      );
      break;
    }
    const label = depth === 0 ? "" : "caused by: ";
    const status = describeStatus(current);
    parts.push(
      `${label}${current.stack ?? `${current.name}: ${current.message}`}${status}`,
    );
    current = current.cause;
  }
  return parts.join("\n").slice(0, DESCRIPTION_LENGTH_LIMIT);
}

function describeStatus(error: Error): string {
  const { status, statusCode } = error as {
    status?: unknown;
    statusCode?: unknown;
  };
  const value = status ?? statusCode;
  return typeof value === "number" ? ` (status ${value})` : "";
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function isErrorLike(value: unknown): value is Error {
  return value instanceof Error;
}

// Wrap console.error so errors logged by any layer — including h3's internal
// unhandled-error logging, which this file cannot hook directly — are both
// recorded for consumeLastCapturedError and expanded before serialization.
const originalConsoleError = console.error.bind(console);

/** True for an AbortError, also when wrapped (h3 reports it as a 500 with the AbortError as cause). */
export function isAbortError(error: unknown): boolean {
  for (
    let e = error, d = 0;
    e instanceof Error && d < CAUSE_DEPTH_LIMIT;
    e = e.cause, d++
  )
    // Node reports a closed incoming request as Error("aborted").
    if (e.name === "AbortError" || e.message === "aborted") return true;
  return false;
}

// When the browser stops waiting for a running request (page reloaded, a new
// file loaded, or STOP WAITING), h3 logs an "AbortError … (status 500)" stack.
// That is normal (the report itself keeps running), not a failure: say so in one line, at most
// once every few seconds (h3 logs each cancellation two or three times).
let lastAbortNote = 0;
function noteCancelled() {
  if (Date.now() - lastAbortNote < 5_000) return;
  lastAbortNote = Date.now();
  console.log(
    "[local-ai] the browser stopped waiting (page reloaded, closed or STOP WAITING). Nothing is wrong: the report keeps running and appears when the same file is loaded again.",
  );
}

console.error = (...args: unknown[]) => {
  const abort = args.find(isAbortError);
  if (abort) {
    record(abort); // lets server.ts recognise the follow-up 500 as a cancellation
    return noteCancelled();
  }
  const expanded = args.map((arg) => {
    if (!isErrorLike(arg)) return arg;
    record(arg);
    return describeError(arg);
  });
  originalConsoleError(...expanded);
};

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) =>
    record((event as ErrorEvent).error ?? event),
  );
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
