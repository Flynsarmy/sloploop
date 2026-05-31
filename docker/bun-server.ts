import { extname, resolve, sep } from "node:path";

const DIST_DIR = "/app/dist";
const PORT = Number(process.env.PORT ?? "80");
const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function getContentType(pathname: string): string {
  return MIME_TYPES[extname(pathname).toLowerCase()] ?? "application/octet-stream";
}

function isImmutableAsset(pathname: string): boolean {
  return /\.(?:css|js|png|jpg|jpeg|gif|svg|ico|woff2?)$/i.test(pathname);
}

async function getFile(pathname: string): Promise<Bun.BunFile | null> {
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const fullPath = resolve(DIST_DIR, `.${normalizedPath}`);

  if (fullPath !== DIST_DIR && !fullPath.startsWith(`${DIST_DIR}${sep}`)) {
    return null;
  }

  const file = Bun.file(fullPath);
  if (await file.exists()) {
    return file;
  }

  return null;
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    const url = new URL(req.url);
    const requestedPath = decodeURIComponent(url.pathname);

    const requestedFile = await getFile(requestedPath);
    const file = requestedFile ?? Bun.file(resolve(DIST_DIR, "index.html"));

    if (!(await file.exists())) {
      return new Response("Not Found", { status: 404 });
    }

    const headers = new Headers({ "Content-Type": getContentType(file.name) });

    if (requestedFile && isImmutableAsset(requestedPath)) {
      headers.set("Cache-Control", `public, max-age=${ONE_WEEK_SECONDS}, immutable`);
    } else {
      headers.set("Cache-Control", "no-cache");
    }

    return new Response(file, {
      headers,
      status: requestedFile ? 200 : 200,
    });
  },
});

console.log(`Serving Sloploop from ${DIST_DIR} on port ${PORT}`);
