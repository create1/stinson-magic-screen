import { handle } from "../server/handlers.js";

export default async function handler(req, res) {
  const route = req.query?.route ?? new URL(req.url, "http://x").pathname.split("/").pop();
  await handle(route, req, res, process.env);
}
