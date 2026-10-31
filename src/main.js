import "@fontsource/cormorant-sc/500.css";
import "./style.css";
import { createDecartClient, models } from "@decartai/sdk";
import { characters as allCharacters } from "./characters.js";

const params = new URLSearchParams(location.search);
// ?seconds=N shortens every slot (testing only); ?start=N begins at roster position N (1-based).
const secondsOverride = Number(params.get("seconds")) || null;
const startPosition = Math.max(1, Number(params.get("start")) || 1);
// ?only=4,2,6 rotates just those roster positions (testing only).
const only = (params.get("only") || "").split(",").map(Number).filter((n) => allCharacters[n - 1]);
const characters = only.length ? only.map((n) => allCharacters[n - 1]) : allCharacters;
const REFERENCE_PREFIX = "Use the reference photo only for the person's face and identity. ";

const FRAME_STALL_MS = 1500;
const SNAPSHOT_EVERY_MS = 500;
const RETRY_MIN_MS = 2000;
const RETRY_MAX_MS = 30000;
const RETRY_TERMINAL_MS = 60000;
const PLATE_SWAP_FALLBACK_MS = 1500;

const $ = (sel) => document.querySelector(sel);
const video = $("#output");
const freeze = $("#freeze");
const freezeCtx = freeze.getContext("2d");
const plates = [...document.querySelectorAll(".plate")];
const startButton = $("#start");
const operator = $("#operator");

const state = {
  config: null,
  decart: null,
  camera: null,
  client: null,
  generation: 0,
  connection: "idle",
  connecting: false,
  retryTimer: null,
  retryDelay: RETRY_MIN_MS,
  started: false,
  index: (startPosition - 1) % characters.length,
  appliedIndex: null,
  lastApplyAt: 0,
  remainingMs: 0,
  timerStarted: false,
  paused: false,
  lastFrameAt: 0,
  lastSnapshotAt: 0,
  activePlate: 0,
  sessionSeconds: 0,
  lastError: null,
  swaps: [],
};
state.remainingMs = slotMs(state.index);

function slotMs(index) {
  return (secondsOverride ?? characters[index].seconds ?? 30) * 1000;
}

function current() {
  return characters[state.index];
}

function log(...args) {
  console.info("[magic-screen]", ...args);
}

// ---------- Nameplate ----------

function preloadCard(index) {
  const img = new Image();
  img.src = characters[index].card;
}

function showPlate(character, immediate = false) {
  const next = immediate ? state.activePlate : 1 - state.activePlate;
  const plate = plates[next];
  plate.querySelector(".thumb").src = character.card;
  plate.querySelector(".name").textContent = character.name;
  if (!immediate) {
    plates[state.activePlate].classList.remove("shown");
    state.activePlate = next;
  }
  plate.classList.add("shown");
  renderOperator();
}

// ---------- Rotation ----------

function isHealthy() {
  return state.connection === "generating" && performance.now() - state.lastFrameAt < FRAME_STALL_MS;
}

function goTo(index) {
  state.index = (index + characters.length) % characters.length;
  state.remainingMs = slotMs(state.index);
  preloadCard((state.index + 1) % characters.length);
  const character = current();
  const sentAt = performance.now();
  let plateShown = false;
  const revealPlate = () => {
    if (plateShown || character !== current()) return;
    plateShown = true;
    showPlate(character);
  };
  setTimeout(revealPlate, PLATE_SWAP_FALLBACK_MS);
  applyPrompt().then((acked) => {
    if (acked) {
      state.swaps.push({ id: character.id, ackMs: Math.round(performance.now() - sentAt), at: Date.now() });
      if (state.swaps.length > 50) state.swaps.shift();
    }
    revealPlate();
  });
}

async function applyPrompt() {
  const client = state.client;
  if (!client || !client.isConnected()) {
    state.appliedIndex = null;
    return false;
  }
  const index = state.index;
  state.appliedIndex = index;
  state.lastApplyAt = performance.now();
  try {
    await client.set(await lucyInput(characters[index]));
    log("prompt applied", characters[index].id);
    return true;
  } catch (err) {
    log("prompt failed; will reapply when healthy", err?.message || err);
    if (client === state.client && state.appliedIndex === index) state.appliedIndex = null;
    return false;
  }
}

let lastTickAt = performance.now();
function tick() {
  const now = performance.now();
  const dt = now - lastTickAt;
  lastTickAt = now;

  const healthy = isHealthy();
  document.body.classList.toggle("frozen", state.timerStarted && !healthy);

  if (healthy && state.appliedIndex !== state.index && state.client && now - state.lastApplyAt > 2000) {
    applyPrompt();
  }

  if (state.timerStarted && healthy && !state.paused) {
    state.remainingMs -= dt;
    if (state.remainingMs <= 0) goTo(state.index + 1);
  }
  renderOperator();
}

// ---------- Video output, first frame, last-good-frame freeze ----------

function onFrame() {
  const now = performance.now();
  if (state.connection === "generating") {
    state.lastFrameAt = now;
    if (!state.timerStarted) {
      state.timerStarted = true;
      document.body.classList.add("live");
      log("first transformed frame; rotation timer started");
    }
    if (now - state.lastSnapshotAt > SNAPSHOT_EVERY_MS && video.videoWidth) {
      if (freeze.width !== video.videoWidth || freeze.height !== video.videoHeight) {
        freeze.width = video.videoWidth;
        freeze.height = video.videoHeight;
      }
      freezeCtx.drawImage(video, 0, 0);
      state.lastSnapshotAt = now;
    }
  }
  video.requestVideoFrameCallback(onFrame);
}
video.requestVideoFrameCallback(onFrame);

function attachStream(stream) {
  if (video.srcObject !== stream) video.srcObject = stream;
  video.play().catch(() => {});
}

// ---------- Lucy input (prompt + optional live reference frame) ----------

const cameraView = document.createElement("video");
cameraView.muted = true;
cameraView.playsInline = true;
const referenceCanvas = document.createElement("canvas");

// A fresh mirrored frame of whoever is in front of the camera, so Lucy anchors to their own face.
async function captureReference() {
  if (!cameraView.videoWidth) return null;
  const w = Math.min(960, cameraView.videoWidth);
  const h = Math.round((w * cameraView.videoHeight) / cameraView.videoWidth);
  referenceCanvas.width = w;
  referenceCanvas.height = h;
  const ctx = referenceCanvas.getContext("2d");
  ctx.setTransform(-1, 0, 0, 1, w, 0);
  ctx.drawImage(cameraView, 0, 0, w, h);
  return new Promise((resolve) => referenceCanvas.toBlob(resolve, "image/jpeg", 0.85));
}

async function lucyInput(character) {
  const enhance = state.config.enhance;
  if (!state.config.liveReference) return { prompt: character.prompt, enhance };
  const image = await captureReference();
  if (!image) return { prompt: character.prompt, enhance };
  return { prompt: REFERENCE_PREFIX + character.prompt, enhance, image };
}

// ---------- Camera + Decart session ----------

async function ensureCamera() {
  const live = state.camera?.getVideoTracks().some((t) => t.readyState === "live");
  if (live) return state.camera;
  state.camera?.getTracks().forEach((t) => t.stop());
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      aspectRatio: { ideal: 16 / 9 },
      frameRate: { ideal: 30 },
    },
  });
  const [track] = stream.getVideoTracks();
  track.addEventListener("ended", () => {
    if (state.camera !== stream) return;
    log("camera dropped");
    state.lastError = "camera dropped";
    scheduleRetry("camera");
  });
  state.camera = stream;
  cameraView.srcObject = stream;
  await cameraView.play().catch(() => {});
  return stream;
}

async function fetchToken() {
  const res = await fetch("/api/token", { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `token request failed (${res.status})`);
  return body.apiKey;
}

async function connect() {
  if (state.connecting || state.client) return;
  state.connecting = true;
  const generation = ++state.generation;
  const isCurrent = () => generation === state.generation;
  try {
    if (!state.config) {
      state.config = await (await fetch("/api/config")).json();
      if (params.has("enhance")) state.config.enhance = params.get("enhance") === "true";
      if (params.has("ref")) state.config.liveReference = params.get("ref") === "true";
      state.decart = createDecartClient({ apiKeyProvider: fetchToken });
    }
    const { model, speed, resolution, selfAnchor } = state.config;
    const camera = await ensureCamera();
    const index = state.index;
    if (state.config.liveReference && !cameraView.videoWidth) {
      await new Promise((r) => cameraView.addEventListener("loadeddata", r, { once: true }));
    }
    const input = await lucyInput(characters[index]);
    const client = await state.decart.realtime.connect(camera, {
      model: models.realtime(model),
      mirror: true,
      initialState: {
        prompt: { text: input.prompt, enhance: input.enhance },
        ...(input.image ? { image: input.image } : {}),
      },
      ...(speed ? { speed } : {}),
      ...(resolution ? { resolution } : {}),
      ...(selfAnchor ? {} : { queryParams: { self_anchor: "false" } }),
      onRemoteStream: (stream) => isCurrent() && attachStream(stream),
      onConnectionChange: (s) => {
        if (!isCurrent()) return;
        state.connection = s;
        log("connection", s);
        if (s === "disconnected" && state.client) scheduleRetry("disconnected");
      },
    });
    if (!isCurrent()) {
      client.disconnect();
      return;
    }
    state.client = client;
    state.connection = client.getConnectionState();
    state.appliedIndex = index;
    state.retryDelay = RETRY_MIN_MS;
    client.on("generationTick", ({ seconds }) => {
      state.sessionSeconds = seconds;
    });
    client.on("error", (err) => {
      if (!isCurrent()) return;
      state.lastError = `${err.code || "error"}: ${err.message}`;
      log("sdk error", state.lastError);
    });
    client.on("sessionEnded", ({ reason }) => {
      if (!isCurrent()) return;
      state.lastError = `session ended: ${reason}`;
      log(state.lastError);
      const terminal = ["insufficient_credits", "session_limit", "policy_violation"].includes(reason);
      scheduleRetry(reason, terminal ? RETRY_TERMINAL_MS : undefined);
    });
    log("connected", client.sessionId, model);
  } catch (err) {
    state.lastError = String(err?.message || err);
    log("connect failed", state.lastError);
    if (isCurrent()) {
      state.connecting = false;
      scheduleRetry("connect failed");
    }
  } finally {
    if (isCurrent()) state.connecting = false;
  }
}

function scheduleRetry(reason, delay) {
  if (state.retryTimer) return;
  state.generation++;
  const old = state.client;
  state.client = null;
  state.connecting = false;
  state.connection = "reconnecting";
  state.appliedIndex = null;
  try {
    old?.disconnect();
  } catch {}
  const wait = delay ?? state.retryDelay;
  state.retryDelay = Math.min(state.retryDelay * 2, RETRY_MAX_MS);
  log(`retrying in ${wait}ms (${reason}); holding ${current().id}`);
  state.retryTimer = setTimeout(() => {
    state.retryTimer = null;
    connect();
  }, wait);
}

// ---------- Start, fullscreen, keys, cursor ----------

function isFullscreenLike() {
  return !!document.fullscreenElement || (innerWidth >= screen.width && innerHeight >= screen.height);
}

async function enterFullscreen() {
  if (document.fullscreenElement) return true;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    return true;
  } catch {
    return false;
  }
}

function start() {
  if (state.started) return;
  state.started = true;
  startButton.hidden = true;
  showPlate(current(), true);
  preloadCard((state.index + 1) % characters.length);
  connect();
}

startButton.addEventListener("click", async () => {
  await enterFullscreen();
  start();
});

document.addEventListener("keydown", (e) => {
  if (e.repeat && e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  switch (e.key) {
    case "ArrowRight":
      goTo(state.index + 1);
      break;
    case "ArrowLeft":
      goTo(state.index - 1);
      break;
    case " ":
      state.paused = !state.paused;
      log(state.paused ? "timer paused" : "timer resumed");
      break;
    case "f":
    case "F":
      if (document.fullscreenElement) document.exitFullscreen();
      else enterFullscreen();
      break;
    case "m":
    case "M":
      video.muted = !video.muted;
      break;
    case "o":
    case "O":
      operator.hidden = !operator.hidden;
      renderOperator();
      break;
    default:
      return;
  }
  e.preventDefault();
});

let idleTimer;
function wake() {
  document.body.classList.remove("idle");
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add("idle"), 2000);
}
document.addEventListener("mousemove", wake);
wake();

// ---------- Operator reference ----------

function renderOperator() {
  if (operator.hidden) return;
  const c = current();
  operator.querySelector(".card").src = c.card;
  operator.querySelector(".title").textContent = `${state.index + 1}/${characters.length} · ${c.name}`;
  operator.querySelector(".prompt").textContent = c.prompt;
  const rows = {
    connection: state.connection,
    remaining: `${Math.max(0, state.remainingMs / 1000).toFixed(1)}s${state.paused ? " (paused)" : ""}`,
    session: `${state.sessionSeconds}s billed`,
    model: state.config ? `${state.config.model}${state.config.speed ? ` (${state.config.speed})` : ""}` : "…",
    error: state.lastError || "—",
  };
  operator.querySelector(".status").innerHTML = Object.entries(rows)
    .map(([k, v]) => `<dt>${k}</dt><dd>${String(v).replace(/</g, "&lt;")}</dd>`)
    .join("");
}

window.magicScreen = {
  state,
  inputFrame: async () => {
    const blob = await captureReference();
    if (!blob) return null;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  },
  characters,
  status: () => ({
    character: current().id,
    index: state.index,
    remainingMs: Math.round(state.remainingMs),
    connection: state.connection,
    timerStarted: state.timerStarted,
    healthy: isHealthy(),
    sessionId: state.client?.sessionId ?? null,
    sessionSeconds: state.sessionSeconds,
    swaps: state.swaps,
    lastError: state.lastError,
  }),
  stop: () => {
    state.generation++;
    clearTimeout(state.retryTimer);
    state.client?.disconnect();
    state.client = null;
  },
};

setInterval(tick, 100);

(async () => {
  const ok = await enterFullscreen();
  if (ok || isFullscreenLike() || params.has("autostart")) start();
  else startButton.hidden = false;
})();
