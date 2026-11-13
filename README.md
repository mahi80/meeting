# Meeting

A Zoom-style meeting app with **video, screen sharing and chat**, built on [LiveKit](https://livekit.io).

- **Web app** — React + Vite, Zoom-like dark room UI: gallery/speaker views, screen-share stage with filmstrip, chat, invite dialog, passcode + waiting room.
- **Screen-share annotation** — anyone in the call can draw on the shared screen (pen, 5 colors, eraser, undo, clear); strokes sync to every participant over the LiveKit data channel.
- **Weak-network audio** — microphone is published as mono speech (24 kbps, DTX + RED, AGC); camera and screen-share bitrates are capped so audio keeps priority on slow WiFi.
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

Annotations are drawn in the web app; the Android client shows the shared screen without the drawing overlay.

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

Passcodes are stored bcrypt-hashed; LiveKit tokens expire after 6 hours and carry host/guest grants.

## End-to-end test

With the API, LiveKit and a built web app running:

```bash
npx playwright install msedge   # once, if Edge is not detected
node tests/e2e.mjs
```

Two isolated Edge contexts create a meeting, join through the waiting room, chat both ways, share the screen, switch to speaker view, and leave. Screenshots land in `tests/screenshots/`.
