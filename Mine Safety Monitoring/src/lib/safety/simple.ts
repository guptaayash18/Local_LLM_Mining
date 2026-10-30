/**
 * The easy thresholds format ("format": "strata-simple-v1").
 *
 * One entry per CSV column, written the way an engineer thinks about it:
 *
 *   "CO_ppm": {
 *     "description": "Carbon monoxide",
 *     "meaning": "First gas to rise in a heating or fire …",
 *     "normal": [0, 10],
 *     "warning": 35,
 *     "critical": 200,
 *     "worseWhen": "higher",
 *     "source": "NIOSH REL 35 ppm TWA; ceiling 200 ppm"
 *   }
 *
 * It is converted to the full rule format (./config.ts) and then validated
 * exactly like any other site file, so every safety guarantee still holds:
 *
 *  - Entries are PROVISIONAL unless they carry a `verified` block, so they can
 *    raise CAUTION but never UNSAFE, and can never make a file SAFE.
 *  - An entry never weakens a verified built-in rule: numbers that repeat a
 *    verified rule are dropped, other numbers are added as an extra check.
 *  - An entry takes over the built-in placeholder for that column (e.g.
 *    "co-site-limit"), keeping its requiredForSafe flag.
 */
import { z } from "zod";

import type { ParameterDef, RulesConfig, SafetyRule } from "./config";
import { UNITS, canConvert, convert } from "./units";

export const SIMPLE_FORMAT = "strata-simple-v1";

const finite = z.number().finite();

const entrySchema = z
  .object({
    description: z.string().min(1).max(200),
    meaning: z.string().max(600).optional(),
    unit: z.enum(UNITS).optional(),
    normal: z.tuple([finite.nullable(), finite.nullable()]).optional(),
    warning: finite.nullable().optional(),
    critical: finite.nullable().optional(),
    /** higher = high readings are bad; lower = low readings are bad;
     *  detected = yes/no alarm; watch = describe only, no check. */
    worseWhen: z
      .enum(["higher", "lower", "detected", "watch"])
      .default("higher"),
    /** Count a reading equal to the limit as a breach (≥ / ≤ instead of > / <). */
    includeLimit: z.boolean().default(false),
    source: z.string().max(400).optional(),
    enabled: z.boolean().default(true),
    /** Fill this in only after checking the numbers against your approved site standard. */
    verified: z
      .object({
        document: z.string().min(3).max(400),
        clause: z.string().min(1).max(300).optional(),
        checkedBy: z.string().min(2).max(200),
        checkedOn: z.string().min(4).max(40),
      })
      .optional(),
  })
  .strict();

const simpleSchema = z
  .object({
    format: z.literal(SIMPLE_FORMAT),
    name: z.string().min(1).max(160),
    about: z.string().max(2000).optional(),
    mine: z
      .object({
        degreeOfGassiness: z
          .union([z.literal(1), z.literal(2), z.literal(3), z.null()])
          .optional(),
        samplingIntervalSeconds: z
          .number()
          .positive()
          .max(86_400)
          .nullable()
          .optional(),
        staleAfterMinutes: z.number().positive().max(10_080).optional(),
        evaluationWindowMinutes: z.number().positive().max(1_440).optional(),
      })
      .strict()
      .optional(),
    parameters: z.record(z.string(), entrySchema),
  })
  .strict();

export type SimpleThresholds = z.input<typeof simpleSchema>;
type Entry = z.output<typeof entrySchema>;

export function isSimpleFormat(json: unknown): boolean {
  return (
    !!json &&
    typeof json === "object" &&
    (json as { format?: unknown }).format === SIMPLE_FORMAT
  );
}

const isVerified = (r: SafetyRule) =>
  r.verificationStatus === "verified_regulatory" ||
  r.verificationStatus === "verified_site";

const ruleId = (name: string) =>
  `site-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`.slice(0, 80);

function fmtRange(e: Entry, unit: string): string {
  const u = unit === "ratio" || unit === "index" ? "" : ` ${unit}`;
  const parts: string[] = [];
  const op =
    e.worseWhen === "lower"
      ? e.includeLimit
        ? "≤"
        : "<"
      : e.includeLimit
        ? "≥"
        : ">";
  if (e.warning != null) parts.push(`warning ${op} ${e.warning}${u}`);
  if (e.critical != null) parts.push(`critical ${op} ${e.critical}${u}`);
  return parts.join(", ");
}

/**
 * Convert the easy format to a full site file (merge policy). Returns the
 * converted object (still to be validated) plus notes for the preview.
 */
export function simpleToFullConfig(
  json: unknown,
  base: RulesConfig,
):
  | { ok: true; config: Record<string, unknown>; notes: string[] }
  | { ok: false; errors: string[] } {
  const parsed = simpleSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues
        .slice(0, 12)
        .map(
          (i) => `${i.path.length ? i.path.join(".") + ": " : ""}${i.message}`,
        ),
    };
  }
  const file = parsed.data;
  const errors: string[] = [];
  const notes: string[] = [];
  const parameters: ParameterDef[] = [];
  const rules: Record<string, unknown>[] = [];
  const registry = new Map(base.parameters.map((p) => [p.name, p]));

  for (const [name, e] of Object.entries(file.parameters)) {
    const where = `parameters.${name}`;
    if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(name)) {
      errors.push(
        `${where}: a column name may only use letters, digits and _.`,
      );
      continue;
    }
    const known = registry.get(name);
    const type = e.worseWhen === "detected" ? "boolean" : "number";
    const unit =
      known?.unit ?? e.unit ?? (type === "boolean" ? "boolean" : undefined);
    if (!unit) {
      errors.push(
        `${where}: a new column needs a "unit" (one of ${UNITS.join(", ")}).`,
      );
      continue;
    }
    if (known && known.type !== type && e.worseWhen !== "watch") {
      errors.push(
        known.type === "boolean"
          ? `${where}: this is a yes/no detection; use "worseWhen": "detected".`
          : `${where}: "detected" is only for yes/no columns; use "higher" or "lower".`,
      );
      continue;
    }
    const ruleUnit = e.unit ?? unit;
    if (type === "number" && !canConvert(ruleUnit, unit)) {
      errors.push(
        `${where}: unit "${ruleUnit}" cannot be converted to ${name}'s unit "${unit}".`,
      );
      continue;
    }

    parameters.push({
      name,
      unit: known?.unit ?? unit,
      type: known?.type ?? type,
      description: e.description,
      ...(e.meaning ? { guidance: e.meaning } : {}),
      ...(type === "boolean" && !e.normal
        ? { normalRange: [null, null] as [null, null] }
        : {}),
      ...(e.normal
        ? {
            normalRange: e.normal.map((v) =>
              v === null || type !== "number" ? v : convert(v, ruleUnit, unit),
            ) as [number | null, number | null],
          }
        : {}),
    });

    if (e.worseWhen === "watch") continue;

    const operator =
      e.worseWhen === "detected"
        ? "is_true"
        : e.worseWhen === "lower"
          ? e.includeLimit
            ? "less_than_or_equal"
            : "less_than"
          : e.includeLimit
            ? "greater_than_or_equal"
            : "greater_than";

    let warning = type === "boolean" ? null : (e.warning ?? null);
    let critical = type === "boolean" ? null : (e.critical ?? null);
    if (type === "number" && warning === null && critical === null) continue;

    // Never duplicate or weaken a verified built-in rule for this column.
    const verified = base.rules.filter(
      (r) =>
        r.enabled &&
        isVerified(r) &&
        r.parameter === name &&
        r.operator === operator &&
        !r.context.gassinessDegree,
    );
    const same = (a: number | null, b: number | null, from: string) =>
      a !== null &&
      b !== null &&
      canConvert(from, ruleUnit) &&
      Math.abs(convert(b, from, ruleUnit) - a) < 1e-9;
    if (type === "boolean") {
      if (verified.length) {
        notes.push(
          `${name}: already checked by verified rule "${verified[0]!.id}"; description added.`,
        );
        continue;
      }
      critical = null;
    } else {
      for (const r of verified) {
        if (same(critical, r.criticalThreshold, r.unit)) critical = null;
        if (same(warning, r.warningThreshold, r.unit)) warning = null;
      }
      if (verified.length && warning === null && critical === null) {
        notes.push(
          `${name}: your numbers match verified rule "${verified[0]!.id}"; description and normal range added.`,
        );
        continue;
      }
    }

    // Take over the built-in placeholder (unverified / provisional) for this column.
    const placeholder = base.rules.find(
      (r) =>
        r.parameter === name &&
        !isVerified(r) &&
        r.operator !== "steady_increase" &&
        !rules.some((x) => x["id"] === r.id),
    );
    const id = placeholder?.id ?? ruleId(name);
    const severity =
      type === "boolean" || critical !== null ? "critical" : "warning";
    const v = e.verified;
    const sourceText = e.source ?? "Starting value in the site thresholds file";
    rules.push({
      id,
      parameter: name,
      unit: type === "boolean" ? "boolean" : ruleUnit,
      operator,
      warningThreshold: warning,
      criticalThreshold: severity === "warning" ? null : critical,
      severity,
      context: {
        location: "any_place",
        note: "From the site thresholds file (easy format).",
      },
      verificationStatus: v ? "verified_site" : "provisional",
      enabled: e.enabled,
      requiredForSafe: placeholder?.requiredForSafe ?? false,
      source: v
        ? {
            document: v.document,
            clause: v.clause ?? sourceText,
            localReference: "site thresholds file",
            verification: {
              method: `Checked against ${v.document}`,
              checkedOn: v.checkedOn,
              officialCopyChecked: true,
              amendmentsChecked: true,
              approvedBy: v.checkedBy,
            },
          }
        : {
            document: sourceText.slice(0, 400),
            clause: sourceText.slice(0, 600),
          },
      explanation: (
        e.meaning ??
        `${e.description}${type === "number" ? ` (${fmtRange(e, ruleUnit)})` : ": alarm when detected"}.`
      ).slice(0, 800),
    });
  }

  if (errors.length) return { ok: false, errors };

  const m = file.mine ?? {};
  const config: Record<string, unknown> = {
    schemaVersion: 1,
    name: file.name,
    mergePolicy: "merge",
    parameters,
    rules,
  };
  if (m.degreeOfGassiness !== undefined)
    config["mineContext"] = { degreeOfGassiness: m.degreeOfGassiness };
  const dq: Record<string, unknown> = {};
  if (m.samplingIntervalSeconds !== undefined)
    dq["expectedSamplingIntervalSeconds"] = m.samplingIntervalSeconds;
  if (m.staleAfterMinutes !== undefined)
    dq["staleAfterMinutes"] = m.staleAfterMinutes;
  if (m.evaluationWindowMinutes !== undefined)
    dq["evaluationWindowMinutes"] = m.evaluationWindowMinutes;
  if (Object.keys(dq).length) config["dataQuality"] = dq;
  return { ok: true, config, notes };
}
