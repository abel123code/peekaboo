#!/usr/bin/env node
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const viewerDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(viewerDir, "..");
const outputsDir = path.join(rootDir, "outputs");
const port = Number(process.env.PORT || 4173);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

async function listRuns() {
  const entries = await fs.readdir(outputsDir, { withFileTypes: true }).catch(() => []);
  const runs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const runDir = path.join(outputsDir, entry.name);
    const finalPath = await findFinalPostPath(runDir);
    try {
      if (!finalPath) continue;
      const stat = await fs.stat(finalPath);
      runs.push({
        id: entry.name,
        updatedAt: stat.mtime.toISOString()
      });
    } catch {
      // Ignore incomplete runs.
    }
  }

  return runs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function findFinalPostPath(runDir) {
  const candidates = [
    path.join(runDir, "09-final-post-packager.json"),
    path.join(runDir, "08-final-post-packager.json"),
    path.join(runDir, "07-final-post-packager.json")
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

async function sendJson(res, value) {
  res.writeHead(200, { "Content-Type": contentTypes[".json"] });
  res.end(JSON.stringify(value, null, 2));
}

async function sendFile(res, filePath) {
  try {
    const ext = path.extname(filePath);
    const content = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
    res.end(content);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return sendError(res, 404, "Not found.");
    }
    throw error;
  }
}

function sendError(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://localhost:${port}`);

    if (url.pathname === "/api/runs") {
      return sendJson(res, { runs: await listRuns() });
    }

    if (url.pathname.startsWith("/api/runs/")) {
      const id = decodeURIComponent(url.pathname.replace("/api/runs/", ""));
      if (id.includes("..") || id.includes("/") || id.includes("\\")) {
        return sendError(res, 400, "Invalid run id.");
      }
      const finalPath = await findFinalPostPath(path.join(outputsDir, id));
      if (!finalPath) return sendError(res, 404, "Final post not found.");
      const content = await fs.readFile(finalPath, "utf8");
      return sendJson(res, JSON.parse(content));
    }

    const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.join(viewerDir, requestedPath);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(viewerDir)) {
      return sendError(res, 403, "Forbidden.");
    }

    return sendFile(res, resolved);
  } catch (error) {
    return sendError(res, 404, error instanceof Error ? error.message : "Not found.");
  }
});

server.listen(port, () => {
  console.log(`SEO post viewer running at http://localhost:${port}`);
  console.log("Press Ctrl+C to stop.");
});
