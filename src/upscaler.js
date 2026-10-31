// Draws the Lucy video onto a canvas at the display's physical pixel size with Catmull-Rom (bicubic)
// sampling plus a light unsharp mask. Browsers scale <video> bilinearly, which turns a 720p stream on a
// 1080p/4K panel noticeably soft. Falls back to the plain <video> when WebGL is unavailable.

const VERTEX = `
attribute vec2 pos;
varying vec2 uv;
void main() {
  uv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
uniform sampler2D tex;
uniform vec2 texSize;
uniform vec4 crop;
uniform float amount;
varying vec2 uv;

vec3 tap(vec2 p) { return texture2D(tex, p).rgb; }

// Catmull-Rom in 9 bilinear taps.
vec3 bicubic(vec2 p) {
  vec2 s = p * texSize;
  vec2 t1 = floor(s - 0.5) + 0.5;
  vec2 f = s - t1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 t0 = (t1 - 1.0) / texSize;
  vec2 t3 = (t1 + 2.0) / texSize;
  vec2 t12 = (t1 + w2 / w12) / texSize;
  vec3 c = tap(vec2(t0.x, t0.y)) * w0.x * w0.y + tap(vec2(t12.x, t0.y)) * w12.x * w0.y + tap(vec2(t3.x, t0.y)) * w3.x * w0.y
         + tap(vec2(t0.x, t12.y)) * w0.x * w12.y + tap(vec2(t12.x, t12.y)) * w12.x * w12.y + tap(vec2(t3.x, t12.y)) * w3.x * w12.y
         + tap(vec2(t0.x, t3.y)) * w0.x * w3.y + tap(vec2(t12.x, t3.y)) * w12.x * w3.y + tap(vec2(t3.x, t3.y)) * w3.x * w3.y;
  return c;
}

void main() {
  vec2 p = crop.xy + uv * crop.zw;
  vec3 c = bicubic(p);
  vec2 d = 1.0 / texSize;
  vec3 blur = 0.25 * (tap(p + vec2(d.x, 0.0)) + tap(p - vec2(d.x, 0.0)) + tap(p + vec2(0.0, d.y)) + tap(p - vec2(0.0, d.y)));
  // Sharpen luma only so compression noise in the colour channels is not amplified.
  float l = dot(c - blur, vec3(0.299, 0.587, 0.114));
  gl_FragColor = vec4(clamp(c + amount * l, 0.0, 1.0), 1.0);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

export function createUpscaler(video, canvas, { amount = 0.35 } = {}) {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: false });
  if (!gl) return null;
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, "pos");
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  const u = (name) => gl.getUniformLocation(program, name);
  const uTexSize = u("texSize");
  const uCrop = u("crop");
  gl.uniform1f(u("amount"), amount);

  let lost = false;
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    lost = true;
  });

  function fitCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  // Same crop as object-fit: cover, in texture coordinates.
  function coverCrop(vw, vh) {
    const canvasAspect = canvas.width / canvas.height;
    const videoAspect = vw / vh;
    if (videoAspect > canvasAspect) {
      const w = canvasAspect / videoAspect;
      return [(1 - w) / 2, 0, w, 1];
    }
    const h = videoAspect / canvasAspect;
    return [0, (1 - h) / 2, 1, h];
  }

  function draw() {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (lost || !vw || !vh) return false;
    fitCanvas();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
    gl.uniform2f(uTexSize, vw, vh);
    gl.uniform4f(uCrop, ...coverCrop(vw, vh));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (gl.getError() !== gl.NO_ERROR) throw new Error("WebGL error while drawing the video");
    return true;
  }

  // Reads back the middle of what was just drawn. Some GPU/driver combinations upload WebRTC video
  // as black without reporting an error, so the canvas is only trusted once it shows a picture.
  const probe = new Uint8Array(64 * 64 * 4);
  function hasPicture() {
    const x = Math.max(0, Math.floor(canvas.width / 2) - 32);
    const y = Math.max(0, Math.floor(canvas.height / 2) - 32);
    gl.readPixels(x, y, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, probe);
    for (let i = 0; i < probe.length; i += 4) {
      if (probe[i] > 24 || probe[i + 1] > 24 || probe[i + 2] > 24) return true;
    }
    return false;
  }

  return { draw, hasPicture, get lost() { return lost; } };
}
