import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publicDomain } from "./site-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);
const publicBasePath = new URL(publicDomain).pathname.replace(/\/$/, "");

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"]
]);

function safePath(urlPath) {
  let decoded = decodeURIComponent(urlPath.split("?")[0]);
  if (publicBasePath && (decoded === publicBasePath || decoded.startsWith(`${publicBasePath}/`))) {
    decoded = decoded.slice(publicBasePath.length) || "/";
  }
  const relative = decoded.replace(/^\/+/, "");
  const resolved = path.resolve(root, relative);
  const fromRoot = path.relative(root, resolved);
  if (fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) return null;
  return resolved;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
    let filePath = safePath(url.pathname);
    if (!filePath) throw new Error("Invalid path");

    let fileStat = await stat(filePath).catch(() => null);
    if (fileStat?.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      fileStat = await stat(filePath).catch(() => null);
    }
    if (!fileStat?.isFile()) throw new Error("Not found");

    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Waterfall Wonder local site: http://127.0.0.1:${port}/`);
});
