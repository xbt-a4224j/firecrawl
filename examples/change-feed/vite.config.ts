import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function readJson(req: NodeJS.ReadableStream): Promise<{ urls?: string[] }> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); }
    });
  });
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "change-feed-api",
      configureServer(server) {
        // POST /api/check {urls} → run the watch server-side; the fc- key never reaches the browser
        server.middlewares.use("/api/check", async (req, res, next) => {
          if (req.method !== "POST") return next();
          res.setHeader("content-type", "application/json");
          const apiKey = process.env.FIRECRAWL_API_KEY;
          if (!apiKey) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "Set FIRECRAWL_API_KEY (a cloud fc- key) before `pnpm dev`." }));
            return;
          }
          try {
            const { urls } = await readJson(req);
            const { default: Firecrawl } = await import("@mendable/firecrawl-js");
            const { watchUrls } = await import("./src/watch");
            const fc = new Firecrawl({ apiKey });
            const remaining = async () => {
              try { const u = (await fc.getCreditUsage()) as { remainingCredits?: number }; return u.remainingCredits ?? null; }
              catch { return null; }
            };
            const scrape = async (url: string, options: Record<string, unknown>) =>
              (await fc.scrape(url, options)) as unknown as Awaited<ReturnType<typeof watchUrls>> extends never ? never : any;
            const before = await remaining();
            const items = await watchUrls(Array.isArray(urls) ? urls : [], { scrape });
            const after = await remaining();
            const credits = before != null && after != null ? { used: before - after, remaining: after } : null;
            res.end(JSON.stringify({ items, credits }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
          }
        });
      },
    },
  ],
});
