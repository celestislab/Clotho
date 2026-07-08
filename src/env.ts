import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Tiny hand-rolled .env loader (no dotenv dependency).
 * Reads KEY=VALUE lines and sets them on process.env without overriding
 * variables that are already present in the real environment.
 */
export function loadEnv(path: string): void {
  try {
    const content = readFileSync(resolve(path), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env not found, rely on real env vars
  }
}

/** Load the standard .env / .env.local pair from the current working directory. */
export function loadDefaultEnv(): void {
  loadEnv(".env");
  loadEnv(".env.local");
}

export function envInt(key: string, def: number): number {
  const v = process.env[key];
  if (!v) return def;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
}

export function envStr(key: string, def: string): string {
  return process.env[key] ?? def;
}
