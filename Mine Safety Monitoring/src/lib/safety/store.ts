/**
 * The active safety configuration: the built-in src/config/safety-rules.json,
 * combined with a site thresholds file if one has been applied in this
 * browser (see the merge policy in ./config.ts). Only files that pass
 * validation are stored; an invalid file never replaces the active rules.
 */
import { useSyncExternalStore } from "react";

import starterThresholds from "@/config/site-thresholds.json";

import {
  builtinConfig,
  previewSiteFile,
  type MergePreview,
  type RulesConfig,
} from "./config";

const KEY = "strata-site-thresholds-v2";
/** Set when the person switched the bundled starter thresholds off. */
const OFF_KEY = "strata-starter-thresholds-off";

/**
 * The bundled starter thresholds (src/config/site-thresholds.json, easy
 * format). Applied when no other site file was loaded in this browser. Edit
 * that file to change the defaults for everyone using this build.
 */
export const STARTER_TEXT = JSON.stringify(starterThresholds);

export interface ActiveConfig {
  config: RulesConfig;
  /** Human-readable origin, shown next to the status. */
  source: string;
  site: null | {
    fileName: string;
    /** True when this is the bundled starter file, not one loaded in this browser. */
    bundled: boolean;
    policy: MergePreview["policy"];
    added: string[];
    replaced: string[];
    kept: string[];
    removed: string[];
  };
  /** Set when a stored site file no longer validates (it is then ignored). */
  siteError: string | null;
}

function readStored(key = KEY): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function starterThresholdsOff(): boolean {
  return readStored(OFF_KEY) === "1";
}

function withSite(
  base: RulesConfig,
  text: string,
  bundled: boolean,
): ActiveConfig | { error: string } {
  const res = previewSiteFile(text, base);
  if (!res.ok) return { error: res.errors[0] ?? "invalid file" };
  const { policy, added, replaced, kept, removed, result } = res.preview;
  return {
    config: result,
    source: bundled
      ? `built-in CMR 2017 rules + starter thresholds "${res.fileName}"`
      : `built-in CMR 2017 rules + site file "${res.fileName}" (${policy})`,
    site: {
      fileName: res.fileName,
      bundled,
      policy,
      added,
      replaced,
      kept,
      removed,
    },
    siteError: null,
  };
}

function compute(): ActiveConfig {
  const base = builtinConfig();
  const text = readStored();
  let siteError: string | null = null;
  if (text) {
    const res = withSite(base, text, false);
    if (!("error" in res)) return res;
    siteError = `The saved site thresholds file is no longer valid and was ignored: ${res.error}`;
  }
  if (!starterThresholdsOff()) {
    const res = withSite(base, STARTER_TEXT, true);
    if (!("error" in res)) return { ...res, siteError };
    siteError ??= `The bundled starter thresholds are invalid and were ignored: ${res.error}`;
  }
  return {
    config: base,
    source: "built-in CMR 2017 rules",
    site: null,
    siteError,
  };
}

let cache: ActiveConfig | null = null;
const listeners = new Set<() => void>();

export function getActiveConfig(): ActiveConfig {
  cache ??= compute();
  return cache;
}

function changed() {
  cache = compute();
  for (const l of listeners) l();
}

/** Re-read the stored site file (e.g. after another tab changed it). */
export function reloadActiveConfig() {
  changed();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === OFF_KEY || e.key === null) changed();
  });
}

/** Validate and preview a site file without applying it. */
export function previewSiteFileText(text: string) {
  return previewSiteFile(text, builtinConfig());
}

/** Apply (and remember) a site file. Returns error messages, or null on success. */
export function applySiteFileText(text: string): string[] | null {
  const res = previewSiteFile(text, builtinConfig());
  if (!res.ok) return res.errors;
  try {
    globalThis.localStorage.setItem(KEY, text);
  } catch {
    return ["This browser does not allow saving the thresholds file."];
  }
  changed();
  return null;
}

export function clearSiteFile() {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    /* ignore */
  }
  changed();
}

/** Switch the bundled starter thresholds on or off in this browser. */
export function setStarterThresholds(on: boolean) {
  try {
    if (on) globalThis.localStorage?.removeItem(OFF_KEY);
    else globalThis.localStorage?.setItem(OFF_KEY, "1");
  } catch {
    /* ignore */
  }
  changed();
}

/** The bundled starter thresholds file, pretty-printed (a template to edit). */
export function starterThresholdsJson(): string {
  return JSON.stringify(starterThresholds, null, 2);
}

/** The active rules as a JSON file, usable as a template for a site file. */
export function activeConfigJson(): string {
  const { config } = getActiveConfig();
  return JSON.stringify(
    {
      schemaVersion: 1,
      name: config.name,
      mergePolicy: "replace",
      mineContext: config.mineContext,
      dataQuality: config.dataQuality,
      parameters: config.parameters,
      rules: config.rules,
    },
    null,
    2,
  );
}

// No browser storage on the server, so this is the default: built-in rules
// plus the bundled starter thresholds (same as a fresh browser).
let serverSnapshot: ActiveConfig | null = null;
const getServerSnapshot = () => (serverSnapshot ??= compute());

export function useActiveConfig(): ActiveConfig {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getActiveConfig,
    getServerSnapshot,
  );
}
