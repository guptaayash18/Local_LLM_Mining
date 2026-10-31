// @vitest-environment node
// 2×2 grid files: per-timestamp averages for charts, per-point safety.
import { describe, expect, it } from "vitest";

import { buildDataset } from "@/lib/dataset";
import { assessSafety, worstIndex } from "@/lib/safety/assess";
import { builtinConfig } from "@/lib/safety/config";

// TEST values, not real readings.
const csv = [
  "Timestamp,Location,CH4_vol_pct,O2_vol_pct,YOLO_Flame_Detected",
  "2026-10-28T08:58:00Z,P1,0.2,20.8,0",
  "2026-10-28T08:58:00Z,P2,0.4,20.6,0",
  "2026-10-28T08:58:00Z,P3,3.0,16.0,1",
  "2026-10-28T08:58:00Z,P4,0.2,20.8,0",
  "2026-10-28T08:59:00Z,P1,0.2,20.8,0",
  "2026-10-28T08:59:00Z,P2,0.4,20.6,0",
  "2026-10-28T08:59:00Z,P3,3.4,15.6,1",
  "2026-10-28T08:59:00Z,P4,0.2,20.8,0",
].join("\n");

describe("grid file", () => {
  const d = buildDataset(csv, "grid.csv");

  it("averages the points at each timestamp for charts and statistics", () => {
    expect(d.rowCount).toBe(2);
    expect(d.columns.map((c) => c.name)).not.toContain("Location");
    expect(d.rows[0]!["CH4_vol_pct"]).toBeCloseTo(0.95);
    expect(d.rows[1]!["YOLO_Flame_Detected"]).toBeCloseTo(0.25);
    expect(d.sourceText).toBe(csv); // saved runs reload the original file
  });

  it("keeps each point's own readings", () => {
    expect(d.grid?.points.map((p) => p.id)).toEqual(["P1", "P2", "P3", "P4"]);
    expect(d.grid?.points[2]!.dataset.rows[1]!["CH4_vol_pct"]).toBe(3.4);
  });

  it("finds the worst point, which the average would hide", () => {
    const now = Date.parse("2026-10-28T09:00:00Z");
    const list = d.grid!.points.map((p) =>
      assessSafety(p.dataset, builtinConfig(), { now }),
    );
    expect(worstIndex(list)).toBe(2);
    expect(list[2]!.status).toBe("UNSAFE");
    expect(list[0]!.status).not.toBe("UNSAFE");
  });

  it("a file without a location column is unchanged", () => {
    const plain = buildDataset("Timestamp,CO_ppm\n2026-10-28T08:59:00Z,5", "x");
    expect(plain.grid).toBeUndefined();
    expect(plain.rowCount).toBe(1);
  });
});

describe("grid facts for the AI", () => {
  it("says the values are averages and names the assessed point", async () => {
    const { buildProfile } = await import("@/lib/dataset");
    const { buildFactsSheet } = await import("@/lib/ai/insights");
    const d = buildDataset(csv, "grid.csv");
    const facts = buildFactsSheet(buildProfile(d, undefined, "P3"));
    expect(facts).toMatch(
      /VALUES: average of 4 measuring points \(P1, P2, P3, P4\).*point P3/,
    );
  });
});

describe("man-down column from the fall detector", () => {
  it("a detected fall is flagged at its point, with the starter thresholds", async () => {
    const { previewSiteFile } = await import("@/lib/safety/config");
    const starter = (await import("@/config/site-thresholds.json")).default;
    const r = previewSiteFile(JSON.stringify(starter), builtinConfig());
    if (!r.ok) throw new Error(r.errors.join("; "));
    const fileCsv = [
      "Timestamp,Location,O2_vol_pct,Worker_Fall_Detected",
      "2026-10-28T08:59:00Z,P1,20.8,0",
      "2026-10-28T08:59:00Z,P3,20.8,1",
    ].join("\n");
    const now = Date.parse("2026-10-28T09:00:00Z");
    const d = buildDataset(fileCsv, "fall.csv");
    const [p1, p3] = d.grid!.points.map((p) =>
      assessSafety(p.dataset, r.preview.result, { now }),
    );
    const fall = (a: typeof p1) =>
      a!.evaluations.find((e) => e.parameter === "Worker_Fall_Detected");
    expect(fall(p3)?.result).toBe("critical");
    expect(fall(p3)?.verificationStatus).toBe("provisional");
    expect(fall(p1)?.result).toBe("ok");
    expect(
      p3!.parameterGuide.find((g) => g.name === "Worker_Fall_Detected")
        ?.description,
    ).toMatch(/man-down/);
  });
});
