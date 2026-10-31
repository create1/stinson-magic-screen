# Stinson Magic Screen

Set `DECART_API_KEY` (in `.env.local` locally, or as a Vercel environment variable). The key stays on the server; the browser only gets Decart tokens that expire after 2 minutes, work only for the configured model, and only from the site's own origin. The server refuses to mint tokens when the balance is below `DECART_MIN_CREDITS`, and limits each IP address to 40 tokens per 10 minutes.

### Passcode (optional)

- No passcode (default): leave `MAGIC_SCREEN_PASSCODE` unset or empty. There is no passcode screen; "Click to start." (or autostart) goes straight to the camera, and anyone who can open the URL can stream on your Decart credits.
- Passcode: set `MAGIC_SCREEN_PASSCODE`. People type it once (case-insensitive, remembered for 30 days in an httpOnly cookie) before the screen can get tokens or credits.
- Turn an existing passcode off without deleting it: set `MAGIC_SCREEN_PASSCODE_ENABLED=false` (also accepts `0`, `off`, `no`). Remove that variable to turn the passcode back on.

On Vercel, environment variable changes only apply to new deployments: redeploy after changing them.

## Hosted (Vercel)

Import `create1/stinson-magic-screen` at [vercel.com/new](https://vercel.com/new) with **Root Directory** left as the repo root (framework Vite, from `vercel.json`) and environment variable `DECART_API_KEY` (plus `MAGIC_SCREEN_PASSCODE` if you want a passcode). `api/[route].js` serves `/api/session`, `/api/login`, `/api/token`, `/api/credits`, and `/api/config`.

Open the URL in Chrome (enter the passcode if one is set) and allow the camera. For the display computer, kiosk mode:

```bash
# macOS
open -na "Google Chrome" --args --kiosk --user-data-dir=$HOME/magic-screen-chrome "https://YOUR-PROJECT.vercel.app/?wait"
# Windows (PowerShell)
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --user-data-dir=$env:USERPROFILE\magic-screen-chrome "https://YOUR-PROJECT.vercel.app/?wait"
```

Use a persistent `--user-data-dir` so camera permission (and the passcode cookie, if any) are remembered; exit kiosk with Alt+F4 (Windows) or Cmd+Q (macOS).

## Run locally instead

Needs Node.js 20.19+ (or 22.12+) and Google Chrome.

```bash
git clone https://github.com/create1/stinson-magic-screen.git
cd stinson-magic-screen
npm install
cp .env.example .env.local   # then put the real key (and optionally a passcode) in .env.local
npm start                    # builds and serves on http://127.0.0.1:4173
```

Then open Chrome full-screen with camera permission pre-granted (separate profile so it always opens a fresh kiosk window):

```bash
# macOS
open -na "Google Chrome" --args --kiosk --use-fake-ui-for-media-stream --user-data-dir=/tmp/magic-screen-chrome http://127.0.0.1:4173
# Windows (PowerShell)
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --use-fake-ui-for-media-stream --user-data-dir=$env:TEMP\magic-screen-chrome http://127.0.0.1:4173
# Linux
google-chrome --kiosk --use-fake-ui-for-media-stream --user-data-dir=/tmp/magic-screen-chrome http://127.0.0.1:4173
```

`--use-fake-ui-for-media-stream` only auto-accepts the camera prompt; the real webcam is used. Without `--kiosk` the page shows "Click to start." and goes fullscreen on click.

## Operator keys

Right / Left: next / previous character · Space: pause or resume the 30 s timer · F: fullscreen · M: mute · O: operator reference (card, prompt, connection, billed seconds, credits).

## Notes

- Roster lives in `src/characters.js` (`{ id, name, card, prompt, seconds }`). Card art is only shown on screen; it is never sent to Lucy, so the live person's face is kept.
- Model: Decart `lucy-2.6` realtime, one session, prompt hot-swapped with `set()`. Billed at $0.02 per second of generation ($1.20/min, $72/hour); `DECART_SPEED=fast` doubles that.
- Likeness: every prompt leads with "same face, facial structure, skin tone, hair color, age, and gender, and their own pose; only the one person in frame". Avoid describing poses the person isn't doing (they invite extra figures) and words like "doll" or "pale skin" (they changed the person's face and hair).
- Prompt enhancement is off by default (`DECART_ENHANCE=true` turns it on). With it on, Lucy rewrote some characters into a different person (for example a bearded man for Satan's Priest).
- `DECART_LIVE_REFERENCE=true` sends a fresh camera frame as Lucy's reference image at each swap. It kept the face but also kept the person's own clothes and background, so costumes mostly vanished; off by default.
- Picture quality: Lucy 2.6 generates 1280×720 at up to 30 fps, and Decart caps each stream at about 3.5 Mbps (typically 1.3–2.4 Mbps); no setting makes the model itself generate more detail. Within that:
  - Output: 720p. `DECART_RESOLUTION=1080p` asks Decart for its 1080p remote stream, but in a live test (Oct 2026) lucy-2.6 still delivered 1280×720 at the same 2 credits/s. If a 1080p session never produces a frame after two tries, the page falls back to 720p.
  - Input: the camera is opened at Lucy's own 1280×720 (Decart's guidance; a bigger frame is only scaled down), and the uplink keeps resolution and drops frames when bandwidth is tight.
  - Display: the picture is drawn with bicubic scaling plus a light luma sharpen at the screen's physical resolution, inside a thin gold frame. The sharpened canvas only covers the video once it has drawn a real (non-black) picture; if it hasn't within 3 s, or WebGL fails, the plain video is shown. `?sharpen=0` shows the browser's plain scaling, `?frame=0` fills the screen edge to edge, and `?res=720p` / `?res=1080p` override the output setting for a side-by-side check.
  - The operator panel (O) shows what actually arrives: "lucy out" (stream size, fps, kbps), "camera in" (what is sent to Lucy, and what limits it), and the display size.
- If the stream drops, the last good frame stays up, the timer pauses, and the session is retried on the same character.
- Credits: the app checks the Decart balance before connecting and every 10 s while streaming. Below `DECART_MIN_CREDITS` (default 30), or if Decart reports insufficient credits, it disconnects, stops retrying, and shows "Out of Decart credits. Top up, then click to start."
- `?wait` always shows "Click to start." even in a kiosk window.
- Test-only URL params: `?seconds=8` shortens every slot, `?start=5` begins at roster position 5.
