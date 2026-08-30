import "dotenv/config";
import express from "express";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import axios from "axios";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { extractSocialVideo } from "../social-importer";

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // Social media and direct video extraction endpoint
  app.post("/api/import-media", async (req, res) => {
    const { url } = req.body || {};
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "Please provide a valid video link." });
      return;
    }
    try {
      const result = await extractSocialVideo(url);
      const streamUrl = result.url.startsWith("/api/media/")
        ? result.url
        : `/api/proxy-media?url=${encodeURIComponent(result.url)}`;

      res.json({
        success: true,
        streamUrl,
        directUrl: result.url,
        title: result.title,
        platform: result.platform,
        thumbnail: result.thumbnail,
        duration: result.duration,
      });
    } catch (err: unknown) {
      console.error("[import-media error]", err);
      const message = err instanceof Error ? err.message : "Could not import video from this link.";
      res.status(422).json({ error: message });
    }
  });

  // Dedicated local video streaming endpoint with full byte-range seeking & CORS support
  app.get("/api/media/:filename", (req, res) => {
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.join(process.cwd(), "storage/videos", safeFilename);

    if (!fs.existsSync(filePath)) {
      res.status(404).send("Media file not found");
      return;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const ext = path.extname(safeFilename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mov": "video/quicktime",
      ".m4v": "video/mp4",
      ".ogg": "video/ogg",
      ".ogv": "video/ogg",
    };
    const contentType = mimeTypes[ext] || "video/mp4";

    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Range, Content-Type, Accept");
    res.header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges, Content-Type");
    res.header("Cross-Origin-Resource-Policy", "cross-origin");
    res.header("Accept-Ranges", "bytes");

    if (req.method === "HEAD") {
      res.header("Content-Type", contentType);
      res.header("Content-Length", fileSize.toString());
      res.end();
      return;
    }

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.status(416).header("Content-Range", `bytes */${fileSize}`).end();
        return;
      }

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType,
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": contentType,
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });

  // High-performance streaming proxy for social video streams with Range request and CORS support
  app.options("/api/proxy-media", (_req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Range, Content-Type, Accept, Authorization");
    res.header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges, Content-Type");
    res.header("Cross-Origin-Resource-Policy", "cross-origin");
    res.sendStatus(204);
  });

  app.all("/api/proxy-media", async (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Range, Content-Type, Accept, Authorization");
    res.header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges, Content-Type");
    res.header("Cross-Origin-Resource-Policy", "cross-origin");

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    const rawTarget = req.query.url;
    if (!rawTarget || typeof rawTarget !== "string") {
      res.status(400).send("Missing target URL");
      return;
    }

    const targetUrl = decodeURIComponent(rawTarget);

    try {
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
      };

      if (req.headers.range) {
        headers["Range"] = req.headers.range;
      }

      const response = await axios({
        method: req.method === "HEAD" ? "HEAD" : "GET",
        url: targetUrl,
        responseType: req.method === "HEAD" ? undefined : "stream",
        headers,
        timeout: 20000,
        maxRedirects: 8,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      res.status(response.status);

      const copyHeaders = [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
        "last-modified",
        "etag",
        "cache-control",
      ];
      for (const h of copyHeaders) {
        if (response.headers[h]) {
          res.header(h, response.headers[h]);
        }
      }

      if (!response.headers["content-type"]) {
        res.header("Content-Type", "video/mp4");
      }
      if (!response.headers["accept-ranges"]) {
        res.header("Accept-Ranges", "bytes");
      }

      if (req.method === "HEAD") {
        res.end();
        return;
      }

      req.on("close", () => {
        if (response.data && typeof response.data.destroy === "function") {
          response.data.destroy();
        }
      });

      response.data.pipe(res);
    } catch (err: unknown) {
      console.error("[proxy-media error]", err);
      if (!res.headersSent) {
        // As a resilient fallback, redirect directly to the source URL
        res.redirect(302, targetUrl);
      }
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // Serve static files and frontend entry point
  const rootDir = process.cwd();
  app.use(express.static(rootDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(rootDir, "index.html"));
  });

  const port = parseInt(process.env.PORT || "3000", 10);

  server.on("error", (err: unknown) => {
    console.error("[api] Server error:", err);
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[api] server listening on port ${port}`);
  });

  const shutdown = () => {
    console.log("[api] shutting down gracefully...");
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startServer().catch((err) => {
  console.error("[api] Fatal startup error:", err);
  process.exit(1);
});

