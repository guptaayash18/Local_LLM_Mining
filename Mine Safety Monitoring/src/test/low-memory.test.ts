// @vitest-environment node
// 8 GB RAM tuning: prompt size, context window, keep-alive.
import { describe, expect, it } from "vitest";

import starter from "@/config/site-thresholds.json";
import {
  buildUserPrompt,
  planFindings,
  profileSchema,
} from "@/lib/ai/insights";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import { loadLocalAiConfig, parseKeepAlive } from "@/lib/ai/config.server";
import { contextFor } from "@/lib/ai/ollama.server";
import { buildProfile } from "@/lib/dataset";
import { assessSafety } from "@/lib/safety/assess";
import { builtinConfig, previewSiteFile } from "@/lib/safety/config";
import { NOW, sensorData } from "./fixtures";

const cfg = (() => {
  const r = previewSiteFile(JSON.stringify(starter), builtinConfig());
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.preview.result;
})();

// A fire-like file: every sensor far outside its normal range (TEST values).
const fire = sensorData({
  n: 60,
  edit: (i) => ({
    CO_ppm: 3200 + i * 7,
    CH4_vol_pct: 3.6,
    O2_vol_pct: 15 - i * 0.01,
    CO2_vol_pct: 8.4,
    H2_ppm: 7800 + i * 4,
    C2H4_ppm: 7 + i * 0.02,
    C2H2_ppm: 0.4 + i * 0.02,
    Coal_Seam_Temp_C: 700 + i * 0.5,
    Airway_Temp_C: 57 + i * 0.13,
    Thermal_IR_Max_C: 338 + i * 0.6,
    Smoke_Obscuration_pct: 35 + i * 0.1,
    YOLO_Flame_Detected: 1,
    YOLO_Smoke_Detected: 1,
  }),
});

describe("prompt for a file with all 18 sensors flagged", () => {
  const a = assessSafety(fire, cfg, { now: NOW });
  const profile = buildProfile(fire, a);
  const system = buildSystemPrompt(profile);
  const user = buildUserPrompt(profile, planFindings(profile));

  it("explains every sensor with its meaning and normal range", () => {
    expect(system).toMatch(
      /- CO_ppm \(ppm\): Carbon monoxide; NORMAL 0 to 10 ppm/,
    );
    expect(system).toMatch(/YOLO_Flame_Detected .*NORMAL not detected/);
    expect(system).toMatch(/Background for flagged sensors:/);
  });

  it("keeps the guide when the server validates the profile", () => {
    const parsed = profileSchema.parse(profile);
    expect(parsed.safety?.parameterGuide).toEqual(
      profile.safety?.parameterGuide,
    );
    expect(parsed.safety?.parameterGuide.length).toBeGreaterThan(10);
    expect(buildSystemPrompt(parsed as typeof profile)).toBe(system);
  });

  it("stays well inside an 8192-token window", () => {
    const chars = system.length + user.length;
    // About 3 characters per token for this kind of text.
    expect(chars / 3 + 1024).toBeLessThan(8192);
  });

  it("does not repeat triggered rules in the reasons list", () => {
    const co = user.split("\n").filter((l) => l.includes("[co-site-limit,"));
    expect(co).toHaveLength(0);
    expect(user).toMatch(/co-site-limit \(PROVISIONAL\): CO_ppm CRITICAL/);
  });
});

describe("Ollama memory settings", () => {
  it("raises the context window only when the prompt would not fit", () => {
    expect(contextFor(12_000, 8192)).toBe(8192);
    expect(contextFor(30_000, 8192)).toBe(11_264);
    expect(contextFor(200_000, 8192)).toBe(16_384);
  });

  it("keeps the model loaded 5 minutes by default; accepts 0 to unload", () => {
    expect(loadLocalAiConfig({}).keepAlive).toBe("5m");
    expect(parseKeepAlive("0")).toBe("0");
    expect(parseKeepAlive("30s")).toBe("30s");
    expect(() => parseKeepAlive("forever")).toThrow(/OLLAMA_KEEP_ALIVE/);
  });
});
