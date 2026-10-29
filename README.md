# YouSong

YouSong is a React/Vite frontend with a long-running Express server, PostgreSQL/Supabase persistence, Google Drive-backed audio, and per-user daily listening limits.

## Deploy on Render

This app runs `yt-dlp`, `ffmpeg`, and `ffprobe` subprocesses. Use Render's **Docker** runtime so the included `Dockerfile` installs those tools and the YouTube JavaScript runtime. The Dockerfile also builds the Vite frontend and starts the Express server.

Read [`RENDER_FIX_GUIDE.md`](./RENDER_FIX_GUIDE.md) for the deployment settings and Google Drive environment variables. Do not put secrets in the repository or frontend build variables.

## Local development

Requirements: Node.js 22+, Python 3, `ffmpeg`/`ffprobe`, and `yt-dlp` with `yt-dlp-ejs` installed.

```bash
npm install
npm run dev
```

Set your existing database and Google Drive environment variables in a local environment file that is not committed to Git. Keep `.env` and `.env.local` out of version control.


## Optional private YouTube conversion worker

The `converter-service/` folder can be deployed as a separate Render Docker Web Service. Configure `CONVERTER_API_KEY` on that service and matching `YT_AUDIO_API_URL` / `YT_AUDIO_API_KEY` on the main app. See `FEATURE_SETUP.md` for exact settings and limitations.
