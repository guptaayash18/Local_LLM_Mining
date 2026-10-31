/**
 * The AI Analyst's prompts, in one place. Both the local Ollama app and the
 * in-browser edition use these. Edit here, not in components.
 */
import type { DatasetProfile } from "@/lib/dataset";
import { SAFETY_STATUS_LABEL } from "@/lib/safety/assess";

/**
 * Fixed system prompt, identical for every file so Ollama can reuse its work
 * on it between runs. Everything file-specific goes in the user message.
 * Wording approved by the project owner (2026-10-31).
 */
export const MINING_SYSTEM_PROMPT = `You are the HazardWatch analyst. You explain one mine sensor log (gases,
temperatures, ventilation, smoke and fire detection) to mining engineers in
plain, easy-to-understand engineering terms.

INPUT
The user message contains: SENSORS (name, unit, meaning, normal range),
THRESHOLDS that were checked, FACTS (trends, ranges, latest values, 1-hour
averages, correlations, outliers) and a SAFETY ASSESSMENT computed by fixed
rules. If FACTS say the values are averages of several measuring points, say
so; the SAFETY ASSESSMENT is then for the one point it names.

RULES
1. Use only the user message. Never invent readings, limits, units,
   locations or causes.
2. Name parameters exactly as written. Keep units and timestamps when you
   quote a number.
3. Copy trend directions exactly: ROSE stays rose, FELL stays fell.
4. Mark explanations as hypotheses: start them with May, Possibly or Could.
   Correlation is not cause.
5. The SAFETY ASSESSMENT status is final. Repeat it exactly and never change
   it. Never say the mine is certified safe or safe to enter.
6. Call a value a breach only if the SAFETY ASSESSMENT lists it. Say that
   PROVISIONAL or REQUIRES VERIFICATION limits are not official limits.
   Quote only the regulation clauses given.
7. A NORMAL range describes typical operation. Being outside it is worth
   mentioning, but it is not a breach.
8. Stale, missing or invalid data and unverified limits are reasons for
   CAUTION; explain them.

WHAT TO COVER
Current conditions and main trends; threshold results; outliers; latest
values that differ from their 1-hour average; data problems; practical
checks for the next shift.

OUTPUT
JSON only:
- headline: one sentence, at most 12 words.
- summary: 2 to 4 sentences on the period and the main movements.
- notes: one item per finding parameter named in the user message,
  {parameter, note}; each note is one sentence without numbers, starting
  with May, Possibly or Could.
- recommendations: 2 to 5 short, concrete checks for the next shift.
- safety_status: the exact status from the SAFETY ASSESSMENT.
- safety_explanation: 1 to 3 sentences explaining that status from its
  evidence.`;

const fmt = (v: number | boolean | null | undefined, unit: string) => {
  if (v === null || v === undefined) return "n/a";
  if (typeof v === "boolean") return v ? "DETECTED" : "not detected";
  return `${Number(v.toPrecision(6))}${unit && unit !== "ratio" && unit !== "index" && unit !== "boolean" ? ` ${unit}` : ""}`;
};

const clip = (t: string, n: number) =>
  t.length > n ? `${t.slice(0, n - 1)}…` : t;

const VERIFICATION_TEXT: Record<string, string> = {
  verified_regulatory: "VERIFIED REGULATORY",
  verified_site: "VERIFIED SITE",
  provisional: "PROVISIONAL",
  requires_verification: "REQUIRES VERIFICATION",
};

function thresholdText(
  e: NonNullable<DatasetProfile["safety"]>["evaluations"][number],
): string {
  if (e.operator === "is_true") return "positive detection";
  if (e.operator === "steady_increase") return "steady increase";
  const op = {
    greater_than: ">",
    greater_than_or_equal: "≥",
    less_than: "<",
    less_than_or_equal: "≤",
  }[e.operator];
  const parts = [];
  if (e.warning !== null) parts.push(`warning ${op} ${fmt(e.warning, e.unit)}`);
  if (e.critical !== null)
    parts.push(`critical ${op} ${fmt(e.critical, e.unit)}`);
  return parts.join(", ") || "no threshold";
}

/** A normal range as text, e.g. "0 to 10 ppm", "at most 0.4", "not detected". */
export function normalText(
  r: [number | null, number | null],
  unit: string,
  type: "number" | "boolean" = "number",
): string {
  if (type === "boolean") return "not detected";
  const u =
    unit && !["ratio", "index", "boolean"].includes(unit) ? ` ${unit}` : "";
  const [lo, hi] = r;
  if (lo !== null && hi !== null)
    return lo === hi ? `${lo}${u}` : `${lo} to ${hi}${u}`;
  if (hi !== null) return `at most ${hi}${u}`;
  if (lo !== null) return `at least ${lo}${u}`;
  return "not stated";
}

/** Sensor names, units and configured thresholds for this file, for the system prompt. */
export function sensorContext(profile: DatasetProfile): string {
  const fields = profile.columns.filter((c) => c.type !== "time");
  const guide = new Map(
    (profile.safety?.parameterGuide ?? []).map((g) => [g.name, g]),
  );
  const ev = (profile.safety?.evaluations ?? []).filter(
    (e) => e.result !== "not_evaluated",
  );
  const flagged = new Set(
    ev
      .filter((e) => e.result === "critical" || e.result === "warning")
      .map((e) => e.parameter),
  );
  const lines = ["", "SENSORS (name, unit: meaning; normal range):"];
  for (const c of fields.slice(0, 40)) {
    const g = guide.get(c.name);
    const unit = c.unit || g?.unit || "unit not stated";
    let line = `- ${c.name} (${unit})`;
    if (g?.description) line += `: ${g.description}`;
    if (g?.normalRange)
      line += `; NORMAL ${normalText(g.normalRange, g.unit, g.type)}`;
    lines.push(line);
  }
  // Background only for the parameters that need explaining (kept short:
  // small local models read long prompts slowly).
  const notes = fields
    .map((c) => guide.get(c.name))
    .filter(
      (g): g is NonNullable<typeof g> => !!g?.guidance && flagged.has(g.name),
    )
    .slice(0, 8);
  if (notes.length) {
    lines.push("", "Background for flagged sensors:");
    for (const g of notes)
      lines.push(`- ${g.name}: ${clip(g.guidance ?? "", 160)}`);
  }
  lines.push(
    "",
    "THRESHOLDS checked for this file (short source; full source in SAFETY ASSESSMENT):",
  );
  if (ev.length === 0) {
    lines.push(
      "- none. No configured threshold could be checked, so no reading can be called a breach.",
    );
  } else {
    for (const e of ev) {
      lines.push(
        `- ${e.parameter}: ${thresholdText(e)} [${VERIFICATION_TEXT[e.verificationStatus]}; ${clip(e.sourceClause, 48)}]`,
      );
    }
  }
  return lines.join("\n");
}

/** The system prompt never depends on the file (see MINING_SYSTEM_PROMPT). */
export function buildSystemPrompt(): string {
  return MINING_SYSTEM_PROMPT;
}

/** The SAFETY ASSESSMENT section of the facts sheet. */
export function safetyFacts(profile: DatasetProfile): string {
  const a = profile.safety;
  if (!a) {
    return "SAFETY ASSESSMENT (rule-based, final):\n- STATUS: CAUTION\n- No rule-based assessment was supplied with this file.";
  }
  const triggered = a.evaluations.filter(
    (e) => e.result === "critical" || e.result === "warning",
  );
  // Reasons that only restate a triggered rule are listed once, below.
  const reasons = a.reasons.filter(
    (r) => !triggered.some((e) => r.includes(`[${e.ruleId},`)),
  );
  const lines = [
    "SAFETY ASSESSMENT (rule-based, final):",
    `- STATUS: ${a.status} (${SAFETY_STATUS_LABEL[a.status]})`,
    `- Newest reading: ${a.latestTimestamp ?? "unknown"}${a.dataAgeMinutes !== null ? ` (${a.dataAgeMinutes} min before this assessment${a.isStale ? ", STALE" : ""})` : ""}`,
    `- Rules: ${a.configName}; ${a.rulesSummary.evaluated} checked, ${a.rulesSummary.enabled} enabled, ${a.rulesSummary.requiresVerification} awaiting verification`,
    ...(reasons.length
      ? ["- Other reasons:", ...reasons.map((r) => `  - ${r}`)]
      : []),
  ];
  if (triggered.length) {
    lines.push("- Triggered rules:");
    for (const e of triggered) {
      lines.push(
        `  - ${e.ruleId} (${VERIFICATION_TEXT[e.verificationStatus]}): ${e.parameter} ${e.result.toUpperCase()}; worst ${fmt(e.worstValue, e.unit)} at ${e.worstAt ?? "n/a"}; ${thresholdText(e)}; source ${clip(e.sourceClause, 110)}`,
      );
    }
  }
  const ok = a.evaluations.filter((e) => e.result === "ok");
  if (ok.length) {
    lines.push("- Checks passed:");
    for (const e of ok) {
      lines.push(
        `  - ${e.parameter}: latest ${fmt(e.latestValue, e.unit)} at ${e.latestAt ?? "n/a"}; 1-hour average ${fmt(e.movingAvg1h, e.unit)}; ${thresholdText(e)}`,
      );
    }
  }
  if (a.dataQuality.length) {
    lines.push(
      "- Data-quality warnings:",
      ...a.dataQuality.map((q) => `  - ${q.message}`),
    );
  }
  if (a.unverifiedRequired.length) {
    lines.push(
      `- Required checks not configured or not verified: ${a.unverifiedRequired.join(", ")}`,
    );
  }
  return lines.join("\n");
}
