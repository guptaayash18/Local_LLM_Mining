import { useRef, useState } from "react";
import {
  Check,
  Clock,
  Download,
  FileJson,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
  X,
} from "lucide-react";

import { downloadText } from "@/lib/report";
import {
  SAFETY_STATUS_LABEL,
  type RuleEvaluation,
  type SafetyAssessment,
  type SafetyStatus,
} from "@/lib/safety/assess";
import {
  VERIFICATION_LABEL,
  type VerificationStatus,
} from "@/lib/safety/config";
import {
  RESULT_TEXT,
  formatReading,
  formatThreshold,
} from "@/lib/safety/format";
import { normalText } from "@/lib/ai/prompts";
import {
  activeConfigJson,
  applySiteFileText,
  clearSiteFile,
  previewSiteFileText,
  setStarterThresholds,
  starterThresholdsJson,
  starterThresholdsOff,
  type ActiveConfig,
} from "@/lib/safety/store";

const SAFETY_STYLES: Record<SafetyStatus, string> = {
  SAFE: "border-positive/60 bg-positive/10 text-positive",
  CAUTION: "border-warning/60 bg-warning/10 text-warning",
  UNSAFE: "border-negative/70 bg-negative/15 text-negative",
};

const ICONS: Record<SafetyStatus, typeof ShieldCheck> = {
  SAFE: ShieldCheck,
  CAUTION: ShieldAlert,
  UNSAFE: ShieldX,
};

/** What each status means, shown next to the label so color is never the only cue. */
const MEANING: Record<SafetyStatus, string> = {
  SAFE: "Every required, verified check passed on current, valid data. Not a certification that the mine is safe.",
  CAUTION:
    "Needs attention: a warning or provisional rule was triggered, the data is stale, missing, invalid or conflicting, or a required threshold is not verified.",
  UNSAFE:
    "A verified critical rule is triggered. Act on the cited regulation or site procedure now.",
};

const RESULT_STYLE: Record<RuleEvaluation["result"], string> = {
  ok: "text-positive",
  warning: "text-warning",
  critical: "text-negative",
  not_evaluated: "text-muted-foreground",
};

const VERIFICATION_STYLE: Record<VerificationStatus, string> = {
  verified_regulatory: "border-positive/50 text-positive",
  verified_site: "border-positive/50 text-positive",
  provisional: "border-warning/50 text-warning",
  requires_verification: "border-border text-muted-foreground",
};

const btn =
  "flex items-center gap-1.5 rounded-sm border border-border bg-surface px-2.5 py-1 font-mono text-[10px] tracking-wider text-foreground transition-colors hover:border-primary/60 disabled:opacity-50";

export function SafetyStatusBadge({
  status,
  size = "md",
}: {
  status: SafetyStatus;
  size?: "sm" | "md";
}) {
  const Icon = ICONS[status];
  return (
    <span
      role="status"
      aria-label={`Safety status: ${SAFETY_STATUS_LABEL[status]}`}
      className={`inline-flex items-center gap-2 rounded-sm border font-mono font-semibold tracking-wider ${SAFETY_STYLES[status]} ${
        size === "md" ? "px-3 py-1.5 text-sm" : "px-1.5 py-0.5 text-[10px]"
      }`}
    >
      <Icon
        className={size === "md" ? "size-5" : "size-3"}
        aria-hidden="true"
      />
      {SAFETY_STATUS_LABEL[status]}
    </span>
  );
}

function VerificationBadge({ status }: { status: VerificationStatus }) {
  return (
    <span
      className={`whitespace-nowrap rounded-sm border px-1 py-0.5 font-mono text-[9px] tracking-wider ${VERIFICATION_STYLE[status]}`}
    >
      {VERIFICATION_LABEL[status]}
    </span>
  );
}

function ageText(min: number | null): string {
  if (min === null) return "unknown age";
  if (min < 1) return "just now";
  if (min < 120) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} days ago`;
}

type Preview = ReturnType<typeof previewSiteFileText>;

type Band = "critical" | "warning" | "ok" | "outside" | "normal" | "unchecked";

const BAND_TEXT: Record<Band, string> = {
  critical: "CRITICAL",
  warning: "WARNING",
  ok: "WITHIN LIMITS",
  outside: "OUTSIDE NORMAL",
  normal: "NORMAL",
  unchecked: "NOT CHECKED",
};

const BAND_STYLE: Record<Band, string> = {
  critical: "border-negative/60 bg-negative/10 text-negative",
  warning: "border-warning/60 bg-warning/10 text-warning",
  ok: "border-positive/50 text-positive",
  outside: "border-warning/50 text-warning",
  normal: "border-positive/50 text-positive",
  unchecked: "border-border text-muted-foreground",
};

function inNormal(
  v: number | boolean | null,
  r: [number | null, number | null] | null,
): boolean | null {
  if (v === null || r === null) return null;
  if (typeof v === "boolean") return !v;
  const [lo, hi] = r;
  return (lo === null || v >= lo) && (hi === null || v <= hi);
}

/**
 * One row per data column: what it means, its normal range, the limits in
 * force and where the latest reading sits. The status column only repeats
 * the rule results; the normal range is information, never a safety verdict.
 */
function ParameterGuide({ assessment }: { assessment: SafetyAssessment }) {
  const guide = assessment.parameterGuide ?? [];
  if (guide.length === 0) return null;
  const rank: Record<Band, number> = {
    critical: 0,
    warning: 1,
    outside: 2,
    ok: 3,
    normal: 4,
    unchecked: 5,
  };
  const rows = guide.map((g) => {
    const evs = assessment.evaluations.filter((e) => e.parameter === g.name);
    const checked = evs.filter((e) => e.result !== "not_evaluated");
    const latest = evs.find((e) => e.latestValue !== null)?.latestValue ?? null;
    const unit = evs[0]?.unit ?? g.unit;
    const worst = checked.some((e) => e.result === "critical")
      ? "critical"
      : checked.some((e) => e.result === "warning")
        ? "warning"
        : checked.length
          ? "ok"
          : null;
    const triggered = checked.filter((e) => e.result === worst);
    const provisionalOnly =
      (worst === "critical" || worst === "warning") &&
      triggered.every((e) => e.verificationStatus === "provisional");
    const normal = inNormal(latest, g.normalRange);
    const band: Band =
      worst === "critical" || worst === "warning"
        ? worst
        : normal === false
          ? "outside"
          : worst === "ok"
            ? "ok"
            : normal === true
              ? "normal"
              : "unchecked";
    const limits = (level: "warning" | "critical") =>
      [
        ...new Set(
          evs
            .filter((e) => e.result !== "not_evaluated")
            .map((e) => formatThreshold(e, level))
            .filter((t) => t !== "—"),
        ),
      ].join(" · ") || "—";
    return { g, unit, latest, band, provisionalOnly, limits };
  });
  rows.sort((a, b) => rank[a.band] - rank[b.band]);

  return (
    <div className="mt-3">
      <p className="font-mono text-[10px] tracking-wider text-primary">
        PARAMETER GUIDE · WHAT EACH READING MEANS AND WHERE IT SITS
      </p>
      {/* Phones: one card per parameter. */}
      <ul className="mt-1 grid gap-2 md:hidden">
        {rows.map(({ g, unit, latest, band, provisionalOnly, limits }) => (
          <li
            key={g.name}
            className="rounded-sm border border-border/70 bg-surface-2/40 p-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[11px] break-words text-foreground">
                  {g.name}
                </p>
                {g.description && (
                  <p className="text-[11px] text-muted-foreground">
                    {g.description}
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-sm border px-1 py-0.5 font-mono text-[9px] tracking-wider ${BAND_STYLE[band]}`}
              >
                {BAND_TEXT[band]}
                {provisionalOnly ? " · PROV." : ""}
              </span>
            </div>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[11px]">
              <dt className="text-muted-foreground">LATEST</dt>
              <dd className="text-right text-foreground">
                {formatReading(latest, unit)}
              </dd>
              <dt className="text-muted-foreground">NORMAL</dt>
              <dd className="text-right text-foreground">
                {g.normalRange ? normalText(g.normalRange, unit, g.type) : "—"}
              </dd>
              <dt className="text-muted-foreground">WARNING</dt>
              <dd className="text-right text-foreground">
                {limits("warning")}
              </dd>
              <dt className="text-muted-foreground">CRITICAL</dt>
              <dd className="text-right text-foreground">
                {limits("critical")}
              </dd>
            </dl>
            {g.guidance && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {g.guidance}
              </p>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-1 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-[11px]">
          <thead>
            <tr className="text-left font-mono text-muted-foreground">
              <th className="pb-1 font-medium tracking-wider">PARAMETER</th>
              <th className="pb-1 font-medium tracking-wider">STATE</th>
              <th className="pb-1 text-right font-medium tracking-wider">
                LATEST
              </th>
              <th className="pb-1 pl-3 font-medium tracking-wider">NORMAL</th>
              <th className="pb-1 font-medium tracking-wider">WARNING</th>
              <th className="pb-1 font-medium tracking-wider">CRITICAL</th>
              <th className="pb-1 pl-2 font-medium tracking-wider">
                WHAT IT MEANS
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ g, unit, latest, band, provisionalOnly, limits }) => (
              <tr key={g.name} className="border-t border-border/60 align-top">
                <td className="py-1.5 pr-2 font-mono">
                  <span className="text-foreground">{g.name}</span>
                  {g.description && (
                    <span className="block text-[10px] text-muted-foreground">
                      {g.description}
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-2">
                  <span
                    className={`whitespace-nowrap rounded-sm border px-1 py-0.5 font-mono text-[9px] tracking-wider ${BAND_STYLE[band]}`}
                  >
                    {BAND_TEXT[band]}
                  </span>
                  {provisionalOnly && (
                    <span className="mt-0.5 block font-mono text-[9px] text-muted-foreground">
                      provisional
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-2 text-right font-mono text-foreground">
                  {formatReading(latest, unit)}
                </td>
                <td className="py-1.5 pr-2 pl-3 font-mono whitespace-nowrap text-muted-foreground">
                  {g.normalRange
                    ? normalText(g.normalRange, unit, g.type)
                    : "—"}
                </td>
                <td className="py-1.5 pr-2 font-mono text-muted-foreground">
                  {limits("warning")}
                </td>
                <td className="py-1.5 pr-2 font-mono text-muted-foreground">
                  {limits("critical")}
                </td>
                <td className="max-w-[26rem] py-1.5 pl-2 leading-relaxed break-words text-muted-foreground">
                  {g.guidance ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SafetyPanel({
  assessment,
  active,
}: {
  assessment: SafetyAssessment;
  active: ActiveConfig;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{
    text: string;
    result: Preview;
    fileName: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { status, rulesSummary: rs } = assessment;
  const dq = active.config.dataQuality;

  const order = { critical: 0, warning: 1, ok: 2, not_evaluated: 3 } as const;
  const rows = [...assessment.evaluations].sort(
    (a, b) => order[a.result] - order[b.result],
  );

  return (
    <div
      className={`mb-4 rounded-md border bg-surface p-4 ${SAFETY_STYLES[status].split(" ")[0]}`}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground">
            SAFETY CLASSIFICATION · RULE-BASED
          </p>
          <div className="mt-1">
            <SafetyStatusBadge status={status} />
          </div>
        </div>
        <p className="min-w-0 flex-1 basis-64 pt-4 text-xs leading-relaxed text-foreground">
          {MEANING[status]}
        </p>
      </div>

      {/* Freshness */}
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] tracking-wide text-foreground">
        <Clock className="size-3.5 text-primary" aria-hidden="true" />
        NEWEST READING: {assessment.latestTimestamp ?? "—"} (
        {ageText(assessment.dataAgeMinutes)})
        <span
          className={`rounded-sm border px-1.5 py-0.5 text-[10px] ${
            assessment.isStale
              ? "border-warning/60 bg-warning/10 text-warning"
              : "border-positive/50 text-positive"
          }`}
        >
          {assessment.isStale
            ? `STALE (LIMIT ${dq.staleAfterMinutes} MIN)`
            : "CURRENT"}
        </span>
        <span className="text-muted-foreground">
          · SAMPLING{" "}
          {assessment.samplingIntervalSeconds
            ? `EVERY ${assessment.samplingIntervalSeconds} S`
            : "UNKNOWN"}
          {dq.expectedSamplingIntervalSeconds
            ? ` (EXPECTED ${dq.expectedSamplingIntervalSeconds} S)`
            : " (INFERRED)"}{" "}
          · WINDOW {dq.evaluationWindowMinutes} MIN
        </span>
      </p>

      {/* Rule summary */}
      <p className="mt-1.5 font-mono text-[10px] leading-relaxed tracking-wide text-muted-foreground">
        RULES: {active.source.toUpperCase()} · {rs.enabled} ENABLED (
        {rs.verifiedRegulatory} VERIFIED REGULATORY, {rs.verifiedSite} VERIFIED
        SITE, {rs.provisional} PROVISIONAL) · {rs.evaluated} CHECKED AGAINST
        THIS FILE · {rs.requiresVerification} AWAITING VERIFICATION
        {active.config.mineContext.degreeOfGassiness
          ? ` · DEGREE ${active.config.mineContext.degreeOfGassiness} GASSY MINE`
          : " · DEGREE OF GASSINESS NOT SET"}
      </p>

      {/* Data quality */}
      {assessment.dataQuality.length > 0 && (
        <div className="mt-3 rounded-sm border border-warning/50 bg-warning/5 p-2.5">
          <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-warning">
            <TriangleAlert className="size-3.5" aria-hidden="true" />
            DATA-QUALITY WARNINGS ({assessment.dataQuality.length})
          </p>
          <ul className="mt-1 grid gap-1 text-xs leading-relaxed text-foreground">
            {assessment.dataQuality.map((q, i) => (
              <li key={i} className="break-words">
                • {q.message}
                {q.blocksSafe && (
                  <span className="ml-1 font-mono text-[9px] text-warning">
                    [PREVENTS SAFE]
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-wider text-primary">
            EVIDENCE
          </p>
          <ul className="mt-1 grid gap-1 text-xs leading-relaxed text-foreground">
            {assessment.reasons.map((r, i) => (
              <li key={i} className="break-words">
                • {r}
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-wider text-primary">
            NEXT ACTIONS (RULE-BASED)
          </p>
          <ul className="mt-1 grid gap-1 text-xs leading-relaxed text-foreground">
            {assessment.nextActions.length === 0 ? (
              <li className="text-muted-foreground">
                No rule-based action required by the configured checks.
              </li>
            ) : (
              assessment.nextActions.map((a, i) => (
                <li key={i} className="break-words">
                  • {a}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <ParameterGuide assessment={assessment} />

      {/* Rule table */}
      <details className="mt-3">
        <summary className="cursor-pointer font-mono text-[10px] tracking-wider text-primary">
          RULE DETAILS ({rows.length} RULES, SOURCES AND VERIFICATION)
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[860px] font-mono text-[11px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1 font-medium tracking-wider">
                  RULE / PARAMETER
                </th>
                <th className="pb-1 font-medium tracking-wider">STATUS</th>
                <th className="pb-1 font-medium tracking-wider">RESULT</th>
                <th className="pb-1 text-right font-medium tracking-wider">
                  LATEST
                </th>
                <th className="pb-1 text-right font-medium tracking-wider">
                  1-HOUR MA
                </th>
                <th className="pb-1 text-right font-medium tracking-wider">
                  WORST
                </th>
                <th className="pb-1 text-right font-medium tracking-wider">
                  WARNING
                </th>
                <th className="pb-1 text-right font-medium tracking-wider">
                  CRITICAL
                </th>
                <th className="pb-1 pl-3 font-medium tracking-wider">SOURCE</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr
                  key={e.ruleId}
                  className="border-t border-border/60 align-top"
                >
                  <td className="py-1.5 pr-2">
                    <span className="text-foreground">{e.parameter}</span>
                    <br />
                    <span className="text-[10px] text-muted-foreground">
                      {e.ruleId}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <VerificationBadge status={e.verificationStatus} />
                  </td>
                  <td
                    className={`py-1.5 pr-2 font-semibold ${RESULT_STYLE[e.result]}`}
                  >
                    {RESULT_TEXT[e.result]}
                    {e.result === "not_evaluated" && e.notEvaluatedReason && (
                      <span className="block max-w-[14rem] text-[10px] font-normal break-words">
                        {e.notEvaluatedReason}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-right text-foreground">
                    {formatReading(e.latestValue, e.unit)}
                  </td>
                  <td className="py-1.5 pr-2 text-right text-foreground">
                    {formatReading(e.movingAvg1h, e.unit)}
                  </td>
                  <td className="py-1.5 pr-2 text-right text-foreground">
                    {formatReading(e.worstValue, e.unit)}
                  </td>
                  <td className="py-1.5 pr-2 text-right text-muted-foreground">
                    {formatThreshold(e, "warning")}
                  </td>
                  <td className="py-1.5 pr-2 text-right text-muted-foreground">
                    {formatThreshold(e, "critical")}
                  </td>
                  <td className="max-w-[18rem] py-1.5 pl-3 break-words text-[10px] text-muted-foreground">
                    {e.sourceUrl ? (
                      <a
                        href={e.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-dotted"
                      >
                        {e.sourceClause}
                      </a>
                    ) : (
                      e.sourceClause
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {assessment.officialCopyCaveat && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Regulatory thresholds come from the Coal Mines Regulations, 2017
          (G.S.R. 1449(E)), checked against a reproduction of the Gazette and an
          independent copy. The official DGMS copy and later amendments were not
          checked; confirm them before relying on these rules
          (docs/safety-sources.md).
        </p>
      )}
      {assessment.unassessedParameters.length > 0 && (
        <p className="mt-1 text-[11px] leading-relaxed break-words text-muted-foreground">
          Not checked by any rule: {assessment.unassessedParameters.join(", ")}.
        </p>
      )}

      {/* Thresholds file */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <button onClick={() => fileRef.current?.click()} className={btn}>
          <FileJson className="size-3.5" />
          LOAD SITE THRESHOLDS (JSON)
        </button>
        {active.site && !active.site.bundled && (
          <button
            onClick={() => {
              clearSiteFile();
              setMessage(
                starterThresholdsOff()
                  ? "Site thresholds removed. Using the built-in rules."
                  : "Site thresholds removed. Using the built-in rules and the starter thresholds.",
              );
            }}
            className={btn}
          >
            <X className="size-3.5" />
            REMOVE SITE FILE
          </button>
        )}
        <button
          onClick={() => {
            const off = starterThresholdsOff();
            setStarterThresholds(off);
            setMessage(
              off
                ? "Starter thresholds switched on."
                : "Starter thresholds switched off. Only the built-in regulation rules (and any site file) apply.",
            );
          }}
          className={btn}
          title="The starter thresholds give every sensor a description, normal range and provisional limits (src/config/site-thresholds.json)"
        >
          {starterThresholdsOff() ? (
            <Check className="size-3.5" />
          ) : (
            <X className="size-3.5" />
          )}
          {starterThresholdsOff()
            ? "USE STARTER THRESHOLDS"
            : "TURN OFF STARTER THRESHOLDS"}
        </button>
        <button
          onClick={() =>
            downloadText(
              "site-thresholds.json",
              starterThresholdsJson(),
              "application/json",
            )
          }
          className={btn}
          title="Download the easy-format thresholds file: edit the numbers, then load it with LOAD SITE THRESHOLDS"
        >
          <Download className="size-3.5" />
          DOWNLOAD EASY TEMPLATE
        </button>
        <button
          onClick={() =>
            downloadText(
              "strata-safety-rules.json",
              activeConfigJson(),
              "application/json",
            )
          }
          className={btn}
          title="Download the active rules as a starting point for a site thresholds file"
        >
          <Download className="size-3.5" />
          EXPORT ACTIVE RULES
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label="Thresholds file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setMessage(null);
            if (file.size > 512 * 1024) {
              setPreview({
                text: "",
                fileName: file.name,
                result: {
                  ok: false,
                  errors: ["The file is too large (max 512 KB)."],
                  warnings: [],
                },
              });
              return;
            }
            const text = await file.text();
            setPreview({
              text,
              fileName: file.name,
              result: previewSiteFileText(text),
            });
          }}
        />
        {message && (
          <p className="w-full font-mono text-[11px] text-positive">
            {message}
          </p>
        )}
        {active.siteError && (
          <p className="w-full font-mono text-[11px] text-negative">
            {active.siteError}
          </p>
        )}
        {active.site && (
          <p className="w-full font-mono text-[10px] text-muted-foreground">
            {active.site.bundled ? "STARTER THRESHOLDS" : "SITE FILE"} "
            {active.site.fileName}" ({active.site.policy.toUpperCase()}):{" "}
            {active.site.added.length} ADDED, {active.site.replaced.length}{" "}
            REPLACED, {active.site.kept.length} BUILT-IN KEPT
            {active.site.removed.length
              ? `, ${active.site.removed.length} BUILT-IN NOT USED`
              : ""}
          </p>
        )}
      </div>

      {preview && (
        <ImportPreview
          preview={preview}
          onCancel={() => setPreview(null)}
          onApply={() => {
            const errors = applySiteFileText(preview.text);
            if (errors) {
              setPreview({
                ...preview,
                result: { ok: false, errors, warnings: [] },
              });
            } else {
              setPreview(null);
              setMessage(`Applied site thresholds from ${preview.fileName}.`);
            }
          }}
        />
      )}
    </div>
  );
}

function ImportPreview({
  preview,
  onApply,
  onCancel,
}: {
  preview: { result: Preview; fileName: string };
  onApply: () => void;
  onCancel: () => void;
}) {
  const r = preview.result;
  return (
    <div
      role="dialog"
      aria-label="Preview site thresholds"
      className="mt-3 rounded-sm border border-primary/50 bg-surface-2 p-3"
    >
      <p className="font-mono text-[11px] font-semibold tracking-wider text-primary">
        PREVIEW: {preview.fileName}
      </p>
      {!r.ok ? (
        <>
          <p className="mt-1 text-xs text-negative">
            This file cannot be applied. The current rules are unchanged.
          </p>
          <ul className="mt-1 grid gap-0.5 text-xs text-negative">
            {r.errors.map((e, i) => (
              <li key={i} className="break-words">
                • {e}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="mt-1 text-xs text-foreground">
            "{r.fileName}" · policy <strong>{r.preview.policy}</strong>:{" "}
            {r.preview.added.length} rule(s) added, {r.preview.replaced.length}{" "}
            replaced, {r.preview.kept.length} built-in kept
            {r.preview.removed.length
              ? `, ${r.preview.removed.length} built-in not used`
              : ""}
            .
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] font-mono text-[10px]">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-1">RULE</th>
                  <th className="pb-1">PARAMETER</th>
                  <th className="pb-1">THRESHOLDS</th>
                  <th className="pb-1">STATUS</th>
                  <th className="pb-1">ENABLED</th>
                </tr>
              </thead>
              <tbody>
                {r.preview.result.rules
                  .filter(
                    (x) =>
                      r.preview.added.includes(x.id) ||
                      r.preview.replaced.includes(x.id),
                  )
                  .map((x) => (
                    <tr key={x.id} className="border-t border-border/60">
                      <td className="py-1 pr-2">
                        {x.id}
                        {r.preview.replaced.includes(x.id) && (
                          <span className="text-warning">
                            {" "}
                            (replaces built-in)
                          </span>
                        )}
                      </td>
                      <td className="py-1 pr-2">{x.parameter}</td>
                      <td className="py-1 pr-2">
                        {x.operator} · W {x.warningThreshold ?? "—"} · C{" "}
                        {x.criticalThreshold ?? "—"} {x.unit}
                      </td>
                      <td className="py-1 pr-2">
                        <VerificationBadge status={x.verificationStatus} />
                      </td>
                      <td className="py-1">{x.enabled ? "yes" : "no"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {r.warnings.length > 0 && (
        <ul className="mt-2 grid gap-0.5 text-[11px] text-warning">
          {r.warnings.map((w, i) => (
            <li key={i} className="break-words">
              • {w}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {r.ok && (
          <button
            onClick={onApply}
            className="flex items-center gap-1.5 rounded-sm bg-primary px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider text-primary-foreground"
          >
            <Check className="size-3.5" />
            APPLY SITE THRESHOLDS
          </button>
        )}
        <button onClick={onCancel} className={btn}>
          <X className="size-3.5" />
          CANCEL
        </button>
      </div>
    </div>
  );
}
