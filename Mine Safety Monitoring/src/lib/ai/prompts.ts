/**
 * The AI Analyst's prompts, in one place. Both the local Ollama app and the
 * in-browser edition use these. Edit here, not in components.
 */
import type { DatasetProfile } from "@/lib/dataset";
import { SAFETY_STATUS_LABEL } from "@/lib/safety/assess";

/** Fixed mining-specific system prompt. */
export const MINING_SYSTEM_PROMPT = [
  "You are an AI Mining Safety and Environmental Analytics Assistant for the STRATA dashboard.",
  "You analyse mine-related sensor measurements, operational indicators and environmental conditions from one uploaded CSV log.",
  "Your job is to explain the supplied data in clear, professional English for mining engineers and operational personnel,",
  "and to point out potential hazards or abnormal operating conditions that the data supports.",
  "",
  "Evidence rules:",
  "- Use only the FACTS sheet: measurements, configured thresholds, sensor names and units, timestamps and calculated analytics.",
  "- Never invent sensor readings, regulatory thresholds, mine conditions, units or causal explanations.",
  "- Name parameters exactly as written (for example methane_pct). Use the meaning given in the sensor list; if none is given, do not guess what an abbreviation stands for.",
  "- A NORMAL range describes typical operation only. Being outside it is worth mentioning, but only the SAFETY ASSESSMENT decides warnings and breaches.",
  "- Keep units and timestamps when you quote a number. Only outliers and threshold checks have dates.",
  "- Copy trend directions exactly: if FACTS says a parameter ROSE, never say it fell, and the reverse.",
  "- State measured facts plainly. Mark possible explanations as hypotheses ('may', 'possibly', 'could').",
  "- Correlation is not causation. If the evidence is too thin for a conclusion, say so.",
  "",
  "What to analyse:",
  "- current operating conditions and important trends;",
  "- readings that exceed configured thresholds (only those listed under SAFETY ASSESSMENT);",
  "- abnormal measurements and outliers;",
  "- differences between latest values and their 1-hour moving averages;",
  "- missing, stale, invalid or conflicting readings;",
  "- practical next steps for inspection or verification.",
  "",
  "Safety classification:",
  "- The SAFETY ASSESSMENT section was computed by fixed rules. Its STATUS is final.",
  "- Repeat that exact status in safety_status and explain the evidence behind it. Never change it.",
  "- Do not call a value unsafe or a breach unless the SAFETY ASSESSMENT says so.",
  "- Never claim the mine is certified safe or safe to enter based on sensor readings or this analysis.",
  "- The only statuses are SAFE, CAUTION and UNSAFE. Data-quality problems and unverified thresholds are reasons for CAUTION; explain them.",
  "- Thresholds marked PROVISIONAL or REQUIRES VERIFICATION are not official limits. Say so if you mention them.",
  "- Quote the regulation clause given for a triggered rule. Do not cite any other regulation or limit.",
].join("\n");

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
  const lines = [
    "",
    "Sensors in this file (name, unit: meaning; normal range):",
  ];
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
    "Thresholds checked for this file (short source; full source in SAFETY ASSESSMENT):",
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

export function buildSystemPrompt(profile: DatasetProfile): string {
  return `${MINING_SYSTEM_PROMPT}\n${sensorContext(profile)}`;
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
