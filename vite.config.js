import { defineConfig, loadEnv } from "vite";
import { handle } from "./server/handlers.js";

// Serves the same /api routes locally that api/[route].js serves on Vercel.
function localApi(env) {
  const middleware = (req, res, next) => {
    const path = req.url.split("?")[0];
    if (!path.startsWith("/api/")) return next();
    handle(path.slice("/api/".length), req, res, env);
  };
  return {
    name: "magic-screen-local-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return {
    plugins: [localApi(env)],
    server: { host: "127.0.0.1", port: 5173, strictPort: true },
    preview: { host: "127.0.0.1", port: 4173, strictPort: true, allowedHosts: true },
  };
});
