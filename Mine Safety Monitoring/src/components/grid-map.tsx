/**
 * 2×2 hazard grid: one tile per measuring point, coloured by its own
 * rule-based safety status, or by one parameter's state at that point.
 * Clicking a tile shows that point's full assessment in the safety panel.
 */
import { useState } from "react";
import { Grid2x2 } from "lucide-react";

import type { SafetyAssessment } from "@/lib/safety/assess";
import { formatReading } from "@/lib/safety/format";
import { SafetyStatusBadge } from "./safety-panel";
import { BAND_TEXT, guideRows, type Band } from "./safety-sections";

const STATUS_TILE = {
  UNSAFE: "border-negative/70 bg-negative/20",
  CAUTION: "border-warning/60 bg-warning/15",
  SAFE: "border-positive/60 bg-positive/10",
} as const;

const BAND_TILE: Record<Band, string> = {
  critical: "border-negative/70 bg-negative/25",
  warning: "border-warning/60 bg-warning/20",
  outside: "border-warning/40 bg-warning/10",
  ok: "border-positive/60 bg-positive/10",
  normal: "border-positive/60 bg-positive/10",
  unchecked: "border-border bg-surface-2/40",
};

export function GridMap({
  points,
  selected,
  worst,
  onSelect,
}: {
  points: { id: string; assessment: SafetyAssessment }[];
  selected: number;
  worst: number;
  onSelect: (i: number) => void;
}) {
  const [colorBy, setColorBy] = useState("__status");
  const params = (points[0]?.assessment.parameterGuide ?? []).map(
    (g) => g.name,
  );

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-primary">
          <Grid2x2 className="size-3.5" aria-hidden="true" />
          HAZARD GRID · {points.length} POINTS
        </p>
        <label className="ml-auto flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-muted-foreground">
          COLOUR BY
          <select
            value={colorBy}
            onChange={(e) => setColorBy(e.target.value)}
            className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-foreground"
          >
            <option value="__status">Safety status</option>
            {params.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2" role="list">
        {points.map((p, i) => {
          const rows = guideRows(p.assessment);
          const crit = rows.filter((r) => r.band === "critical").length;
          const warn = rows.filter((r) => r.band === "warning").length;
          const row =
            colorBy === "__status"
              ? null
              : rows.find((r) => r.g.name === colorBy);
          const tone = row
            ? BAND_TILE[row.band]
            : STATUS_TILE[p.assessment.status];
          return (
            <button
              key={p.id}
              role="listitem"
              onClick={() => onSelect(i)}
              aria-pressed={i === selected}
              className={`min-h-28 rounded-sm border-2 p-2.5 text-left transition-shadow ${tone} ${
                i === selected ? "ring-2 ring-primary" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-display text-2xl leading-none text-foreground">
                  {p.id}
                </span>
                <SafetyStatusBadge status={p.assessment.status} size="sm" />
              </div>
              {row ? (
                <p className="mt-2 font-mono text-sm font-semibold text-foreground">
                  {formatReading(row.latest, row.unit)}
                  <span className="block text-[9px] font-normal tracking-wider text-muted-foreground">
                    {row.g.name} · {BAND_TEXT[row.band]}
                  </span>
                </p>
              ) : (
                <p className="mt-2 font-mono text-[11px] text-foreground">
                  {crit} CRITICAL · {warn} WARNING
                </p>
              )}
              <p className="mt-1 font-mono text-[9px] tracking-wider text-muted-foreground">
                {i === worst ? "WORST POINT · " : ""}
                {i === selected ? "SHOWN BELOW" : "CLICK TO VIEW"}
              </p>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Charts and statistics use the average of all points at each timestamp.
        Safety is checked at each point separately, because an average can hide
        a single dangerous point; the safety panel shows the point selected here
        ({points[selected]?.id}).
      </p>
    </div>
  );
}
