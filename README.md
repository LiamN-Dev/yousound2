# YouSong

YouSong is a React/Vite music library with an Express backend, PostgreSQL/Supabase persistence, and site-wide Google Drive storage for uploaded music.

## Deploy on Render

Deploy the repository root as a **Docker Web Service** using `./Dockerfile`. The container installs Node.js dependencies and FFmpeg/ffprobe (used to read track duration), builds the frontend, and starts the Express server.

See [RENDER_FIX_GUIDE.md](./RENDER_FIX_GUIDE.md) for the exact deployment checks and environment variables. Keep database credentials, Google OAuth secrets, and encryption keys in Render's environment settings, never in Git.

## Local development

Requirements: Node.js 22+ and FFmpeg/ffprobe.

```bash
npm install
npm run dev
```

Create a local environment file for the existing PostgreSQL/Supabase connection and Google Drive OAuth settings. Keep `.env` and `.env.local` out of version control.

## Music uploads

Administrators upload MP3s and cover images through the site. The server transfers the files to the connected site-wide Google Drive account using resumable, chunked uploads. The library database stores song metadata and Drive references, not the audio bytes.

- MP3 maximum: **150 MB**.
- Cover image maximum: **25 MB** (JPG, PNG, WEBP, or GIF).
- Uploaded audio is made readable by link so the browser's audio player can play it directly from Drive.
- Drive uploads use resumable sessions and 8 MB chunks to avoid loading an entire large song into server memory.

The music library player uses normal audio files and stream URLs. There is no video-source or video-conversion pipeline.
