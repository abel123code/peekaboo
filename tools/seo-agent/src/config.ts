import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function uniquePaths(paths: string[]) {
  return [...new Set(paths.map((candidate) => path.resolve(candidate)))];
}

function ancestorDirs(start: string, limit = 8) {
  const dirs: string[] = [];
  let current = path.resolve(start);
  for (let index = 0; index < limit; index++) {
    dirs.push(current);
    const next = path.dirname(current);
    if (next === current) break;
    current = next;
  }
  return dirs;
}

export function loadEnv(): void {
  const envPaths = uniquePaths([
    path.join(rootDir, ".env"),
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "..", "..", "tools", "seo-agent", ".env"),
    ...ancestorDirs(process.cwd()).flatMap((dir) => [
      path.join(dir, "tools", "seo-agent", ".env"),
      path.join(dir, "apps", "web", ".env")
    ])
  ]);

  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) continue;

    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function hasDataForSeoCredentials(): boolean {
  return Boolean(process.env.DATAFORSEO_USERNAME && process.env.DATAFORSEO_PASSWORD);
}

export function hasUnsplashCredentials(): boolean {
  return Boolean(process.env.UNSPLASH_ACCESS_KEY);
}
