/** Change at build time with VITE_WEBLLM_MODEL (any id from WebLLM's prebuilt model list). */
export const WEBLLM_MODEL: string =
  (import.meta.env["VITE_WEBLLM_MODEL"] as string | undefined) ||
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

/**
 * Smaller model used automatically on phones and tablets that report less
 * than 8 GB of memory (about 0.9 GB instead of 1.6 GB of GPU memory).
 * Change with VITE_WEBLLM_LITE_MODEL; set it to the main model to disable.
 */
export const WEBLLM_LITE_MODEL: string =
  (import.meta.env["VITE_WEBLLM_LITE_MODEL"] as string | undefined) ||
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

/**
 * Context window in tokens. WebLLM's default for Qwen is 4096, too small for
 * a file with many sensors and triggered rules (about 5000 tokens of facts plus
 * the answer). 8192 adds about 120 MB of GPU memory for the 1.5B model.
 */
export const WEBLLM_CONTEXT_TOKENS = 8192;
