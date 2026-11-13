# Meeting

A Zoom-style meeting app with **video, screen sharing and chat**, built on [LiveKit](https://livekit.io).

- **Web app** — React + Vite, Zoom-like dark room UI: gallery/speaker views, screen-share stage with filmstrip, chat, invite dialog, passcode + waiting room.
- **Screen-share annotation** — anyone in the call can draw on the shared screen (pen, 5 colors, eraser, undo, clear); strokes sync to every participant over the LiveKit data channel, including people who join late.
- **Whiteboard** — start a shared whiteboard from the toolbar; everyone in the call sees it and can draw at once on an endless pannable canvas (pen with 5 colors and 3 sizes, eraser, undo, clear, select-and-resize of drawn strokes, hand/wheel/space panning). Strokes sync over the LiveKit data channel.
- **Screen share with sound** — Chrome/Edge share computer/tab audio along with the screen (48 kbps Opus), shown as “with sound” on the share stage.
- **File sharing in chat** — attach a file of any size; the web app uploads it to the meeting server in 8 MiB chunks (no total size cap) and posts a download card that everyone in the call can open.
- **Weak-network audio** — microphone is published as mono speech (32 kbps, RED + AGC, DTX off so sentence starts are not clipped); while sharing, the camera drops to its low simulcast layer, and if LiveKit reports a poor local connection the app lowers camera quality automatically to keep voice flowing. Video bitrates are capped so audio keeps priority on slow WiFi.
- **Compact share layout** — while someone shares a screen, participant cameras move to a narrow filmstrip so the shared screen gets nearly the full stage.
- **Android app** — Kotlin + Jetpack Compose + LiveKit Android SDK: start a meeting, share the invite link over WhatsApp, admit guests, camera/mic, screen share, chat.
- **Server** — issues LiveKit tokens, keeps passcodes and the waiting room in SQLite, serves the built web app.

## Layout

```
server/    Express API: meetings, waiting room, LiveKit tokens
web/       React meeting UI
android/   Native Android app (open this folder in Android Studio)
tests/     Playwright end-to-end test + screenshots
```

## Requirements

- Node.js 22+ (uses the built-in `node:sqlite`)
- Docker Desktop (local LiveKit) — or a LiveKit Cloud project
- Android Studio (JDK 17) for the Android app

## Quick start (web)

```bash
npm install
cp .env.example .env        # defaults match the Docker LiveKit below
npm run livekit:up          # starts livekit-server on :7880
npm run dev                 # API on :8787, Vite on :5173
```

Open http://localhost:5173, create a meeting, copy the invite link, and open it in a second browser (or another device).

For a production-style run:

```bash
npm run build
npm start                   # serves the built web app and API on :8787
```

### LiveKit Cloud

Set these in `.env` and skip `npm run livekit:up`:

```
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=your-secret
```

`PUBLIC_URL` is optional; set it when the app is behind a reverse proxy so invite links use the public hostname.

## Deploy on Render (free)

Live deployment: **https://meeting-bmcz.onrender.com** (Render free web service + LiveKit Cloud in Frankfurt).

LiveKit cannot be self-hosted on Render's free tier — media needs UDP/TCP ports Render does not expose. Use **LiveKit Cloud** (free tier) for media and Render only for the API + web app.

1. Create a free project at https://cloud.livekit.io and copy its **WebSocket URL**, **API key** and **secret** (Settings → Keys).
2. In Render: **New → Blueprint**, select this repository, and apply. `render.yaml` defines one free Node web service.
3. When prompted, paste `LIVEKIT_URL` (`wss://….livekit.cloud`), `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.
4. Wait for the build. Health check: `/api/health`. Open the `onrender.com` URL and create a meeting.

Invite links are built from the incoming request host, so after deploying they automatically become `https://<service>.onrender.com/m/<id>#p=<passcode>`. Set `PUBLIC_URL` only if you add a custom domain or a proxy that rewrites the host.

Render free notes:

- The service sleeps after ~15 minutes without traffic; the first request afterwards takes ~30 seconds. Media stays on LiveKit Cloud, not Render.
- SQLite uses the container's ephemeral disk, so meetings and pending join requests reset on restart or deploy. That is fine for ad-hoc rooms; meeting links are per-session anyway.
- No Google sign-in is needed: the invite link + passcode is the access gate, and the host admits guests from the waiting room.

## Testing on a phone or the Android emulator

The phone must reach both the API (`:8787`) and LiveKit (`:7880`, `:7881`, `:7882/udp`). Use your PC's LAN IP everywhere:

```bash
# .env
LIVEKIT_URL=ws://192.168.1.20:7880
LIVEKIT_NODE_IP=192.168.1.20
```

`docker-compose.yml` passes `LIVEKIT_NODE_IP` to `--node-ip`, which controls the ICE candidates LiveKit advertises. Without it, browsers/phones cannot establish the media connection.

- Web on the PC: http://localhost:8787 (or the Vite dev server)
- Android emulator: server URL `http://10.0.2.2:8787` (LiveKit still connects to the LAN IP from the server's token response)
- Physical phone: server URL `http://192.168.1.20:8787` — set it from **Server: …** on the home screen
- Allow ports 8787/tcp, 7880/tcp, 7881/tcp, 7882/udp through the PC firewall

## Android app

Open the `android/` folder in Android Studio, let Gradle sync, and run the `app` configuration. The Gradle wrapper is included (Gradle 8.9, AGP 8.7, Kotlin 2.0, Compose).

The app defaults to the hosted server at `https://meeting-bmcz.onrender.com`; edit **Server** in the app (or `DEFAULT_SERVER_URL` in `android/app/build.gradle.kts`) to point at a local instance.

Flow:

1. Enter your name (persisted), optionally edit the **Server** URL.
2. **New meeting** generates a passcode and an invite link. **Share on WhatsApp** opens WhatsApp with the link and passcode; **Start meeting** joins as host.
3. Guests paste the link (passcode is read from the `#p=` fragment) and wait in the waiting room until the host taps **Admit**.
4. In the room: mic/camera toggles, screen share, chat, people list with waiting requests, invite.
5. Screen sharing uses Android's MediaProjection consent dialog and LiveKit's foreground service (Android 14+ shows a system prompt).

Deep links are supported: `meeting://m/<meetingId>#p=<passcode>`.

Screen sharing from the **web app** requires a desktop browser: mobile browsers (Chrome on Android, Safari on iOS) do not implement `getDisplayMedia`, so the Share button reports that screen sharing is unsupported. Use the Android app on a phone — it shares through Android's MediaProjection.

When sharing from Chrome or Edge, the browser picker offers audio: tick **Share system audio** for an entire screen, or **Share tab audio** when sharing a tab; participants then hear the computer sound. What is offered depends on the OS and the chosen surface (Safari and Firefox cannot capture screen audio). If nobody can hear the shared sound, share a tab and tick its audio checkbox.

While a share is active the stage switches to a compact layout: the shared screen takes almost the whole area and participant cameras collapse into a narrow filmstrip. If the connection is weak, the sharer's camera is automatically published at its lowest simulcast layer so the screen share and voice keep the available bandwidth. Voice is carried continuously (DTX off, redundant audio on); for the most reliable audio on a weak link, use headphones and, where possible, 5 GHz WiFi.

Annotations draw on top of the shared-screen stage for everyone in the call (web clients). If someone still cannot see them, make sure they loaded the current build (hard refresh: `Ctrl+Shift+R`, or `Cmd+Shift+R` on macOS). With more than one person sharing at once, the app shows one share — if the ink was drawn on a different share, switch to that one.

Annotations are drawn in the web app; the Android client shows the shared screen without the drawing overlay.

### Whiteboard

The **Whiteboard** button in the toolbar opens a shared board for the whole call. Any participant can start one, everyone sees the same canvas, and everyone can draw simultaneously. It reuses the annotation stroke protocol (`meet-annotate`, target `whiteboard`), so late joiners get the existing drawing and the board opens for them too. Closing the board clears it.

The **Select and resize** tool (arrow next to the hand) lets you drag a rectangle around strokes, then drag any of the four corner handles to scale that selection. The result is broadcast as one `x` packet and applies to everyone, including participants who join later.

The board is an endless canvas. Pan it with the **Pan canvas** hand tool, with the mouse wheel (or trackpad), with a middle-mouse drag, or by holding **Space** and dragging with any tool active. The view is personal: panning only moves your own screen, while strokes stay at the same world position for everyone.

Only one stage is shown at a time: stop a screen share before opening the whiteboard (the app asks you to). The whiteboard is web-only — Android participants do not render it, like screen-share annotations.

The board is inspired by the standalone [whiteboard](https://github.com/mahi80/whiteboard) project, but instead of Excalidraw plus a second WebSocket server it reuses the meeting's LiveKit connection, so there is nothing extra to deploy.

### File sharing

Attach files with the paperclip in chat. The webapp uploads in 8 MiB chunks to `POST /api/meetings/:id/files` → `PUT .../chunk` → `POST .../complete`, so the app imposes **no total size limit** — only the server's free disk space matters. Uploads require a LiveKit token for the room; downloads use the unguessable `/api/files/<id>/<name>` link and are sent with `Content-Disposition: attachment`.

Files live in `data/uploads` (override with `UPLOAD_DIR`) and are swept 24 hours after upload. On Render's free plan the filesystem is ephemeral, so uploads disappear on restart or redeploy and count against the instance disk; for durable large-file storage point `UPLOAD_DIR` at a persistent disk or swap in object storage.

The file card is drawn by web clients. The Android app's chat does not render attachments yet.

`node tests/file-upload.mjs` uploads a 20 MB file through multiple chunks and compares the SHA-256 of the download.

The app is intentionally cleartext-friendly for LAN development (`usesCleartextTraffic="true"`). For a public deployment, serve everything over HTTPS/WSS and remove that flag.

> The Android project was scaffolded without an Android SDK on the build machine, so build/run it from Android Studio.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/meetings` | create meeting (title, passcode) → host key + invite URLs |
| GET | `/api/meetings/:id` | meeting title / has-passcode |
| POST | `/api/meetings/:id/requests` | guest asks to join (name, passcode) |
| GET | `/api/requests/:id` | guest polls status; returns token when approved |
| GET | `/api/meetings/:id/requests` | host lists waiting guests (`x-host-key`) |
| POST | `/api/meetings/:id/requests/:requestId` | host approves/denies (`x-host-key`) |
| POST | `/api/meetings/:id/host-token` | host LiveKit token (`x-host-key`) |
| POST | `/api/meetings/:id/files` | start a chat file upload (Bearer LiveKit token) |
| PUT | `/api/meetings/:id/files/:fileId/chunk` | append a chunk (`x-file-offset`) |
| POST | `/api/meetings/:id/files/:fileId/complete` | finalize upload → download URL |
| GET | `/api/files/:fileId/:name` | download a shared file |

Passcodes are stored bcrypt-hashed; LiveKit tokens expire after 6 hours and carry host/guest grants.

## End-to-end test

With the API, LiveKit and a built web app running:

```bash
npx playwright install msedge   # once, if Edge is not detected
node tests/e2e.mjs
```

Two isolated Edge contexts create a meeting, join through the waiting room, chat both ways, share a file, share the screen, annotate, draw on a shared whiteboard, resize and pan the drawing, toggle the camera, switch to speaker view, and leave. Screenshots land in `tests/screenshots/`.
