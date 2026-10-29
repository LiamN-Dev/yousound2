# YouSong: Drive MP3 playback and daily listen limits

This update connects the existing MP3/Google Drive service to the actual request approval workflow and adds a per-user listen limit stored in PostgreSQL/Supabase.

## 1. Install the server-side media tools (Render)

The YouTube extraction worker requires `yt-dlp`, `yt-dlp-ejs`, a supported JavaScript runtime, `ffmpeg`, and `ffprobe`. The included `Dockerfile` uses Node.js 22 as yt-dlp's JavaScript runtime, installs yt-dlp with its `default` dependency group (which includes `yt-dlp-ejs`), and installs ffmpeg/ffprobe.

Important: Render only uses this Dockerfile when the Web Service's Environment/Runtime is set to **Docker**. If the service is configured as a native Node service, the Dockerfile is ignored and these system tools will not be installed by this file.

The extraction command explicitly selects Node using `--js-runtimes node`. yt-dlp's official instructions describe the JS runtime and EJS challenge scripts as required parts of current YouTube extraction setup: https://github.com/yt-dlp/yt-dlp/wiki/EJS.

Even with the correct runtime, YouTube can return HTTP 429 or require account verification from a hosted server IP. Code cannot guarantee that every YouTube source will be downloadable in that state. The Admin → Requests → Google Drive MP3 archive panel therefore includes a manual audio-file fallback: select the existing song, upload an audio file you own or have permission to re-host (up to 100 MB), and let the server convert it to MP3 and upload it to Drive. The saved song URL changes only after the Drive upload and sharing permission succeed.

## 2. Configure Google Drive OAuth

1. In Google Cloud Console, select/create a project and enable the **Google Drive API**.
2. Configure the OAuth consent screen for the intended audience.
3. Create an OAuth **Web application** client ID and client secret. Add the exact deployed callback URL as an **Authorized redirect URI**; use the same canonical deployed domain for `APP_URL` and `GOOGLE_REDIRECT_URI`.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DRIVE_TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET`, `APP_URL`, and `GOOGLE_REDIRECT_URI` in the Render web service environment, as shown in section 7 below. Do not expose the client secret, encryption key, or session secret in the frontend or in GitHub.
5. In Admin → Requests, click **Connect site Drive** once and approve access. The server stores an encrypted refresh token in the database and refreshes the short-lived access token automatically.

The conversion creates the MP3 in the connected site's Drive, in a folder named `YouSong Audio Tracks` when folder access is available. The upload is made link-readable so a normal browser audio player can stream from Google Drive directly. Some Google Workspace administrators disable public link sharing; if that is the case, upload permissions will fail and the request will not be published.

## 3. Supabase / PostgreSQL schema

The app's startup `ensureTables()` migration adds the required objects when the backend has database access. The SQL is also included in `supabase-schema.sql`:

- `users.daily_listen_limit`: `NULL` means unlimited, `0` blocks listening, and a positive integer is the per-UTC-day cap.
- `user_daily_listen_usage`: one atomic counter row per user per UTC day.

For a manual Supabase SQL Editor migration, run the updated `supabase-schema.sql` against the same database your Node server uses. Make sure the backend's `DATABASE_URL`/`SUPABASE_DB_URL` connects to that database; a frontend Supabase project URL alone is not the Postgres connection string the Node server uses.

The counter is incremented atomically in PostgreSQL, before the player starts, so simultaneous player requests cannot exceed the configured cap. If the database is configured but unavailable, the listen endpoint fails closed rather than silently allowing a listen without checking the cap. The date resets at midnight UTC.

## 4. What the changes do to egress

- Approved requests now go through MP3 conversion and one-time upload to Drive.
- Published request songs store the direct Google Drive download/stream URL. New playback bytes are served by Google Drive rather than relayed by this app's web server.
- Older saved `/api/media/drive-stream/...` and `/api/drive/stream/...` URLs are normalized to direct Drive URLs in the player; the old endpoints now redirect by default.
- Local audio and cover endpoints now supply cache validators and long-lived immutable-URL browser caching, including conditional `304 Not Modified` responses and byte-range support for audio. Stable ETags continue to match after a server restart.
- The song metadata endpoint uses an ETag and revalidation. Metadata is still fetched as needed, but the actual audio payload is not sent on every page refresh.
- Legacy songs that stored audio as a `data:audio/...;base64,...` URL are migrated to a normal `/api/media/audio/...` URL on the next library fetch. New song POST/PATCH requests also convert inline audio to a stored media URL (up to 20 MB) before the song row is saved, preventing that base64 payload from living inside `songs.audio_url`.

## Important limit of Google Drive sharing

The per-user cap is enforced for each song start through YouSong's authenticated player/API. To stream directly from Drive without paying this app host to retransmit the media, the audio link must be accessible to the browser. As a result, a determined user can copy the public Drive URL and play it outside YouSong, bypassing the app-level counter. Strictly enforcing a cap outside the app would require private, authenticated streaming (which would send audio through an authorized proxy and increase app egress) or moving the files to a service that supports short-lived signed URLs. This implementation does not claim to prevent that out-of-app bypass.


## 5. Optional separate converter service

The repository also includes `converter-service/`, a private Flask API that runs `yt-dlp` and FFmpeg away from the main YouSong web process. To deploy it on Render, create a separate **Docker Web Service** with the repository root directory set to `converter-service`, and set `CONVERTER_API_KEY` to a long random secret. Keep the service private to server-to-server use by keeping this key secret; the app rejects conversion requests without it.

Set these environment variables on the converter service as needed:

```env
CONVERTER_API_KEY=a-long-random-secret
YTDLP_PLAYER_CLIENTS=default,web_safari
MAX_FILE_MB=60
MAX_CONCURRENT_JOBS=2
TOKEN_TTL_SECONDS=600
```

Then set these on the main YouSong Render web service:

```env
YT_AUDIO_API_URL=https://YOUR-CONVERTER-SERVICE.onrender.com
YT_AUDIO_API_KEY=the-same-long-random-secret
```

`YTDLP_PLAYER_CLIENTS` is a best-effort yt-dlp client-selection setting. The `web_safari` client may work for some sources and fail for others; YouTube changes its player behavior and can still block downloads with HTTP 429 or verification challenges. No extractor argument can guarantee conversion of every YouTube video. The converter service uses a different hosted process, but moving a job to another host is not a reliable way to defeat an IP-level block. Do not add proxy rotation or CAPTCHA-bypass systems to evade those blocks.

The main app calls the protected converter, downloads the resulting temporary MP3, then uses the existing connected Drive account to store it. Playback points at the Drive file so routine song listening does not stream the MP3 through the YouSong Render app. Each conversion temporarily transfers the MP3 once through the app server; playback does not.

## 6. Hosting check before using the conversion button

This app launches `yt-dlp` and `ffmpeg` subprocesses and runs a long-lived Express server. Deploy it on Render as a **Docker Web Service** using the repository's `Dockerfile`; a native Node deployment does not install the required system media tools from that file. After each code change, deploy the repository branch that contains the updated `Dockerfile`, `src/services/audioPipeline.ts`, `server.ts`, and `src/components/AdminPipelineManager.tsx`.

The request-based YouTube extraction is time-limited. A hosted request may still fail when YouTube rate-limits the server or requires verification. In that case, use the new manual audio-file fallback in the Admin → Requests page for audio you are allowed to re-host rather than repeatedly retrying a blocked URL.

## 7. Persistent site-wide Google Drive OAuth (Render)

The browser-only OAuth token flow has been replaced with a server-side authorization-code flow. One Drive account is connected to the whole site; access tokens are refreshed by the backend and the refresh token is encrypted in `system_settings` using AES-256-GCM.

Set these environment variables in the Render web service:

```env
GOOGLE_CLIENT_ID=your_web_oauth_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
DRIVE_TOKEN_ENCRYPTION_KEY=64_hex_characters_from_32_random_bytes
SESSION_SECRET=your_existing_long_random_session_secret
APP_URL=https://yousound.onrender.com
GOOGLE_REDIRECT_URI=https://yousound.onrender.com/api/admin/google-drive/oauth/callback
```

Use your actual canonical deployed origin consistently. In Google Cloud Console → Google Auth Platform → Clients → your Web application, add the exact `GOOGLE_REDIRECT_URI` under **Authorized redirect URIs**. The site origin must also be correct. Keep the OAuth client secret and encryption key only in Render environment variables, never in GitHub or any `VITE_` variable.

Generate a key locally with Node:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

After deploying, an admin opens Admin → Requests → **Connect site Drive** once and approves access. The refresh token is encrypted and saved in Supabase `system_settings`; the backend refreshes access tokens automatically. A valid PostgreSQL connection is required for persistence across Render restarts. Do not remove or rotate `DRIVE_TOKEN_ENCRYPTION_KEY` after connecting unless you plan to reconnect Drive.

The same admin page includes **Migrate existing songs to Drive (3 per batch)**. It processes up to three existing library songs per click, marks completed songs to prevent repeat migration, and updates each song URL only after the upload succeeds. If YouTube blocks a source, use the manual audio-file uploader in that page to convert an audio file and upload it directly to the site Drive. It skips tracks already marked as published by the YouSong Drive pipeline; other Drive links are re-hosted into the site's connected Drive account when downloadable. This migration requires working `yt-dlp`, `yt-dlp-ejs`, a supported JavaScript runtime, `ffmpeg`, and `ffprobe`, and only audio you own or are licensed to re-host. Check each batch result before running the next one. When a source is blocked by YouTube, use the manual audio-file uploader instead.
