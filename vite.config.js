import { defineConfig, loadEnv } from "vite";
import { createDecartClient } from "@decartai/sdk";

// Mints short-lived Decart client tokens so the permanent API key never reaches the browser.
function decartTokenServer(env) {
  const model = env.DECART_MODEL || "lucy-2.6";
  const config = {
    model,
    speed: env.DECART_SPEED || null,
    resolution: env.DECART_RESOLUTION || null,
    selfAnchor: env.DECART_SELF_ANCHOR === "true",
    enhance: env.DECART_ENHANCE === "true",
  };

  const handler = async (req, res, next) => {
    const path = req.url.split("?")[0];
    if (path === "/api/config") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(config));
      return;
    }
    if (path !== "/api/token") return next();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    if (!env.DECART_API_KEY) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "DECART_API_KEY is not set (see .env.example)" }));
      return;
    }
    try {
      const client = createDecartClient({ apiKey: env.DECART_API_KEY });
      const token = await client.tokens.create({ expiresIn: 120, allowedModels: [model] });
      res.end(JSON.stringify({ apiKey: token.apiKey, expiresAt: token.expiresAt }));
    } catch (err) {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: String(err?.message || err) }));
    }
  };

  return {
    name: "decart-token-server",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return {
    plugins: [decartTokenServer(env)],
    // Loopback only: the token endpoint must not be reachable from the LAN.
    server: { host: "127.0.0.1", port: 5173, strictPort: true },
    preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  };
});
