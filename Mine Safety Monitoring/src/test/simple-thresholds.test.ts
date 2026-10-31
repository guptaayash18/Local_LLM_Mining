// @vitest-environment node
// The easy thresholds format ("strata-simple-v1") and the bundled starter file.
import { describe, expect, it } from "vitest";

import starter from "@/config/site-thresholds.json";
import { assessSafety } from "@/lib/safety/assess";
import { builtinConfig, previewSiteFile } from "@/lib/safety/config";
import { sensorData } from "./fixtures";

const base = builtinConfig();
const simple = (parameters: Record<string, unknown>, extra = {}) =>
  JSON.stringify({
    format: "strata-simple-v1",
    name: "TEST easy file",
    parameters,
    ...extra,
  });
const apply = (text: string) => {
  const r = previewSiteFile(text, base);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r;
};
const errorsOf = (text: string) => {
  const r = previewSiteFile(text, base);
  return r.ok ? [] : r.errors;
};

describe("bundled starter thresholds (src/config/site-thresholds.json)", () => {
  const r = apply(JSON.stringify(starter));
  const cfg = r.preview.result;

  it("validates and describes every built-in field", () => {
    for (const p of cfg.parameters) {
      expect(p.description, p.name).toBeTruthy();
      expect(p.guidance, p.name).toBeTruthy();
    }
  });

  it("checks every numeric sensor except barometric pressure (watch only)", () => {
    const checked = new Set(
      cfg.rules.filter((x) => x.enabled).map((x) => x.parameter),
    );
    const unchecked = cfg.parameters
      .map((p) => p.name)
      .filter((n) => !checked.has(n));
    expect(unchecked).toEqual(["Barometric_Pressure_kPa"]);
  });

  it("adds only provisional rules and keeps every verified rule unchanged", () => {
    for (const rule of base.rules.filter(
      (x) => x.verificationStatus === "verified_regulatory",
    )) {
      expect(cfg.rules.find((x) => x.id === rule.id)).toEqual(rule);
    }
    const changed = [...r.preview.added, ...r.preview.replaced];
    for (const id of changed) {
      expect(cfg.rules.find((x) => x.id === id)?.verificationStatus).toBe(
        "provisional",
      );
    }
  });

  it("keeps CO required for SAFE, so starter values alone can never give SAFE", () => {
    const co = cfg.rules.find((x) => x.id === "co-site-limit")!;
    expect(co.requiredForSafe).toBe(true);
    expect(co.verificationStatus).toBe("provisional");
    const a = assessSafety(sensorData(), cfg, { now: Date.now() });
    expect(a.status).not.toBe("SAFE");
  });

  it("puts descriptions and normal ranges into the assessment", () => {
    const a = assessSafety(sensorData(), cfg);
    const co = a.parameterGuide.find((g) => g.name === "CO_ppm")!;
    expect(co.description).toBe("Carbon monoxide");
    expect(co.normalRange).toEqual([0, 10]);
  });
});

describe("easy format conversion", () => {
  it("a provisional breach gives CAUTION, never UNSAFE", () => {
    const cfg = apply(
      simple({
        Coal_Seam_Temp_C: { description: "Seam", warning: 1, critical: 2 },
      }),
    ).preview.result;
    const rule = cfg.rules.find((x) => x.parameter === "Coal_Seam_Temp_C")!;
    expect(rule.id).toBe("coal-seam-temp-monitoring");
    expect(rule.verificationStatus).toBe("provisional");
  });

  it("a verified block makes a verified_site rule", () => {
    const cfg = apply(
      simple({
        CO_ppm: {
          description: "CO",
          warning: 20,
          critical: 40,
          verified: {
            document: "TEST site standard rev 1",
            checkedBy: "TEST officer",
            checkedOn: "2026-10-30",
          },
        },
      }),
    ).preview.result;
    const co = cfg.rules.find((x) => x.id === "co-site-limit")!;
    expect(co.verificationStatus).toBe("verified_site");
    expect(co.requiredForSafe).toBe(true);
    expect(co.source.verification?.approvedBy).toBe("TEST officer");
  });

  it("never duplicates or weakens a verified regulatory rule", () => {
    const r = apply(
      simple({
        CH4_vol_pct: { description: "Methane", warning: 0.8, critical: 1.25 },
        O2_vol_pct: {
          description: "Oxygen",
          warning: 19.5,
          critical: 19,
          worseWhen: "lower",
        },
      }),
    );
    expect(r.preview.added).toEqual(["site-o2-vol-pct"]);
    const o2 = r.preview.result.rules.find((x) => x.id === "site-o2-vol-pct")!;
    expect(o2.severity).toBe("warning");
    expect(o2.criticalThreshold).toBeNull();
    expect(
      r.preview.result.rules.find((x) => x.id === "cmr153-o2-min")
        ?.criticalThreshold,
    ).toBe(19);
  });

  it("a stricter number than the regulation is added as an extra provisional check", () => {
    const r = apply(
      simple({ CH4_vol_pct: { description: "Methane", critical: 1 } }),
    );
    expect(r.preview.added).toEqual(["site-ch4-vol-pct"]);
  });

  it("supports a new column with a unit", () => {
    const r = apply(
      simple({
        Dust_mg_m3_index: {
          description: "Dust index",
          unit: "index",
          normal: [0, 3],
          warning: 5,
          critical: 8,
        },
      }),
    );
    expect(
      r.preview.result.parameters.find((p) => p.name === "Dust_mg_m3_index")
        ?.normalRange,
    ).toEqual([0, 3]);
  });

  it("explains mistakes in plain words", () => {
    expect(
      errorsOf(simple({ New_Sensor: { description: "x", warning: 1 } })),
    ).toEqual([expect.stringMatching(/needs a "unit"/)]);
    expect(
      errorsOf(
        simple({ YOLO_Flame_Detected: { description: "x", warning: 1 } }),
      ),
    ).toEqual([expect.stringMatching(/use "worseWhen": "detected"/)]);
    expect(
      errorsOf(
        simple({ CO_ppm: { description: "x", warning: 50, critical: 10 } }),
      ).join(" "),
    ).toMatch(/warning \(50\) must be below critical \(10\)/);
    expect(
      errorsOf(simple({ CO_ppm: { description: "x", warnig: 5 } })).join(" "),
    ).toMatch(/warnig/);
  });
});
