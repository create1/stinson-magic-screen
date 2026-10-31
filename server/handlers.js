// Server-side routes shared by the local Vite server and the Vercel function (api/[route].js).
// The Decart API key never leaves this module; the browser only receives short-lived client tokens
// scoped to this site's origin, and only after the passcode has been checked when one is configured.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DECART_API = "https://api.decart.ai";
const COOKIE = "ms_session";
const SESSION_DAYS = 30;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const TOKEN_WINDOW_MS = 10 * 60 * 1000;
const TOKEN_MAX_PER_WINDOW = 40;

// Best-effort, per server instance (each Vercel instance keeps its own counts).
const loginFailures = new Map();
const tokenCounts = new Map();

function settings(env) {
  const gateOff = /^(false|0|off|no)$/i.test(String(env.MAGIC_SCREEN_PASSCODE_ENABLED || "").trim());
  return {
    apiKey: env.DECART_API_KEY || "",
    // Empty means no passcode gate: tokens and credits are served without a session cookie.
    passcode: gateOff ? "" : String(env.MAGIC_SCREEN_PASSCODE || "").trim(),
    model: env.DECART_MODEL || "lucy-2.6",
    speed: env.DECART_SPEED || null,
    // Lucy generates 1280x720. "1080p" asks Decart for a 1080p remote stream; as of Oct 2026 lucy-2.6 ignores it.
    resolution: env.DECART_RESOLUTION === "1080p" ? "1080p" : null,
    selfAnchor: env.DECART_SELF_ANCHOR === "true",
    enhance: env.DECART_ENHANCE === "true",
    liveReference: env.DECART_LIVE_REFERENCE === "true",
    minCredits: Number(env.DECART_MIN_CREDITS || 30),
  };
}

// Sessions are signed with a key derived from the API key and passcode, so changing either logs everyone out.
function signingKey(s) {
  return createHmac("sha256", s.apiKey).update(`magic-screen-session:${s.passcode}`).digest();
}

function sign(s, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", signingKey(s)).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(s, token) {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expected = createHmac("sha256", signingKey(s)).update(body).digest("base64url");
  if (!safeEqual(mac, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((c) => c.trim().split("="))
      .filter(([k]) => k)
      .map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]),
  );
}

function isHttps(req) {
  return req.headers["x-forwarded-proto"] === "https" || !!req.socket?.encrypted;
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

// Tokens are scoped to the site that served the request, never to a caller-supplied Origin header.
function siteOrigin(req) {
  return `${isHttps(req) ? "https" : "http"}://${req.headers["x-forwarded-host"] || req.headers.host}`;
}

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}

function bump(map, key, windowMs) {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now - entry.start > windowMs) {
    map.set(key, { start: now, count: 1 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

function session(s, req) {
  if (!s.passcode) return { open: true };
  return verify(s, cookies(req)[COOKIE]);
}

async function fetchCredits(s) {
  const r = await fetch(`${DECART_API}/v1/credits`, { headers: { "x-api-key": s.apiKey } });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, credits: typeof body.credits === "number" ? body.credits : null };
}

const routes = {
  async config(s, req, res) {
    const { apiKey, passcode, ...publicConfig } = s;
    send(res, 200, publicConfig);
  },

  async session(s, req, res) {
    send(res, 200, { authenticated: !!session(s, req), gated: !!s.passcode, configured: !!s.apiKey });
  },

  async login(s, req, res) {
    if (req.method !== "POST") return send(res, 405, { error: "POST only" });
    if (!s.passcode) return send(res, 200, { ok: true, gated: false });
    if (!s.apiKey) return send(res, 500, { error: "Server is missing DECART_API_KEY" });
    const ip = clientIp(req);
    const failures = loginFailures.get(ip);
    if (failures && Date.now() - failures.start < LOGIN_WINDOW_MS && failures.count >= LOGIN_MAX_FAILURES) {
      return send(res, 429, { error: "Too many attempts. Try again in a few minutes." });
    }
    let passcode = "";
    try {
      passcode = String((await readJson(req)).passcode || "");
    } catch {}
    if (!safeEqual(passcode.trim().toLowerCase(), s.passcode.trim().toLowerCase())) {
      bump(loginFailures, ip, LOGIN_WINDOW_MS);
      await new Promise((r) => setTimeout(r, 600));
      return send(res, 401, { error: "Wrong passcode." });
    }
    loginFailures.delete(ip);
    const maxAge = SESSION_DAYS * 24 * 3600;
    const value = sign(s, { exp: Date.now() + maxAge * 1000, sid: cryptoRandom() });
    const secure = isHttps(req) ? "; Secure" : "";
    send(res, 200, { ok: true }, {
      "Set-Cookie": `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`,
    });
  },

  async logout(s, req, res) {
    send(res, 200, { ok: true }, { "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` });
  },

  async token(s, req, res) {
    if (!session(s, req)) return send(res, 401, { error: "Passcode required." });
    if (!s.apiKey) return send(res, 500, { error: "Server is missing DECART_API_KEY" });
    const site = siteOrigin(req);
    if (req.headers.origin && req.headers.origin !== site) return send(res, 403, { error: "Wrong origin." });
    if (bump(tokenCounts, clientIp(req), TOKEN_WINDOW_MS) > TOKEN_MAX_PER_WINDOW) {
      return send(res, 429, { error: "Too many token requests." });
    }
    // Unreadable balance does not block, matching the browser's own credit check.
    const { credits } = await fetchCredits(s).catch(() => ({ credits: null }));
    if (credits !== null && credits < s.minCredits) {
      return send(res, 402, { error: "Out of Decart credits." });
    }
    const r = await fetch(`${DECART_API}/v1/client/tokens`, {
      method: "POST",
      headers: { "x-api-key": s.apiKey, "content-type": "application/json" },
      body: JSON.stringify({ expiresIn: 120, allowedModels: [s.model], allowedOrigins: [site] }),
    });
    if (!r.ok) return send(res, 502, { error: `Token request failed (${r.status})` });
    const token = await r.json();
    send(res, 200, { apiKey: token.apiKey, expiresAt: token.expiresAt });
  },

  async credits(s, req, res) {
    if (!session(s, req)) return send(res, 401, { error: "Passcode required." });
    const { ok, status, credits } = await fetchCredits(s);
    send(res, ok ? 200 : 502, ok ? { credits } : { error: `Credits request failed (${status})` });
  },
};

function cryptoRandom() {
  return randomBytes(12).toString("base64url");
}

export async function handle(route, req, res, env) {
  const fn = routes[route];
  if (!fn) return send(res, 404, { error: "Not found" });
  try {
    await fn(settings(env), req, res);
  } catch (err) {
    send(res, 500, { error: String(err?.message || err) });
  }
}
