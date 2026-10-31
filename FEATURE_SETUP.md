# YouSong setup: Google Drive music storage

This project stores uploaded music in one site-wide Google Drive account. PostgreSQL/Supabase stores song metadata and Drive file references; audio bytes are not stored in the database or streamed through the YouSong app during playback.

## 1. Google Drive OAuth

1. In Google Cloud Console, select or create a project and enable the **Google Drive API**.
2. Configure the OAuth consent screen for the intended audience.
3. Create an OAuth client of type **Web application**.
4. Add the deployed callback URL as an authorized redirect URI. Use the same canonical deployed origin for `APP_URL` and `GOOGLE_REDIRECT_URI`.
5. Set the environment variables below in the Render web service.
6. In the admin area, choose **Connect Google Drive** once and approve access. The backend saves the refresh token encrypted in the database and refreshes short-lived access tokens when needed.
7. The OAuth request uses `drive.file` for files YouSong creates and `drive.metadata` to search and rename metadata for selected files already in the connected Drive. Existing connections must click **Grant Drive folder access** and approve the additional metadata permission once. Add `https://www.googleapis.com/auth/drive.metadata` to the OAuth consent screen's Data Access scopes in Google Cloud Console before reconnecting. This allows YouSong to view and manage file metadata (including names), but does not grant access to download the contents of every Drive file.

Example Render environment variables (replace the origin with the real deployed URL):

```env
GOOGLE_CLIENT_ID=your_web_oauth_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
DRIVE_TOKEN_ENCRYPTION_KEY=64_hex_characters_from_32_random_bytes
SESSION_SECRET=your_existing_long_random_session_secret
APP_URL=https://yousound.onrender.com
GOOGLE_REDIRECT_URI=https://yousound.onrender.com/api/admin/google-drive/oauth/callback
```

Generate a 32-byte encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep `GOOGLE_CLIENT_SECRET`, `DRIVE_TOKEN_ENCRYPTION_KEY`, and `SESSION_SECRET` private. Do not rotate `DRIVE_TOKEN_ENCRYPTION_KEY` after connecting Drive; the saved refresh token is encrypted with it.

The app stores audio in `YouSong/Audio Tracks` and artwork in `YouSong/Artwork`, creating those folders when needed. Each newly published song receives a unique three-digit media code. Its MP3 is named `Song title by Artist - 123.mp3` and its cover is named `Song title - 123.jpg` (or the image's original extension). The same code is saved with the song record. When existing Drive files are selected, the uploader renames them in place without re-uploading their contents. Link access is enabled so the browser can play the file directly from Drive. Google Workspace policies that prohibit public link access will cause the upload to fail rather than publish a track that cannot play.

## 2. Upload limits and implementation

- MP3 files: **150 MB maximum**.
- Cover images: **25 MB maximum**, JPG, PNG, WEBP, or GIF.
- Both the library uploader and approved-request uploader use the same backend upload configuration.
- Google Drive uploads use the resumable upload API. The server sends bounded 8 MB chunks from temporary disk storage rather than buffering the full MP3 in memory.
- The temporary upload files are deleted after the Drive transfer succeeds or fails.
- The library stores only song metadata and the resulting Drive URLs/file IDs.

A request rejected with HTTP 413 is a size rejection. The application accepts files up to the limits above; a 413 response with no application JSON body indicates the request was rejected upstream before Express could handle it. Check the deployed host's request-body settings and deployment logs in that case.

If an upload succeeds in Drive but fails while creating the song record, check the server/database logs before retrying so you do not create duplicate Drive files.

## 3. PostgreSQL / Supabase and daily listen limits

The startup `ensureTables()` migration creates or updates the required tables when the backend has database access. The SQL is also in `supabase-schema.sql`.

- `users.daily_listen_limit`: `NULL` means unlimited, `0` blocks playback, and a positive integer is the per-UTC-day song-start limit.
- `user_daily_listen_usage`: one atomic counter row per user per UTC day.

The counter is incremented on the server before the audio player starts. If the database is configured but unavailable, the listen endpoint fails closed rather than silently ignoring the user's limit. The counter resets at midnight UTC. Administrators are excluded from the counter and play metrics.

For manual setup in the Supabase SQL Editor, apply the current `supabase-schema.sql` to the same database used by the Node backend. The server requires a PostgreSQL connection string such as `DATABASE_URL` or `SUPABASE_DB_URL`; a frontend Supabase project URL by itself is not a database connection string.

## 4. Playback and egress

Published songs store a direct Google Drive audio URL. The browser streams audio from Drive, so refreshing YouSong does not make the app server retransmit every MP3. Song metadata is fetched separately from the database/API.

Direct browser playback requires Drive link access. Someone who copies the public Drive URL can play it outside YouSong and bypass the app's per-user daily listen counter. The counter is enforced by YouSong's authenticated player/API; it is not a restriction on someone who has copied the public Drive URL. Strict enforcement outside the app would require private authenticated streaming or a storage provider with expiring signed URLs.

## 5. Runtime

Use Render's **Docker** runtime, repository root as the build context, and `./Dockerfile` as the Dockerfile path. FFmpeg/ffprobe are installed in the image to read audio duration. After a change, deploy a fresh image build; restarting an old container does not install updated dependencies.
