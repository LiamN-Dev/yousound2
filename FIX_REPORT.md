# YouSong egress and daily-listen-limit fix

This report describes the code changes included in this project copy. It is not a drop-in database backup; keep a backup of your Supabase database before deploying.

## File-by-file changes

- `server.ts`
  - Converts inline `data:audio/...;base64,...` values to persisted media files on song POST/PATCH and migrates legacy song rows on GET, replacing the large data URL with a short media URL.
  - Adds stable ETag/Last-Modified/conditional response handling, long-lived immutable-URL caching and byte-range validation for locally stored audio, plus validators for covers.
  - Sends Google Drive media requests to Drive directly by default rather than relaying the file through the app host; retains an explicit `?proxy=1` compatibility option.
  - Enforces authenticated per-user listen grants before a song is allowed to play, using server-session identity rather than a client-supplied role.
  - Implements actual request conversion: download/convert to MP3, upload to the connected Google Drive, require shareable-link permission, stage the result, and refuse publication without a staged Drive MP3.
  - Adds/returns daily limit and current-day usage fields for admin user management.
- `src/services/audioPipeline.ts`
  - Fails clearly when YouTube extraction/conversion fails instead of generating unrelated substitute audio.
  - Requires the Drive link-sharing permission to succeed; cleans up an orphaned Drive upload if permissions fail and deletes temporary MP3 files.
- `src/components/AdminPipelineManager.tsx`
  - Replaces a duplicate manual uploader with the request-processing queue: connect Drive, confirm rights to re-host, edit metadata, convert/stage, preview, publish/unpublish, or decline/remove requests.
- `src/components/AdminPanel.tsx`
  - Adds a per-user daily listen limit editor and displays today's listens beside each user.
- `src/context/AudioContext.tsx`
  - Requests server authorization before audio playback, routes repeat/next-track playback through the same gate, and avoids double-counting play metrics.
- `src/context/AuthContext.tsx` and `src/services/storage.ts`
  - Pass the daily-limit setting through user administration, call the listen-grant endpoint, switch Drive playback to direct URLs, and refresh the canonical library after publishing.
- `src/services/playbackEngine.ts`
  - Normalizes old app proxy URLs to direct Drive URLs at playback time.
- `src/db/schema.ts`, `src/db/ensureTables.ts`, `src/db/queries.ts`, `src/db/localStore.ts`, `src/types.ts`, `supabase-schema.sql`
  - Add the nullable `daily_listen_limit` user field and atomic daily-usage table/counter, including an idempotent startup migration and local fallback behavior when no SQL database is configured.

## Daily limit rules

- Blank limit: unlimited.
- `0`: block all song starts.
- Positive integer: maximum number of song starts per user per UTC calendar day.
- The server consumes a listen atomically before the frontend sets the audio source. When Supabase is configured but unavailable, the authorization route fails closed instead of silently bypassing the limit.
- Administrators are excluded from the counter and play metrics.

## Important Google Drive limitation

Direct browser playback requires the Drive file to be readable by link. Someone who copies that public link can play it outside YouSong without hitting the app's daily counter. The counter is enforced in YouSong's player/API, not against a person who has copied the raw public URL. Strict off-site enforcement would require authenticated media delivery (which sends the bytes through an authorized service) or storage with expiring signed URLs.

## Validation performed

- A TypeScript syntax/transpilation pass parsed 64 `.ts`/`.tsx` files with zero syntax errors.
- Full `npm run lint` and `npm run build` could not be verified in this environment because project dependencies are not installed and npm registry access failed with DNS `EAI_AGAIN`. Treat the syntax pass as a syntax check, not a full typecheck or production build.
- The MP3 conversion flow needs `yt-dlp`, `yt-dlp-ejs`, a supported JavaScript runtime, `ffmpeg`, and `ffprobe`. The included Render Dockerfile installs these with Node 22 and `yt-dlp[default]`. Google Drive uses server-side `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables.


## Follow-up migration fixes

- The Docker image installs `yt-dlp[default]` so the EJS challenge solver package is present; `yt-dlp` is invoked with Node.js as its explicit JavaScript runtime.
- YouTube HTTP 429 and anti-bot responses now produce a targeted message instead of suggesting only that ffmpeg is missing. This runtime fix does not guarantee downloads from a rate-limited Render IP.
- Successful library migrations are marked with the `drive-mp3` tag and are skipped by later batches. Older direct site-Drive URLs are recognized to avoid duplicate uploads.
- Admins can upload a permitted local audio file (up to 100 MB) for a selected library song when YouTube blocks a source. The upload is converted to MP3, uploaded to Drive, and only then replaces the song's URL.


## Validation of the follow-up patch

- The three modified TypeScript/TSX files (`server.ts`, `src/services/audioPipeline.ts`, and `src/components/AdminPipelineManager.tsx`) passed TypeScript syntax transpilation.
- A full npm build was not verified in this environment: dependency installation timed out, and a Docker build/live Render deployment was not available. Run a fresh Docker deploy in Render to verify the full dependency install and production build.
