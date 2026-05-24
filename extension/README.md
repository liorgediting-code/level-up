# Live Meeting Transcriber (private Chrome extension)

Captures audio from the active meeting tab, streams it to Deepgram for live
Hebrew transcription, shows draggable RTL subtitles on the page, and posts the
transcript to your webapp.

## Setup

1. Edit `config.js`:
   - `WEBAPP_BASE_URL` — your deployed webapp URL (no trailing slash).
   - `WEBAPP_AUTH_TOKEN` — already populated with a random bearer token. Add the
     same value to your webapp's env so it can validate incoming requests.
   - `DEEPGRAM_API_KEY` — already populated.
2. Add icons at `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`
   (any PNGs at those sizes work; the manifest references them).
3. Open `chrome://extensions`, enable **Developer mode**, click **Load
   unpacked**, and select this `extension/` folder.

## Use

1. Open a Google Meet / Zoom / Teams tab.
2. Click the extension icon → choose language → **Start**.
3. Subtitles appear at the bottom of the page (draggable, RTL).
4. Click **Stop** to flush the final batch and close the session.

## Webapp endpoints expected

- `POST /api/sessions` → returns `{ session_id }` (or `{ id }`).
  Body: `{ title, language, started_at }`.
- `POST /api/sessions/:id/chunks` — array of
  `{ text, is_final, start_ms, end_ms }`.
- `POST /api/sessions/:id/end` — body `{ ended_at }`.

All three require `Authorization: Bearer <WEBAPP_AUTH_TOKEN>`.

## Architecture

- `background.js` (service worker) owns the Deepgram WebSocket and webapp API
  calls. Batches finals every 2 s / 5 chunks. Retries failed POSTs with
  exponential backoff in memory.
- `offscreen.html` / `offscreen.js` host the `AudioContext` + `AudioWorklet`
  (service workers can't use Web Audio). Receives a tab capture `streamId`
  from the background and pipes PCM back via a long-lived `chrome.runtime`
  port. Source node is also routed to `destination` so the tab is still
  audible to the user.
- `pcm-worklet.js` resamples to 16 kHz mono `linear16` Int16 PCM in
  ~100 ms chunks.
- `content.js` / `content.css` render the draggable RTL caption overlay
  (interim grey, last 3 finals white).
- `popup.html` / `popup.js` control start/stop, language, title, overlay
  visibility; shows session id + elapsed time.

## Notes / caveats

- `getMediaStreamId` is called from the background but tab capture must
  originate from a user gesture in the popup — which is how Start works.
- Deepgram auth uses `Sec-WebSocket-Protocol: ['token', KEY]` because Chrome
  extensions cannot set arbitrary WS headers.
- If you reload the extension, an in-flight session is dropped (no persistent
  queue across SW restarts).
