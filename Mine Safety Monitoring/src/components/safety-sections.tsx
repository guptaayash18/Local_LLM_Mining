/**
 * Display building blocks for the safety panel: status scoreboard, rule
 * tiles, grouped findings, prioritised actions and parameter cards with a
 * zone bar. Presentation only: every number and sentence comes from the
 * rule-based assessment (src/lib/safety/assess.ts).
 */
import {
  ClipboardCheck,
  Eye,
  Flame,
  Info,
  ListChecks,
  Settings2,
  ShieldX,
  TriangleAlert,
  Wrench,
} from "lucide-react";

import { normalText } from "@/lib/ai/prompts";
import type {
  ActionKind,
  ParameterGuideEntry,
  RuleEvaluation,
  SafetyAssessment,
} from "@/lib/safety/assess";
import { formatReading, formatThreshold } from "@/lib/safety/format";

/* ============================ Parameter states ============================ */

export type Band =
  "critical" | "warning" | "ok" | "outside" | "normal" | "unchecked";

export const BAND_TEXT: Record<Band, string> = {
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
  ok: "border-positive/50 bg-positive/5 text-positive",
  outside: "border-warning/50 text-warning",
  normal: "border-positive/50 bg-positive/5 text-positive",
  unchecked: "border-border text-muted-foreground",
};

const BAND_EDGE: Record<Band, string> = {
  critical: "border-l-negative",
  warning: "border-l-warning",
  ok: "border-l-positive",
  outside: "border-l-warning/60",
  normal: "border-l-positive",
  unchecked: "border-l-border",
};

const BAND_ORDER: Band[] = [
  "critical",
  "warning",
  "outside",
  "ok",
  "normal",
  "unchecked",
];

export interface GuideRow {
  g: ParameterGuideEntry;
  unit: string;
  latest: number | boolean | null;
  band: Band;
  provisionalOnly: boolean;
  lowerIsWorse: boolean;
  /** A reading equal to a limit counts as a breach (≥ / ≤). */
  inclusive: boolean;
  warning: number | null;
  critical: number | null;
  limits: (level: "warning" | "critical") => string;
}

function inNormal(
  v: number | boolean | null,
  r: [number | null, number | null] | null,
): boolean | null {
  if (v === null || r === null) return null;
  if (typeof v === "boolean") return !v;
  const [lo, hi] = r;
  return (lo === null || v >= lo) && (hi === null || v <= hi);
}

const isBelow = (op: RuleEvaluation["operator"]) =>
  op === "less_than" || op === "less_than_or_equal";

/** One row per data column: where its latest reading sits. */
export function guideRows(a: SafetyAssessment): GuideRow[] {
  return (a.parameterGuide ?? []).map((g) => {
    const evs = a.evaluations.filter((e) => e.parameter === g.name);
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
    const numeric = checked.filter(
      (e) => e.operator !== "is_true" && e.operator !== "steady_increase",
    );
    const lowerIsWorse =
      numeric.length > 0 && numeric.every((e) => isBelow(e.operator));
    // Strictest limits in force, for the zone bar.
    const pick = (vals: (number | null)[]) => {
      const v = vals.filter((x): x is number => x !== null);
      if (!v.length) return null;
      return lowerIsWorse ? Math.max(...v) : Math.min(...v);
    };
    const limits = (level: "warning" | "critical") =>
      [
        ...new Set(
          checked
            .map((e) => formatThreshold(e, level))
            .filter((t) => t !== "—"),
        ),
      ].join(" · ") || "—";
    return {
      g,
      unit,
      latest,
      band,
      provisionalOnly,
      lowerIsWorse,
      inclusive: numeric.some((e) => e.operator.endsWith("or_equal")),
      warning: pick(numeric.map((e) => e.warning)),
      critical: pick(numeric.map((e) => e.critical)),
      limits,
    };
  });
}

export function bandCounts(rows: GuideRow[]): Record<Band, number> {
  const c = Object.fromEntries(BAND_ORDER.map((b) => [b, 0])) as Record<
    Band,
    number
  >;
  for (const r of rows) c[r.band]++;
  return c;
}

/* ============================ Scoreboard ============================ */

export function Scoreboard({ rows }: { rows: GuideRow[] }) {
  const c = bandCounts(rows);
  const items: { band: Band; label: string; n: number }[] = [
    { band: "critical", label: "CRITICAL", n: c.critical },
    { band: "warning", label: "WARNING", n: c.warning },
    { band: "outside", label: "OUTSIDE NORMAL", n: c.outside },
    { band: "ok", label: "OK", n: c.ok + c.normal },
    { band: "unchecked", label: "NOT CHECKED", n: c.unchecked },
  ];
  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-5"
      aria-label="Parameters by state"
    >
      {items.map((i) => (
        <div
          key={i.band}
          className={`rounded-sm border px-2.5 py-1.5 ${i.n ? BAND_STYLE[i.band] : "border-border text-muted-foreground"}`}
        >
          <p className="font-display text-2xl leading-none">{i.n}</p>
          <p className="mt-0.5 font-mono text-[9px] tracking-wider">
            {i.label}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ============================ Rule tiles ============================ */

export function RuleTiles({
  a,
  gassiness,
}: {
  a: SafetyAssessment;
  gassiness: number | null;
}) {
  const rs = a.rulesSummary;
  const tiles: [string, string | number, string?][] = [
    ["ENABLED", rs.enabled],
    ["VERIFIED REGULATORY", rs.verifiedRegulatory, "text-positive"],
    ["VERIFIED SITE", rs.verifiedSite, "text-positive"],
    ["PROVISIONAL", rs.provisional, "text-warning"],
    ["CHECKED AGAINST THIS FILE", rs.evaluated],
    ["AWAITING VERIFICATION", rs.requiresVerification],
    ["DEGREE OF GASSINESS", gassiness ? `DEGREE ${gassiness}` : "NOT SET"],
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-4 lg:grid-cols-7">
      {tiles.map(([label, value, tone]) => (
        <div key={label} className="bg-surface px-2.5 py-1.5">
          <dt className="font-mono text-[9px] tracking-wider text-muted-foreground">
            {label}
          </dt>
          <dd
            className={`font-mono text-sm font-semibold ${tone ?? "text-foreground"}`}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ============================ Findings ============================ */

function FindingRow({ e }: { e: RuleEvaluation }) {
  const level = e.result === "critical" ? "critical" : "warning";
  const provisional = e.verificationStatus === "provisional";
  const when = e.worstAt ? ` at ${e.worstAt}` : "";
  return (
    <li className="border-t border-border/60 py-2 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="flex items-center gap-2">
          <span
            className={`rounded-sm border px-1 py-0.5 font-mono text-[9px] tracking-wider ${BAND_STYLE[level]}`}
          >
            {level.toUpperCase()}
          </span>
          <span className="font-mono text-xs font-semibold text-foreground">
            {e.parameter}
          </span>
        </span>
        <span className="font-mono text-xs text-foreground">
          {formatReading(e.worstValue, e.unit)}
          <span className="text-muted-foreground">
            {" "}
            vs {formatThreshold(e, level)}
          </span>
        </span>
      </div>
      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
        worst{when} · rule {e.ruleId}
        {provisional && (
          <span className="ml-1 text-warning">
            · PROVISIONAL: needs verification, cannot set UNSAFE
          </span>
        )}
      </p>
      <p className="mt-0.5 text-[11px] leading-relaxed break-words text-muted-foreground">
        {e.sourceClause}
      </p>
    </li>
  );
}

function Group({
  title,
  count,
  tone,
  icon: Icon,
  children,
}: {
  title: string;
  count: number;
  tone: string;
  icon: typeof Flame;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <details
      open
      className="rounded-sm border border-border/70 bg-surface-2/30"
    >
      <summary
        className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 font-mono text-[10px] tracking-wider ${tone}`}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {title}
        <span className="ml-auto rounded-sm border border-current/40 px-1.5">
          {count}
        </span>
      </summary>
      <div className="px-2.5 pt-1 pb-2.5">{children}</div>
    </details>
  );
}

export function Findings({ a }: { a: SafetyAssessment }) {
  const triggered = a.evaluations.filter(
    (e) => e.result === "critical" || e.result === "warning",
  );
  const rank = (e: RuleEvaluation) => (e.result === "critical" ? 0 : 1);
  const verified = triggered
    .filter((e) => e.verificationStatus !== "provisional")
    .sort((x, y) => rank(x) - rank(y));
  const provisional = triggered
    .filter((e) => e.verificationStatus === "provisional")
    .sort((x, y) => rank(x) - rank(y));
  // Reasons not already shown as a triggered rule above.
  const other = a.reasons.filter(
    (r) => !triggered.some((e) => r.includes(`[${e.ruleId},`)),
  );
  return (
    <div className="grid gap-2">
      <Group
        title="REGULATION LIMITS BREACHED (VERIFIED)"
        count={verified.length}
        tone="text-negative"
        icon={ShieldX}
      >
        <ul>
          {verified.map((e) => (
            <FindingRow key={e.ruleId} e={e} />
          ))}
        </ul>
      </Group>
      <Group
        title="PROVISIONAL LIMITS EXCEEDED"
        count={provisional.length}
        tone="text-warning"
        icon={TriangleAlert}
      >
        <ul>
          {provisional.map((e) => (
            <FindingRow key={e.ruleId} e={e} />
          ))}
        </ul>
      </Group>
      <Group
        title="DATA, CONFIGURATION AND NOTES"
        count={other.length}
        tone="text-primary"
        icon={Info}
      >
        <ul className="grid gap-1.5">
          {other.map((r, i) => (
            <li
              key={i}
              className="text-[11px] leading-relaxed break-words text-foreground"
            >
              {r}
            </li>
          ))}
        </ul>
      </Group>
      {triggered.length === 0 && other.length === 0 && (
        <p className="text-xs text-muted-foreground">No rule was triggered.</p>
      )}
    </div>
  );
}

/* ============================ Actions ============================ */

const ACTION_GROUPS: {
  kind: ActionKind;
  title: string;
  tone: string;
  icon: typeof Flame;
}[] = [
  { kind: "act_now", title: "ACT NOW", tone: "text-negative", icon: Flame },
  {
    kind: "check_urgently",
    title: "CHECK URGENTLY",
    tone: "text-warning",
    icon: ListChecks,
  },
  {
    kind: "fix_data",
    title: "FIX THE DATA FEED",
    tone: "text-warning",
    icon: Wrench,
  },
  {
    kind: "monitor",
    title: "MONITOR CLOSELY",
    tone: "text-primary",
    icon: Eye,
  },
  {
    kind: "set_up",
    title: "SET UP",
    tone: "text-muted-foreground",
    icon: Settings2,
  },
];

export function Actions({ a }: { a: SafetyAssessment }) {
  const items = a.actionItems ?? [];
  if (items.length === 0)
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ClipboardCheck className="size-3.5" aria-hidden="true" />
        No rule-based action required by the configured checks.
      </p>
    );
  let n = 0;
  return (
    <div className="grid gap-2">
      {ACTION_GROUPS.map((grp) => {
        const list = items.filter((i) => i.kind === grp.kind);
        return (
          <Group
            key={grp.kind}
            title={grp.title}
            count={list.length}
            tone={grp.tone}
            icon={grp.icon}
          >
            <ol className="grid gap-1.5">
              {list.map((i) => (
                <li
                  key={i.text}
                  className="flex gap-2 text-[11px] leading-relaxed"
                >
                  <span className="font-mono text-muted-foreground">
                    {String(++n).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 break-words text-foreground">
                    {i.text}
                  </span>
                </li>
              ))}
            </ol>
          </Group>
        );
      })}
    </div>
  );
}

/* ============================ Zone bar ============================ */

interface Zone {
  label: string;
  from: number | null;
  to: number | null;
  tone: string;
}

const TONE = {
  low: "bg-steel/40",
  ok: "bg-positive/60",
  above: "bg-warning/30",
  warn: "bg-warning/70",
  crit: "bg-negative/70",
};

function zonesFor(r: GuideRow): Zone[] | null {
  if (r.g.type === "boolean")
    return [
      { label: "NOT DETECTED", from: null, to: 0.5, tone: TONE.ok },
      { label: "DETECTED", from: 0.5, to: null, tone: TONE.crit },
    ];
  const [lo, hi] = r.g.normalRange ?? [null, null];
  const w = r.warning;
  const c = r.critical;
  const z: Zone[] = [];
  if (!r.lowerIsWorse) {
    const firstLimit = w ?? c;
    if (lo !== null && lo > 0)
      z.push({ label: "LOW", from: null, to: lo, tone: TONE.low });
    if (hi !== null)
      z.push({ label: "NORMAL", from: lo, to: hi, tone: TONE.ok });
    if (hi !== null && firstLimit !== null && firstLimit > hi)
      z.push({ label: "ELEVATED", from: hi, to: firstLimit, tone: TONE.above });
    if (w !== null)
      z.push({ label: "WARNING", from: w, to: c, tone: TONE.warn });
    if (c !== null)
      z.push({ label: "CRITICAL", from: c, to: null, tone: TONE.crit });
    if (hi !== null && w === null && c === null)
      z.push({ label: "HIGH", from: hi, to: null, tone: TONE.above });
  } else {
    if (c !== null)
      z.push({ label: "CRITICAL", from: null, to: c, tone: TONE.crit });
    if (w !== null)
      z.push({ label: "WARNING", from: c, to: w, tone: TONE.warn });
    const lastLimit = w ?? c;
    if (lo !== null && lastLimit !== null && lo > lastLimit)
      z.push({ label: "LOW", from: lastLimit, to: lo, tone: TONE.above });
    if (lo !== null || hi !== null)
      z.push({
        label: "NORMAL",
        from:
          lo !== null && lastLimit !== null
            ? Math.max(lo, lastLimit)
            : (lo ?? lastLimit),
        to: hi,
        tone: TONE.ok,
      });
    if (hi !== null)
      z.push({ label: "HIGH", from: hi, to: null, tone: TONE.low });
  }
  return z.length >= 2 ? z : null;
}

/** Equal-width zones with a marker for the latest reading. Not to scale. */
function ZoneBar({ r }: { r: GuideRow }) {
  const zones = zonesFor(r);
  if (!zones || r.latest === null) return null;
  const v = typeof r.latest === "boolean" ? (r.latest ? 1 : 0) : r.latest;
  // Which side of a limit a reading equal to it falls on: the worse side.
  const leftClosed = r.lowerIsWorse ? !r.inclusive : r.inclusive;
  let idx = zones.findIndex(
    (z) =>
      (z.from === null || (leftClosed ? v >= z.from : v > z.from)) &&
      (z.to === null || (leftClosed ? v < z.to : v <= z.to)),
  );
  if (idx < 0) idx = v <= (zones[0]!.to ?? v) ? 0 : zones.length - 1;
  const z = zones[idx]!;
  const frac =
    z.from !== null && z.to !== null && z.to > z.from
      ? Math.min(1, Math.max(0, (v - z.from) / (z.to - z.from)))
      : z.from === null
        ? 0.35
        : 0.65;
  const pos = ((idx + frac) / zones.length) * 100;
  return (
    <div className="mt-2" aria-hidden="true">
      <div className="relative flex h-2 gap-px overflow-visible">
        {zones.map((zz) => (
          <div
            key={zz.label}
            className={`h-full flex-1 first:rounded-l-sm last:rounded-r-sm ${zz.tone}`}
          />
        ))}
        <div
          className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded-sm bg-foreground shadow"
          style={{ left: `${pos}%` }}
        />
      </div>
      <div className="mt-0.5 flex gap-px">
        {zones.map((zz) => (
          <span
            key={zz.label}
            className="flex-1 truncate text-center font-mono text-[8px] tracking-wider text-muted-foreground"
          >
            {zz.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ============================ Parameter cards ============================ */

function ParameterCard({ r }: { r: GuideRow }) {
  const { g, unit, latest, band, provisionalOnly, limits } = r;
  return (
    <li
      className={`flex flex-col rounded-sm border border-l-4 border-border/70 bg-surface-2/30 p-2.5 ${BAND_EDGE[band]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-semibold break-words text-foreground">
            {g.name}
          </p>
          {g.description && (
            <p className="text-[11px] leading-snug text-muted-foreground">
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
      <p className="mt-1.5 font-mono text-xl leading-none font-semibold text-foreground">
        {formatReading(latest, unit)}
        <span className="ml-1.5 align-middle font-mono text-[9px] tracking-wider text-muted-foreground">
          LATEST
        </span>
      </p>
      <ZoneBar r={r} />
      <dl className="mt-2 grid grid-cols-3 gap-1 font-mono text-[10px]">
        <div>
          <dt className="text-[9px] tracking-wider text-muted-foreground">
            NORMAL
          </dt>
          <dd className="text-foreground">
            {g.normalRange ? normalText(g.normalRange, unit, g.type) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] tracking-wider text-warning">WARNING</dt>
          <dd className="text-foreground">{limits("warning")}</dd>
        </div>
        <div>
          <dt className="text-[9px] tracking-wider text-negative">CRITICAL</dt>
          <dd className="text-foreground">{limits("critical")}</dd>
        </div>
      </dl>
      {g.guidance && (
        <p className="mt-2 border-t border-border/50 pt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          {g.guidance}
        </p>
      )}
    </li>
  );
}

const GROUP_TITLE: Record<Band, string> = {
  critical: "CRITICAL",
  warning: "WARNING",
  outside: "OUTSIDE NORMAL RANGE",
  ok: "WITHIN LIMITS",
  normal: "NORMAL",
  unchecked: "NOT CHECKED BY ANY RULE",
};

export function ParameterCards({ rows }: { rows: GuideRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="grid gap-3">
      {BAND_ORDER.map((band) => {
        const list = rows.filter((r) => r.band === band);
        if (!list.length) return null;
        return (
          <section key={band} aria-label={GROUP_TITLE[band]}>
            <p
              className={`mb-1.5 font-mono text-[10px] tracking-wider ${BAND_STYLE[band].split(" ").pop()}`}
            >
              {GROUP_TITLE[band]} · {list.length}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((r) => (
                <ParameterCard key={r.g.name} r={r} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
