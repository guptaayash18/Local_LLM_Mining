import { createHash } from "node:crypto";

import { getRequest } from "@tanstack/react-start/server";

import { runAnalysis } from "./analyst";
import { loadLocalAiConfig } from "./config.server";
import { OllamaProvider } from "./ollama.server";
import type { LocalInferenceProvider } from "./provider";
import type { AiStatus, AnalyzeResult } from "./types";

/** Swap this factory to plug in another local runtime (llama.cpp, LM Studio, ...). */
export function createProvider(
  env: Record<string, string | undefined> = process.env,
): LocalInferenceProvider {
  return new OllamaProvider(loadLocalAiConfig(env));
}

function requestSignal(): AbortSignal | undefined {
  try {
    return getRequest().signal;
  } catch {
    return undefined;
  }
}

/** Finished reports are kept this long, so a reload or the same file loaded again gets them at once. */
const KEEP_MS = 30 * 60_000;
const runs = new Map<string, { at: number; result: Promise<AnalyzeResult> }>();

/**
 * One analysis per identical request: a second request for the same file
 * (after a reload, or loading it again) joins the run already in progress,
 * or gets its result if it finished in the last 30 minutes. RE-RUN sends a
 * new `rerun` value, so it always starts a fresh analysis. Failed runs are
 * not kept, so they can be retried at once.
 */
/**
 * What makes two requests "the same report": the file's statistics and the
 * safety result, but not the data age, which changes every minute.
 */
function sameFileKey(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const { safety, ...rest } = input as { safety?: Record<string, unknown> };
  if (!safety) return rest;
  return {
    ...rest,
    safety: {
      status: safety["status"],
      triggeredRuleIds: safety["triggeredRuleIds"],
      configName: safety["configName"],
    },
  };
}

export function sharedRun(
  input: unknown,
  start: () => Promise<AnalyzeResult>,
  now = Date.now(),
): Promise<AnalyzeResult> {
  for (const [k, v] of runs) if (now - v.at > KEEP_MS) runs.delete(k);
  const key = createHash("sha256")
    .update(JSON.stringify(sameFileKey(input)))
    .digest("hex");
  const hit = runs.get(key);
  if (hit) return hit.result;
  const result = start();
  runs.set(key, { at: now, result });
  void result.then((r) => {
    if (!r.ok) runs.delete(key);
  });
  return result;
}

/**
 * The browser's connection is deliberately not passed on: the model always
 * finishes the report, even if the page is reloaded or another file loaded.
 * (Only an explicit OLLAMA_TIMEOUT_MS can stop it.)
 */
export function runLocalAnalysis(
  input: unknown,
  options: { provider?: LocalInferenceProvider } = {},
): Promise<AnalyzeResult> {
  if (options.provider)
    return runAnalysis(input, { provider: options.provider });
  return sharedRun(input, () =>
    runAnalysis(input, { provider: () => createProvider() }),
  );
}

export async function getLocalAiStatus(): Promise<AiStatus> {
  try {
    return await createProvider().status(requestSignal());
  } catch (error) {
    return {
      provider: "ollama",
      model: process.env["OLLAMA_MODEL"] ?? "",
      baseUrl: process.env["OLLAMA_BASE_URL"] ?? "",
      reachable: false,
      modelInstalled: false,
      runtimeVersion: null,
      installedModels: [],
      message:
        error instanceof Error ? error.message : "Local AI is not configured.",
      hint: "Check the values in your .env file.",
    };
  }
}
